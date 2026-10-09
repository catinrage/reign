import {
	RESOURCES,
	STANDARD_NUMBER_POOL,
	STANDARD_PORT_POOL,
	STANDARD_TERRAIN_POOL,
	type PortKind,
	type Terrain
} from '../rules/config';
import { randomInt, shuffle } from '../rng';
import { hexesInRadius } from './hex';
import type { MapTile } from './maps';
import { type Board, type BoardHex, type BoardPort, buildTopology } from './topology';

/** Random classic island: 19 tiles, no two red numbers (6 and 8) touching, 9 harbors. */
export function generateStandardBoard(rngState: { rng: number }): Board {
	const coords = hexesInRadius(2);
	for (let attempt = 0; attempt < 500; attempt++) {
		const terrains = shuffle(rngState, [...STANDARD_TERRAIN_POOL]);
		const numbers = shuffle(rngState, [...STANDARD_NUMBER_POOL]);
		let n = 0;
		const hexes: BoardHex[] = coords.map((c, i) => ({
			q: c.q,
			r: c.r,
			terrain: terrains[i],
			number: terrains[i] === 'desert' ? null : numbers[n++]
		}));
		const board: Board = { hexes, ports: [] };
		const topo = buildTopology(board);
		const redTouching = topo.hexes.some(
			(h) =>
				isRed(hexes[h.id].number) && h.neighbors.some((nb) => isRed(hexes[nb].number))
		);
		const sameTouching = topo.hexes.some((h) =>
			h.neighbors.some((nb) => hexes[nb].number !== null && hexes[nb].number === hexes[h.id].number)
		);
		if (redTouching || (sameTouching && attempt < 400)) continue;
		board.ports = placePorts(board, rngState);
		return board;
	}
	throw new Error('Could not generate a board');
}

function isRed(n: number | null) {
	return n === 6 || n === 8;
}

function placePorts(board: Board, rngState: { rng: number }) {
	const topo = buildTopology(board);
	const coastal = topo.edges
		.filter((e) => e.coastal)
		.map((e) => {
			const a = topo.vertices[e.a];
			const b = topo.vertices[e.b];
			return { e, angle: Math.atan2((a.z + b.z) / 2, (a.x + b.x) / 2) };
		})
		.sort((x, y) => x.angle - y.angle);
	const kinds = shuffle(rngState, [...STANDARD_PORT_POOL]) as PortKind[];
	const gaps = [3, 3, 4, 3, 3, 4, 3, 3, 4];
	const offset = randomInt(rngState, coastal.length);
	let idx = offset;
	return kinds.map((kind, i) => {
		const edge = coastal[idx % coastal.length].e;
		idx += gaps[i];
		const hex = edge.hexes[0];
		const side = topo.hexes[hex].edges.indexOf(edge.id);
		return { hex, side, kind };
	});
}

/**
 * Producing terrains in the classic mix (4 forest, 4 pasture, 4 fields, 3 hills, 3 mountains),
 * as an order to deal from so any count keeps that balance.
 */
const TERRAIN_MIX: Terrain[] = ['forest', 'pasture', 'fields', 'hills', 'mountains'];
const TERRAIN_WEIGHT: Record<string, number> = { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3 };

/** `count` producing terrains in the classic proportions (largest remainder). */
export function terrainMix(count: number): Terrain[] {
	const total = 18;
	const out: Terrain[] = [];
	const rem: { t: Terrain; f: number }[] = [];
	for (const t of TERRAIN_MIX) {
		const exact = (TERRAIN_WEIGHT[t] * count) / total;
		const n = Math.floor(exact);
		for (let i = 0; i < n; i++) out.push(t);
		rem.push({ t, f: exact - n });
	}
	rem.sort((a, b) => b.f - a.f);
	for (let i = 0; out.length < count; i++) out.push(rem[i % rem.length].t);
	return out;
}

/**
 * Number tokens for `count` producing tiles. The first 18 are exactly the classic set; beyond
 * that a balanced cycle adds one of each, and smaller maps drop the rarest first.
 */
export function numberPool(count: number): number[] {
	const order = [5, 9, 6, 8, 4, 10, 3, 11, 5, 9, 6, 8, 4, 10, 3, 11, 2, 12];
	const extra = [5, 9, 6, 8, 4, 10, 3, 11, 2, 12];
	const out: number[] = [];
	for (let i = 0; out.length < count; i++) out.push(i < order.length ? order[i] : extra[(i - order.length) % extra.length]);
	return out;
}

/**
 * Deal terrains, numbers and harbors onto any island shape. Fixed tiles keep their terrain;
 * random ones get a classic mix with about one desert per 19 tiles. Red numbers (6 and 8)
 * never touch, and same numbers avoid touching when the shape allows it.
 */
export function generateBoard(tiles: MapTile[], rngState: { rng: number }): Board {
	const randomCount = tiles.filter((t) => t.terrain === null).length;
	const fixedDeserts = tiles.filter((t) => t.terrain === 'desert').length;
	const deserts = randomCount ? Math.max(fixedDeserts ? 0 : 1, Math.round(tiles.length / 19) - fixedDeserts) : 0;
	const pool: Terrain[] = [
		...Array<Terrain>(Math.min(deserts, randomCount)).fill('desert'),
		...terrainMix(Math.max(0, randomCount - deserts))
	];
	const coords = tiles.map((t) => ({ q: t.q, r: t.r }));
	let best: { board: Board; bad: number } | null = null;
	for (let attempt = 0; attempt < 600; attempt++) {
		const dealt = shuffle(rngState, [...pool]);
		let d = 0;
		const terrains = tiles.map((t) => t.terrain ?? dealt[d++]);
		const producing = terrains.filter((t) => t !== 'desert').length;
		const numbers = shuffle(rngState, numberPool(producing));
		let n = 0;
		const hexes: BoardHex[] = coords.map((c, i) => ({
			q: c.q,
			r: c.r,
			terrain: terrains[i],
			number: terrains[i] === 'desert' ? null : numbers[n++]
		}));
		const board: Board = { hexes, ports: [] };
		const topo = buildTopology(board);
		separateReds(hexes, topo.hexes, rngState);
		let red = 0;
		let same = 0;
		for (const h of topo.hexes)
			for (const nb of h.neighbors) {
				if (isRed(hexes[h.id].number) && isRed(hexes[nb].number)) red++;
				else if (hexes[nb].number !== null && hexes[nb].number === hexes[h.id].number) same++;
			}
		const bad = red * 100 + same;
		if (!best || bad < best.bad) best = { board, bad };
		if (red === 0 && (same === 0 || attempt > 400)) break;
	}
	const board = best!.board;
	board.ports = placePortsAlongCoast(board, rngState);
	return board;
}

/** Swap red numbers that touch onto tiles with no red neighbor, where the shape leaves room. */
function separateReds(hexes: BoardHex[], topo: { neighbors: number[] }[], rngState: { rng: number }) {
	const redNear = (h: number, except: number) => topo[h].neighbors.some((nb) => nb !== except && isRed(hexes[nb].number));
	for (let k = 0; k < 60; k++) {
		const clash = hexes.findIndex((h, i) => isRed(h.number) && redNear(i, -1));
		if (clash < 0) return;
		const spots = hexes
			.map((h, i) => i)
			.filter((i) => hexes[i].number !== null && !isRed(hexes[i].number) && !redNear(i, clash) && !topo[i].neighbors.includes(clash));
		if (!spots.length) return;
		const to = spots[randomInt(rngState, spots.length)];
		[hexes[clash].number, hexes[to].number] = [hexes[to].number, hexes[clash].number];
	}
}

/**
 * About one harbor per 3.3 coastal edges, spread evenly along each coastline loop in walking
 * order, so they never share a corner. Lake shores inside the island get none.
 */
function placePortsAlongCoast(board: Board, rngState: { rng: number }): BoardPort[] {
	const topo = buildTopology(board);
	const coastal = topo.edges.filter((e) => e.coastal);
	// Walk each loop of coastal edges.
	const byVertex = new Map<number, number[]>();
	for (const e of coastal) for (const v of [e.a, e.b]) byVertex.set(v, [...(byVertex.get(v) ?? []), e.id]);
	const used = new Set<number>();
	const loops: number[][] = [];
	for (const start of coastal) {
		if (used.has(start.id)) continue;
		const loop: number[] = [];
		let edge = start.id;
		let at = start.b;
		while (!used.has(edge)) {
			used.add(edge);
			loop.push(edge);
			const next = (byVertex.get(at) ?? []).find((x) => !used.has(x));
			if (next === undefined) break;
			const ne = topo.edges[next];
			at = ne.a === at ? ne.b : ne.a;
			edge = next;
		}
		loops.push(loop);
	}
	// The outer coast is the loop that reaches furthest from the middle.
	const reach = (loop: number[]) =>
		Math.max(...loop.map((e) => Math.hypot(topo.vertices[topo.edges[e].a].x, topo.vertices[topo.edges[e].a].z)));
	loops.sort((a, b) => reach(b) - reach(a));
	const outer = loops[0];
	const count = Math.max(3, Math.round(outer.length / 3.33));
	const kinds = harborKinds(count, rngState);
	const step = outer.length / count;
	const offset = randomInt(rngState, outer.length);
	const ports: BoardPort[] = [];
	const taken = new Set<number>();
	for (let i = 0; i < count; i++) {
		let idx = Math.round(offset + i * step) % outer.length;
		// Nudge forward if the spot would share a corner with the last harbor.
		for (let k = 0; k < 2; k++) {
			const e = topo.edges[outer[idx]];
			if (!taken.has(e.a) && !taken.has(e.b)) break;
			idx = (idx + 1) % outer.length;
		}
		const e = topo.edges[outer[idx]];
		if (taken.has(e.a) || taken.has(e.b)) continue;
		taken.add(e.a);
		taken.add(e.b);
		const hex = e.hexes[0];
		ports.push({ hex, side: topo.hexes[hex].edges.indexOf(e.id), kind: kinds[i] });
	}
	return ports;
}

/** 4 in 9 harbors trade anything at 3:1; the rest cover each resource in turn at 2:1. */
function harborKinds(count: number, rngState: { rng: number }): PortKind[] {
	const any = Math.round((count * 4) / 9);
	const res = shuffle(rngState, [...RESOURCES]);
	const out: PortKind[] = Array<PortKind>(any).fill('any');
	for (let i = 0; out.length < count; i++) out.push(res[i % res.length]);
	return shuffle(rngState, out);
}
