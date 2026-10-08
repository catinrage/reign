/** Small synthesized sound effects (no audio files): dice clatter, thuds, chimes. */

let ctx: AudioContext | null = null;
let muted = false;
try {
	muted = localStorage.getItem('reign:muted') === '1';
} catch {
	/* ignore */
}

function ac(): AudioContext | null {
	if (muted) return null;
	if (!ctx) {
		try {
			ctx = new AudioContext();
		} catch {
			return null;
		}
	}
	if (ctx.state === 'suspended') ctx.resume();
	return ctx;
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
}

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
	o.connect(g).connect(a.destination);
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
	src.connect(f).connect(g).connect(a.destination);
	src.start(t);
}

export const sfx = {
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
