import { campaign } from './state/campaign.svelte';
import { mount } from 'svelte';
import './styles/ui.css';
import { prewarmBusts } from './scene/avatars';
import { GameScene } from './scene/gameScene';
import { getIcons } from './scene/icons';
import type { Match } from '../shared/accounts';
import { account, api } from './state/account.svelte';
import { startPlaying } from './state/guestPlay';
import { PLATFORM } from './platform';
import { client } from './state/client.svelte';
import { replay } from './state/replay.svelte';
import { startTelemetry } from './state/telemetry';
import App from './ui/App.svelte';
import { installArt } from './ui/art';
import { applySettings, settings } from './ui/settings.svelte';
import { bootStep, nextPaint, until } from './boot';
import { t } from './i18n/index.svelte';
import { sceneRef } from './ui/sceneRef';
import { armAudio, sfx } from './ui/sound';
import { installTooltips } from './ui/tooltip';

export function mountApp(canvas: HTMLCanvasElement, el: HTMLElement) {
	installArt();
	installTooltips();
	applySettings();
	getIcons();
	sceneRef.current = new GameScene(canvas, settings.quality, settings.detail);
	sceneRef.current.stage.setNight(settings.night, true);
	sceneRef.current.stage.maxFps = settings.fpsCap;
	(window as any).__scene = sceneRef.current;
	sceneRef.current.onPurr = sfx.purr;
	mount(App, { target: el });
	armAudio();
	// The game connection opens once signed in, and closes on signing out.
	account.watch((signedIn) => (signedIn ? client.connect() : client.disconnect()));
	// CrazyGames signs players in itself (see platform/crazygames.ts).
	if (PLATFORM === 'crazygames') void import('./platform/crazygames.svelte').then((m) => m.startCrazyGames());
	// Signed in, or a guest (as is everyone in the offline build) playing bots in this page.
	else startPlaying();
	startTelemetry();
	// The admin panel's "Watch" opens a game's replay here (see src/client/admin).
	const watch = new URLSearchParams(location.search).get('replay');
	if (watch && /^\d+$/.test(watch)) void watchFromAdmin(watch);
	(window as any).__account = account;
	(window as any).__client = client;
	(window as any).__replay = replay;
	(window as any).__campaign = campaign;
	if (new URLSearchParams(location.search).has('autoplay')) {
		import('./autoplay').then((m) => m.startAutoplay());
	}
	// Avatars and portraits draw in the background (see whenReady); a dev script that screenshots
	// them awaits this first.
	(window as any).__portraits = prewarmBusts;
	(window as any).__ready = true;
}

/** Watch any game's replay, for an admin (the server says no to everyone else). */
async function watchFromAdmin(id: string) {
	await until(() => account.status !== 'loading' && (account.status === 'out' || client.status === 'online'), 15_000);
	if (account.status !== 'in') return;
	const url = new URL(location.href);
	url.searchParams.delete('replay');
	history.replaceState(null, '', url);
	try {
		const { match } = await api<{ match: Match }>(`admin/matches/${id}`);
		await replay.watch(match);
	} catch (e) {
		client.toast((e as Error).message, 'error');
	}
}

/**
 * Resolves once the first screen is ready to be seen (the room built, its shaders compiled, the
 * account known and the game server reached), so the loading screen lifts onto a finished menu
 * rather than one that fills in piece by piece. A slow server doesn't hold it up for long: the
 * menu then shows with its "Connecting…" plaque.
 */
export async function whenReady(): Promise<void> {
	bootStep(0.72, 0.88, t('Lighting the hearth'));
	await sceneRef.current?.warmUp();
	bootStep(0.88, 0.97, t('Opening the gates'));
	await until(
		() =>
			account.status === 'out' ||
			(account.status === 'in' && (client.status === 'online' || !!client.joining)),
		8000
	);
	// Two frames, so the menu and its title are drawn before the screen fades.
	await nextPaint();
	await nextPaint();
	// Then draw the avatars and character portraits while nobody is waiting on them, so the lobby,
	// the draft and the player list never do. Dev scripts drive a software renderer where each
	// takes most of a second, so under automation they're only drawn when something shows them.
	if (!navigator.webdriver) {
		if ('requestIdleCallback' in window)
			requestIdleCallback(() => void prewarmBusts(), { timeout: 3000 });
		else setTimeout(() => void prewarmBusts(), 1000);
	}
}
