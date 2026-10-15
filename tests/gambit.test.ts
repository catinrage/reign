import { describe, expect, it } from 'vitest';
import { hexDistance } from '../src/shared/board/hex';
import { cellAt, gambitBoard, START_PIECES, startingCells, THRONE_CROWNS } from '../src/shared/gambit/board';
import { gambitBot } from '../src/shared/gambit/bot';
import { DIAGONALS, LEAPS, moveTargets, shotTargets, VALUE } from '../src/shared/gambit/pieces';
import { applyGambit, boardOf, createGambit, gambitView, MUSTER_EVERY, ordersAllowed, timeOutGambit } from '../src/shared/gambit/rules';
import { cleanGambitSettings } from '../src/shared/gambit/settings';
import { DEFAULT_GAMBIT_SETTINGS, TERRAIN_RULES, type GambitBoard, type GambitSettings, type GambitState, type GbEvent, type Order, type PieceKind, type RoundPlay } from '../src/shared/gambit/types';
import { PLAYER_COLORS } from '../src/shared/rules/config';

const seats = (n: number, bots = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: PLAYER_COLORS[i], isBot: bots }));
const settings = (o: Partial<GambitSettings> = {}): GambitSettings => ({ ...DEFAULT_GAMBIT_SETTINGS, ...o });

function orders(s: GambitState, p: number, os: Order[], ready = true): GambitState {
	const r = applyGambit(s, p, { type: 'orders', orders: os, ready });
	if (!r.ok) throw new Error(r.error);
	return r.state;
}
function error(s: GambitState, p: number, os: Order[]): string {
	const r = applyGambit(s, p, { type: 'orders', orders: os, ready: true });
	if (r.ok) throw new Error('should have failed');
	return r.error;
}
/** Everyone's orders at once (all ready; those not given none), and what the round did. */
function round(s: GambitState, all: Order[][]): { s: GambitState; play: RoundPlay } {
	let t = s;
	s.players.forEach((_, p) => (t = orders(t, p, all[p] ?? [])));
	const e = [...t.log].reverse().find((x): x is Extract<GbEvent, { type: 'roundPlayed' }> => x.type === 'roundPlayed');
	if (!e) throw new Error('no round played');
	return { s: t, play: e.play };
}

/**
 * Room for a scene: a hex with every hex within `r` of it on the board and plain, and no shrine
 * or keep within `free` of it.
 */
function plainSpot(board: GambitBoard, r = 3, free = 0): number {
	const i = board.cells.findIndex(
		(c) =>
			board.cells.filter((d) => hexDistance(c, d) <= r).length === 3 * r * (r + 1) + 1 &&
			board.cells.every((d) => hexDistance(c, d) > r || d.terrain === 'plain') &&
			board.cells.every((d) => hexDistance(c, d) > free || (!d.shrine && d.keep < 0))
	);
	if (i < 0) throw new Error('no plain spot');
	return i;
}
const step = (board: GambitBoard, from: number, dq: number, dr: number) => cellAt(board, { q: board.cells[from].q + dq, r: board.cells[from].r + dr });

/** An open field (a full table's, for room) to stage the scenes below on. */
const TABLE = 8;
const OPEN_SEED = 1;
const board2 = () => gambitBoard(TABLE, { terrain: 'none', seed: OPEN_SEED });

/** Players 0 and 1 on that board (the others have nothing); the pieces placed by hand: [owner, kind, cell]. */
function duel(layout: [number, PieceKind, number][], o: Partial<GambitSettings> = {}): GambitState {
	const s = createGambit(seats(TABLE), 5, settings({ terrain: 'none', seed: OPEN_SEED, ...o }));
	s.pieces = layout.map(([owner, kind, cell], i) => ({ id: i + 1, owner, kind, cell }));
	s.nextPieceId = layout.length + 1;
	return s;
}

describe('Gambit board', () => {
	it('is the same for the same seed, and every land hex can be reached', () => {
		for (const n of [2, 4, 5, 6, 7, 8])
			for (const terrain of TERRAIN_RULES)
				for (const seed of [1, 2, 3]) {
					const b = gambitBoard(n, { terrain, seed });
					expect(gambitBoard(n, { terrain, seed })).toBe(b);
					expect(b.keeps).toHaveLength(n);
					expect(new Set(b.keeps).size).toBe(n);
					// A shrine between every two seats, and the Throne.
					expect(b.cells.filter((c) => c.shrine).length).toBe(n + 1);
					expect(b.cells[cellAt(b, { q: 0, r: 0 })].shrine).toBe(THRONE_CROWNS);
					const land = b.cells.map((c, i) => i).filter((i) => b.cells[i].terrain !== 'water');
					const seen = new Set([land[0]]);
					const queue = [land[0]];
					while (queue.length) {
						const c = queue.shift()!;
						for (const d of land) if (!seen.has(d) && hexDistance(b.cells[c], b.cells[d]) === 1) (seen.add(d), queue.push(d));
					}
					expect(seen.size).toBe(land.length);
				}
	});

	it('grows with the table, and starts everyone the same way round', () => {
		const sizes = [4, 8].map((n) => gambitBoard(n, { terrain: 'mixed', seed: 1 }).cells.length);
		expect(sizes[0]).toBeGreaterThan(120);
		expect(sizes[1]).toBeGreaterThan(sizes[0] + 60);
		for (const n of [2, 3, 4, 5, 6, 7, 8])
			for (const seed of [1, 9]) {
				const b = gambitBoard(n, { terrain: 'wild', seed });
				const all = b.keeps.flatMap((_, p) => startingCells(b, p));
				expect(new Set(all).size).toBe(n * START_PIECES.length);
				for (let p = 0; p < n; p++) {
					const cells = startingCells(b, p);
					expect(cells[0]).toBe(b.keeps[p]);
					for (const c of cells) expect(b.cells[c].terrain).toBe('plain');
				}
				// Keeps all the same steps from the middle, and from their nearest shrines. (Where hexes
				// can't turn every seat onto another, within a step, and shrines a ring or so apart; the
				// seats there are turned round the rim as bot wars found fairest, see gambit-seats.ts.)
				const exact = [2, 3, 4, 6].includes(n);
				const mid = b.cells[cellAt(b, { q: 0, r: 0 })];
				const shrines = b.cells.filter((c) => c.shrine === 1);
				expect(shrines).toHaveLength(n);
				expect(new Set(b.keeps.map((k) => hexDistance(b.cells[k], mid))).size).toBe(1);
				const rings = shrines.map((c) => hexDistance(c, mid));
				expect(Math.max(...rings) - Math.min(...rings)).toBeLessThanOrEqual(exact ? 0 : 2);
				const toShrine = b.keeps.map((k) => Math.min(...shrines.map((c) => hexDistance(c, b.cells[k]))));
				expect(Math.max(...toShrine) - Math.min(...toShrine)).toBeLessThanOrEqual(exact ? 0 : 1);
				// The ground round each keep: where hexes allow it (two, three, four or six seats), the
				// same for every seat, kind by kind and step by step; otherwise close.
				const side = (p: number) =>
					b.cells
						.filter((c) => c.terrain !== 'plain' && b.keeps.every((k) => hexDistance(c, b.cells[b.keeps[p]]) <= hexDistance(c, b.cells[k])))
						.map((c) => `${c.terrain}:${hexDistance(c, b.cells[b.keeps[p]])}:${hexDistance(c, mid)}`)
						.sort()
						.join(' ');
				if (exact) for (let p = 1; p < n; p++) expect(side(p)).toBe(side(0));
				else {
					const counts = b.keeps.map((_, p) => side(p).split(' ').filter(Boolean).length);
					expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(8);
				}
			}
	});
});

describe('Gambit pieces', () => {
	it('step, charge, glide and leap as they should', () => {
		const b = board2();
		const c = plainSpot(b);
		const s = duel([
			[0, 'lancer', c],
			[0, 'guard', step(b, c, 2, 0)],
			[1, 'guard', step(b, c, 0, -2)]
		]);
		const lancer = s.pieces[0];
		const t = moveTargets(b, s.pieces, lancer);
		// Stopped short of its own guard, onto the enemy's but not past it.
		expect(t).toContain(step(b, c, 1, 0));
		expect(t).not.toContain(step(b, c, 2, 0));
		expect(t).toContain(step(b, c, 0, -2));
		expect(t).not.toContain(step(b, c, 0, -3));
		// Its own guard moving away opens the line.
		expect(moveTargets(b, s.pieces, lancer, new Set([step(b, c, 2, 0)]))).toContain(step(b, c, 3, 0));
		const knight = { id: 9, owner: 0, kind: 'knight' as const, cell: c };
		expect(moveTargets(b, [knight], knight).sort()).toEqual(LEAPS.map((d) => step(b, c, d.q, d.r)).filter((x) => x >= 0).sort());
		const seer = { id: 9, owner: 0, kind: 'seer' as const, cell: c };
		expect(moveTargets(b, [seer], seer)).toEqual(expect.arrayContaining(DIAGONALS.map((d) => step(b, c, d.q, d.r))));
		const guard = { id: 9, owner: 0, kind: 'guard' as const, cell: c };
		expect(moveTargets(b, [guard], guard)).toHaveLength(6);
		const archer = { id: 9, owner: 0, kind: 'archer' as const, cell: c };
		expect(shotTargets(b, archer).every((x) => hexDistance(b.cells[x], b.cells[c]) === 2)).toBe(true);
		expect(shotTargets(b, archer)).toHaveLength(12);
	});
});

describe('Gambit rounds', () => {
	it('take a piece that stays, but not one that moved away', () => {
		const b = board2();
		const c = plainSpot(b);
		const e = step(b, c, 1, 0);
		const s = duel([
			[0, 'guard', c],
			[1, 'guard', e],
			[1, 'monarch', step(b, c, 3, 0)]
		]);
		const taken = round(s, [[{ piece: 1, type: 'move', to: e }], []]);
		expect(taken.play.losses).toMatchObject([{ piece: { id: 2 }, by: 0, how: 'captured' }]);
		expect(taken.play.crowns.find((c) => c.player === 0)?.taken).toBe(VALUE.guard);
		expect(taken.s.pieces.find((p) => p.id === 1)?.cell).toBe(e);
		const dodged = round(s, [[{ piece: 1, type: 'move', to: e }], [{ piece: 2, type: 'move', to: step(b, c, 1, 1) }]]);
		expect(dodged.play.losses).toEqual([]);
	});

	it('lets a braced guard hold against a charge, and equal ranks fall together', () => {
		const b = board2();
		const c = plainSpot(b);
		const e = step(b, c, 2, 0);
		const s = duel([
			[0, 'lancer', c],
			[1, 'guard', e]
		]);
		const held = round(s, [[{ piece: 1, type: 'move', to: e }], [{ piece: 2, type: 'brace' }]]);
		expect(held.play.losses).toMatchObject([{ piece: { id: 1 }, by: 1, how: 'clash' }]);
		const meet = duel([
			[0, 'lancer', c],
			[1, 'lancer', step(b, c, 4, 0)],
			[1, 'monarch', step(b, c, 0, 3)]
		]);
		const both = round(meet, [[{ piece: 1, type: 'move', to: e }], [{ piece: 2, type: 'move', to: e }]]);
		expect(both.play.losses.map((l) => l.piece.id).sort()).toEqual([1, 2]);
		expect(both.play.losses.every((l) => l.by === null)).toBe(true);
	});

	it('fights pieces that swap places on the way', () => {
		const b = board2();
		const c = plainSpot(b);
		const e = step(b, c, 1, 0);
		const s = duel([
			[0, 'knight', step(b, c, -3, 1)],
			[0, 'guard', c],
			[1, 'monarch', e]
		]);
		const r = round(s, [[{ piece: 2, type: 'move', to: e }], [{ piece: 3, type: 'move', to: c }]]);
		expect(r.play.swaps).toEqual([{ a: 2, b: 3 }]);
		// The monarch outranks the guard, takes it on the way, and goes on.
		expect(r.play.losses).toMatchObject([{ piece: { id: 2 }, by: 1 }]);
		expect(r.s.pieces.find((p) => p.id === 3)?.cell).toBe(c);
	});

	it('lands arrows where the pieces are once they have moved, never in a forest', () => {
		const b = board2();
		const c = plainSpot(b);
		const s = duel([
			[0, 'archer', c],
			[1, 'guard', step(b, c, 3, 0)],
			[1, 'monarch', step(b, c, -3, 0)]
		]);
		// The guard walks into the arrow's hex.
		const r = round(s, [[{ piece: 1, type: 'shoot', at: step(b, c, 2, 0) }], [{ piece: 2, type: 'move', to: step(b, c, 2, 0) }]]);
		expect(r.play.arrows).toEqual([{ piece: 1, at: step(b, c, 2, 0), hit: 2 }]);
		expect(r.play.losses).toMatchObject([{ piece: { id: 2 }, by: 0, how: 'arrow' }]);
		// A miss when it stays put.
		const miss = round(s, [[{ piece: 1, type: 'shoot', at: step(b, c, 2, 0) }], []]);
		expect(miss.play.arrows[0].hit).toBeNull();
	});

	it('gives cover from arrows in the forests', () => {
		const settings = { terrain: 'wild' as const, seed: 4 };
		const b = gambitBoard(TABLE, settings);
		const wood = b.cells.findIndex((c, i) => c.terrain === 'forest' && b.cells.some((d) => hexDistance(c, d) === 2 && d.terrain === 'plain') && i >= 0);
		const from = b.cells.findIndex((d) => hexDistance(d, b.cells[wood]) === 2 && d.terrain === 'plain');
		const s = createGambit(seats(TABLE), 5, { ...DEFAULT_GAMBIT_SETTINGS, ...settings });
		s.pieces = [
			{ id: 1, owner: 0, kind: 'archer', cell: from },
			{ id: 2, owner: 1, kind: 'guard', cell: wood }
		];
		const r = round(s, [[{ piece: 1, type: 'shoot', at: wood }]]);
		expect(r.play.arrows).toEqual([{ piece: 1, at: wood, hit: null }]);
		expect(r.play.losses).toEqual([]);
	});

	it('scores shrines, brings a taken monarch home and costs its player an order', () => {
		const b = board2();
		const c = plainSpot(b, 1, 1);
		const throne = cellAt(b, { q: 0, r: 0 });
		const king = step(b, c, 1, 0);
		const s = duel([
			[0, 'guard', throne],
			[0, 'guard', c],
			[1, 'monarch', king]
		]);
		const r = round(s, [[{ piece: 2, type: 'move', to: king }], []]);
		expect(r.s.players[0].crowns).toBe(THRONE_CROWNS + VALUE.monarch);
		expect(r.play.crowns).toContainEqual({ player: 0, shrines: THRONE_CROWNS, taken: VALUE.monarch });
		// Back on its keep, and one order fewer next round.
		expect(r.play.returned).toEqual([{ piece: 3, cell: b.keeps[1] }]);
		expect(r.s.pieces.find((p) => p.id === 3)?.cell).toBe(b.keeps[1]);
		expect(r.s.players[1].deposed).toBe(true);
		expect(ordersAllowed(r.s, 1)).toBe(DEFAULT_GAMBIT_SETTINGS.orders - 1);
		expect(error(r.s, 1, [{ piece: 3, type: 'brace' }, { piece: 3, type: 'brace' }])).toBe('You can give only 1 order this round.');
		// The round after, it's back to normal.
		expect(round(r.s, []).s.players[1].deposed).toBe(false);
	});

	it('musters a guard at each keep every third round', () => {
		let s = createGambit(seats(2), 3, settings());
		s.pieces = s.pieces.filter((p) => !(p.owner === 1 && p.kind === 'lancer'));
		for (let i = 0; i < MUSTER_EVERY; i++) s = round(s, [[], []]).s;
		expect(s.pieces.filter((p) => p.owner === 1)).toHaveLength(START_PIECES.length - 1);
		expect(s.pieces.filter((p) => p.owner === 0)).toHaveLength(START_PIECES.length);
	});

	it('refuses orders that break the rules, and allows moving into a hex your own piece leaves', () => {
		const b = board2();
		const c = plainSpot(b);
		const s = duel([
			[0, 'guard', c],
			[0, 'guard', step(b, c, 1, 0)],
			[0, 'guard', step(b, c, 0, 1)],
			[1, 'guard', step(b, c, -3, 0)]
		]);
		expect(error(s, 0, [{ piece: 1, type: 'move', to: step(b, c, 1, 0) }])).toBe("That piece can't move there.");
		expect(error(s, 0, [{ piece: 4, type: 'brace' }])).toBe('Order your own pieces.');
		expect(error(s, 0, [{ piece: 1, type: 'brace' }, { piece: 2, type: 'brace' }, { piece: 3, type: 'brace' }])).toBe('You can give only 2 orders this round.');
		expect(error(s, 0, [{ piece: 1, type: 'move', to: step(b, c, 1, -1) }, { piece: 2, type: 'move', to: step(b, c, 1, -1) }])).toBe('Two of your pieces are going to the same hex.');
		expect(error(s, 0, [{ piece: 1, type: 'shoot', at: step(b, c, 2, 0) }])).toBe('Only archers shoot, two hexes away (three from a hill).');
		const chain = orders(s, 0, [{ piece: 1, type: 'move', to: step(b, c, 1, 0) }, { piece: 2, type: 'move', to: step(b, c, 2, 0) }], false);
		expect(chain.orders[0]).toHaveLength(2);
	});

	it('keeps orders secret until the round is played', () => {
		const s = orders(createGambit(seats(3), 1, settings()), 1, [{ piece: 10, type: 'brace' }]);
		expect(gambitView(s, 1).myOrders).toEqual([{ piece: 10, type: 'brace' }]);
		expect(gambitView(s, 0).myOrders).toEqual([]);
		expect(JSON.stringify(gambitView(s, 0))).not.toContain('"brace"');
		expect(gambitView(s, 0).ready).toEqual([false, true, false]);
	});

	it('plays the round with the orders given when the clock runs out', () => {
		const s0 = createGambit(seats(2), 1, settings());
		const s = orders(s0, 0, [{ piece: 1, type: 'brace' }], false);
		const t = timeOutGambit(s);
		expect(t.round).toBe(2);
		expect(t.log.filter((e) => e.type === 'turnTimedOut')).toHaveLength(2);
	});

	it('ends at the crown target, or when the rounds run out', () => {
		let s = createGambit(seats(2), 1, settings({ rounds: 10 }));
		s.players[0].crowns = 19;
		const throne = cellAt(boardOf(s), { q: 0, r: 0 });
		s.pieces[1].cell = throne;
		s = round(s, [[], []]).s;
		expect(s.phase).toBe('ended');
		expect(s.winner).toBe(0);
		expect(s.log.at(-1)).toMatchObject({ type: 'gameOver', winner: 0, reason: 'crowns' });
		let t = createGambit(seats(2), 1, settings({ rounds: 10 }));
		for (let i = 0; i < 10; i++) t = round(t, [[], []]).s;
		expect(t.phase).toBe('ended');
		expect(t.log.at(-1)).toMatchObject({ type: 'gameOver', reason: 'rounds' });
	});
});

describe('Gambit settings', () => {
	it('keep only what is allowed', () => {
		expect(cleanGambitSettings({ orders: 9, crowns: 20, rounds: 'x', terrain: 'lava', seed: 7 })).toEqual({ ...DEFAULT_GAMBIT_SETTINGS, seed: 7 });
		expect(cleanGambitSettings(null)).toEqual(DEFAULT_GAMBIT_SETTINGS);
	});
});

describe('Gambit bots', () => {
	it('play whole wars at every table size, always within the rules', () => {
		for (const n of [2, 4, 6, 8]) {
			let s = createGambit(seats(n, true), n * 7, settings({ terrain: n % 4 ? 'wild' : 'mixed', seed: n }));
			for (let guard = 0; s.phase !== 'ended' && guard < 40; guard++)
				for (let p = 0; p < n && s.phase !== 'ended'; p++) {
					const os = gambitBot(gambitView(s, p)) ?? [];
					const r = applyGambit(s, p, { type: 'orders', orders: os, ready: true });
					if (!r.ok) throw new Error(`bot ${p} round ${s.round}: ${r.error}`);
					s = r.state;
				}
			expect(s.phase).toBe('ended');
			expect(s.players.some((p) => p.crowns > 0)).toBe(true);
			// Every piece on its own hex, none in water.
			const b = boardOf(s);
			expect(new Set(s.pieces.map((p) => p.cell)).size).toBe(s.pieces.length);
			expect(s.pieces.every((p) => b.cells[p.cell].terrain !== 'water')).toBe(true);
		}
	});
});
