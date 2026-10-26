import type { GuestGameReport, Ping } from '../../shared/admin';
import { OFFLINE_BUILD, guest } from '../offline/guest.svelte';
import { PLATFORM } from '../platform';
import { account } from './account.svelte';
import { client } from './client.svelte';
import { apiUrl, sessionToken } from './server';

/**
 * Pings for the admin panel's numbers (see server/analytics.ts): once a minute while the game is
 * open and in view, the page tells the server it's here, on which site, and whether a game is on
 * the table. Guests' games against bots run in the page and never reach the server otherwise, so
 * their start and end are told too. Only a random id this browser keeps goes along: no names,
 * nothing of the game itself. The offline build has no server to tell.
 */

const KEY = 'reign:client';
const EVERY_MS = 60_000;

let id: string | null = null;
let started = false;
/** The guest game on the table, until its end has been told. */
let game: GuestGameReport | null = null;

function clientId(): string {
	if (id) return id;
	try {
		id = localStorage.getItem(KEY);
	} catch {
		/* private mode: a new visitor every time */
	}
	if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
		const bytes = crypto.getRandomValues(new Uint8Array(16));
		id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		try {
			localStorage.setItem(KEY, id);
		} catch {
			/* kept for this visit only */
		}
	}
	return id;
}

function send(extra: Partial<Ping> = {}) {
	if (OFFLINE_BUILD) return;
	const body: Ping = {
		client: clientId(),
		platform: PLATFORM,
		guest: guest.on,
		where: client.view && !client.replaying ? 'game' : 'menu',
		...extra
	};
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	const token = sessionToken();
	if (token && !guest.on) headers.authorization = `Bearer ${token}`;
	fetch(apiUrl('ping'), { method: 'POST', credentials: 'same-origin', keepalive: true, headers, body: JSON.stringify(body) }).catch(
		() => {}
	);
}

/** Start pinging, once the page knows whether it's signed in or a guest. */
export function startTelemetry() {
	if (OFFLINE_BUILD || started) return;
	started = true;
	const first = Date.now();
	const hello = () => {
		if (account.status === 'loading' && Date.now() - first < 60_000) return void setTimeout(hello, 500);
		send({ hello: true });
		setInterval(() => document.visibilityState === 'visible' && send(game ? { game } : {}), EVERY_MS);
		document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && send());
	};
	hello();
}

/** A guest's game against bots started in this page. */
export function guestGameStarted(g: { mode: GuestGameReport['mode']; mission: string | null; bots: number }) {
	const bytes = crypto.getRandomValues(new Uint8Array(9));
	game = {
		id: btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_'),
		mode: g.mode,
		mission: g.mission,
		bots: g.bots,
		status: 'playing',
		turns: 0
	};
	// The table shows a moment later: say so as in a game.
	send({ game, where: 'game' });
}

/** That game ended: the guest won or lost it, or left before it was over. */
export function guestGameEnded(status: 'won' | 'lost' | 'quit', turns: number) {
	if (!game) return;
	const done = { ...game, status, turns };
	game = null;
	send({ game: done, where: status === 'quit' ? 'menu' : 'game' });
}
