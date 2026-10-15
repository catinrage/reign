import { describe, expect, it } from 'vitest';
import { FrameCap } from '../src/client/scene/frameCap';

/** Frames a second drawn over ten seconds of a screen refreshing `hz` times a second, a little unevenly. */
function drawn(hz: number, cap: number): number {
	const fc = new FrameCap();
	fc.maxFps = cap;
	let n = 0;
	for (let k = 1; k <= hz * 10; k++) if (fc.due(k * (1000 / hz) + Math.sin(k * 12.9898) * 0.4)) n++;
	return n / 10;
}

describe('the frame rate cap', () => {
	it('draws every frame with no cap', () => {
		expect(drawn(144, 0)).toBe(144);
	});

	it('holds a cap the screen rate divides', () => {
		expect(drawn(60, 30)).toBeCloseTo(30, 0);
		expect(drawn(120, 60)).toBeCloseTo(60, 0);
		expect(drawn(240, 120)).toBeCloseTo(120, 0);
	});

	it('holds a cap the screen rate does not divide, on average', () => {
		expect(Math.abs(drawn(144, 60) - 60)).toBeLessThan(3);
		expect(Math.abs(drawn(144, 30) - 30)).toBeLessThan(2);
		expect(Math.abs(drawn(165, 30) - 30)).toBeLessThan(2);
	});

	it('never draws more often than the screen', () => {
		expect(drawn(60, 120)).toBe(60);
		expect(drawn(75, 60)).toBeCloseTo(60, 0);
	});
});
