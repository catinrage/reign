/**
 * Sound effects. Samples (generated with ElevenLabs) live in public/sfx and are decoded
 * with WebAudio on first use; until a sample is ready the old synthesized version plays.
 * A quiet fireplace ambience loop starts after the first user gesture.
 */

const SAMPLES = ['dice', 'build', 'coin', 'turn', 'robber', 'steal', 'error', 'win', 'pop', 'card'] as const;
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
	card: 0.6
};
/** Random pitch spread (playbackRate +/- this) for sounds that repeat a lot. */
const VARY: Partial<Record<SampleName, number>> = { dice: 0.06, build: 0.08, pop: 0.12, card: 0.08 };

const AMBIENCE_GAIN = 0.12;
const AMBIENCE_FADE_IN = 4;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
	muted = localStorage.getItem('reign:muted') === '1';
} catch {
	/* ignore */
}

const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;

/** The audio context, created on demand (even while muted, so loading and ambience can resume). */
function context(): AudioContext | null {
	if (!ctx) {
		try {
			ctx = new AudioContext();
			master = ctx.createGain();
			master.gain.value = muted ? 0 : 1;
			master.connect(ctx.destination);
		} catch {
			return null;
		}
	}
	if (ctx.state === 'suspended' && !muted) ctx.resume().catch(() => {});
	return ctx;
}

/** Context for playing a one-shot, or null when muted / unavailable. */
function ac(): AudioContext | null {
	if (muted) return null;
	const a = context();
	if (a) loadSamples();
	return a;
}

function out(): AudioNode {
	return master!;
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
	if (!a) return true; // muted: nothing to play, and no fallback either
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
		if (ctx && master) {
			master.gain.cancelScheduledValues(ctx.currentTime);
			master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
		}
		stopAmbienceSource(0.3);
	} else {
		const a = context(); // unmuting is a click, so creating/resuming the context is allowed
		if (a && master) {
			master.gain.cancelScheduledValues(a.currentTime);
			master.gain.setTargetAtTime(1, a.currentTime, 0.05);
			loadSamples();
		}
		if (ambienceWanted) startAmbience();
	}
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
	src.connect(g).connect(out());
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

/**
 * Arm audio for the first user gesture: browsers only allow an AudioContext to start
 * after one. On that gesture the samples load and the ambience fades in.
 */
export function armAudio() {
	const opts = { capture: true } as const;
	const go = () => {
		window.removeEventListener('pointerdown', go, opts);
		window.removeEventListener('keydown', go, opts);
		context();
		loadSamples();
		startAmbience();
	};
	window.addEventListener('pointerdown', go, opts);
	window.addEventListener('keydown', go, opts);
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
	}
};

/** Delay before a sample plays, matching the scene animation (the build piece lands after 0.5 s). */
const DELAY: Partial<Record<SampleName, number>> = { build: 0.5 };

function play(name: SampleName) {
	if (!sample(name, DELAY[name] ?? 0)) synth[name]();
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
	card: () => play('card')
};
