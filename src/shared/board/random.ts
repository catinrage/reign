import { nextRandom } from '../rng';
import { type Axial, hexDistance, hexKey, hexNeighbors, hexToWorld } from './hex';
import { MAP_MAX_RADIUS, centerTiles, validateCustomMap, type CustomMap, type MapTile } from './maps';

/**
 * Random islands for Reign Extended. The host picks a size and a few options, and every press
 * of Generate grows a fresh shape. All tiles are random, so terrains, numbers and harbors are
 * dealt as usual when the game starts.
 */

export const RANDOM_SHAPES = ['round', 'long', 'ragged', 'islands'] as const;
export type RandomShape = (typeof RANDOM_SHAPES)[number];

export const RANDOM_SHAPE_INFO: Record<RandomShape, { name: string; text: string }> = {
	round: { name: 'Round', text: 'One compact island.' },
	long: { name: 'Long', text: 'Stretched out along one axis.' },
	ragged: { name: 'Ragged', text: 'Bays, capes and a long coastline.' },
	islands: { name: 'Islands', text: 'Several islands joined by narrow land bridges.' }
};

export const RANDOM_MIN_TILES = 12;
export const RANDOM_MAX_TILES = 240;

export interface RandomMapOptions {
	tiles: number;
	shape: RandomShape;
	/** Small inland lakes (sea tiles inside the island). */
	lakes: boolean;
	seed: number;
}

export const DEFAULT_RANDOM_OPTIONS: Omit<RandomMapOptions, 'seed'> = { tiles: 30, shape: 'round', lakes: false };

/** Keep options in range, whatever arrived over the wire. */
export function cleanRandomOptions(o: Partial<RandomMapOptions> | undefined): RandomMapOptions {
	const tiles = Math.round(Number(o?.tiles));
	return {
		tiles: Number.isFinite(tiles) ? Math.max(RANDOM_MIN_TILES, Math.min(RANDOM_MAX_TILES, tiles)) : DEFAULT_RANDOM_OPTIONS.tiles,
		shape: RANDOM_SHAPES.includes(o?.shape as RandomShape) ? (o!.shape as RandomShape) : 'round',
		lakes: !!o?.lakes,
		seed: Number.isInteger(o?.seed) ? (o!.seed as number) | 0 : 1
	};
}

export function randomMapName(o: RandomMapOptions): string {
	return `${RANDOM_SHAPE_INFO[o.shape].name} isle ${(o.seed >>> 0) % 1000}`;
}

/** A random island with these options. The same options always give the same island. */
export function randomMap(options: RandomMapOptions): CustomMap {
	const o = cleanRandomOptions(options);
	const rng = { rng: o.seed };
	// A rare unlucky shape can poke past the bounds; grow again from the next seed.
	for (let attempt = 0; attempt < 20; attempt++) {
		const tiles = centerTiles(grow(o, rng)).map((t): MapTile => ({ q: t.q, r: t.r, terrain: null }));
		const map = { name: randomMapName(o), tiles, random: o };
		if (!validateCustomMap(map)) return map;
	}
	const tiles = centerTiles(grow({ ...o, shape: 'round', lakes: false }, rng)).map((t): MapTile => ({ ...t, terrain: null }));
	return { name: randomMapName(o), tiles, random: o };
}

type Rng = { rng: number };

function grow(o: RandomMapOptions, rng: Rng): Axial[] {
	const lakeCount = o.lakes ? Math.max(1, Math.round(o.tiles / 40)) : 0;
	// Lakes are carved out afterwards, so grow a little extra land for them.
	const target = o.tiles + lakeCount * 2;
	let land: Map<string, Axial>;
	if (o.shape === 'islands') land = archipelago(target, rng);
	else land = blob(target, { q: 0, r: 0 }, o.shape, rng);
	const lakes = lakeCount ? carveLakes(land, lakeCount, rng) : new Set<string>();
	// Then the exact size: fill coves or trim the coast, keeping it in one piece.
	fillTo(land, o.tiles, rng, lakes);
	trimTo(land, o.tiles, rng);
	return [...land.values()];
}

/**
 * Grow a blob from a seed hex by repeatedly adding a frontier hex. Round favors hexes near the
 * start, long favors one axis, ragged picks almost freely so the coast gets bays and capes.
 */
function blob(count: number, start: Axial, shape: RandomShape, rng: Rng, taken?: Set<string>): Map<string, Axial> {
	const land = new Map<string, Axial>([[hexKey(start), start]]);
	const angle = nextRandom(rng) * Math.PI;
	const ax = { x: Math.cos(angle), z: Math.sin(angle) };
	const origin = hexToWorld(start);
	const score = (h: Axial) => {
		const w = hexToWorld(h);
		const dx = w.x - origin.x;
		const dz = w.z - origin.z;
		const along = dx * ax.x + dz * ax.z;
		const across = -dx * ax.z + dz * ax.x;
		if (shape === 'ragged') {
			// Hexes with few land neighbors win, so the island reaches out in capes and leaves bays.
			const touching = hexNeighbors(h).filter((m) => land.has(hexKey(m))).length;
			return Math.hypot(dx, dz) * 0.6 + touching * 0.55 + nextRandom(rng) * 3;
		}
		const d = shape === 'long' ? Math.hypot(along * 0.45, across * 1.6) : Math.hypot(dx, dz);
		// Lower is better; the noise keeps every island different.
		return d + nextRandom(rng) * 1.6;
	};
	while (land.size < count) {
		let best: Axial | null = null;
		let bestScore = Infinity;
		for (const h of land.values())
			for (const n of hexNeighbors(h)) {
				const k = hexKey(n);
				if (land.has(k) || taken?.has(k) || hexDistance(n, start) > MAP_MAX_RADIUS * 2) continue;
				const s = score(n);
				if (s < bestScore) {
					bestScore = s;
					best = n;
				}
			}
		if (!best) break;
		land.set(hexKey(best), best);
	}
	return land;
}

/** Two to six islands spread around the center, then joined by one-tile-wide bridges. */
function archipelago(count: number, rng: Rng): Map<string, Axial> {
	const k = Math.max(2, Math.min(6, Math.round(count / 22)));
	// Leave a couple of tiles per gap for the bridges.
	const each = Math.max(5, Math.floor((count - 2 * (k - 1)) / k));
	// Islands of `each` tiles are about sqrt(each / 3) hexes across from their middle; set them
	// round a circle so neighbors are two or three hexes of sea apart.
	const radius = Math.sqrt(each / 3);
	const spread = (radius + 1) / Math.sin(Math.PI / k);
	const land = new Map<string, Axial>();
	const centers: Axial[] = [];
	const turn = nextRandom(rng) * Math.PI * 2;
	for (let i = 0; i < k; i++) {
		const a = turn + (i / k) * Math.PI * 2 + (nextRandom(rng) - 0.5) * 0.6;
		const d = spread * (1 + nextRandom(rng) * 0.15);
		// Axial from a world-space direction (pointy-top hexes of radius 1).
		const x = Math.cos(a) * d * 1.73;
		const z = Math.sin(a) * d * 1.5;
		const r = Math.round(z / 1.5);
		const q = Math.round(x / 1.732 - r / 2);
		centers.push({ q, r });
	}
	// Keep a ring of sea between islands so they read as separate before the bridges go in.
	const near = new Set<string>();
	for (const c of centers) {
		const island = blob(each, c, 'round', rng, near);
		for (const [key, h] of island) {
			land.set(key, h);
			near.add(key);
			for (const n of hexNeighbors(h)) near.add(hexKey(n));
		}
	}
	// Join the islands one by one along the shortest gap until it's all one landmass.
	for (let g = components(land); g.length > 1; g = components(land)) bridge(land, g[0], g.slice(1));
	return land;
}

/** Lay a straight one-tile-wide line of land from `from` to the nearest of the other islands. */
function bridge(land: Map<string, Axial>, from: Map<string, Axial>, others: Map<string, Axial>[]) {
	let best: [Axial, Axial] | null = null;
	let bestD = Infinity;
	for (const p of from.values())
		for (const g of others)
			for (const q of g.values()) {
				const d = hexDistance(p, q);
				if (d < bestD) {
					bestD = d;
					best = [p, q];
				}
			}
	if (!best) return;
	const [p, q] = best;
	for (let i = 1; i < bestD; i++) {
		const t = i / bestD;
		const h = cubeRound(p.q + (q.q - p.q) * t, p.r + (q.r - p.r) * t);
		land.set(hexKey(h), h);
	}
}

function cubeRound(qf: number, rf: number): Axial {
	const sf = -qf - rf;
	let q = Math.round(qf);
	let r = Math.round(rf);
	const s = Math.round(sf);
	const dq = Math.abs(q - qf);
	const dr = Math.abs(r - rf);
	const ds = Math.abs(s - sf);
	if (dq > dr && dq > ds) q = -r - s;
	else if (dr > ds) r = -q - s;
	return { q, r };
}

/** Turn a few inland hexes (with land all round) into small lakes. */
function carveLakes(land: Map<string, Axial>, count: number, rng: Rng): Set<string> {
	const lakes = new Set<string>();
	for (let n = 0; n < count; n++) {
		const inland = [...land.values()].filter((h) =>
			hexNeighbors(h).every((m) => land.has(hexKey(m)) && hexNeighbors(m).every((x) => land.has(hexKey(x))))
		);
		if (!inland.length) break;
		const h = inland[Math.floor(nextRandom(rng) * inland.length)];
		land.delete(hexKey(h));
		lakes.add(hexKey(h));
		// Sometimes the lake spills into a second hex.
		if (nextRandom(rng) < 0.5) {
			const m = hexNeighbors(h).find((x) => {
				if (!land.has(hexKey(x))) return false;
				land.delete(hexKey(x));
				const ok = components(land).length === 1;
				if (ok) lakes.add(hexKey(x));
				else land.set(hexKey(x), x);
				return ok;
			});
			void m;
		}
	}
	return lakes;
}

/** Add sea hexes beside the coast, the most sheltered first (lakes stay), until the island has `count`. */
function fillTo(land: Map<string, Axial>, count: number, rng: Rng, keepSea: Set<string>) {
	while (land.size < count) {
		let best: Axial | null = null;
		let bestScore = -Infinity;
		for (const h of land.values())
			for (const n of hexNeighbors(h)) {
				if (land.has(hexKey(n)) || keepSea.has(hexKey(n))) continue;
				const s = hexNeighbors(n).filter((m) => land.has(hexKey(m))).length + nextRandom(rng) * 2;
				if (s > bestScore) {
					bestScore = s;
					best = n;
				}
			}
		if (!best) return;
		land.set(hexKey(best), best);
	}
}

/** Remove coast hexes until the island has exactly `count`, never splitting it. */
function trimTo(land: Map<string, Axial>, count: number, rng: Rng) {
	let guard = land.size * 4;
	while (land.size > count && guard-- > 0) {
		const coast = [...land.values()].filter((h) => hexNeighbors(h).filter((m) => land.has(hexKey(m))).length <= 3);
		const pool = coast.length ? coast : [...land.values()];
		const h = pool[Math.floor(nextRandom(rng) * pool.length)];
		land.delete(hexKey(h));
		if (components(land).length !== 1) land.set(hexKey(h), h);
	}
}

function components(land: Map<string, Axial>): Map<string, Axial>[] {
	const seen = new Set<string>();
	const out: Map<string, Axial>[] = [];
	for (const [key, start] of land) {
		if (seen.has(key)) continue;
		const group = new Map<string, Axial>([[key, start]]);
		seen.add(key);
		const todo = [start];
		while (todo.length) {
			const h = todo.pop()!;
			for (const n of hexNeighbors(h)) {
				const k = hexKey(n);
				if (land.has(k) && !seen.has(k)) {
					seen.add(k);
					group.set(k, land.get(k)!);
					todo.push(land.get(k)!);
				}
			}
		}
		out.push(group);
	}
	return out;
}
