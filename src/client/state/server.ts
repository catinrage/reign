/// <reference types="vite/client" />

/**
 * Where the game server is. The page normally comes from the server itself, so that is its own
 * site. A copy hosted elsewhere (itch.io, CrazyGames: see docs/publishing.md) is built with
 * VITE_SERVER_URL set to the server's address, and signs in with a token it keeps instead of the
 * server's cookie, which browsers don't send from inside another site's frame (see server/api.ts).
 */
const SERVER = (import.meta.env.VITE_SERVER_URL ?? '').trim().replace(/\/+$/, '');

/** The page and the server are on different sites. */
export const REMOTE = SERVER !== '';

/** The server's address, for links that should open the game on its own site (invites). */
export function serverOrigin(): string {
	return SERVER || location.origin;
}

export function apiUrl(path: string): string {
	return `${SERVER}/api/${path}`;
}

export function socketUrl(): string {
	const url = new URL('/ws', serverOrigin());
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	return url.toString();
}

const KEY = 'reign:session';
let token: string | null = null;
try {
	token = REMOTE ? localStorage.getItem(KEY) : null;
} catch {
	/* private mode: signed in until the page closes */
}

/** The session token a page on another site keeps (null on the server's own site, which uses its cookie). */
export function sessionToken(): string | null {
	return token;
}

export function keepSessionToken(value: string | null) {
	token = value;
	try {
		if (value) localStorage.setItem(KEY, value);
		else localStorage.removeItem(KEY);
	} catch {
		/* private mode */
	}
}

/** Open the game connection, with the kept token as a subprotocol when there is one (see server/index.ts). */
export function openServerSocket(url: string): WebSocket {
	return token ? new WebSocket(url, ['reign', `reign-token.${token}`]) : new WebSocket(url);
}
