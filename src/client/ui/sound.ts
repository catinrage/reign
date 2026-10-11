/**
 * Sound: one-shot effects, the fireside ambience loop and the tavern music.
 *
 * Samples (generated with ElevenLabs) live in public/sfx and are decoded with WebAudio on first
 * use; until a sample is ready the synthesized version plays. The ambience and the music start
 * after the first user gesture. The music streams from public/music through an <audio> element, so
 * the ~1 MB file is never decoded up front; the file is cut to whole bars with its end crossfaded
 * into its start, so it loops seamlessly.
 *
 * Mix: one-shots -> sfx bus, ambience -> ambience bus, music -> music bus, and every bus feeds the
 * master gain, which also carries mute. Channel volumes are linear 0..1 and persist per browser.
 */

const SAMPLES = [
	'dice',
	'build',
	'coin',
	'turn',
	'robber',
	'steal',
	'error',
	'win',
	'pop',
	'card',
	'click',
	'open',
	'close',
	'hover',
	'seven',
	'flutter',
	'coo',
	'horn',
	'trade',
	'tearDown',
	'purr'
] as const;
type SampleName = (typeof SAMPLES)[number];

/** Per-sample playback gain (the files are loudness-normalized, this sets the mix). */
const VOLUME: Record<SampleName, number> = {
	dice: 0.8,
	build: 0.75,
	coin: 0.5,
	turn: 0.6,
	robber: 0.7,
	steal: 0.6,
	error: 0.55,
	win: 0.65,
	pop: 0.45,
	card: 0.6,
	// UI sounds sit with the quieter game sounds; hover is a barely-there tick.
	click: 0.55,
	open: 0.45,
	close: 0.5,
	hover: 0.13,
	seven: 0.8,
	flutter: 0.5,
	coo: 0.55,
	horn: 0.7,
	trade: 0.5,
	tearDown: 0.7,
	purr: 0.6
};
/** Random pitch spread (playbackRate +/- this) for sounds that repeat a lot. */
const VARY: Partial<Record<SampleName, number>> = {
	dice: 0.06,
	build: 0.08,
	pop: 0.12,
	card: 0.08,
	click: 0.05,
	hover: 0.08,
	open: 0.03,
	close: 0.03,
	flutter: 0.08,
	coo: 0.06
};

const AMBIENCE_GAIN = 0.12;
const AMBIENCE_FADE_IN = 4;
/** Hover ticks closer together than this are dropped. */
const HOVER_GAP_MS = 70;

// ---------------------------------------------------------------- channels

export type Channel = 'master' | 'sfx' | 'music' | 'ambience';
const CHANNELS: Channel[] = ['master', 'sfx', 'music', 'ambience'];
const DEFAULT_VOLUME: Record<Channel, number> = {
	master: 0.9,
	sfx: 0.9,
	music: 0.45,
	ambience: 0.6
};
const volume: Record<Channel, number> = { ...DEFAULT_VOLUME };

let muted = false;
try {
	muted = localStorage.getItem('reign:muted') === '1';
	for (const ch of CHANNELS) {
		const s = localStorage.getItem(`reign:vol:${ch}`);
		const v = s === null ? NaN : Number(s);
		if (Number.isFinite(v)) volume[ch] = clamp01(v);
	}
} catch {
	/* ignore */
}

function clamp01(v: number) {
	return Math.min(1, Math.max(0, v));
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let ambienceBus: GainNode | null = null;
let musicBus: GainNode | null = null;
/** Set by the first user gesture: from then on the context may run and the music may play. */
let armed = false;

const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;

/** The audio context and its buses, created on demand (even while muted, so loading and ambience can resume). */
function context(): AudioContext | null {
	if (!ctx) {
		try {
			const a = new AudioContext();
			master = a.createGain();
			master.gain.value = muted ? 0 : volume.master;
			master.connect(a.destination);
			const bus = (v: number) => {
				const g = a.createGain();
				g.gain.value = v;
				g.connect(master!);
				return g;
			};
			sfxBus = bus(volume.sfx);
			ambienceBus = bus(volume.ambience);
			musicBus = bus(volume.music);
			ctx = a;
		} catch {
			return null;
		}
	}
	// 'interrupted' is Safari's state after a phone call or similar
	if (ctx.state !== 'running' && ctx.state !== 'closed' && !muted) ctx.resume().catch(() => {});
	return ctx;
}

/**
 * Context for playing a one-shot, or null when muted / unavailable. Before the first gesture the
 * context cannot run, so nothing is scheduled (it would all play at once on the first click).
 */
function ac(): AudioContext | null {
	if (muted || !(armed || ctx?.state === 'running')) return null;
	const a = context();
	if (a) loadSamples();
	return a;
}

/** Where one-shots (samples and their synthesized fallbacks) go. */
function out(): AudioNode {
	return sfxBus!;
}

/** Glide a param from its current value to `v` without jumping, even if another ramp is running. */
function glide(p: AudioParam, v: number, seconds: number, linear = false) {
	if (!ctx) return;
	const t = ctx.currentTime;
	const now = p.value;
	p.cancelScheduledValues(t);
	p.setValueAtTime(now, t);
	if (linear) p.linearRampToValueAtTime(v, t + seconds);
	else p.setTargetAtTime(v, t, seconds / 3);
}

/** A channel's volume, 0..1. */
export function getVolume(ch: Channel): number {
	return volume[ch];
}

/** Set a channel's volume (0..1). It glides there at once and is remembered in this browser. */
export function setVolume(ch: Channel, v: number) {
	const x = Number.isFinite(v) ? clamp01(v) : DEFAULT_VOLUME[ch];
	volume[ch] = x;
	try {
		localStorage.setItem(`reign:vol:${ch}`, String(x));
	} catch {
		/* ignore */
	}
	const node = { master, sfx: sfxBus, music: musicBus, ambience: ambienceBus }[ch];
	if (node) glide(node.gain, ch === 'master' && muted ? 0 : x, 0.08);
}

async function loadOne(a: AudioContext, name: string) {
	try {
		const res = await fetch(`/sfx/${name}.mp3`);
		if (!res.ok) return;
		const data = await res.arrayBuffer();
		const buf = await a.decodeAudioData(data);
		buffers.set(name, buf);
	} catch {
		/* keep the synthesized fallback */
	}
}

/** Fetch and decode every sample once. Safe to call repeatedly. */
export function loadSamples(): Promise<void> {
	const a = context();
	if (!a) return Promise.resolve();
	if (!loading) {
		loading = Promise.all([...SAMPLES, 'ambience'].map((n) => loadOne(a, n))).then(() => {
			if (ambienceWanted) startAmbience();
		});
	}
	return loading;
}

/** Play a decoded sample. Returns false when it is not loaded yet (caller falls back to synth). */
function sample(name: SampleName, delay = 0): boolean {
	const a = ac();
	if (!a) return true; // muted or not armed: nothing to play, and no fallback either
	const buf = buffers.get(name);
	if (!buf) return false;
	const t = a.currentTime + delay;
	const src = a.createBufferSource();
	src.buffer = buf;
	const vary = VARY[name];
	let vol = VOLUME[name];
	if (vary) {
		src.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
		vol *= 0.85 + Math.random() * 0.3;
	}
	const g = a.createGain();
	g.gain.value = vol;
	src.connect(g).connect(out());
	src.start(t);
	return true;
}

export function isMuted() {
	return muted;
}

export function setMuted(m: boolean) {
	muted = m;
	try {
		localStorage.setItem('reign:muted', m ? '1' : '0');
	} catch {
		/* ignore */
	}
	if (m) {
		if (master) glide(master.gain, 0, 0.15);
		stopAmbienceSource(0.3);
	} else {
		const a = context(); // unmuting is a click, so creating/resuming the context is allowed
		if (a && master) {
			glide(master.gain, volume.master, 0.15);
			loadSamples();
		}
		if (ambienceWanted) startAmbience();
	}
	applyMusic();
}

// ---------------------------------------------------------------- ambience

let ambienceWanted = false;
let ambSrc: AudioBufferSourceNode | null = null;
let ambGain: GainNode | null = null;

/** Range of the loop without any decoder padding (near-silent samples) at either end. */
function loopBounds(buf: AudioBuffer): [number, number] {
	const d = buf.getChannelData(0);
	const eps = 1e-4;
	let s = 0;
	while (s < d.length - 1 && Math.abs(d[s]) < eps) s++;
	let e = d.length - 1;
	while (e > s && Math.abs(d[e]) < eps) e--;
	return [s / buf.sampleRate, (e + 1) / buf.sampleRate];
}

/** Start the quiet fireplace loop (fades in). Remembers the wish while muted or still loading. */
export function startAmbience() {
	ambienceWanted = true;
	if (muted || ambSrc) return;
	const a = context();
	if (!a) return;
	const buf = buffers.get('ambience');
	if (!buf) {
		loadSamples();
		return;
	}
	const [s, e] = loopBounds(buf);
	const src = a.createBufferSource();
	src.buffer = buf;
	src.loop = true;
	src.loopStart = s;
	src.loopEnd = e;
	const g = a.createGain();
	g.gain.setValueAtTime(0.0001, a.currentTime);
	g.gain.linearRampToValueAtTime(AMBIENCE_GAIN, a.currentTime + AMBIENCE_FADE_IN);
	src.connect(g).connect(ambienceBus!);
	src.start(a.currentTime, s);
	ambSrc = src;
	ambGain = g;
}

function stopAmbienceSource(fade: number) {
	if (!ambSrc || !ambGain || !ctx) return;
	const t = ctx.currentTime;
	ambGain.gain.cancelScheduledValues(t);
	ambGain.gain.setValueAtTime(ambGain.gain.value, t);
	ambGain.gain.linearRampToValueAtTime(0.0001, t + fade);
	ambSrc.stop(t + fade + 0.05);
	ambSrc = null;
	ambGain = null;
}

/** Fade the ambience out and forget it. */
export function stopAmbience() {
	ambienceWanted = false;
	stopAmbienceSource(1.2);
}

// ---------------------------------------------------------------- music

export type MusicMode = 'menu' | 'game' | 'off';
const MUSIC_URL = '/music/tavern.mp3';
/** Level of the track (before the music channel volume) in each mode. */
const MUSIC_LEVEL: Record<MusicMode, number> = { menu: 1, game: 0.45, off: 0 };
const MUSIC_FADE = 2;
const MUSIC_MUTE_FADE = 0.3;

let musicMode: MusicMode = 'menu';
let musicEl: HTMLAudioElement | null = null;
let musicGain: GainNode | null = null;
let musicBroken = false;
let musicPause: ReturnType<typeof setTimeout> | null = null;

/** The <audio> element streaming the track into the music bus, created on first use. */
function musicNode(a: AudioContext): GainNode | null {
	if (musicGain || musicBroken) return musicGain;
	try {
		const el = new Audio(MUSIC_URL);
		el.loop = true;
		el.preload = 'auto';
		el.addEventListener('error', () => {
			musicBroken = true;
		});
		const g = a.createGain();
		g.gain.value = 0;
		a.createMediaElementSource(el).connect(g).connect(musicBus!);
		musicEl = el;
		musicGain = g;
	} catch {
		musicBroken = true;
	}
	return musicGain;
}

/** Fade the music to what the mode and mute ask for; pause the element once it is silent. */
function applyMusic() {
	if (!armed || musicBroken) return;
	const level = muted ? 0 : MUSIC_LEVEL[musicMode];
	if (!level && !musicEl) return;
	const a = context();
	const g = a && musicNode(a);
	const el = musicEl;
	if (!g || !el) return;
	if (musicPause) clearTimeout(musicPause);
	musicPause = null;
	const fade = muted ? MUSIC_MUTE_FADE : MUSIC_FADE;
	glide(g.gain, level, fade, true);
	if (level) {
		if (el.paused)
			el.play().catch((err: unknown) => {
				if ((err as DOMException)?.name === 'NotAllowedError') retryMusicOnGesture();
			});
	} else {
		musicPause = setTimeout(
			() => {
				musicPause = null;
				el.pause();
			},
			fade * 1000 + 100
		);
	}
}

/**
 * Choose the music: 'menu' plays the tavern track at the music volume, 'game' plays it at about
 * 45% of that under the game, 'off' fades it out. Changes fade over ~2 s. Before the first user
 * gesture the mode is only remembered (it starts as 'menu').
 */
export function setMusicMode(mode: MusicMode) {
	if (mode === musicMode) return;
	musicMode = mode;
	applyMusic();
}

/** Events that can carry user activation (a touch only counts once the finger lifts). */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
const CAPTURE = { capture: true } as const;

let musicRetry = false;
/** The browser refused to start the music (no user activation yet): try again on the next gesture. */
function retryMusicOnGesture() {
	if (musicRetry) return;
	musicRetry = true;
	const again = () => {
		for (const e of GESTURES) window.removeEventListener(e, again, CAPTURE);
		musicRetry = false;
		applyMusic();
	};
	for (const e of GESTURES) window.addEventListener(e, again, CAPTURE);
}

/**
 * Arm audio for the first user gesture: browsers only allow an AudioContext (and media playback)
 * to start after one. On that gesture the samples load and the ambience and music fade in. This
 * keeps listening until the context is actually running.
 */
let armListening = false;
export function armAudio() {
	if (armListening) return;
	armListening = true;
	const go = () => {
		armed = true;
		const a = context();
		loadSamples();
		startAmbience();
		applyMusic();
		if (!a) return;
		const done = () => {
			if (a.state === 'running')
				for (const e of GESTURES) window.removeEventListener(e, go, CAPTURE);
		};
		if (a.state === 'running') done();
		else a.resume().then(done, () => {});
	};
	for (const e of GESTURES) window.addEventListener(e, go, CAPTURE);
}

// ---------------------------------------------------------------- synthesized fallbacks

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slide = 0) {
	const a = ac();
	if (!a) return;
	const t = a.currentTime + delay;
	const o = a.createOscillator();
	const g = a.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, t);
	if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(g).connect(out());
	o.start(t);
	o.stop(t + dur + 0.05);
}

function click(delay: number, gain = 0.25, pitch = 1) {
	const a = ac();
	if (!a) return;
	const t = a.currentTime + delay;
	const len = Math.floor(a.sampleRate * 0.03);
	const buf = a.createBuffer(1, len, a.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
	const src = a.createBufferSource();
	src.buffer = buf;
	src.playbackRate.value = pitch;
	const f = a.createBiquadFilter();
	f.type = 'bandpass';
	f.frequency.value = 1800 * pitch;
	f.Q.value = 1.4;
	const g = a.createGain();
	g.gain.value = gain;
	src.connect(f).connect(g).connect(out());
	src.start(t);
}

/** Filtered noise whose band sweeps f0 -> f1, rising over `attack` then dying away (paper, cloth). */
function swish(delay: number, dur: number, gain: number, f0: number, f1: number, attack: number) {
	const a = ac();
	if (!a) return;
	const t = a.currentTime + delay;
	const len = Math.floor(a.sampleRate * dur);
	const buf = a.createBuffer(1, len, a.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
	const src = a.createBufferSource();
	src.buffer = buf;
	const f = a.createBiquadFilter();
	f.type = 'bandpass';
	f.Q.value = 0.8;
	f.frequency.setValueAtTime(f0, t);
	f.frequency.exponentialRampToValueAtTime(f1, t + dur);
	const g = a.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(gain, t + attack);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	src.connect(f).connect(g).connect(out());
	src.start(t);
	src.stop(t + dur + 0.02);
}

const synth: Record<SampleName, () => void> = {
	dice() {
		const hits = [0.0, 0.08, 0.6, 0.66, 0.95, 1.02, 1.18, 1.24];
		hits.forEach((d, i) => click(d, 0.35 - i * 0.03, 0.8 + Math.random() * 0.5));
	},
	build() {
		tone(140, 0.18, 'sine', 0.35, 0.5, 0.5);
		click(0.5, 0.2, 0.5);
	},
	coin() {
		tone(1318, 0.12, 'square', 0.04);
		tone(1760, 0.22, 'square', 0.035, 0.07);
	},
	turn() {
		tone(523, 0.18, 'triangle', 0.12);
		tone(659, 0.18, 'triangle', 0.12, 0.12);
		tone(784, 0.3, 'triangle', 0.12, 0.24);
	},
	robber() {
		tone(220, 0.3, 'sawtooth', 0.06, 0, 0.6);
		tone(165, 0.4, 'sawtooth', 0.06, 0.18, 0.6);
	},
	steal() {
		tone(880, 0.08, 'square', 0.05);
		tone(440, 0.15, 'square', 0.05, 0.08);
	},
	error() {
		tone(200, 0.15, 'square', 0.05);
	},
	win() {
		[523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.13, i * 0.13));
	},
	pop() {
		tone(660, 0.07, 'sine', 0.1, 0, 1.6);
	},
	card() {
		click(0, 0.18, 1.6);
	},
	click() {
		click(0, 0.16, 0.6);
		tone(200, 0.05, 'sine', 0.08, 0, 0.75);
	},
	open() {
		swish(0, 0.42, 0.1, 900, 3200, 0.16);
		click(0.17, 0.05, 1.3);
	},
	close() {
		swish(0, 0.12, 0.05, 1400, 500, 0.03);
		tone(120, 0.16, 'sine', 0.2, 0.02, 0.55);
	},
	hover() {
		click(0, 0.04, 0.9);
	},
	seven() {
		tone(73, 1.1, 'sine', 0.3, 0, 0.8);
		tone(110, 0.9, 'sawtooth', 0.05, 0.05, 0.75);
		tone(131, 0.9, 'sawtooth', 0.04, 0.05, 0.75);
	},
	flutter() {
		// Quick wing beats, slowing as the bird gets airborne.
		for (let i = 0; i < 7; i++) swish(i * (0.06 + i * 0.008), 0.07, 0.07, 700, 2200, 0.015);
	},
	coo() {
		tone(392, 0.22, 'sine', 0.12, 0, 0.9);
		tone(330, 0.42, 'sine', 0.14, 0.2, 0.88);
		tone(784, 0.2, 'triangle', 0.015, 0, 0.9);
	},
	horn() {
		// A rising call on a horn: the fifth, then the root held.
		tone(196, 0.3, 'sawtooth', 0.05, 0, 1.12);
		tone(294, 1.0, 'sawtooth', 0.06, 0.26, 0.99);
		tone(147, 1.0, 'triangle', 0.08, 0.26, 0.99);
	},
	trade() {
		// Two quick rings of a small shop bell.
		tone(1568, 0.5, 'sine', 0.08);
		tone(2350, 0.3, 'sine', 0.02);
		tone(1568, 0.6, 'sine', 0.08, 0.14);
		tone(2350, 0.35, 'sine', 0.02, 0.14);
	},
	tearDown() {
		// Timber cracking, then the heap slumping in a thump and a hiss of dust.
		[0, 0.05, 0.12].forEach((d, i) => click(d, 0.3 - i * 0.05, 0.6 + i * 0.1));
		tone(120, 0.4, 'sine', 0.32, 0.35, 0.45);
		click(0.36, 0.28, 0.4);
		swish(0.36, 0.9, 0.1, 1100, 220, 0.05);
	},
	purr() {
		// A low buzz at a cat's purring rate, breathed out and in.
		tone(26, 1.2, 'sawtooth', 0.12);
		tone(24, 1.4, 'sawtooth', 0.1, 1.3);
	}
};

/** Delay before a sample plays, matching the scene animation (the build piece lands after 0.5 s). */
const DELAY: Partial<Record<SampleName, number>> = { build: 0.5 };

function play(name: SampleName) {
	if (!sample(name, DELAY[name] ?? 0)) synth[name]();
}

let lastHover = -Infinity;
function hover() {
	if (muted) return;
	const t = performance.now();
	if (t - lastHover < HOVER_GAP_MS) return;
	lastHover = t;
	play('hover');
}

/** A clock tick, synthesized (there is no sample): a wooden knock with a bright edge. */
function tick() {
	click(0, 0.34, 1.15);
	tone(1175, 0.07, 'triangle', 0.16, 0, 0.92);
	tone(2350, 0.035, 'square', 0.025);
}

/** A beacon lit on the map, synthesized: a bright little two-note chime with a soft knock under it. */
function beacon() {
	click(0, 0.18, 1.6);
	tone(1568, 0.22, 'triangle', 0.12);
	tone(2093, 0.32, 'triangle', 0.1, 0.07);
	tone(4186, 0.12, 'sine', 0.02, 0.07);
}

export const sfx = {
	dice: () => play('dice'),
	build: () => play('build'),
	coin: () => play('coin'),
	turn: () => play('turn'),
	robber: () => play('robber'),
	steal: () => play('steal'),
	error: () => play('error'),
	win: () => play('win'),
	pop: () => play('pop'),
	card: () => play('card'),
	/** A soft wooden button tap. */
	click: () => play('click'),
	/** A parchment page turning: a menu, sheet or book opening. */
	open: () => play('open'),
	/** A small book closing: a menu or sheet closing. */
	close: () => play('close'),
	/** A tiny, very quiet wooden tick; at most one every 70 ms. */
	hover,
	/** A clock tick, once a second as a turn's time runs out. */
	tick,
	/** A dark sting (a drum boom and a low brass chord) as the dice land on 7. */
	seven: () => play('seven'),
	/** A medieval horn call: the lobby has closed and the game begins. */
	horn: () => play('horn'),
	/** A merchant's little bell: another player put a trade on the table. */
	trade: () => play('trade'),
	/** A workshop torn down: timber cracks and the heap slumps into dust. */
	tearDown: () => play('tearDown'),
	/** Wings beating as a carrier pigeon takes off. */
	flutter: () => play('flutter'),
	/** A soft coo as a carrier pigeon lands with a note. */
	coo: () => play('coo'),
	/** A cat purring: someone clicked the cat asleep on the armchair (an easter egg). */
	purr: () => play('purr'),
	/** A chime as someone lights a beacon on the map. */
	beacon
};
