import { mount } from 'svelte';
import './styles/ui.css';
import { GameScene } from './scene/gameScene';
import { getIcons } from './scene/icons';
import { account } from './state/account.svelte';
import { OFFLINE } from './offline/flag';
import { client } from './state/client.svelte';
import App from './ui/App.svelte';
import { installArt } from './ui/art';
import { applySettings, settings } from './ui/settings.svelte';
import { sceneRef } from './ui/sceneRef';
import { armAudio } from './ui/sound';
import { installTooltips } from './ui/tooltip';

export function mountApp(canvas: HTMLCanvasElement, el: HTMLElement) {
	installArt();
	installTooltips();
	applySettings();
	getIcons();
	sceneRef.current = new GameScene(canvas, settings.quality, settings.detail);
	(window as any).__scene = sceneRef.current;
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
	if (new URLSearchParams(location.search).has('autoplay')) {
		import('./autoplay').then((m) => m.startAutoplay());
	}
	(window as any).__ready = true;
}
