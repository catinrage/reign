import { createPublicKey, verify } from 'node:crypto';

/**
 * Signing in with a CrazyGames account. On CrazyGames the game takes no logins of its own: the
 * CrazyGames SDK hands the page a token (a JWT signed by CrazyGames) for the signed-in player,
 * and the server checks it here with CrazyGames' public key before signing them in.
 * See https://docs.crazygames.com/sdk/html5-v3/user
 */

const KEY_URL = 'https://sdk.crazygames.com/publicKey.json';
/** Set to the game's id on CrazyGames to turn away tokens made for other games. */
const GAME_ID = process.env.CRAZYGAMES_GAME_ID || null;

let key: { pem: string; at: number } | null = null;
const KEY_MAX_AGE_MS = 6 * 60 * 60_000;
/** A bad token fetches the key again, but no more often than this. */
const KEY_MIN_AGE_MS = 60_000;

async function publicKey(fresh: boolean): Promise<string> {
	const age = key ? Date.now() - key.at : Infinity;
	if (key && (fresh ? age < KEY_MIN_AGE_MS : age < KEY_MAX_AGE_MS)) return key.pem;
	const res = await fetch(KEY_URL);
	if (!res.ok) throw new Error(`CrazyGames public key: HTTP ${res.status}`);
	const text = String(((await res.json()) as { publicKey?: unknown }).publicKey ?? '').trim();
	if (!text) throw new Error('CrazyGames public key is empty');
	const pem = text.includes('BEGIN') ? text : `-----BEGIN PUBLIC KEY-----\n${text}\n-----END PUBLIC KEY-----`;
	key = { pem, at: Date.now() };
	return pem;
}

export interface CrazyGamesUser {
	userId: string;
	username: string;
}

function decode(part: string): Record<string, unknown> {
	return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** Check a token against a key; the player it names, or null when it isn't good. */
function check(token: string, pem: string, now: number): CrazyGamesUser | null {
	const [head, body, sig] = token.split('.');
	if (!head || !body || !sig) return null;
	let header: Record<string, unknown>;
	let payload: Record<string, unknown>;
	try {
		header = decode(head);
		payload = decode(body);
	} catch {
		return null;
	}
	if (header.alg !== 'RS256') return null;
	const ok = verify('RSA-SHA256', Buffer.from(`${head}.${body}`), createPublicKey(pem), Buffer.from(sig, 'base64url'));
	if (!ok) return null;
	if (typeof payload.exp === 'number' && payload.exp * 1000 < now) return null;
	if (GAME_ID && String(payload.gameId) !== GAME_ID) return null;
	if (typeof payload.userId !== 'string' || !payload.userId) return null;
	return { userId: payload.userId, username: String(payload.username ?? '') };
}

/** The CrazyGames player a token is for, or null when it isn't a good token. */
export async function verifyCrazyGamesToken(token: unknown, now = Date.now()): Promise<CrazyGamesUser | null> {
	if (typeof token !== 'string' || token.length > 8192) return null;
	const pem = await publicKey(false);
	const user = check(token, pem, now);
	if (user) return user;
	// CrazyGames may have changed its key since it was fetched: try once more with a fresh one.
	const fresh = await publicKey(true);
	return fresh === pem ? null : check(token, fresh, now);
}

/** For tests: use this key instead of fetching CrazyGames' own. */
export function setCrazyGamesKey(pem: string) {
	key = { pem, at: Date.now() };
}
