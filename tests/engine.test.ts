import { describe, expect, it } from 'vitest';
import { generateStandardBoard } from '../src/shared/board/generate';
import { buildTopology, getTopology } from '../src/shared/board/topology';
import { botAction } from '../src/shared/rules/bot';
import { BANK_PER_RESOURCE, RESOURCES, STANDARD_NUMBER_POOL } from '../src/shared/rules/config';
import { applyAction, createGame, totalPoints } from '../src/shared/rules/engine';
import {
	longestRoad,
	settlementSpots,
	tradeHarbor,
	tradeRatios
} from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const players = (n: number) =>
	(['red', 'blue', 'yellow', 'green'] as const).slice(0, n).map((color, i) => ({
		name: `P${i}`,
		color,
		isBot: true
	}));

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

function checkConservation(s: GameState) {
	for (const r of RESOURCES) {
		const total = s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0);
		expect(total, r).toBe(BANK_PER_RESOURCE);
	}
	const devTotal = s.devDeck.length + s.players.reduce((n, p) => n + p.devCards.length, 0);
	expect(devTotal).toBeLessThanOrEqual(25);
}

describe('board', () => {
	it('has the classic topology', () => {
		const board = generateStandardBoard({ rng: 42 });
		const topo = buildTopology(board);
		expect(board.hexes).toHaveLength(19);
		expect(topo.vertices).toHaveLength(54);
		expect(topo.edges).toHaveLength(72);
		expect(topo.edges.filter((e) => e.coastal)).toHaveLength(30);
		expect(board.ports).toHaveLength(9);
		const nums = board.hexes.flatMap((h) => (h.number === null ? [] : [h.number])).sort((a, b) => a - b);
		expect(nums).toEqual([...STANDARD_NUMBER_POOL].sort((a, b) => a - b));
	});

	it('never puts 6 and 8 next to each other', () => {
		for (let seed = 1; seed < 200; seed++) {
			const board = generateStandardBoard({ rng: seed });
			const topo = getTopology(board);
			for (const h of topo.hexes) {
				const red = (n: number | null) => n === 6 || n === 8;
				if (!red(board.hexes[h.id].number)) continue;
				for (const nb of h.neighbors) expect(red(board.hexes[nb].number)).toBe(false);
			}
		}
	});

	it('keeps harbors apart', () => {
		const board = generateStandardBoard({ rng: 7 });
		const topo = getTopology(board);
		const verts = topo.portEdges.flatMap((p) => [topo.edges[p.edge].a, topo.edges[p.edge].b]);
		expect(new Set(verts).size).toBe(18);
	});
});

describe('rules', () => {
	it('enforces the distance rule and setup order', () => {
		let s = createGame(players(3), 1);
		const v = settlementSpots(s, 0, true)[0];
		s = act(s, 0, { type: 'placeSettlement', vertex: v });
		const topo = getTopology(s.board);
		const neighbor = topo.vertices[v].neighbors[0];
		expect(applyAction(s, 0, { type: 'placeRoad', edge: topo.edges.find((e) => e.a !== v && e.b !== v)!.id }).ok).toBe(false);
		s = act(s, 0, { type: 'placeRoad', edge: topo.vertices[v].edges[0] });
		expect(s.current).toBe(1);
		expect(applyAction(s, 1, { type: 'placeSettlement', vertex: neighbor }).ok).toBe(false);
		expect(applyAction(s, 0, { type: 'placeSettlement', vertex: settlementSpots(s, 0, true)[0] }).ok).toBe(false);
	});

	it('snakes the setup and pays the second settlement', () => {
		let s = createGame(players(3), 5);
		const order: number[] = [];
		while (s.phase === 'setup') {
			order.push(s.current);
			s = act(s, s.current, botAction(s, s.current)!);
			s = act(s, s.current, botAction(s, s.current)!);
		}
		expect(order).toEqual([0, 1, 2, 2, 1, 0]);
		expect(s.step).toBe('roll');
		for (const p of s.players) expect(RESOURCES.reduce((n, r) => n + p.resources[r], 0)).toBeGreaterThan(0);
		checkConservation(s);
	});

	it('computes longest road and stops at opponent buildings', () => {
		let s = createGame(players(2), 3);
		const topo = getTopology(s.board);
		// Build a chain of 6 edges for player 0 along the coast.
		const coast = topo.edges.filter((e) => e.coastal);
		const chain: number[] = [coast[0].id];
		let end = coast[0].b;
		const used = new Set(chain);
		while (chain.length < 6) {
			const next = topo.vertices[end].edges.find((e) => !used.has(e) && topo.edges[e].coastal)!;
			chain.push(next);
			used.add(next);
			end = topo.edges[next].a === end ? topo.edges[next].b : topo.edges[next].a;
		}
		s = { ...s, roads: s.roads.map((o, e) => (chain.includes(e) ? 0 : o)) };
		expect(longestRoad(s, 0)).toBe(6);
		// Opponent settlement in the middle splits it.
		const e3 = topo.edges[chain[3]];
		const shared = [e3.a, e3.b].find((v) => topo.edges[chain[2]].a === v || topo.edges[chain[2]].b === v)!;
		const buildings = [...s.buildings];
		buildings[shared] = { owner: 1, kind: 'settlement' };
		s = { ...s, buildings };
		expect(longestRoad(s, 0)).toBe(3);
	});

	it('tells which harbor a bank trade went through', () => {
		const s = createGame(players(3), 4);
		const topo = getTopology(s.board);
		const wool = topo.portEdges.findIndex((p) => p.kind === 'sheep');
		const any = topo.portEdges.findIndex((p) => p.kind === 'any');
		const buildings = [...s.buildings];
		for (const i of [wool, any])
			buildings[topo.edges[topo.portEdges[i].edge].a] = { owner: 0, kind: 'settlement' };
		const t = { ...s, buildings };
		expect(tradeRatios(t, 0).sheep).toBe(2);
		expect(tradeHarbor(t, 0, 'sheep', 2)).toBe(wool);
		expect(tradeHarbor(t, 0, 'ore', 3)).toBe(any);
		// At the bank's own rate it's the bank, and for the Merchant that rate is already 3.
		expect(tradeHarbor(t, 0, 'ore', 4)).toBe(-1);
		expect(tradeHarbor(t, 1, 'ore', 4)).toBe(-1);
		const merchant = {
			...t,
			players: t.players.map((p, i) => (i === 0 ? { ...p, character: 'merchant' as const } : p))
		};
		expect(tradeHarbor(merchant, 0, 'ore', 3)).toBe(-1);
		expect(tradeHarbor(merchant, 0, 'sheep', 2)).toBe(wool);
	});

	it('hides other hands in the view', () => {
		let s = createGame(players(3), 9);
		while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
		const v = viewFor(s, 1);
		expect(v.players[1].resources).toBeDefined();
		expect(v.players[0].resources).toBeUndefined();
		expect((v as any).devDeck).toBeUndefined();
		expect((v as any).rng).toBeUndefined();
	});

	it('keeps victory point cards secret until the game ends', () => {
		let s = createGame(players(3), 9);
		while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
		const players0 = s.players.map((p, i) =>
			i === 0 ? { ...p, devCards: [{ type: 'victoryPoint' as const, boughtTurn: 0 }] } : p
		);
		s = { ...s, players: players0 };
		const theirs = viewFor(s, 1).players[0];
		expect(theirs.devCardCount).toBe(1);
		expect(theirs.devCards).toBeUndefined();
		expect(theirs.totalPoints).toBeUndefined();
		expect(theirs.publicPoints).toBe(totalPoints(s, 0) - 1);
		const mine = viewFor(s, 0).players[0];
		expect(mine.totalPoints).toBe(totalPoints(s, 0));
		expect(viewFor({ ...s, phase: 'ended' }, 1).players[0].devCards).toHaveLength(1);
	});

	it('lets bots see only what players can see', () => {
		// Secret victory point cards in the other hands must not change any bot's move.
		const random = Math.random;
		const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		const vp = { type: 'victoryPoint' as const, boughtTurn: 0 };
		// Three secret points for the next player only, so they would stand out if a bot saw them.
		const secret = (s: GameState, me: number): GameState => ({
			...s,
			players: s.players.map((p, i) =>
				i === (me + 1) % s.players.length ? { ...p, devCards: [...p.devCards, vp, vp, vp] } : p
			)
		});
		const decide = (s: GameState, me: number, perTurn: number, seed: number) => {
			Math.random = seeded(seed);
			const a = botAction(s, me, perTurn);
			Math.random = seeded(seed);
			expect(botAction(secret(s, me), me, perTurn)).toEqual(a);
			return a;
		};
		try {
			for (const seed of [11, 12, 13]) {
				let s = createGame(players(3), seed);
				let perTurn = 0;
				let lastTurn = -1;
				for (let step = 1; step < 3000 && s.phase !== 'ended'; step++) {
					if (s.turn !== lastTurn) {
						lastTurn = s.turn;
						perTurn = 0;
					}
					const others = [0, 1, 2].filter((p) => p !== s.current);
					const responder = others.find((p) => decide(s, p, 0, step) !== null);
					if (responder !== undefined) {
						s = act(s, responder, decide(s, responder, 0, step)!);
						continue;
					}
					s = act(s, s.current, decide(s, s.current, perTurn++, step)!);
				}
			}
		} finally {
			Math.random = random;
		}
	});
});

describe('full bot games', () => {
	for (const n of [2, 3, 4]) {
		it(`finishes ${n}-player games with consistent state`, () => {
			for (let seed = 1; seed <= 25; seed++) {
				let s = createGame(players(n), seed * 977);
				let steps = 0;
				let perTurn = 0;
				let lastTurn = -1;
				while (s.phase !== 'ended' && steps < 20000) {
					steps++;
					if (s.turn !== lastTurn) {
						lastTurn = s.turn;
						perTurn = 0;
					}
					let acted = false;
					// Everyone who needs to respond (discards, trades) goes first.
					for (let p = 0; p < n && !acted; p++) {
						if (p === s.current) continue;
						const a = botAction(s, p);
						if (a) {
							s = act(s, p, a);
							acted = true;
						}
					}
					if (acted) continue;
					const a = botAction(s, s.current, perTurn++);
					expect(a, `stuck at ${s.step}`).not.toBeNull();
					s = act(s, s.current, a!);
					if (steps % 25 === 0) checkConservation(s);
				}
				expect(s.phase, `seed ${seed}`).toBe('ended');
				expect(totalPoints(s, s.winner!)).toBeGreaterThanOrEqual(10);
				checkConservation(s);
			}
		});
	}
});
