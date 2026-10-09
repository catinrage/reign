import { TERRAINS, type Terrain } from '../rules/config';
import { type Axial, hexDistance, hexKey, hexToWorld } from './hex';
import type { RandomMapOptions } from './random';

/**
 * Island shapes for Reign Extended. A map is a set of land hexes, each either a fixed terrain or
 * random; numbers and harbors are always dealt when the game starts (see generateBoard).
 * Classic games always use the standard 19-tile island from generateStandardBoard.
 */

/** One land tile of a map: a fixed terrain, or null for one dealt at random. */
export interface MapTile extends Axial {
	terrain: Terrain | null;
}

export interface MapPreset {
	id: string;
	name: string;
	blurb: string;
	tiles: MapTile[];
}

/** What the host picked: a preset, or a map made in the editor. */
export type MapChoice = { preset: string } | { custom: CustomMap };

export interface CustomMap {
	name: string;
	tiles: MapTile[];
	/** Set when the island came from the random generator, so the host can reroll it. */
	random?: RandomMapOptions;
}

/**
 * Islands can be as big as players like. This bound is only a safety net far beyond anything
 * drawn by hand (469 tiles), so a pasted code can't ask the table to build something absurd.
 */
export const MAP_MAX_RADIUS = 12;
export const MAP_MIN_TILES = 10;

/** Single-letter terrain codes, used by the ASCII presets and by shareable map codes. */
export const TERRAIN_CODE: Record<Terrain, string> = {
	forest: 'f',
	hills: 'h',
	pasture: 'p',
	fields: 'w',
	mountains: 'm',
	desert: 'd'
};
const CODE_TERRAIN = Object.fromEntries(Object.entries(TERRAIN_CODE).map(([t, c]) => [c, t])) as Record<string, Terrain>;

/**
 * Reads a hex map drawn in text. Each row is one hex row; tiles sit on every other character and
 * rows shift by one, like the rows of a real board. `x` or `?` is a random tile, a terrain letter
 * (f h p w m d) a fixed one, anything else is sea. The result is moved to sit round the center.
 */
export function parseAscii(rows: string[]): MapTile[] {
	const tiles: MapTile[] = [];
	let parity = -1;
	rows.forEach((row, r) => {
		for (let c = 0; c < row.length; c++) {
			const ch = row[c];
			const fixed = CODE_TERRAIN[ch];
			if (ch !== 'x' && ch !== '?' && !fixed) continue;
			if (parity < 0) parity = (c - r) & 1;
			if (((c - r) & 1) !== parity) throw new Error(`Map row ${r}: tile at column ${c} is off the hex grid.`);
			tiles.push({ q: (c - r - parity) / 2, r, terrain: fixed ?? null });
		}
	});
	return centerTiles(tiles);
}

/** Shift tiles so the hex nearest their middle sits at the origin. */
export function centerTiles<T extends Axial>(tiles: T[]): T[] {
	if (!tiles.length) return tiles;
	let x = 0;
	let z = 0;
	for (const t of tiles) {
		const w = hexToWorld(t);
		x += w.x;
		z += w.z;
	}
	x /= tiles.length;
	z /= tiles.length;
	// Nearest hex center to the centroid, among the tiles' own grid.
	let best = { q: 0, r: 0 };
	let bestD = Infinity;
	for (let r = -12; r <= 12; r++)
		for (let q = -12; q <= 12; q++) {
			const w = hexToWorld({ q: q + tiles[0].q, r: r + tiles[0].r });
			const d = Math.hypot(w.x - x, w.z - z);
			if (d < bestD - 1e-6) {
				bestD = d;
				best = { q: q + tiles[0].q, r: r + tiles[0].r };
			}
		}
	return tiles.map((t) => ({ ...t, q: t.q - best.q, r: t.r - best.r }));
}

export const MAP_PRESETS: MapPreset[] = [
	{
		id: 'classic',
		name: 'Classic Isle',
		blurb: 'The familiar 19 tiles, dealt at random.',
		tiles: parseAscii(['  x x x', ' x x x x', 'x x x x x', ' x x x x', '  x x x'])
	},
	{
		id: 'great',
		name: 'Great Isle',
		blurb: '30 tiles and two deserts: room to spread out.',
		tiles: parseAscii([
			'    x x x',
			'   x x x x',
			'  x x x x x',
			' x x x x x x',
			'  x x x x x',
			'   x x x x',
			'    x x x'
		])
	},
	{
		id: 'realm',
		name: 'Grand Realm',
		blurb: 'A broad 37-tile island for long games.',
		tiles: parseAscii([
			'   x x x x',
			'  x x x x x',
			' x x x x x x',
			'x x x x x x x',
			' x x x x x x',
			'  x x x x x',
			'   x x x x'
		])
	},
	{
		id: 'lagoon',
		name: 'Crescent Lagoon',
		blurb: 'A ring of land round a sheltered inner sea.',
		tiles: parseAscii([
			'   x x x x',
			'  x x x x x',
			' x x . . x x',
			'x x . . . x x',
			' x x . . x x',
			'  x x x x x',
			'   x x x .'
		])
	},
	{
		id: 'twin',
		name: 'Twin Crowns',
		blurb: 'Two highlands joined by a narrow neck of land.',
		tiles: parseAscii([
			' x x     x x',
			'x x x   x x x',
			' x m x x x m x',
			'x x x   x x x',
			' x x     x x'
		])
	},
	{
		id: 'serpent',
		name: 'Serpent Coast',
		blurb: 'A long winding isle: every road is a race.',
		tiles: parseAscii([
			'x x x x x',
			' x x x x x',
			'        x x',
			'   x x x x x',
			'  x x x x',
			' x x',
			'x x x x x'
		])
	}
];

export function presetById(id: string): MapPreset | undefined {
	return MAP_PRESETS.find((p) => p.id === id);
}

/** The most players any island seats. */
export const MAP_MAX_SEATS = 8;

/**
 * How many players an island seats: one per five tiles, so four on the standard size, six on
 * the 30-tile 5-6 player board and eight from 40 tiles.
 */
export function mapSeats(tileCount: number): number {
	return Math.max(4, Math.min(MAP_MAX_SEATS, Math.floor(tileCount / 5)));
}

/** The tiles a map choice stands for, or null if it isn't valid. */
export function mapTiles(choice: MapChoice): MapTile[] | null {
	if ('preset' in choice) return presetById(choice.preset)?.tiles ?? null;
	return validateCustomMap(choice.custom) ? null : choice.custom.tiles;
}

export function mapName(choice: MapChoice): string {
	if ('preset' in choice) return presetById(choice.preset)?.name ?? 'Unknown map';
	return choice.custom.name || 'Custom map';
}

/** Why a custom map can't be played, or null if it can. */
export function validateCustomMap(map: CustomMap): string | null {
	if (!map || !Array.isArray(map.tiles)) return 'That map is empty.';
	const tiles = map.tiles;
	if (tiles.length < MAP_MIN_TILES) return `A map needs at least ${MAP_MIN_TILES} land tiles.`;
	const seen = new Set<string>();
	for (const t of tiles) {
		if (!Number.isInteger(t.q) || !Number.isInteger(t.r)) return 'A tile is off the grid.';
		if (hexDistance(t, { q: 0, r: 0 }) > MAP_MAX_RADIUS) return 'A tile is too far from the center.';
		if (t.terrain !== null && !TERRAINS.includes(t.terrain)) return 'A tile has an unknown terrain.';
		const k = hexKey(t);
		if (seen.has(k)) return 'Two tiles share a spot.';
		seen.add(k);
	}
	// Without ships, every tile has to be reachable over land.
	const todo = [tiles[0]];
	const reached = new Set([hexKey(tiles[0])]);
	while (todo.length) {
		const t = todo.pop()!;
		for (const [dq, dr] of NEIGHBORS) {
			const k = hexKey({ q: t.q + dq, r: t.r + dr });
			if (seen.has(k) && !reached.has(k)) {
				reached.add(k);
				todo.push({ q: t.q + dq, r: t.r + dr, terrain: null });
			}
		}
	}
	if (reached.size !== tiles.length) return 'All land has to be joined into one island.';
	const random = tiles.filter((t) => t.terrain === null).length;
	if (!random && !tiles.some((t) => t.terrain === 'desert')) return 'Add a desert (or a random tile) for the robber to start on.';
	const producing = tiles.filter((t) => t.terrain !== 'desert').length;
	if (producing < 5) return 'A map needs at least five tiles that produce.';
	return null;
}

const NEIGHBORS = [
	[1, 0],
	[1, -1],
	[0, -1],
	[-1, 0],
	[-1, 1],
	[0, 1]
];

/**
 * Map codes are short text a player can paste to share a map: the name, then each tile as
 * q,r and a terrain letter (`x` for random). Example: `My isle;0,0x;1,0f;...`
 */
export function encodeMap(map: CustomMap): string {
	const name = map.name.replace(/[;|]/g, '').slice(0, 24);
	return [name, ...map.tiles.map((t) => `${t.q},${t.r}${t.terrain ? TERRAIN_CODE[t.terrain] : 'x'}`)].join(';');
}

export function decodeMap(code: string): CustomMap | null {
	const parts = code.trim().split(';');
	if (parts.length < 2) return null;
	const tiles: MapTile[] = [];
	for (const p of parts.slice(1)) {
		const m = p.trim().match(/^(-?\d+),(-?\d+)([a-z])$/);
		if (!m) return null;
		const terrain = m[3] === 'x' ? null : CODE_TERRAIN[m[3]];
		if (terrain === undefined) return null;
		tiles.push({ q: Number(m[1]), r: Number(m[2]), terrain });
	}
	return { name: parts[0].trim().slice(0, 24), tiles };
}
