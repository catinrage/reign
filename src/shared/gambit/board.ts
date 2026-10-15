import { AXIAL_DIRECTIONS, hexDistance, hexKey, hexToWorld, worldToHex, type Axial } from '../board/hex';
import { nextRandom } from '../rng';
import type { Cell, GambitBoard, GambitSettings, Piece, PieceKind, Terrain, TerrainRule } from './types';

/**
 * Gambit's board: a hexagon of hexes sized for the table, each seat's keep on its rim, a shrine
 * between every two neighbouring seats and the Throne in the middle. Where things lie is worked
 * out in steps round the rings of hexes about the middle (the way pieces count distance), and
 * every seat's side gets the same: the keep as many steps out, the shrines as near, the same
 * groves, hills and lakes in the same places as seen from it. Every land hex can be reached. The
 * same players and settings always make the same board, on every machine at the table.
 */

/** Steps from the middle to the rim: 127 hexes for up to three players, 169 for four, 217 for five or six, 271 for seven, 331 for eight. */
export function boardRadius(players: number): number {
	return players <= 3 ? 6 : players === 4 ? 7 : players <= 6 ? 8 : players === 7 ? 9 : 10;
}
/** Each player's home (this many steps from the keep, where their pieces start) and the middle stay open ground. */
const HOME = 3;
const MIDDLE = 1;
/** Where the shrines between seats stand, as a share of the way out from the middle to the keeps. */
const SHRINE_AT = 0.55;
/** Crowns a round: a shrine, the Throne. */
export const SHRINE_CROWNS = 1;
export const THRONE_CROWNS = 2;

type Feature = Exclude<Terrain, 'plain'>;
/** Which wins where two meet. */
const OVER: Feature[] = ['water', 'forest', 'hill'];
/** About the share of each seat's open ground (outside homes, shrines and the middle) each kind takes. */
const DENSITY: Record<TerrainRule, Record<Feature, number>> = {
	none: { water: 0, forest: 0, hill: 0 },
	light: { water: 0, forest: 0.12, hill: 0.06 },
	mixed: { water: 0.07, forest: 0.17, hill: 0.09 },
	wild: { water: 0.11, forest: 0.25, hill: 0.13 }
};
/** Where lakes may lie, as shares of the way out from the middle. */
const LAKE_BAND = [0.35, 0.8] as const;
/** Layouts tried where hexes can't make every side alike (five, seven, eight players): the fairest is kept. */
const TRIES = 12;

/** Every seat's pieces, as they stand when the war begins: the monarch on the keep, guards in front. */
export const START_PIECES: PieceKind[] = ['monarch', 'guard', 'guard', 'guard', 'knight', 'seer', 'lancer', 'lancer', 'archer'];

/** The seats' directions out from the middle (radians, world x/z), the first towards the viewer. */
export function seatAngle(seat: number, players: number): number {
	return Math.PI / 2 + (2 * Math.PI * seat) / players;
}

/**
 * Where hexes can't make every seat alike (five, seven, eight players): how many hexes round the
 * rim the seats are turned, picked from bot wars as the turn with the most even wins (see
 * scripts/dev/gambit-seats.ts). Left out: turned clear of the hexagon's corners.
 */
export const SEAT_SHIFT: Partial<Record<number, number>> = { 5: 5, 7: 4, 8: 1 };

const cache = new Map<string, GambitBoard>();

export function gambitBoard(players: number, settings: Pick<GambitSettings, 'terrain' | 'seed'>): GambitBoard {
	const key = `${players}:${settings.terrain}:${settings.seed}:${SEAT_SHIFT[players] ?? ''}`;
	let b = cache.get(key);
	if (!b) {
		b = makeBoard(players, settings.terrain, settings.seed);
		if (cache.size >= 8) cache.delete(cache.keys().next().value!);
		cache.set(key, b);
	}
	return b;
}

/**
 * The hexes `steps` from the middle, in order round the ring the way the seats go (from the
 * first seat's direction): `at(u)` is the one a share `u` of the way round.
 */
function ring(steps: number): { cells: Axial[]; at: (u: number) => Axial } {
	if (steps === 0) return { cells: [{ q: 0, r: 0 }], at: () => ({ q: 0, r: 0 }) };
	const out: Axial[] = [];
	let h = { q: AXIAL_DIRECTIONS[4].q * steps, r: AXIAL_DIRECTIONS[4].r * steps };
	for (let side = 0; side < 6; side++)
		for (let j = 0; j < steps; j++) {
			out.push(h);
			h = { q: h.q + AXIAL_DIRECTIONS[side].q, r: h.r + AXIAL_DIRECTIONS[side].r };
		}
	const angle = (a: Axial) => {
		const w = hexToWorld(a);
		return Math.atan2(w.z, w.x);
	};
	const first = seatAngle(0, 1);
	const off = (a: Axial) => Math.abs(Math.atan2(Math.sin(angle(a) - first), Math.cos(angle(a) - first)));
	// Start at the hex straight towards the first seat, going round the way the seats do.
	let start = 0;
	out.forEach((a, i) => {
		if (off(a) < off(out[start]) - 1e-9) start = i;
	});
	let cells = [...out.slice(start), ...out.slice(0, start)];
	const turn = Math.atan2(Math.sin(angle(cells[1]) - angle(cells[0])), Math.cos(angle(cells[1]) - angle(cells[0])));
	if (turn < 0) cells = [cells[0], ...cells.slice(1).reverse()];
	return { cells, at: (u) => cells[(((Math.round(u * cells.length) % cells.length) + cells.length) % cells.length)] };
}

/** A way of turning the board onto itself, the first seat's side onto another's. */
type Turn = (h: Axial) => Axial;

/**
 * How each seat's side is the first seat's, turned. Exactly, where hexes allow it: a rotation for
 * two, three or six players; for four, mirror images (each seat with a near neighbour and a far
 * one, all alike). Otherwise as near as the rings of hexes about the middle allow.
 */
function seatTurns(players: number, radius: number): { turns: Turn[]; exact: boolean; first: Axial } {
	const turned = (f: (x: number, z: number) => [number, number]) => (h: Axial) => {
		const w = hexToWorld(h);
		return worldToHex(...f(w.x, w.z));
	};
	const rotate = (a: number) => turned((x, z) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)]);
	if (6 % players === 0) return { exact: true, first: ring(radius).at(0), turns: Array.from({ length: players }, (_, p) => rotate((2 * Math.PI * p) / players)) };
	if (players === 4)
		return {
			exact: true,
			first: ring(radius).at(-1 / 6),
			turns: [(h) => h, turned((x, z) => [-x, z]), rotate(Math.PI), turned((x, z) => [x, -z])]
		};
	// Round the rim as evenly as the ring allows, turned so no keep stands on (or by) one of the
	// hexagon's corners, where there is less room to stand and fewer ways out.
	const rim = ring(radius);
	const corners = rim.cells.filter((c) => AXIAL_DIRECTIONS.some((d) => d.q * radius === c.q && d.r * radius === c.r));
	const fromCorner = (shift: number) =>
		Math.min(...Array.from({ length: players }, (_, p) => Math.min(...corners.map((c) => hexDistance(c, rim.at(shift / rim.cells.length + p / players))))));
	let shift = SEAT_SHIFT[players] ?? 0;
	if (SEAT_SHIFT[players] === undefined) for (let k = 1; k < rim.cells.length / players; k++) if (fromCorner(k) > fromCorner(shift)) shift = k;
	return {
		exact: false,
		first: rim.at(shift / rim.cells.length),
		turns: Array.from({ length: players }, (_, p) => (h: Axial) => {
			const d = hexDistance(h, { q: 0, r: 0 });
			if (!d) return h;
			const r = ring(d);
			const i = r.cells.findIndex((c) => c.q === h.q && c.r === h.r);
			return r.at(i / r.cells.length + p / players);
		})
	};
}

function makeBoard(players: number, rule: TerrainRule, seed: number): GambitBoard {
	const { turns, exact } = seatTurns(players, boardRadius(players));
	let best: { board: GambitBoard; unfair: number } | null = null;
	for (let attempt = 0; attempt < (exact ? 1 : TRIES); attempt++) {
		const board = layout(players, rule, seed + attempt * 7717);
		if (exact) return board;
		const unfair = unfairness(board, turns);
		if (!best || unfair < best.unfair) best = { board, unfair };
	}
	return best!.board;
}

function layout(players: number, rule: TerrainRule, seed: number): GambitBoard {
	const radius = boardRadius(players);
	const { turns, exact, first } = seatTurns(players, radius);
	const cells: Cell[] = [];
	const index: Record<string, number> = {};
	for (let r = -radius; r <= radius; r++)
		for (let q = -radius; q <= radius; q++) {
			if (hexDistance({ q, r }, { q: 0, r: 0 }) > radius) continue;
			index[hexKey({ q, r })] = cells.length;
			cells.push({ q, r, terrain: 'plain', shrine: 0, keep: -1 });
		}
	const at = (h: Axial) => index[hexKey(h)] ?? -1;
	const middle = at({ q: 0, r: 0 });
	const keeps = turns.map((turn) => at(turn(first)));
	keeps.forEach((k, p) => (cells[k].keep = p));
	cells[middle].shrine = THRONE_CROWNS;
	// (Four seats are mirror images of each other: their shrines lie on the mirrors, an even ring out.)
	const want = radius * SHRINE_AT;
	const shrineRing = Math.max(MIDDLE + 1, players === 4 ? 2 * Math.round(want / 2) : Math.round(want));
	for (const c of exact ? exactShrines(players, shrineRing, turns, at) : evenShrines(cells, keeps, shrineRing)) cells[c].shrine = SHRINE_CROWNS;

	// Groves, hills and lakes: laid out on the first seat's side (the hexes nearer its keep than
	// any other's), then turned onto every seat's. Where two meet, lakes win over groves and
	// groves over hills, whoever's side they are on.
	const open = (c: Cell) => !c.shrine && keeps.every((k) => hexDistance(c, cells[k]) > HOME) && hexDistance(c, cells[middle]) > MIDDLE;
	const own = cells.filter((c) => {
		const d = keeps.map((k) => hexDistance(c, cells[k]));
		return d[0] <= Math.min(...d.slice(1));
	});
	const room = own.filter(open);
	// Each seat's fair share of the open ground, whatever the shape of its side.
	const share = cells.filter(open).length / players;
	const rng = { rng: seed * 7919 + players * 104729 + 1 };
	const mine = new Map<number, Feature>();
	// Groves and lakes keep apart from what is already there; a hill may stand beside anything.
	const taken = (c: Cell, kind: Feature) => mine.has(at(c)) || (kind !== 'hill' && neighborsOf(c, index).some((n) => mine.has(n)));
	for (const kind of OVER) {
		let left = Math.round(DENSITY[rule][kind] * share);
		const band = (c: Cell) => {
			const d = hexDistance(c, cells[middle]) / radius;
			return kind !== 'water' || (d >= LAKE_BAND[0] && d <= LAKE_BAND[1]);
		};
		for (let tries = 0; left > 0 && tries < 120; tries++) {
			const c = room[Math.floor(nextRandom(rng) * room.length)];
			if (!c || !band(c) || taken(c, kind)) continue;
			// Groves and lakes: a hex and as many of its neighbours as are wanted; hills stand alone.
			const spread = kind === 'hill' ? [] : neighborsOf(c, index).filter((n) => open(cells[n]) && band(cells[n]) && !mine.has(n));
			const patch = [at(c), ...spread.slice(0, Math.max(0, Math.min(left - 1, 3 + Math.floor(nextRandom(rng) * 3))))];
			for (const i of patch) mine.set(i, kind);
			left -= patch.length;
		}
	}
	const cover = new Map<number, Feature>();
	for (const turn of turns)
		for (const [i, kind] of mine) {
			const j = at(turn(cells[i]));
			if (j < 0 || !open(cells[j])) continue;
			const was = cover.get(j);
			if (!was || OVER.indexOf(kind) < OVER.indexOf(was)) cover.set(j, kind);
		}
	for (const [i, kind] of cover) cells[i].terrain = kind;
	connect(cells, index, middle);
	return { cells, index, keeps, radius };
}

/** Shrines where every seat's side is the first's turned: those between it and its neighbours, turned round. */
function exactShrines(players: number, steps: number, turns: Turn[], at: (h: Axial) => number): number[] {
	const r = ring(steps);
	// Halfway round to the next seat and to the one before, as seen from the first.
	const gaps = players === 4 ? [r.at(0), r.at(-1 / 4)] : [r.at(0.5 / players)];
	return [...new Set(gaps.flatMap((g) => turns.map((turn) => at(turn(g)))))];
}

/**
 * Shrines where the seats can't be turned onto each other exactly: one between every two
 * neighbouring seats, near halfway round to the next and about halfway out, each seat as near as
 * can be the same steps from both of its shrines (worth more than every shrine lying the same
 * ring out, which comes next).
 */
function evenShrines(cells: Cell[], keeps: number[], steps: number): number[] {
	const players = keeps.length;
	const radius = Math.max(...cells.map((c) => hexDistance(c, { q: 0, r: 0 })));
	const ringOf = (c: Cell) => hexDistance(c, { q: 0, r: 0 });
	const frac = (c: Cell) => {
		const w = hexToWorld(c);
		const a = Math.atan2(w.z, w.x) - seatAngle(0, players);
		return ((a / (2 * Math.PI)) % 1 + 1) % 1;
	};
	const free = (c: Cell) => keeps.every((k) => hexDistance(c, cells[k]) > HOME) && ringOf(c) > MIDDLE && ringOf(c) < radius;
	/** For each gap: hexes near halfway round to the next seat, how far from the keeps either side. */
	const options = keeps.map((_, p) =>
		cells.flatMap((c, i) => {
			if (!free(c)) return [];
			const gap = (p + 0.5) / players;
			const aside = Math.abs(((frac(c) - gap + 1.5) % 1) - 0.5) * players;
			// Near halfway round, and about halfway out (a ring either side at most).
			if (aside > 0.3 || Math.abs(ringOf(c) - steps) > 1) return [];
			return [{ i, a: hexDistance(c, cells[keeps[p]]), b: hexDistance(c, cells[keeps[(p + 1) % players]]), off: Math.abs(ringOf(c) - steps), aside }];
		})
	);
	let best: { pick: number[]; score: number[] } | null = null;
	for (const target of new Set(options.flat().map((o) => Math.max(o.a, o.b)))) {
		const pick = options.map((os) => [...os].sort((x, y) => Math.abs(x.a - target) + Math.abs(x.b - target) - Math.abs(y.a - target) - Math.abs(y.b - target) || x.off - y.off || x.aside - y.aside)[0]);
		if (pick.some((o) => !o) || new Set(pick.map((o) => o.i)).size < players) continue;
		const all = pick.flatMap((o) => [o.a, o.b]);
		const score = [Math.max(...all) - Math.min(...all), pick.reduce((n, o) => n + o.off, 0), Math.abs(target - steps - 1), pick.reduce((n, o) => n + o.aside, 0)];
		const k = best ? score.findIndex((v, j) => v !== best!.score[j]) : -1;
		if (!best || (k >= 0 && score[k] < best.score[k])) best = { pick: pick.map((o) => o.i), score };
	}
	return best?.pick ?? [];
}

/**
 * How unevenly a board treats its seats (lower is fairer): how much the ground round each keep
 * differs from the first seat's, turned, and how differently far the shrines are from each.
 */
function unfairness(board: GambitBoard, turns: Turn[]): number {
	const at = (h: Axial) => board.index[hexKey(h)] ?? -1;
	let off = 0;
	board.cells.forEach((c) => {
		if (c.terrain === 'plain') return;
		for (const turn of turns) {
			const j = at(turn(c));
			if (j >= 0 && board.cells[j].terrain !== c.terrain) off++;
		}
	});
	const shrines = board.cells.filter((c) => c.shrine === SHRINE_CROWNS);
	const near = board.keeps.map((k) => Math.min(...shrines.map((c) => hexDistance(c, board.cells[k]))));
	return off + 10 * (Math.max(...near) - Math.min(...near));
}

/** Lakes never cut a land hex off: any that can't be reached get a ford dug towards the middle. */
function connect(cells: Cell[], index: Record<string, number>, middle: number) {
	for (let guard = 0; guard < cells.length; guard++) {
		const seen = reachable(cells, index, middle);
		const lost = cells.findIndex((c, i) => c.terrain !== 'water' && !seen.has(i));
		if (lost < 0) return;
		// Walk from the cut-off hex towards the middle, draining water on the way.
		let at = lost;
		while (!seen.has(at)) {
			const here = cells[at];
			const next = neighborsOf(here, index)
				.map((n) => ({ n, d: hexDistance(cells[n], cells[middle]) }))
				.sort((a, b) => a.d - b.d || a.n - b.n)[0].n;
			if (cells[next].terrain === 'water') cells[next].terrain = 'plain';
			at = next;
		}
	}
}

function reachable(cells: Cell[], index: Record<string, number>, from: number): Set<number> {
	const seen = new Set([from]);
	const queue = [from];
	while (queue.length) {
		const c = queue.shift()!;
		for (const n of neighborsOf(cells[c], index)) {
			if (seen.has(n) || cells[n].terrain === 'water') continue;
			seen.add(n);
			queue.push(n);
		}
	}
	return seen;
}

export function cellAt(board: GambitBoard, h: Axial): number {
	return board.index[hexKey(h)] ?? -1;
}

export function neighborsOf(h: Axial, index: Record<string, number>): number[] {
	const out: number[] = [];
	for (const d of AXIAL_DIRECTIONS) {
		const n = index[hexKey({ q: h.q + d.q, r: h.r + d.r })];
		if (n !== undefined) out.push(n);
	}
	return out;
}

export function terrainOf(board: GambitBoard, cell: number): Terrain {
	return board.cells[cell]?.terrain ?? 'water';
}

/** The middle of the board (the Throne). */
export function throneOf(board: GambitBoard): number {
	return board.index['0,0'];
}

/**
 * Where a seat's pieces stand when the war begins, in START_PIECES' order: the monarch on the keep,
 * the rest drawn up close in front of it, facing the middle (a narrow wedge, so its flanks don't
 * reach out towards the neighbours): a guard on each flank and one in front, the others between.
 */
export function startingCells(board: GambitBoard, seat: number): number[] {
	const keep = board.cells[board.keeps[seat]];
	const where = seatFrame(board, seat);
	const wedge = board.cells
		.map((c, i) => ({ c, i }))
		.filter(({ c, i }) => i !== board.keeps[seat] && c.terrain !== 'water' && hexDistance(c, keep) <= 3)
		.map(({ i, c }) => ({ i, ...where(c), d: hexDistance(c, keep) }))
		.filter((x) => x.ahead > 0)
		.sort((a, b) => Math.abs(a.side) * 2 + a.ahead - (Math.abs(b.side) * 2 + b.ahead) || a.side - b.side)
		.slice(0, START_PIECES.length - 1);
	// The flanks: the furthest out to either side; the front: the furthest ahead of the rest.
	const left = [...wedge].sort((a, b) => a.side - b.side || b.ahead - a.ahead)[0];
	const right = [...wedge].sort((a, b) => b.side - a.side || b.ahead - a.ahead)[0];
	const rest = wedge.filter((x) => x !== left && x !== right).sort((a, b) => b.ahead - a.ahead || Math.abs(a.side) - Math.abs(b.side) || a.side - b.side);
	const [front, ...middle] = rest;
	// Guards (flanks and front), then knight, seer, lancers and archer, front to back.
	return [board.keeps[seat], left.i, right.i, front.i, ...middle.map((x) => x.i)];
}

/**
 * Where a hex lies as seen from a seat's keep, facing the middle: how far ahead, and how far to
 * the side (rounded, so seats turned onto each other see the same, and ties fall the same way).
 */
function seatFrame(board: GambitBoard, seat: number): (c: Axial) => { ahead: number; side: number } {
	const kw = hexToWorld(board.cells[board.keeps[seat]]);
	const len = Math.hypot(kw.x, kw.z) || 1;
	const fx = -kw.x / len;
	const fz = -kw.z / len;
	const round = (v: number) => Math.round(v * 1e6) / 1e6;
	return (c) => {
		const w = hexToWorld(c);
		const dx = w.x - kw.x;
		const dz = w.z - kw.z;
		return { ahead: round(dx * fx + dz * fz), side: round(dx * fz - dz * fx) };
	};
}

/** The free hex nearest a seat's keep (the keep itself if free): where a monarch comes back, or a guard musters. */
export function nearestFree(board: GambitBoard, pieces: Piece[], seat: number): number {
	const taken = new Set(pieces.map((p) => p.cell));
	const keep = board.cells[board.keeps[seat]];
	const where = seatFrame(board, seat);
	let best = -1;
	let key: number[] = [];
	board.cells.forEach((c, i) => {
		if (c.terrain === 'water' || taken.has(i)) return;
		// The nearest; of those, the most sheltered (straight behind the line, furthest back).
		const w = where(c);
		const k = [hexDistance(c, keep), Math.abs(w.side), w.ahead, w.side];
		const j = k.findIndex((v, n) => v !== key[n]);
		if (best < 0 || (j >= 0 && k[j] < key[j])) {
			best = i;
			key = k;
		}
	});
	return best;
}
