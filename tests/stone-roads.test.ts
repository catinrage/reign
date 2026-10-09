import { describe, expect, it } from 'vitest';
import { botAction } from '../src/shared/rules/bot';
import { allBuildings } from '../src/shared/rules/buildings';
import { BANK_PER_RESOURCE, RESOURCES } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import type { GameSettings } from '../src/shared/rules/modes';
import { builtKey, longestRoad, paveSpots, roadSpots } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';
import { pieceTip } from '../src/client/ui/helpers';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (n: number) => COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));
// Characters off, so games go straight to setup instead of drafting first.
const extended = (more: Partial<GameSettings> = {}): Partial<GameSettings> => ({ mode: 'extended', map: { preset: 'great' }, characters: false, ...more });
const RICH = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

function error(s: GameState, p: number, a: Action): string | undefined {
	const r = applyAction(s, p, a);
	return r.ok ? undefined : r.error;
}

/** A game past its setup, in the current player's main step, with cards to spend. */
function midGame(settings: Partial<GameSettings>, seed = 7): GameState {
	let s = createGame(players(3), seed, undefined, settings);
	while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
	s = structuredClone(s);
	s.step = 'main';
	s.players[s.current].resources = { ...RICH };
	for (const r of RESOURCES) s.bank[r] = BANK_PER_RESOURCE - s.players.reduce((n, p) => n + p.resources[r], 0);
	return s;
}

/** Build the road that makes this player's longest trail longest. */
function extend(s: GameState, p: number): GameState {
	let best: { s: GameState; len: number } | null = null;
	for (const e of roadSpots(s, p)) {
		const next = act(s, p, { type: 'placeRoad', edge: e });
		const len = longestRoad(next, p);
		if (!best || len > best.len) best = { s: next, len };
	}
	return best!.s;
}

function playOut(s: GameState, limit = 30000) {
	const n = s.players.length;
	let perTurn = 0;
	let lastTurn = -1;
	for (let steps = 0; s.phase !== 'ended' && steps < limit; steps++) {
		if (s.turn !== lastTurn) {
			lastTurn = s.turn;
			perTurn = 0;
		}
		let acted = false;
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
	}
	return s;
}

describe('stone roads', () => {
	it('are not in Classic, nor when the host turns them off', () => {
		for (const settings of [{ mode: 'classic' as const }, extended({ buildings: { ...allBuildings(), stoneRoad: false } })]) {
			const s = midGame(settings);
			const p = s.current;
			const e = s.roads.findIndex((o) => o === p);
			expect(paveSpots(s, p)).toEqual([]);
			expect(error(s, p, { type: 'paveRoad', edge: e })).toBe('Stone roads are not part of this game.');
		}
	});

	it('pave one of your own roads for a Brick and an Ore, without using a road piece', () => {
		const s = midGame(extended());
		const p = s.current;
		const mine = s.roads.flatMap((o, e) => (o === p ? [e] : []));
		const theirs = s.roads.findIndex((o) => o !== null && o !== p);
		const empty = s.roads.findIndex((o) => o === null);
		expect(paveSpots(s, p).sort()).toEqual(mine.sort());

		expect(error(s, p, { type: 'paveRoad', edge: theirs })).toBe('Pave one of your own roads.');
		expect(error(s, p, { type: 'paveRoad', edge: empty })).toBe('Pave one of your own roads.');
		expect(error(s, p, { type: 'paveRoad', edge: 9999 })).toBe('Pick a road on the island.');

		const after = act(s, p, { type: 'paveRoad', edge: mine[0] });
		expect(after.stoneRoads[mine[0]]).toBe(true);
		expect(after.players[p].resources).toEqual({ ...RICH, brick: RICH.brick - 1, ore: RICH.ore - 1 });
		expect(after.bank.brick).toBe(s.bank.brick + 1);
		expect(after.bank.ore).toBe(s.bank.ore + 1);
		expect(after.players[p].piecesLeft.road).toBe(s.players[p].piecesLeft.road);
		expect(after.log.at(-1)).toMatchObject({ type: 'built', player: p, kind: 'stoneRoad', at: mine[0] });
		expect(paveSpots(after, p)).not.toContain(mine[0]);
		expect(error(after, p, { type: 'paveRoad', edge: mine[0] })).toBe('That road is already paved.');
	});

	it("can't be paved without the cards or before the roll", () => {
		const s = midGame(extended());
		const p = s.current;
		const e = s.roads.findIndex((o) => o === p);
		const poor = structuredClone(s);
		poor.players[p].resources = { wood: 2, brick: 1, sheep: 2, wheat: 2, ore: 0 };
		expect(error(poor, p, { type: 'paveRoad', edge: e })).toBe("You don't have enough resources.");
		const early = structuredClone(s);
		early.step = 'roll';
		expect(error(early, p, { type: 'paveRoad', edge: e })).toBe('Roll the dice first.');
	});

	it('count twice towards the Longest Road, and can win it', () => {
		let s = midGame(extended());
		const p = s.current;
		while (longestRoad(s, p) < 3) s = extend(s, p);
		expect(s.longestRoadHolder).toBe(null);
		const trail = longestRoad(s, p);
		// Paving a road on the trail makes it one longer; paving one off it doesn't.
		const lengths = paveSpots(s, p).map((e) => longestRoad(act(s, p, { type: 'paveRoad', edge: e }), p));
		expect(Math.max(...lengths)).toBe(trail + 1);
		while (longestRoad(s, p) < 5) {
			const e = paveSpots(s, p).find((e) => longestRoad(act(s, p, { type: 'paveRoad', edge: e }), p) > longestRoad(s, p));
			s = act(s, p, { type: 'paveRoad', edge: e! });
		}
		expect(s.players[p].longestRoad).toBe(5);
		expect(s.longestRoadHolder).toBe(p);
		expect(s.log.some((e) => e.type === 'longestRoad' && e.player === p && e.length === 5)).toBe(true);
	});

	it('show up in every player view, dated in their tooltip', () => {
		const s = midGame(extended());
		const p = s.current;
		const e = s.roads.findIndex((o) => o === p);
		const after = act(s, p, { type: 'paveRoad', edge: e });
		for (let i = -1; i < after.players.length; i++) expect(viewFor(after, i).stoneRoads[e]).toBe(true);
		expect(after.builtTurns[builtKey('stoneRoad', e)]).toBe(s.turn);
		const tip = pieceTip(viewFor(after, p), { place: 'edge', at: e })!;
		expect(tip.head).toBe('Stone road');
		expect(tip.text).toBe(`Owner: You\nBuilt during setup\nPaved on turn ${s.turn}`);
		expect(pieceTip(viewFor(s, p), { place: 'edge', at: e })!.head).toBe('Road');
	});
});

describe('bots and stone roads', () => {
	it('pave roads in the race for the Longest Road and still finish their games', () => {
		let paved = 0;
		for (const seed of [1, 2, 3, 4, 5, 6]) {
			const s = playOut(createGame(players(4), seed, undefined, extended()));
			expect(s.phase).toBe('ended');
			s.stoneRoads.forEach((stone, e) => {
				if (!stone) return;
				paved++;
				expect(s.roads[e]).not.toBe(null);
			});
		}
		expect(paved).toBeGreaterThan(0);
	});

	it('leave them alone when the host turned them off', () => {
		const s = playOut(createGame(players(4), 3, undefined, extended({ buildings: { ...allBuildings(), stoneRoad: false } })));
		expect(s.phase).toBe('ended');
		expect(s.stoneRoads.every((stone) => !stone)).toBe(true);
	});
});
