import type { Quality } from '../scene/stage';
import { sceneRef } from './sceneRef';
import { getVolume, setVolume, type Channel } from './sound';
import { msg } from '../i18n/index.svelte';
import { OFFER_WAITS } from '../../shared/protocol';

/**
 * Player preferences that live in this browser: volumes (owned by the sound module),
 * graphics quality (read by the scene at startup, so changing it reloads), island detail,
 * night mode, reduced motion, the size of the interface, the performance readout and how this
 * player takes trade offers.
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

/** The frame-rate caps to pick from (0: none, as fast as the screen shows). */
export const FPS_CAPS = [0, 30, 60, 120] as const;
export type FpsCap = (typeof FPS_CAPS)[number];
function readFpsCap(): FpsCap {
	const v = Number(read('reign:fpsCap'));
	return FPS_CAPS.includes(v as FpsCap) ? (v as FpsCap) : 0;
}

/** How long other players' dice roll in Conquest, and how fast Gambit's rounds play out. */
export const DICE_PACES = ['slow', 'quick'] as const;
export type DicePace = (typeof DICE_PACES)[number];
export const ROUND_PACES = ['normal', 'fast'] as const;
export type RoundPace = (typeof ROUND_PACES)[number];
function readPick<T extends string>(key: string, from: readonly T[]): T {
	const v = read(key);
	return from.includes(v as T) ? (v as T) : from[0];
}

/** The saved wait for bots' trade offers, in seconds (0: until answered); the standard one if none. */
function readOfferWait(): number {
	const v = read('reign:offerWait');
	return v !== null && OFFER_WAITS.includes(Number(v)) ? Number(v) : OFFER_WAITS[0];
}

const QUALITIES: Quality[] = ['high', 'medium', 'low'];
function readQuality(): Quality {
	const q = QUALITIES.find((k) => k === read('reign:graphics'));
	if (q) return q;
	// Saved before the levels became High, Medium and Low, when they were high, low and veryLow.
	const old = read('reign:quality');
	return old === 'low' ? 'medium' : old === 'veryLow' ? 'low' : 'high';
}

/**
 * Fine unless the player picked Standard. Low graphics, meant for old devices, starts on
 * Standard too, since Fine draws about four times the triangles.
 */
function readDetail(quality: Quality): 1 | 2 {
	const d = read('reign:detail');
	if (d === '1' || d === '2') return d === '2' ? 2 : 1;
	return quality === 'low' ? 1 : 2;
}

export const CHANNELS: { id: Channel; label: string }[] = [
	{ id: 'master', label: msg('Master') },
	{ id: 'sfx', label: msg('Effects') },
	{ id: 'music', label: msg('Music') },
	{ id: 'ambience', label: msg('Fireside') }
];

class Settings {
	quality = $state<Quality>(readQuality());
	/** Voxels per world unit of every game's board: 1 standard, 2 fine (half-size voxels, the default). */
	detail = $state<1 | 2>(readDetail(this.quality));
	/** Frames a second at most (0: no cap). */
	fpsCap = $state<FpsCap>(readFpsCap());
	/** Conquest: other players' dice roll slowly enough to follow, or quickly. */
	dicePace = $state<DicePace>(readPick('reign:dicePace', DICE_PACES));
	/** Gambit: how fast a round plays out on the board. */
	roundPace = $state<RoundPace>(readPick('reign:roundPace', ROUND_PACES));
	/** The room's lights down for a cozy evening: only this player sees it, and it changes nothing in the game. */
	night = $state(read('reign:night') === '1');
	/** A small readout of frames per second and the ping to the server, like competitive games have. */
	showStats = $state(read('reign:stats') === '1');
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
	/** Offers this player hasn't the cards for are declined for them, and never pop up. */
	hideOffers = $state(read('reign:hideOffers') === '1');
	/**
	 * How long bots keep a trade offer open for this player to answer, in seconds, one of
	 * OFFER_WAITS (0: until they answer). The server is told (see client.setOfferWait).
	 */
	offerWait = $state(readOfferWait());
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

	setFpsCap(cap: FpsCap) {
		this.fpsCap = cap;
		write('reign:fpsCap', String(cap));
		if (sceneRef.current) sceneRef.current.stage.maxFps = cap;
	}

	setDicePace(pace: DicePace) {
		this.dicePace = pace;
		write('reign:dicePace', pace);
		applyPaces();
	}

	setRoundPace(pace: RoundPace) {
		this.roundPace = pace;
		write('reign:roundPace', pace);
		applyPaces();
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

	setShowStats(on: boolean) {
		this.showStats = on;
		write('reign:stats', on ? '1' : '0');
	}

	setHideOffers(on: boolean) {
		this.hideOffers = on;
		write('reign:hideOffers', on ? '1' : '0');
	}

	setOfferWait(seconds: number) {
		if (!OFFER_WAITS.includes(seconds)) return;
		this.offerWait = seconds;
		write('reign:offerWait', String(seconds));
	}

	setReduceMotion(on: boolean) {
		this.reduceMotion = on;
		write('reign:reduceMotion', on ? '1' : '0');
		applySettings();
	}
}

export const settings = new Settings();

/** How long someone else's dice roll in Conquest (seconds), and a Gambit round's length as a share of the usual. */
const WATCHED_ROLL: Record<DicePace, number> = { slow: 1.15, quick: 0.62 };
const ROUND_LENGTH: Record<RoundPace, number> = { normal: 1, fast: 0.5 };

/** The pace picks to the scene. */
export function applyPaces() {
	sceneRef.current?.setPaces({ watchedRoll: WATCHED_ROLL[settings.dicePace], round: ROUND_LENGTH[settings.roundPace] });
}

export function applySettings() {
	document.body.classList.toggle('reduce-motion', settings.reduceMotion);
	// Low also spares the interface its costliest effects (see ui.css).
	document.body.classList.toggle('low-graphics', settings.quality === 'low');
}
