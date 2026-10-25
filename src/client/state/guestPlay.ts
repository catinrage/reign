import { OFFLINE_BUILD, guest } from '../offline/guest.svelte';
import { account } from './account.svelte';
import { client } from './client.svelte';
import { openServerSocket } from './server';

/**
 * Switching between guest play (bots only, the server inside the page, see offline/guest.svelte.ts)
 * and an account on the real server. A guest stays one across reloads, until they sign in.
 */

const KEY = 'reign:guest';

function remember(on: boolean) {
	try {
		if (on) localStorage.setItem(KEY, '1');
		else localStorage.removeItem(KEY);
	} catch {
		/* private mode */
	}
}

/** This browser played as a guest last time (and wasn't sent here by an invite, which needs an account). */
export function wasGuest(): boolean {
	if (OFFLINE_BUILD) return true;
	if (new URLSearchParams(location.search).has('room')) return false;
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

/** Play as a guest: the rules and the bots run in this page, and the local profile is signed in. */
export async function playAsGuest() {
	const { LocalSocket } = await import('../offline/localServer');
	client.disconnect();
	// A table on the real server can't be joined from here.
	client.joining = null;
	guest.on = true;
	remember(true);
	client.openSocket = () => new LocalSocket() as unknown as WebSocket;
	await account.boot();
}

/** From guest play to the sign-in screen, to play online with an account. */
export function leaveGuest() {
	if (OFFLINE_BUILD) return;
	remember(false);
	account.signedOut();
	guest.on = false;
	client.openSocket = openServerSocket;
}
