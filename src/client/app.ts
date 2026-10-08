import { mount } from 'svelte';
import './styles/ui.css';
import { GameScene } from './scene/gameScene';
import { getIcons } from './scene/icons';
import { client } from './state/client.svelte';
import App from './ui/App.svelte';
import { sceneRef } from './ui/sceneRef';
import { armAudio } from './ui/sound';

export function mountApp(canvas: HTMLCanvasElement, el: HTMLElement) {
	let quality: 'high' | 'low' = 'high';
	try {
		quality = (localStorage.getItem('reign:quality') as 'high' | 'low') ?? 'high';
	} catch {
		/* ignore */
	}
	getIcons();
	sceneRef.current = new GameScene(canvas, quality);
	(window as any).__scene = sceneRef.current;
	mount(App, { target: el });
	armAudio();
	client.connect();
	(window as any).__client = client;
	if (new URLSearchParams(location.search).has('autoplay')) {
		import('./autoplay').then((m) => m.startAutoplay());
	}
	(window as any).__ready = true;
}
