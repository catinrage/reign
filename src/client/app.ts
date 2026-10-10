import { mount } from 'svelte';
import './styles/ui.css';
import { prewarmBusts } from './scene/avatars';
import { GameScene } from './scene/gameScene';
import { getIcons } from './scene/icons';
import { account } from './state/account.svelte';
import { OFFLINE } from './offline/flag';
import { client } from './state/client.svelte';
import { replay } from './state/replay.svelte';
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
	(window as any).__scene = sceneRef.current;
	sceneRef.current.onPurr = sfx.purr;
	mount(App, { target: el });
	armAudio();
	// The game connection opens once signed in, and closes on signing out.
	account.watch((signedIn) => (signedIn ? client.connect() : client.disconnect()));
	if (OFFLINE) {
		// No server: the rules and the bots run in this page, and the one local player is signed in.
		void import('./offline/localServer').then(({ LocalSocket }) => {
			client.openSocket = () => new LocalSocket() as unknown as WebSocket;
			void account.boot();
		});
	} else void account.boot();
	(window as any).__account = account;
	(window as any).__client = client;
	(window as any).__replay = replay;
	if (new URLSearchParams(location.search).has('autoplay')) {
		import('./autoplay').then((m) => m.startAutoplay());
	}
	// Draw the avatars and character portraits while nobody is waiting on them, so the lobby, the
	// draft and the player list never do. Dev scripts drive a software renderer where each takes
	// most of a second, so under automation they're drawn when something shows them, and a script
	// that screenshots them awaits `__portraits()` first.
	(window as any).__portraits = prewarmBusts;
	if (!navigator.webdriver) {
		if ('requestIdleCallback' in window)
			requestIdleCallback(() => void prewarmBusts(), { timeout: 3000 });
		else setTimeout(() => void prewarmBusts(), 2000);
	}
	(window as any).__ready = true;
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
}
