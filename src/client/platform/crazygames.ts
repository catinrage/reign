import { t } from '../i18n/index.svelte';
import { guest } from '../offline/guest.svelte';
import { api, account } from '../state/account.svelte';
import { client } from '../state/client.svelte';
import { leaveGuest, playAsGuest } from '../state/guestPlay';
import { platform } from '.';

/**
 * The CrazyGames build (see docs/publishing.md). CrazyGames' rules: no logins of the game's own.
 * A player signed in to CrazyGames is signed in to Reign with it (the server makes their account
 * on their first visit, see server/crazygames.ts); anyone else plays as a guest, against bots,
 * until they sign in to CrazyGames to play online. The SDK also hears when the game has loaded
 * and when a game is being played, and makes the invite links.
 * See https://docs.crazygames.com/sdk/html5-v3/intro
 */

interface CrazyUser {
	username: string;
}

interface CrazySdk {
	init(): Promise<void>;
	environment: 'local' | 'crazygames' | 'disabled';
	game: {
		loadingStart(): void;
		loadingStop(): void;
		gameplayStart(): void;
		gameplayStop(): void;
		inviteLink(params: Record<string, string>): string;
		getInviteParam(name: string): string | null;
	};
	user: {
		isUserAccountAvailable: boolean;
		getUser(): Promise<CrazyUser | null>;
		getUserToken(): Promise<string>;
		showAuthPrompt(): Promise<CrazyUser | null>;
		addAuthListener(fn: (user: CrazyUser | null) => void): void;
	};
}

function sdk(): CrazySdk | null {
	const s = (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK;
	return s && s.environment !== 'disabled' ? s : null;
}

/** Sign in to Reign with the player's CrazyGames account, if they are signed in to CrazyGames. */
async function signInWithCrazyGames(s: CrazySdk): Promise<boolean> {
	if (!s.user.isUserAccountAvailable || !(await s.user.getUser())) return false;
	const token = await s.user.getUserToken();
	// Keeps the Reign session token (see state/server.ts), then signs in with it below.
	await api('crazygames', 'POST', { token });
	if (guest.on) leaveGuest();
	await account.boot();
	return account.status === 'in';
}

/** Start the game on CrazyGames: the SDK first, then the player's account or a guest's table. */
export async function startCrazyGames() {
	let s: CrazySdk | null = null;
	try {
		await (window as unknown as { CrazyGames: { SDK: CrazySdk } }).CrazyGames.SDK.init();
		s = sdk();
	} catch (e) {
		console.warn('[crazygames] no SDK here, playing without it', e);
	}
	if (s) {
		const cg = s;
		cg.game.loadingStart();
		let started = false;
		platform.loaded = () => cg.game.loadingStop();
		platform.playing = (on) => {
			if (on === started) return;
			started = on;
			if (on) cg.game.gameplayStart();
			else cg.game.gameplayStop();
		};
		platform.inviteLink = (code) => cg.game.inviteLink({ room: code });
		platform.signIn = async () => {
			try {
				await cg.user.showAuthPrompt();
			} catch {
				/* cancelled, or already signed in */
			}
			await signInWithCrazyGames(cg).catch((e) => client.toast((e as Error).message, 'error'));
		};
		// Signing in to CrazyGames while playing (from its own bar) signs in here too.
		cg.user.addAuthListener((user) => {
			if (user && account.status !== 'in') void signInWithCrazyGames(cg).catch(() => {});
		});
	}
	const signedIn = s ? await signInWithCrazyGames(s).catch(() => false) : false;
	if (!signedIn) await playAsGuest();
	// A friend's invite: their table, which takes a CrazyGames account to join.
	const room = s?.game.getInviteParam('room')?.toUpperCase();
	if (room && /^[A-Z]{5}$/.test(room)) {
		if (account.status === 'in' && !guest.on) client.join(room);
		else client.toast(t('Sign in to CrazyGames to join your friend.'), 'info');
	}
}
