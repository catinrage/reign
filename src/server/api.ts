import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, type Accounts, SESSION_DAYS } from './accounts';
import type { Hub } from './hub';

/**
 * The account API under /api: signing up and in, the profile, friends and match history. The
 * sign-in lives in an HttpOnly cookie, which the game's WebSocket carries along too.
 */

export const SESSION_COOKIE = 'reign_session';
const MAX_BODY = 16 * 1024;
/** Sign-in and sign-up attempts allowed per address in a window, against password guessing. */
const ATTEMPTS = 20;
const ATTEMPT_WINDOW_MS = 10 * 60_000;

const attempts = new Map<string, { n: number; until: number }>();

export function readCookie(req: IncomingMessage, name: string): string | null {
	for (const part of (req.headers.cookie ?? '').split(';')) {
		const i = part.indexOf('=');
		if (i > 0 && part.slice(0, i).trim() === name) {
			try {
				return decodeURIComponent(part.slice(i + 1).trim());
			} catch {
				return null;
			}
		}
	}
	return null;
}

/** Behind Render's proxy (or any https proxy) the cookie is marked Secure. */
function secure(req: IncomingMessage) {
	return req.headers['x-forwarded-proto'] === 'https' || (req.socket as { encrypted?: boolean }).encrypted === true;
}

function sessionCookie(req: IncomingMessage, token: string | null) {
	const parts = [
		`${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ''}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${token ? SESSION_DAYS * 86400 : 0}`
	];
	if (secure(req)) parts.push('Secure');
	return parts.join('; ');
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
	res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
	res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
	let size = 0;
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY) throw new AccountError('That request is too big.');
		chunks.push(chunk);
	}
	if (!size) return {};
	try {
		const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
		return body && typeof body === 'object' ? body : {};
	} catch {
		throw new AccountError('That request is garbled.');
	}
}

function clientAddress(req: IncomingMessage) {
	const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
	return fwd || req.socket.remoteAddress || '?';
}

function tooManyAttempts(req: IncomingMessage) {
	const now = Date.now();
	const key = clientAddress(req);
	let a = attempts.get(key);
	if (!a || a.until < now) {
		if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
		a = { n: 0, until: now + ATTEMPT_WINDOW_MS };
		attempts.set(key, a);
	}
	return ++a.n > ATTEMPTS;
}

/** Handle an /api request. Returns false when the path isn't part of the API. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, accounts: Accounts, hub: Hub): Promise<boolean> {
	const url = new URL(req.url ?? '/', 'http://x');
	if (!url.pathname.startsWith('/api/')) return false;
	const path = url.pathname.slice(5).replace(/\/+$/, '');
	const method = req.method ?? 'GET';
	try {
		// Changes only come as JSON, which a form on another site can't send.
		if (method !== 'GET' && !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
			return (json(res, 415, { error: 'Send JSON.' }), true);
		}
		const token = readCookie(req, SESSION_COOKIE);

		if (path === 'register' || path === 'login') {
			if (method !== 'POST') return (json(res, 405, { error: 'Use POST.' }), true);
			if (tooManyAttempts(req)) return (json(res, 429, { error: 'Too many tries. Wait a few minutes.' }), true);
			const body = await readBody(req);
			const { user, token: fresh } = path === 'register' ? await accounts.register(body) : await accounts.login(body);
			json(res, 200, { user }, { 'set-cookie': sessionCookie(req, fresh) });
			return true;
		}
		if (path === 'logout') {
			if (token) {
				await accounts.logout(token);
				hub.signOut({ session: token });
			}
			json(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, null) });
			return true;
		}

		const me = await accounts.userForSession(token);
		if (!me) return (json(res, 401, { error: 'Sign in first.' }, token ? { 'set-cookie': sessionCookie(req, null) } : {}), true);

		if (path === 'me') {
			if (method === 'GET') return (json(res, 200, { user: me }), true);
			if (method === 'PATCH') {
				const body = await readBody(req);
				const pick = (k: string) => (body[k] === undefined ? undefined : String(body[k]));
				const user = await accounts.updateProfile(
					me.id,
					{
						username: pick('username'),
						nickname: pick('nickname'),
						avatar: pick('avatar'),
						password: pick('password'),
						currentPassword: pick('currentPassword')
					},
					token!
				);
				if (body.password !== undefined) hub.signOut({ userId: me.id, except: token! });
				await hub.profileChanged(user);
				return (json(res, 200, { user }), true);
			}
		}

		if (path === 'friends') {
			if (method === 'GET') return (json(res, 200, await hub.friendsInfo(me.id)), true);
			if (method === 'POST') {
				const body = await readBody(req);
				const { other, accepted } = await accounts.requestFriend(me.id, body.username);
				await hub.pushFriends(me.id, other.id);
				return (json(res, 200, { accepted, user: other, friends: await hub.friendsInfo(me.id) }), true);
			}
		}
		const friend = /^friends\/(\d+)(\/accept)?$/.exec(path);
		if (friend) {
			const other = friend[1];
			if (friend[2] && method === 'POST') await accounts.acceptFriend(me.id, other);
			else if (!friend[2] && method === 'DELETE') await accounts.removeFriend(me.id, other);
			else return (json(res, 405, { error: 'Not like that.' }), true);
			await hub.pushFriends(me.id, other);
			return (json(res, 200, await hub.friendsInfo(me.id)), true);
		}

		if (path === 'history' && method === 'GET') {
			const name = url.searchParams.get('user');
			let id = me.id;
			if (name && name !== me.username) {
				const other = await accounts.byUsername(name);
				if (!other || !(await accounts.areFriends(me.id, other.id))) {
					return (json(res, 404, { error: 'You can see the games of your friends only.' }), true);
				}
				id = other.id;
			}
			return (json(res, 200, await accounts.history(id)), true);
		}

		json(res, 404, { error: 'Nothing here.' });
	} catch (e) {
		if (e instanceof AccountError) json(res, 400, { error: e.message });
		else {
			console.error('[api]', e);
			json(res, 500, { error: 'Something went wrong on the server.' });
		}
	}
	return true;
}
