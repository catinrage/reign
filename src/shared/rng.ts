/**
 * Small deterministic PRNG (mulberry32). The game state carries the rng state so the
 * server can replay or persist a game; it is stripped from what clients receive.
 */
export function nextRandom(state: { rng: number }): number {
	let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: { rng: number }, maxExclusive: number): number {
	return Math.floor(nextRandom(state) * maxExclusive);
}

export function shuffle<T>(state: { rng: number }, items: T[]): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = randomInt(state, i + 1);
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}

export function randomSeed(): number {
	return (Math.random() * 0xffffffff) >>> 0;
}
