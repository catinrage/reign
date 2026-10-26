import { t } from '../i18n/index.svelte';
import { guest } from '../offline/guest.svelte';
import { api, account } from '../state/account.svelte';
import { client } from '../state/client.svelte';
import { leaveGuest, playAsGuest } from '../state/guestPlay';
import { setSiteMuted } from '../ui/sound';
import { platform } from '.';
import { site } from './site.svelte';

/**
 * The CrazyGames build (see docs/publishing.md). CrazyGames' rules: no logins of the game's own.
 * A player signed in to CrazyGames is signed in to Reign with it (the server makes their account
 * on their first visit, see server/crazygames.ts); anyone else plays as a guest, against bots,
 * until they sign in to CrazyGames to play online. The SDK also hears when the game has loaded
 * and when a game is being played, makes the invite links, hears which table the player sits at
 * (so friends can join from CrazyGames' own friends list), and shows the ads: a short one back in
 * the menu after a game, and a rewarded one for a campaign head start.
 * See https://docs.crazygames.com/sdk/intro and docs.crazygames.com/requirements/multiplayer
 */

interface CrazyUser {
	username: string;
}

interface CrazySettings {
	disableChat: boolean;
	muteAudio: boolean;
}

interface AdCallbacks {
	adStarted?(): void;
	adFinished?(): void;
	adError?(error: unknown): void;
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
		/** The party leader opened the game from CrazyGames to play with friends: straight to a table. */
		isInstantMultiplayer?: boolean;
		updateRoom?(room: {
			roomId?: string;
			isJoinable?: boolean;
			inviteParams?: Record<string, string>;
		}): void;
		leftRoom?(): void;
		addJoinRoomListener?(fn: (params: Record<string, string>) => void): void;
		settings?: CrazySettings;
		addSettingsChangeListener?(fn: (settings: CrazySettings) => void): void;
	};
	ad: {
		requestAd(kind: 'midgame' | 'rewarded', callbacks: AdCallbacks): void;
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
	// A guest's requests go to the server inside the page: off to the real server first.
	const wasGuest = guest.on;
	if (wasGuest) leaveGuest();
	try {
		// Keeps the Reign session token (see state/server.ts), then signs in with it below.
		await api('crazygames', 'POST', { token });
	} catch (e) {
		if (wasGuest) await playAsGuest();
		throw e;
	}
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
		// A short ad back in the menu after a game (never during one: the table would wait).
		const playing = platform.playing;
		platform.playing = (on) => {
			const was = started;
			playing(on);
			if (was && !on) void showAd(cg, 'midgame');
		};
		site.rewarded = true;
		platform.rewardedAd = () => showAd(cg, 'rewarded');
		watchSettings(cg);
		reportRoom(cg);
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
			if (user && (account.status !== 'in' || guest.on)) void signInWithCrazyGames(cg).catch(() => {});
		});
	}
	const signedIn = s ? await signInWithCrazyGames(s).catch(() => false) : false;
	if (!signedIn) await playAsGuest();
	if (!s) return;
	const cg = s;
	// A friend's invite, or joining a friend from CrazyGames' friends list while already playing.
	joinFriend(cg.game.getInviteParam('room'), false);
	cg.game.addJoinRoomListener?.((params) => joinFriend(params?.room, true));
	// Opened from CrazyGames to play with friends: a new private table, ready to invite them to.
	if (cg.game.isInstantMultiplayer && !cg.game.getInviteParam('room')) void instantTable();
}

/**
 * Sit down at a friend's table, which takes a CrazyGames account. `ask` opens CrazyGames' sign-in
 * for a guest (they just picked the friend on CrazyGames); otherwise a note says so.
 */
function joinFriend(code: string | null | undefined, ask: boolean) {
	const room = code?.toUpperCase();
	if (!room || !/^[A-Z]{5}$/.test(room) || client.code === room) return;
	if (account.status !== 'in' || guest.on) {
		client.toast(t('Sign in to CrazyGames to join your friend.'), 'info');
		if (ask) {
			void platform.signIn().then(() => {
				if (account.status === 'in' && !guest.on) joinFriend(room, false);
			});
		}
		return;
	}
	if (client.code) client.leave();
	client.join(room);
}

/** Instant multiplayer: the party leader lands at a new unlisted table, signing in first if need be. */
async function instantTable() {
	if (account.status !== 'in' || guest.on) await platform.signIn();
	if (account.status !== 'in' || guest.on) return;
	// Messages wait for the connection, so the table opens as soon as it is up.
	if (!client.code && !client.pendingJoin) client.create('settlement', false);
}

/** CrazyGames' settings: chat off, audio muted. They can change while the game runs. */
function watchSettings(cg: CrazySdk) {
	const apply = (s: CrazySettings | undefined) => {
		site.chatOff = !!s?.disableChat;
		settingsMute = !!s?.muteAudio;
		setSiteMuted(settingsMute || adPlaying);
	};
	apply(cg.game.settings);
	cg.game.addSettingsChangeListener?.(apply);
}

let settingsMute = false;
let adPlaying = false;

/** Show an ad, the game muted while it plays. True when it played to the end (a reward is earned). */
function showAd(cg: CrazySdk, kind: 'midgame' | 'rewarded'): Promise<boolean> {
	return new Promise((done) => {
		const end = (watched: boolean) => {
			adPlaying = false;
			setSiteMuted(settingsMute);
			done(watched);
		};
		try {
			cg.ad.requestAd(kind, {
				adStarted: () => {
					adPlaying = true;
					setSiteMuted(true);
				},
				adFinished: () => end(true),
				adError: (e) => {
					if (kind === 'rewarded')
						client.toast(t('No ad to watch right now. Try again in a moment.'), 'info');
					console.warn('[crazygames] no ad', e);
					end(false);
				}
			});
		} catch (e) {
			console.warn('[crazygames] no ad', e);
			end(false);
		}
	});
}

/**
 * Tell CrazyGames which table the player sits at and whether friends can still join it, so its
 * friends list can bring them over. Guest tables (bots, in this page) and campaign tables are
 * nobody else's to join.
 */
function reportRoom(cg: CrazySdk) {
	if (!cg.game.updateRoom) return;
	let reported: string | null = null;
	$effect.root(() => {
		$effect(() => {
			const lobby = client.lobby;
			const mine = lobby && client.seat && !guest.on && !lobby.mission ? lobby : null;
			if (!mine) {
				if (reported) cg.game.leftRoom?.();
				reported = null;
				return;
			}
			const joinable = !mine.started && mine.seats.length < mine.maxPlayers;
			const key = `${mine.code}:${joinable}`;
			if (key === reported) return;
			reported = key;
			cg.game.updateRoom!({
				roomId: mine.code,
				isJoinable: joinable,
				inviteParams: { room: mine.code }
			});
		});
	});
}
