/** Deterministic value noise, shared by the games' rules and boards (Conquest's lands, Gambit's terrain). */

export function hash2(x: number, z: number, seed = 0): number {
	let h = (x * 374761393 + z * 668265263 + seed * 144269504) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function noise(x: number, z: number, seed = 0): number {
	const xi = Math.floor(x);
	const zi = Math.floor(z);
	const xf = x - xi;
	const zf = z - zi;
	const u = xf * xf * (3 - 2 * xf);
	const v = zf * zf * (3 - 2 * zf);
	const a = hash2(xi, zi, seed);
	const b = hash2(xi + 1, zi, seed);
	const c = hash2(xi, zi + 1, seed);
	const d = hash2(xi + 1, zi + 1, seed);
	return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** A few octaves of `noise`, in [0, 1]. */
export function fractal(x: number, z: number, seed = 0, octaves = 3): number {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += noise(x * freq, z * freq, seed + i * 17) * amp;
		norm += amp;
		amp *= 0.5;
		freq *= 2;
	}
	return sum / norm;
}
