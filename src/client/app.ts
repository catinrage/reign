import { mount } from 'svelte';
import './styles/ui.css';
import { GameScene } from './scene/gameScene';
import { getIcons } from './scene/icons';
import { account } from './state/account.svelte';
import { client } from './state/client.svelte';
import App from './ui/App.svelte';
import { installArt } from './ui/art';
import { applySettings } from './ui/settings.svelte';
import { sceneRef } from './ui/sceneRef';
import { armAudio } from './ui/sound';
import { installTooltips } from './ui/tooltip';

export function mountApp(canvas: HTMLCanvasElement, el: HTMLElement) {
	let quality: 'high' | 'low' = 'high';
	let detail = 1;
	try {
		quality = (localStorage.getItem('reign:quality') as 'high' | 'low') ?? 'high';
		detail = localStorage.getItem('reign:detail') === '2' ? 2 : 1;
	} catch {
		/* ignore */
	}
	installArt();
	installTooltips();
	applySettings();
	getIcons();
	sceneRef.current = new GameScene(canvas, quality, detail);
	(window as any).__scene = sceneRef.current;
	mount(App, { target: el });
	armAudio();
	// The game connection opens once signed in, and closes on signing out.
	account.onChange = (signedIn) => (signedIn ? client.connect() : client.disconnect());
	void account.boot();
	(window as any).__account = account;
	(window as any).__client = client;
	if (new URLSearchParams(location.search).has('autoplay')) {
		import('./autoplay').then((m) => m.startAutoplay());
	}
	(window as any).__ready = true;
}
