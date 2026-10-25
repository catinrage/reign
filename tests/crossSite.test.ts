import { generateKeyPairSync, sign } from 'node:crypto';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Accounts } from '../src/server/accounts';
import { handleApi } from '../src/server/api';
import { setCrazyGamesKey, verifyCrazyGamesToken } from '../src/server/crazygames';
import { type Db, openDb } from '../src/server/db';
import { Hub } from '../src/server/hub';

/** Copies of the game on other sites (itch.io, CrazyGames): token sign-in, CORS, CrazyGames accounts. */

let db: Db;
let accounts: Accounts;
let server: Server;
let base = '';

beforeAll(async () => {
	db = await openDb(process.env.TEST_DATABASE_URL ?? 'memory://');
	accounts = new Accounts(db);
	const hub = new Hub(accounts);
	server = createServer((req, res) => void handleApi(req, res, accounts, hub));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
	server?.close();
	await db?.close();
});

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
setCrazyGamesKey(publicKey.export({ type: 'spki', format: 'pem' }).toString());

/** A token as CrazyGames' SDK hands it out, signed with `key`. */
function cgToken(payload: Record<string, unknown>, key = privateKey) {
	const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const body = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}`;
	return `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
}

const run = Math.random().toString(36).slice(2, 6);
const json = { 'content-type': 'application/json' };

describe('CrazyGames tokens', () => {
	it('takes a good one and turns away forged, expired and garbled ones', async () => {
		expect(await verifyCrazyGamesToken(cgToken({ userId: 'u1', username: 'Ada' }))).toEqual({ userId: 'u1', username: 'Ada' });
		expect(await verifyCrazyGamesToken(cgToken({ userId: 'u1' }, other.privateKey))).toBeNull();
		expect(await verifyCrazyGamesToken(cgToken({ userId: 'u1', exp: 1000 }))).toBeNull();
		expect(await verifyCrazyGamesToken('not.a.token')).toBeNull();
		expect(await verifyCrazyGamesToken(42)).toBeNull();
	});

	it('makes an account on the first visit and signs the same player into it after', async () => {
		const first = await accounts.crazyGamesLogin({ userId: `cg-${run}`, username: 'Brave Knight' });
		expect(first.user.nickname).toBe('Brave Knight');
		expect(first.user.username).toMatch(/^[a-z0-9_]{3,20}$/);
		const again = await accounts.crazyGamesLogin({ userId: `cg-${run}`, username: 'Brave Knight' });
		expect(again.user.id).toBe(first.user.id);
		expect(await accounts.userForSession(again.token)).toMatchObject({ id: first.user.id });
		// Another player with the same name gets a username of their own.
		const twin = await accounts.crazyGamesLogin({ userId: `cg-${run}-2`, username: 'Brave Knight' });
		expect(twin.user.id).not.toBe(first.user.id);
		expect(twin.user.username).not.toBe(first.user.username);
		// No password signs into it.
		await expect(accounts.login({ username: first.user.username, password: 'crazygames' })).rejects.toThrow('Wrong');
	});
});

describe('the API from another site', () => {
	it('answers the browser asking first, for allowed headers', async () => {
		const res = await fetch(`${base}/api/me`, {
			method: 'OPTIONS',
			headers: { origin: 'https://html-classic.itch.zone', 'access-control-request-method': 'GET' }
		});
		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-origin')).toBe('https://html-classic.itch.zone');
		expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
		// Never with credentials: the cookie stays the game's own site's.
		expect(res.headers.get('access-control-allow-credentials')).toBeNull();
	});

	it('hands the token over when asked, instead of a cookie, and takes it back as a bearer', async () => {
		const origin = { origin: 'https://html-classic.itch.zone' };
		const res = await fetch(`${base}/api/register`, {
			method: 'POST',
			headers: { ...json, ...origin, 'x-reign-auth': 'token' },
			body: JSON.stringify({ username: `itch_${run}`, password: 'secret12', avatar: 'owl' })
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(res.headers.get('access-control-allow-origin')).toBe(origin.origin);
		expect(typeof data.token).toBe('string');
		const me = await fetch(`${base}/api/me`, { headers: { ...origin, authorization: `Bearer ${data.token}` } });
		expect((await me.json()).user.username).toBe(`itch_${run}`);
		expect((await fetch(`${base}/api/me`, { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
	});

	it('keeps the cookie for the game on its own site', async () => {
		const res = await fetch(`${base}/api/register`, {
			method: 'POST',
			headers: json,
			body: JSON.stringify({ username: `web_${run}`, password: 'secret12', avatar: 'owl' })
		});
		expect(res.headers.get('set-cookie')).toMatch(/^reign_session=/);
		expect((await res.json()).token).toBeUndefined();
	});

	it('signs a CrazyGames player in with their token', async () => {
		const res = await fetch(`${base}/api/crazygames`, {
			method: 'POST',
			headers: { ...json, 'x-reign-auth': 'token' },
			body: JSON.stringify({ token: cgToken({ userId: `cg-api-${run}`, username: 'Cleo' }) })
		});
		const data = await res.json();
		expect(data.user.nickname).toBe('Cleo');
		expect(await accounts.userForSession(data.token)).toMatchObject({ id: data.user.id });
		const bad = await fetch(`${base}/api/crazygames`, {
			method: 'POST',
			headers: json,
			body: JSON.stringify({ token: cgToken({ userId: 'x' }, other.privateKey) })
		});
		expect(bad.status).toBe(401);
	});
});
