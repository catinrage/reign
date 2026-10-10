import type { Quality } from '../scene/stage';
import { sceneRef } from './sceneRef';
import { getVolume, setVolume, type Channel } from './sound';
import { msg } from '../i18n/index.svelte';

/**
 * Player preferences that live in this browser: volumes (owned by the sound module),
 * graphics quality (read by the scene at startup, so changing it reloads), island detail,
 * night mode, reduced motion and the size of the interface.
 */

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function write(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* private mode */
	}
}

/** How far the interface sizes go each way, as a share of the standard size. */
export const SIZE_MIN = 0.7;
export const SIZE_MAX = 1.5;

function readSize(key: string): number {
	const v = Number(read(key) ?? 1);
	return Number.isFinite(v) && v >= SIZE_MIN && v <= SIZE_MAX ? v : 1;
}
function clampSize(v: number): number {
	return Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, v)) * 100) / 100;
}

const QUALITIES: Quality[] = ['high', 'medium', 'low'];
function readQuality(): Quality {
	const q = QUALITIES.find((k) => k === read('reign:graphics'));
	if (q) return q;
	// Saved before the levels became High, Medium and Low, when they were high, low and veryLow.
	const old = read('reign:quality');
	return old === 'low' ? 'medium' : old === 'veryLow' ? 'low' : 'high';
}

export const CHANNELS: { id: Channel; label: string }[] = [
	{ id: 'master', label: msg('Master') },
	{ id: 'sfx', label: msg('Effects') },
	{ id: 'music', label: msg('Music') },
	{ id: 'ambience', label: msg('Fireside') }
];

class Settings {
	quality = $state<Quality>(readQuality());
	/** Voxels per terrain unit: 1 standard, 2 fine (an experiment with half-size voxels). */
	detail = $state<1 | 2>(read('reign:detail') === '2' ? 2 : 1);
	/** The room's lights down for a cozy evening: only this player sees it, and it changes nothing in the game. */
	night = $state(read('reign:night') === '1');
	reduceMotion = $state(
		read('reign:reduceMotion') === null
			? typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
			: read('reign:reduceMotion') === '1'
	);
	/**
	 * How big the interface is drawn, 1 being the standard size: the HUD over the table in a
	 * game, and the menus (main menu, lobby, the in-game menu and its settings).
	 */
	hudSize = $state(readSize('reign:hudSize'));
	menuSize = $state(readSize('reign:menuSize'));
	volumes = $state<Record<Channel, number>>({
		master: getVolume('master'),
		sfx: getVolume('sfx'),
		music: getVolume('music'),
		ambience: getVolume('ambience')
	});

	setVolume(channel: Channel, v: number) {
		this.volumes[channel] = v;
		setVolume(channel, v);
	}

	setQuality(q: Quality) {
		if (q === this.quality) return;
		this.quality = q;
		write('reign:graphics', q);
		// The renderer is set up once, so a reload applies it (the seat is reclaimed on reconnect).
		location.reload();
	}

	setDetail(d: 1 | 2) {
		if (d === this.detail) return;
		this.detail = d;
		write('reign:detail', String(d));
		// Rebuilding takes a moment; let the button show its new state first.
		setTimeout(() => sceneRef.current?.setDetail(d), 50);
	}

	setNight(on: boolean) {
		if (on === this.night) return;
		this.night = on;
		write('reign:night', on ? '1' : '0');
		sceneRef.current?.stage.setNight(on);
	}

	setHudSize(v: number) {
		this.hudSize = clampSize(v);
		write('reign:hudSize', String(this.hudSize));
	}

	setMenuSize(v: number) {
		this.menuSize = clampSize(v);
		write('reign:menuSize', String(this.menuSize));
	}

	setReduceMotion(on: boolean) {
		this.reduceMotion = on;
		write('reign:reduceMotion', on ? '1' : '0');
		applySettings();
	}
}

export const settings = new Settings();

export function applySettings() {
	document.body.classList.toggle('reduce-motion', settings.reduceMotion);
	// Low also spares the interface its costliest effects (see ui.css).
	document.body.classList.toggle('low-graphics', settings.quality === 'low');
}
