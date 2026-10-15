import { OFFLINE } from '../offline/flag';

/**
 * The numbers behind the performance readout (Settings > Show FPS and ping): frames drawn a
 * second, and the round trip to the game server timed with pings over the game's own socket.
 * Nothing is measured while the readout is off.
 */

/** How often the readout's numbers refresh. */
const REFRESH_MS = 500;
/** How often a ping goes out while the readout is on. */
const PING_EVERY_MS = 2000;
/** A ping with no answer by then counts as lost. */
const LOST_AFTER_MS = 3000;
/** Pings remembered for jitter and loss: about a minute's worth. */
const KEEP = 30;

interface Ping {
	n: number;
	sent: number;
	/** The round trip in ms; null while it is out, NaN once it is lost. */
	rtt: number | null;
}

class NetStats {
	/** Frames drawn a second, over the last half second; null until the first count. */
	fps = $state<number | null>(null);
	/** The round trip to the server in ms, the mean of the newest three; null when unknown. */
	ping = $state<number | null>(null);
	/** How much the round trip wobbles from one ping to the next, in ms. */
	jitter = $state<number | null>(null);
	/** The share of recent pings that got no answer, 0 to 1. */
	loss = $state<number | null>(null);

	private running = false;
	/** Animation ticks: the screen's refreshes, counted when the game can't say what it drew. */
	private frames = 0;
	/** How many frames the game has drawn so far, when it can say (a frame rate cap draws fewer than the screen shows). */
	private drawn: (() => number | undefined) | null = null;
	private lastDrawn: number | undefined;
	private windowStart = 0;
	private raf = 0;
	private timer: ReturnType<typeof setInterval> | undefined;
	private pinger: ReturnType<typeof setInterval> | undefined;
	private pings: Ping[] = [];
	private nextId = 1;
	private sendPing: ((n: number) => boolean) | null = null;

	/** How pings reach the server: returns false when the line is down. Set by the game client. */
	connect(send: (n: number) => boolean) {
		this.sendPing = send;
	}

	start(drawn?: () => number | undefined) {
		if (this.running) return;
		this.running = true;
		this.frames = 0;
		this.drawn = drawn ?? null;
		this.lastDrawn = drawn?.();
		this.windowStart = performance.now();
		const tick = () => {
			this.frames++;
			this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
		this.timer = setInterval(() => this.refresh(), REFRESH_MS);
		// The offline build has its server in this page: there is no network to time.
		if (!OFFLINE) {
			this.pingServer();
			this.pinger = setInterval(() => this.pingServer(), PING_EVERY_MS);
		}
	}

	stop() {
		if (!this.running) return;
		this.running = false;
		cancelAnimationFrame(this.raf);
		clearInterval(this.timer);
		clearInterval(this.pinger);
		this.pings = [];
		this.fps = this.ping = this.jitter = this.loss = null;
	}

	/** A pong came back. */
	pong(n: number | undefined) {
		const p = this.pings.find((q) => q.n === n);
		if (!p || p.rtt !== null) return;
		p.rtt = performance.now() - p.sent;
		this.refreshNet();
	}

	/** The line dropped: pings still out will never be answered. */
	dropped() {
		for (const p of this.pings) if (p.rtt === null) p.rtt = NaN;
		this.ping = this.jitter = null;
	}

	private pingServer() {
		const n = this.nextId++;
		if (!this.sendPing?.(n)) return;
		this.pings.push({ n, sent: performance.now(), rtt: null });
		if (this.pings.length > KEEP) this.pings.shift();
	}

	private refresh() {
		const now = performance.now();
		const span = now - this.windowStart;
		// A hidden tab draws nothing; keep the last count rather than showing 0.
		const total = this.drawn?.();
		const frames = total !== undefined && this.lastDrawn !== undefined && total >= this.lastDrawn ? total - this.lastDrawn : this.frames;
		this.lastDrawn = total;
		if (frames > 0 || document.visibilityState === 'visible') {
			this.fps = Math.round((frames * 1000) / span);
		}
		this.frames = 0;
		this.windowStart = now;
		if (!OFFLINE) this.refreshNet(now);
	}

	private refreshNet(now = performance.now()) {
		for (const p of this.pings) if (p.rtt === null && now - p.sent > LOST_AFTER_MS) p.rtt = NaN;
		const done = this.pings.filter((p) => p.rtt !== null);
		const answered = done.filter((p) => !Number.isNaN(p.rtt)).map((p) => p.rtt!);
		if (done.length) this.loss = (done.length - answered.length) / done.length;
		const newest = answered.slice(-3);
		this.ping = newest.length ? newest.reduce((a, b) => a + b, 0) / newest.length : null;
		if (answered.length > 1) {
			let sum = 0;
			for (let i = 1; i < answered.length; i++) sum += Math.abs(answered[i] - answered[i - 1]);
			this.jitter = sum / (answered.length - 1);
		}
	}
}

export const netStats = new NetStats();
