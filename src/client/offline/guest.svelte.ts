/**
 * Guest play: the game server runs inside the page, there is no account, and only games against
 * bots can be played (and the campaign, kept in this browser). Anyone can pick it on the sign-in
 * screen to try the game; playing with other people takes an account.
 *
 * The offline build (`pnpm build:offline`) has no server at all, so there everyone is a guest.
 * Vite sets that at build time, so the normal build keeps the sign-in screen.
 */
declare const __REIGN_OFFLINE__: boolean;

export const OFFLINE_BUILD: boolean = __REIGN_OFFLINE__;

class Guest {
	/** Playing as a guest right now: the local server and the local profile stand in. */
	on = $state(OFFLINE_BUILD);
}

export const guest = new Guest();
