import { describe, expect, it } from 'vitest';
import { getTopology } from '../src/shared/board/topology';
import { botAction } from '../src/shared/rules/bot';
import { RESOURCES, totalResources } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import type { GameSettings } from '../src/shared/rules/modes';
import { expectedRoll, newStats, rollOdds } from '../src/shared/rules/stats';
import { gatherLeaders, honors } from '../src/client/ui/game/postGame';
import type { Action, GameEvent, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'] as const;
const players = (n: number) =>
	COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));

/** Every event a game produced, beyond the log's last 80. */
type Played = { s: GameState; events: GameEvent[][] };

function act(g: Played, p: number, a: Action) {
	const r = applyAction(g.s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	g.s = r.state;
	g.events.push(r.events);
}

function pastSetup(seed: number): GameState {
	let s = createGame(players(3), seed);
	while (s.phase === 'setup')
		s = (applyAction(s, s.current, botAction(s, s.current)!) as { state: GameState }).state;
	return s;
}

function playOut(s: GameState, check?: (s: GameState) => void, limit = 30000): Played {
	const g: Played = { s, events: [] };
	const n = s.players.length;
	let perTurn = 0;
	let lastTurn = -1;
	for (let steps = 0; g.s.phase !== 'ended' && steps < limit; steps++) {
		check?.(g.s);
		if (g.s.turn !== lastTurn) {
			lastTurn = g.s.turn;
			perTurn = 0;
		}
		let other = -1;
		let a: Action | null = null;
		for (let p = 0; p < n && !a; p++) if (p !== g.s.current && (a = botAction(g.s, p))) other = p;
		if (a) act(g, other, a);
		else act(g, g.s.current, botAction(g.s, g.s.current, perTurn++)!);
	}
	expect(g.s.phase).toBe('ended');
	return g;
}

describe('end-of-game stats', () => {
	it('count every roll and every card the dice paid', () => {
		const g = playOut(createGame(players(4), 11));
		const st = g.s.stats;
		const rolls = Array(13).fill(0);
		const rolled = [0, 0, 0, 0];
		const longShots = [0, 0, 0, 0];
		const built = [0, 0, 0, 0];
		for (const evs of g.events) {
			let total = 0;
			for (const e of evs) {
				if (e.type === 'diceRolled') rolls[(total = e.dice[0] + e.dice[1])]++;
				if (e.type === 'built') built[e.player]++;
				if (e.type === 'produced' && total) {
					for (const x of e.gains) {
						rolled[x.player] += x.amount;
						if (total <= 3 || total >= 11) longShots[x.player] += x.amount;
					}
				}
			}
		}
		expect(st.rolls).toEqual(rolls);
		expect(st.players.map((p) => p.rolled)).toEqual(rolled);
		expect(st.players.map((p) => p.longShots)).toEqual(longShots);
		expect(st.players.map((p) => p.built)).toEqual(built);
		for (const p of st.players) {
			// Dice cards are some of the cards a player came by, never more.
			expect(totalResources(p.gained)).toBeGreaterThanOrEqual(p.rolled);
			expect(p.expected).toBeGreaterThan(0);
		}
		expect(st.bestHaul!.cards).toBeGreaterThan(0);
	});

	it('predict what the dice pay: over many games the cards collected stay close to the odds', () => {
		let rolled = 0;
		let expected = 0;
		for (const seed of [1, 2, 3, 4, 5, 6]) {
			const { s } = playOut(createGame(players(4), seed));
			for (const p of s.stats.players) {
				rolled += p.rolled;
				expected += p.expected;
			}
		}
		expect(Math.abs(rolled - expected) / expected).toBeLessThan(0.15);
	});

	it("weigh each of a player's tiles by its odds, leaving out the robber's", () => {
		const s = pastSetup(5);
		const topo = getTopology(s.board);
		// Setup leaves two settlements each: count them tile by tile.
		let sum = 0;
		s.board.hexes.forEach((hex, h) => {
			if (h === s.robberHex || hex.number === null) return;
			sum +=
				rollOdds(hex.number) *
				topo.hexes[h].vertices.filter((v) => s.buildings[v]?.owner === 0).length;
		});
		expect(sum).toBeGreaterThan(0);
		expect(expectedRoll(s, 0)).toBeCloseTo(sum, 10);
		// With the robber on their best tile it pays nothing.
		const best = s.board.hexes.findIndex(
			(hex, h) =>
				hex.number !== null && topo.hexes[h].vertices.some((v) => s.buildings[v]?.owner === 0)
		);
		const robbed = { ...s, robberHex: best };
		expect(expectedRoll(robbed, 0)).toBeLessThan(sum);
	});

	it("don't count trades as cards gathered", () => {
		const s = structuredClone(pastSetup(9));
		s.step = 'main';
		const me = s.current;
		s.players[me].resources = { wood: 4, brick: 0, sheep: 0, wheat: 0, ore: 0 };
		const before = structuredClone(s.stats.players[me].gained);
		const r = applyAction(s, me, { type: 'bankTrade', give: 'wood', get: 'ore' });
		expect(r.ok).toBe(true);
		const after = (r as { state: GameState }).state.stats.players[me];
		expect(after.gained).toEqual(before);
		expect(after.trades).toBe(1);
	});

	it('stay hidden until the game is over, then everyone sees them, spectators too', () => {
		const g = playOut(createGame(players(3), 4), (s) => {
			if (s.turn % 7 === 0)
				for (const me of [-1, 0, 1, 2]) expect(viewFor(s, me).stats).toBeUndefined();
		});
		const seen = [-1, 0, 1, 2].map((me) => viewFor(g.s, me).stats);
		for (const st of seen) expect(st).toEqual(g.s.stats);
	});

	it('play along in Reign Extended with characters, powers, buildings and events', () => {
		const settings: Partial<GameSettings> = {
			mode: 'extended',
			map: { preset: 'great' },
			powers: true
		};
		const g = playOut(createGame(players(5), 21, undefined, settings));
		const st = g.s.stats;
		expect(st.players).toHaveLength(5);
		for (const p of st.players) {
			expect(Number.isFinite(p.expected)).toBe(true);
			for (const r of RESOURCES) expect(p.gained[r]).toBeGreaterThanOrEqual(0);
		}
		expect(st.rolls.reduce((a, b) => a + b, 0)).toBeGreaterThan(10);
	});
});

describe('end-of-game honors', () => {
	const game = () => {
		const st = newStats(3);
		st.rolls[8] = 10;
		st.players[0].rolled = 14;
		st.players[0].expected = 9.6;
		st.players[0].longShots = 3;
		st.players[1].rolled = 5;
		st.players[1].expected = 9.2;
		st.players[1].robbed = 4;
		st.players[2].rolled = 9;
		st.players[2].expected = 9;
		return st;
	};

	it('name the luckiest and unluckiest player by cards beyond the odds', () => {
		const h = honors(game());
		expect(h[0]).toEqual({
			kind: 'lucky',
			players: [0],
			got: 14,
			expected: 10,
			longShots: 3,
			robbed: 0
		});
		expect(h[1]).toEqual({
			kind: 'unlucky',
			players: [1],
			got: 5,
			expected: 9,
			longShots: 0,
			robbed: 4
		});
	});

	it('share a record between players tied for it, and skip one everyone shares or nobody set', () => {
		const st = game();
		st.players[0].trades = 4;
		st.players[2].trades = 4;
		for (const p of st.players) p.built = 5;
		const h = honors(st, 10);
		expect(h.find((x) => x.kind === 'trader')).toEqual({ kind: 'trader', players: [0, 2], n: 4 });
		expect(h.find((x) => x.kind === 'builder')).toBeUndefined();
		expect(h.find((x) => x.kind === 'thief')).toBeUndefined();
	});

	it('crown the top gatherer of each resource', () => {
		const st = game();
		st.players[1].gained.ore = 7;
		st.players[2].gained.ore = 3;
		st.players[0].gained.wood = 2;
		st.players[2].gained.wood = 2;
		const lead = gatherLeaders(st);
		expect(lead.ore).toEqual([1]);
		expect(lead.wood).toEqual([0, 2]);
		expect(lead.sheep).toEqual([]);
	});
});
