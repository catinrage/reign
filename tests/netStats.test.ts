import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { netStats } from '../src/client/state/netStats.svelte';

/**
 * The performance readout's numbers: frames counted off animation frames, and the round trip
 * timed with numbered pings (the server sends each number back in its pong).
 */

let sent: number[] = [];
let lineUp = true;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'performance'] });
	// Animation frames at 60 a second.
	vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 1000 / 60));
	vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
	vi.stubGlobal('document', { visibilityState: 'visible' });
	sent = [];
	lineUp = true;
	netStats.connect((n) => {
		if (!lineUp) return false;
		sent.push(n);
		return true;
	});
});

afterEach(() => {
	netStats.stop();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('performance readout', () => {
	it('measures nothing until it is turned on', () => {
		vi.advanceTimersByTime(5000);
		expect(sent).toEqual([]);
		expect(netStats.fps).toBeNull();
	});

	it('counts frames a second', () => {
		netStats.start();
		vi.advanceTimersByTime(2000);
		expect(netStats.fps).toBeGreaterThanOrEqual(58);
		expect(netStats.fps).toBeLessThanOrEqual(62);
	});

	it('times pings by the number the pong carries back', () => {
		netStats.start();
		expect(sent).toHaveLength(1);
		vi.advanceTimersByTime(40);
		netStats.pong(sent[0]);
		expect(netStats.ping).toBeCloseTo(40, 0);
		vi.advanceTimersByTime(1960);
		expect(sent).toHaveLength(2);
		vi.advanceTimersByTime(60);
		netStats.pong(sent[1]);
		expect(netStats.ping).toBeCloseTo(50, 0);
		expect(netStats.jitter).toBeCloseTo(20, 0);
		expect(netStats.loss).toBe(0);
		// A pong for no ping of ours (the keep-alive's) changes nothing.
		netStats.pong(undefined);
		expect(netStats.ping).toBeCloseTo(50, 0);
	});

	it('counts a ping with no answer as lost', () => {
		netStats.start();
		netStats.pong(sent[0]);
		vi.advanceTimersByTime(2000);
		// The second ping never comes back.
		vi.advanceTimersByTime(3500);
		expect(netStats.loss).toBeCloseTo(1 / 2, 5);
	});

	it('sends no ping while the line is down, and forgets everything when turned off', () => {
		lineUp = false;
		netStats.start();
		vi.advanceTimersByTime(4000);
		expect(sent).toEqual([]);
		expect(netStats.ping).toBeNull();
		netStats.stop();
		expect(netStats.fps).toBeNull();
		expect(netStats.loss).toBeNull();
	});
});
