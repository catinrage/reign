/**
 * Dense voxel grid. Each cell is 0 (empty) or ((material + 1) << 24 | rgb).
 * Builders write colors here; the mesher turns a grid into geometry per material.
 */
export const enum Mat {
	Solid = 0,
	Water = 1,
	Glow = 2,
	Sway = 3,
	Fire = 4
}

export class VoxelGrid {
	readonly data: Uint32Array;
	constructor(
		readonly nx: number,
		readonly ny: number,
		readonly nz: number,
		/** World-voxel coordinate of cell (0,0,0). */
		readonly ox = 0,
		readonly oy = 0,
		readonly oz = 0
	) {
		this.data = new Uint32Array(nx * ny * nz);
	}

	index(x: number, y: number, z: number) {
		return x + this.nx * (z + this.nz * y);
	}

	inBounds(x: number, y: number, z: number) {
		return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
	}

	/** Coordinates are in world-voxel space (origin offset applied). */
	set(x: number, y: number, z: number, color: number, mat: Mat = Mat.Solid) {
		x -= this.ox;
		y -= this.oy;
		z -= this.oz;
		if (!this.inBounds(x, y, z)) return;
		this.data[this.index(x, y, z)] = ((((mat + 1) & 0xff) << 24) | (color & 0xffffff)) >>> 0;
	}

	clear(x: number, y: number, z: number) {
		x -= this.ox;
		y -= this.oy;
		z -= this.oz;
		if (this.inBounds(x, y, z)) this.data[this.index(x, y, z)] = 0;
	}

	get(x: number, y: number, z: number): number {
		x -= this.ox;
		y -= this.oy;
		z -= this.oz;
		if (!this.inBounds(x, y, z)) return 0;
		return this.data[this.index(x, y, z)];
	}

	solid(x: number, y: number, z: number) {
		return this.get(x, y, z) !== 0;
	}

	box(
		x0: number,
		y0: number,
		z0: number,
		x1: number,
		y1: number,
		z1: number,
		color: number | ((x: number, y: number, z: number) => number),
		mat: Mat = Mat.Solid
	) {
		for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
			for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
				for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
					const c = typeof color === 'number' ? color : color(x, y, z);
					if (c >= 0) this.set(x, y, z, c, mat);
				}
	}

	/** Highest solid y in a column, or -Infinity. */
	top(x: number, z: number): number {
		for (let y = this.oy + this.ny - 1; y >= this.oy; y--) if (this.solid(x, y, z)) return y;
		return -Infinity;
	}
}

// ---------------------------------------------------------------- color helpers

export function rgb(r: number, g: number, b: number) {
	return ((clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)) >>> 0;
}

function clamp255(v: number) {
	return Math.max(0, Math.min(255, Math.round(v)));
}

export function hex(c: string) {
	return parseInt(c.replace('#', ''), 16);
}

export function shade(c: number, f: number) {
	return rgb(((c >> 16) & 255) * f, ((c >> 8) & 255) * f, (c & 255) * f);
}

export function mix(a: number, b: number, t: number) {
	return rgb(
		((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t,
		((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t,
		(a & 255) * (1 - t) + (b & 255) * t
	);
}

/** Stable pseudo-random value in [0,1) for integer coordinates. */
export function hash3(x: number, y: number, z: number, seed = 0) {
	let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

export function pick<T>(items: T[], r: number): T {
	return items[Math.min(items.length - 1, Math.floor(r * items.length))];
}

/** Smooth 2D value noise in [0,1]. */
export function noise2(x: number, z: number, seed = 0) {
	const xi = Math.floor(x);
	const zi = Math.floor(z);
	const xf = x - xi;
	const zf = z - zi;
	const s = (t: number) => t * t * (3 - 2 * t);
	const a = hash3(xi, 0, zi, seed);
	const b = hash3(xi + 1, 0, zi, seed);
	const c = hash3(xi, 0, zi + 1, seed);
	const d = hash3(xi + 1, 0, zi + 1, seed);
	const u = s(xf);
	const v = s(zf);
	return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function fbm(x: number, z: number, seed = 0, octaves = 3) {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += noise2(x * freq, z * freq, seed + i * 17) * amp;
		norm += amp;
		amp *= 0.5;
		freq *= 2;
	}
	return sum / norm;
}
