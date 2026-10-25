import { REMOTE, serverOrigin } from '../state/server';

/**
 * Which site this build is for (see docs/publishing.md). Vite sets it from the build's mode:
 * - web: served by the game server itself (the default);
 * - itch: an upload for itch.io (and the like: Newgrounds, GameJolt), talking to the server from afar;
 * - crazygames: an upload for CrazyGames, with its SDK (see crazygames.ts).
 */
declare const __REIGN_PLATFORM__: 'web' | 'itch' | 'crazygames';
export const PLATFORM = __REIGN_PLATFORM__;

/** The site signs players in itself (CrazyGames): the game shows no sign-in screen or sign-out of its own. */
export const SITE_ACCOUNTS = PLATFORM === 'crazygames';

/** What a site's SDK hears from the game. Only CrazyGames has one; elsewhere these do nothing. */
export interface PlatformHooks {
	/** The game finished loading and shows its menu. */
	loaded(): void;
	/** A game started on the table (true) or the player is back in the menus (false). */
	playing(on: boolean): void;
	/** A link that brings a friend to this table. */
	inviteLink(code: string): string | null;
	/** Sign in with the site's own account (CrazyGames' sign-in window). */
	signIn(): Promise<void>;
}

export const platform: PlatformHooks = {
	loaded() {},
	playing() {},
	inviteLink: () => null,
	signIn: async () => {}
};

/** The link to send a friend for table `code`: the site's own, or the game on the server's site. */
export function inviteLink(code: string | null): string {
	const own = code ? platform.inviteLink(code) : null;
	if (own) return own;
	// A copy on another site sends friends to the server's copy: itch.io can't pass ?room= into its frame.
	const url = new URL(REMOTE ? `${serverOrigin()}/` : location.origin + location.pathname);
	if (code) url.searchParams.set('room', code);
	return url.toString();
}
