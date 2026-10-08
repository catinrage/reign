/** Tiny tween runner driven by the stage's frame loop. */

export type Ease = (t: number) => number;

export const ease = {
	linear: (t: number) => t,
	outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
	inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
	outBack: (t: number) => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
	},
	outBounce: (t: number) => {
		const n1 = 7.5625;
		const d1 = 2.75;
		if (t < 1 / d1) return n1 * t * t;
		if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
		if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
		return n1 * (t -= 2.625 / d1) * t + 0.984375;
	}
};

interface Tween {
	start: number;
	duration: number;
	fn: (t: number) => void;
	ease: Ease;
	resolve: () => void;
}

export class Animator {
	private tweens: Tween[] = [];
	private now = 0;

	tween(duration: number, fn: (t: number) => void, e: Ease = ease.outCubic, delay = 0): Promise<void> {
		return new Promise((resolve) => {
			this.tweens.push({ start: this.now + delay, duration, fn, ease: e, resolve });
		});
	}

	wait(seconds: number) {
		return this.tween(seconds, () => {}, ease.linear);
	}

	update(dt: number) {
		this.now += dt;
		const done: Tween[] = [];
		for (const tw of this.tweens) {
			if (this.now < tw.start) continue;
			const t = Math.min(1, (this.now - tw.start) / tw.duration);
			tw.fn(tw.ease(t));
			if (t >= 1) done.push(tw);
		}
		if (done.length) {
			this.tweens = this.tweens.filter((t) => !done.includes(t));
			for (const d of done) d.resolve();
		}
	}
}
