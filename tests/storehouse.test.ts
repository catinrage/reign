import { describe, expect, it } from 'vitest';
import { getTopology } from '../src/shared/board/topology';
import { botAction } from '../src/shared/rules/bot';
import { STOREHOUSE_SAFE, allBuildings } from '../src/shared/rules/buildings';
import { applyCheat } from '../src/shared/rules/cheats';
import { BANK_PER_RESOURCE, RESOURCES, totalResources, type ResourceCounts } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import { busiestTile, type EventCard } from '../src/shared/rules/events';
import type { CharacterId } from '../src/shared/rules/characters';
import type { GameSettings } from '../src/shared/rules/modes';
import { builtKey, discardLimit, playersOnHex, safeCards, storehouseOf, storehouseSpots } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';
import { pieceTip } from '../src/client/ui/helpers';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (n: number) => COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));
// Characters off, so games go straight to setup instead of drafting first.
const extended = (more: Partial<GameSettings> = {}): Partial<GameSettings> => ({
	mode: 'extended',
	map: { preset: 'great' },
	characters: false,
	...more
});
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
function midGame(settings: Partial<GameSettings>, seed = 7, n = 3): GameState {
	let s = createGame(players(n), seed, undefined, settings);
	while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
	s = structuredClone(s);
	s.step = 'main';
	if (s.events) s.events.choice = null;
	s.players[s.current].resources = { ...RICH };
	settle(s);
	return s;
}

/** Give the bank whatever the hands don't hold. */
function settle(s: GameState) {
	for (const r of RESOURCES) s.bank[r] = BANK_PER_RESOURCE - s.players.reduce((n, p) => n + p.resources[r], 0);
}

/** A hand of `n` cards, spread over the kinds. */
function hand(n: number): ResourceCounts {
	const h = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
	for (let i = 0; i < n; i++) h[RESOURCES[i % RESOURCES.length]]++;
	return h;
}

/** Player `p` with a storehouse on their first building (set straight on the state). */
function withStore(s: GameState, p: number): GameState {
	const t = structuredClone(s);
	t.storehouses[t.buildings.findIndex((b) => b?.owner === p)] = true;
	return t;
}

/** Roll for the current player with the dice coming up `total`. */
function rollTotal(s: GameState, total: number): GameState {
	const t = structuredClone(s);
	t.step = 'roll';
	const cheat = applyCheat(t, t.current, { type: 'rigDice', total });
	if (!cheat.ok) throw new Error(cheat.error);
	return act(cheat.state, cheat.state.current, { type: 'rollDice' });
}

/** Flip an event card with the dev cheat. */
function flip(s: GameState, card: EventCard): GameState {
	const r = applyCheat(s, 0, { type: 'event', card });
	if (!r.ok) throw new Error(r.error);
	return r.state;
}

const held = (s: GameState, p: number) => totalResources(s.players[p].resources);

describe('storehouses', () => {
	it('are not in Classic, nor when the host turns them off', () => {
		for (const settings of [{ mode: 'classic' as const }, extended({ buildings: { ...allBuildings(), storehouse: false } })]) {
			const s = midGame(settings);
			const p = s.current;
			const v = s.buildings.findIndex((b) => b?.owner === p);
			expect(storehouseSpots(s, p)).toEqual([]);
			expect(error(s, p, { type: 'buildStorehouse', vertex: v })).toBe('Storehouses are not part of this game.');
		}
	});

	it('go onto one of your own settlements or cities for a Lumber, a Wool and a Grain, one each', () => {
		const s = midGame(extended());
		const p = s.current;
		const mine = s.buildings.flatMap((b, v) => (b?.owner === p ? [v] : []));
		const theirs = s.buildings.findIndex((b) => b && b.owner !== p);
		const empty = s.buildings.findIndex((b) => !b);
		expect(storehouseSpots(s, p)).toEqual(mine);
		expect(error(s, p, { type: 'buildStorehouse', vertex: theirs })).toBe('Pick one of your own settlements or cities.');
		expect(error(s, p, { type: 'buildStorehouse', vertex: empty })).toBe('Pick one of your own settlements or cities.');
		expect(error(s, p, { type: 'buildStorehouse', vertex: 9999 })).toBe('Pick a spot on the island.');
		expect(error(s, p, { type: 'buildStorehouse', vertex: 0.5 })).toBe('Pick a spot on the island.');

		const after = act(s, p, { type: 'buildStorehouse', vertex: mine[0] });
		expect(after.storehouses[mine[0]]).toBe(true);
		expect(after.players[p].resources).toEqual({ ...RICH, wood: 8, sheep: 8, wheat: 8 });
		expect(after.bank.wood).toBe(s.bank.wood + 1);
		expect(after.log.at(-1)).toMatchObject({ type: 'built', player: p, kind: 'storehouse', at: mine[0], free: false });
		expect(storehouseOf(after, p)).toBe(mine[0]);
		expect(safeCards(after, p)).toBe(STOREHOUSE_SAFE);
		expect(storehouseSpots(after, p)).toEqual([]);
		expect(error(after, p, { type: 'buildStorehouse', vertex: mine[1] })).toBe('You already have a storehouse.');
		// It stays when the settlement becomes a city.
		const city = act(after, p, { type: 'buildCity', vertex: mine[0] });
		expect(city.storehouses[mine[0]]).toBe(true);
		expect(safeCards(city, p)).toBe(STOREHOUSE_SAFE);
	});

	it("can't be built without the cards or before the roll", () => {
		const s = midGame(extended());
		const p = s.current;
		const v = s.buildings.findIndex((b) => b?.owner === p);
		const poor = structuredClone(s);
		poor.players[p].resources = { wood: 3, brick: 3, sheep: 0, wheat: 3, ore: 3 };
		expect(error(poor, p, { type: 'buildStorehouse', vertex: v })).toBe("You don't have enough resources.");
		const early = structuredClone(s);
		early.step = 'roll';
		expect(error(early, p, { type: 'buildStorehouse', vertex: v })).toBe('Roll the dice first.');
		const other = (p + 1) % s.players.length;
		expect(error(s, other, { type: 'buildStorehouse', vertex: s.buildings.findIndex((b) => b?.owner === other) })).toBe("It's not your turn.");
	});

	it('keep three cards out of the count on a 7: half of the rest goes', () => {
		const base = midGame(extended({ events: { on: false, every: 1, wild: true, pulled: [] } }));
		const p = (base.current + 1) % base.players.length;
		const s = withStore(base, p);
		const limit = s.handLimit;
		expect(discardLimit(s, p)).toBe(limit + STOREHOUSE_SAFE);
		for (const [cards, owed] of [
			[limit + 3, undefined],
			[limit + 4, Math.floor((limit + 1) / 2)],
			[limit + 9, Math.floor((limit + 6) / 2)]
		] as const) {
			const t = structuredClone(s);
			t.players[p].resources = hand(cards);
			settle(t);
			const rolled = rollTotal(t, 7);
			expect(rolled.pendingDiscards[p]).toBe(owed);
			// Without the storehouse, the same hand loses half of everything.
			const plain = structuredClone(t);
			plain.storehouses = plain.storehouses.map(() => false);
			expect(rollTotal(plain, 7).pendingDiscards[p]).toBe(Math.floor(cards / 2));
		}
	});

	it('keep the robber off your last three cards, even for the Rogue', () => {
		const base = midGame(extended({ events: { on: false, every: 1, wild: true, pulled: [] } }));
		const thief = base.current;
		const victim = (thief + 1) % base.players.length;
		// A tile only the victim builds on.
		const topo = getTopology(base.board);
		const hex = base.board.hexes.findIndex(
			(_, h) => h !== base.robberHex && playersOnHex(base, h).length === 1 && playersOnHex(base, h)[0] === victim
		);
		expect(hex).toBeGreaterThanOrEqual(0);
		expect(topo.hexes[hex]).toBeDefined();
		const robbing = (cards: number, rogue = false) => {
			const t = withStore(base, victim);
			t.step = 'moveRobber';
			t.resumeStep = 'main';
			t.players[victim].resources = hand(cards);
			if (rogue) t.players[thief].character = 'rogue';
			settle(t);
			return act(t, thief, { type: 'moveRobber', hex });
		};
		const safe = robbing(3);
		expect(safe.log.at(-1)).toMatchObject({ type: 'nothingToSteal', player: thief });
		expect(held(safe, victim)).toBe(3);
		const four = robbing(4);
		expect(held(four, victim)).toBe(3);
		expect(four.log.filter((e) => e.type === 'stole')).toHaveLength(1);
		// The Rogue's second card would be one of the safe three.
		const rogue = robbing(4, true);
		expect(held(rogue, victim)).toBe(3);
		expect(held(robbing(6, true), victim)).toBe(4);
	});

	it("keep the Witch's purse off your last three cards", () => {
		const base = midGame(extended({ events: { on: false, every: 1, wild: true, pulled: [] } }));
		const thief = base.current;
		const witch = (thief + 1) % base.players.length;
		const hex = base.board.hexes.findIndex(
			(_, h) => h !== base.robberHex && playersOnHex(base, h).length === 1 && playersOnHex(base, h)[0] === witch
		);
		const robWitch = (cards: number) => {
			const t = withStore(base, thief);
			t.step = 'moveRobber';
			t.resumeStep = 'main';
			t.players[witch].character = 'witch';
			t.players[witch].resources = hand(4);
			t.players[thief].resources = hand(cards);
			settle(t);
			return act(t, thief, { type: 'moveRobber', hex });
		};
		expect(held(robWitch(3), thief)).toBe(3);
		expect(held(robWitch(5), thief)).toBe(4);
	});

	it("keep the Baron's toll off your last three cards", () => {
		const base = midGame(extended({ events: { on: false, every: 1, wild: true, pulled: [] } }));
		const me = base.current;
		const baron = (me + 1) % base.players.length;
		const topo = getTopology(base.board);
		// A road built off the far end of one of the Baron's roads touches it.
		const baronRoad = base.roads.findIndex((o) => o === baron);
		const { a, b } = topo.edges[baronRoad];
		const at = [a, b].find((v) => !base.buildings[v])!;
		const next = topo.vertices[at].edges.find((x) => x !== baronRoad && base.roads[x] === null)!;
		const build = (sheep: number) => {
			const t = withStore(base, me);
			t.players[baron].character = 'baron';
			t.buildings[at] = { owner: me, kind: 'settlement' };
			t.players[me].resources = { wood: 1, brick: 1, sheep, wheat: 0, ore: 0 };
			settle(t);
			return act(t, me, { type: 'placeRoad', edge: next });
		};
		expect(held(build(3), me)).toBe(3);
		const paid = build(4);
		expect(held(paid, me)).toBe(3);
		expect(paid.log.at(-1)).toMatchObject({ type: 'traitToll', from: me, to: baron, character: 'baron' });
	});

	it("keep events off your last three cards, and out of the Plague's count", () => {
		let s = midGame(extended());
		s.step = 'roll';
		const p = (s.current + 1) % s.players.length;
		s = withStore(s, p);
		const play = (card: EventCard, cards: number) => {
			const t = structuredClone(s);
			for (const [i, pl] of t.players.entries()) pl.resources = i === p ? hand(cards) : hand(8);
			// Cities, so the Tax Collector takes several cards.
			t.buildings = t.buildings.map((b) => (b && b.owner === p ? { ...b, kind: 'city' } : b));
			t.players.forEach((pl, i) => (pl.knightsPlayed = i === p ? 0 : i === (p + 1) % t.players.length ? 3 : 0));
			settle(t);
			return flip(t, card);
		};
		// Plague of Rats: over 5 cards besides the safe three.
		expect(held(play('plagueOfRats', 8), p)).toBe(8);
		expect(held(play('plagueOfRats', 9), p)).toBe(8);
		// The Tax Collector, the Tournament and the Royal Wedding stop at the safe three.
		expect(held(play('taxCollector', 4), p)).toBe(3);
		expect(held(play('taxCollector', 3), p)).toBe(3);
		expect(held(play('tournament', 3), p)).toBe(3);
		expect(held(play('tournament', 4), p)).toBe(3);
		const wedding = play('royalWedding', 3);
		expect(held(wedding, p)).toBeGreaterThanOrEqual(3);
		// The Bandit Uprising's robber leaves them too, while it robs everyone else round its tile.
		const bandit = structuredClone(s);
		bandit.storehouses = bandit.storehouses.map(() => false);
		const around = playersOnHex(bandit, busiestTile(bandit)!);
		const q = around[0];
		const guarded = withStore(bandit, q);
		for (const pl of guarded.players) pl.resources = hand(3);
		settle(guarded);
		const hit = flip(guarded, 'banditUprising');
		expect(held(hit, q)).toBe(3);
		for (const o of around.slice(1)) expect(held(hit, o)).toBe(2);
	});

	it('leave Monopoly alone: it still takes every card of its kind', () => {
		const base = midGame(extended({ events: { on: false, every: 1, wild: true, pulled: [] } }));
		const p = base.current;
		const victim = (p + 1) % base.players.length;
		const s = withStore(base, victim);
		s.players[victim].resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
		s.players[p].devCards = [{ type: 'monopoly', boughtTurn: -1 }];
		settle(s);
		const after = act(s, p, { type: 'playMonopoly', resource: 'wood' });
		expect(after.players[victim].resources.wood).toBe(0);
	});

	it('show up in every player view, dated in the building tooltip', () => {
		const s = midGame(extended());
		const p = s.current;
		const v = s.buildings.findIndex((b) => b?.owner === p);
		const after = act(s, p, { type: 'buildStorehouse', vertex: v });
		for (let i = -1; i < after.players.length; i++) {
			expect(viewFor(after, i).storehouses[v]).toBe(true);
			expect(discardLimit(viewFor(after, i), p)).toBe(after.handLimit + STOREHOUSE_SAFE);
		}
		expect(after.builtTurns[builtKey('storehouse', v)]).toBe(s.turn);
		const tip = pieceTip(viewFor(after, p), { place: 'vertex', at: v })!;
		expect(tip.head).toBe('Settlement');
		expect(tip.text).toBe(`Owner: You\nBuilt during setup\nStorehouse added on turn ${s.turn}`);
	});
});

describe('storehouses and character powers', () => {
	/** A game past setup with these characters, player 0 to move after the roll, every hand empty. */
	function ready(chars: (CharacterId | null)[]): GameState {
		const seats = chars.map((character, i) => ({ name: `P${i}`, color: COLORS[i], isBot: true, character }));
		let g = createGame(seats, 21, undefined, { mode: 'extended', map: { preset: 'great' } });
		while (g.phase === 'setup') g = act(g, g.current, botAction(g, g.current)!);
		const s = structuredClone(g);
		s.current = 0;
		s.step = 'main';
		s.dice = [3, 3];
		for (const p of s.players) p.resources = hand(0);
		settle(s);
		return s;
	}

	it("keep the Rogue's Pickpocket off your last three cards", () => {
		const g = withStore(ready(['rogue', null, null]), 1);
		g.players[1].resources = hand(STOREHOUSE_SAFE);
		expect(error(g, 0, { type: 'usePower', target: 1 })).toMatch(/storehouse/);
		g.players[1].resources = hand(STOREHOUSE_SAFE + 1);
		settle(g);
		const s = act(g, 0, { type: 'usePower', target: 1 });
		// Only the one card past the safe ones goes.
		expect(totalResources(s.players[1].resources)).toBe(STOREHOUSE_SAFE);
		expect(totalResources(s.players[0].resources)).toBe(1);
	});

	it("keep the Shepherd's Drive Off from taking your last three cards", () => {
		const g = withStore(ready(['shepherd', null]), 1);
		g.robberHex = g.board.hexes.findIndex((_, h) => h !== g.robberHome);
		g.robberMover = 1;
		g.players[1].resources = hand(STOREHOUSE_SAFE);
		settle(g);
		const s = act(g, 0, { type: 'usePower' });
		expect(s.robberHex).toBe(g.robberHome);
		expect(s.players[1].resources).toEqual(hand(STOREHOUSE_SAFE));
		expect(totalResources(s.players[0].resources)).toBe(0);
	});

	it("keep three of your cards out of the Jester's Mischief", () => {
		const g = withStore(ready(['jester', null, null]), 1);
		const mine = { wood: 2, brick: 0, sheep: 0, wheat: 1, ore: 0 };
		g.players[1].resources = { ...mine };
		g.players[2].resources = hand(9);
		settle(g);
		const s = act(g, 0, { type: 'usePower' });
		// The storehouse's three stay; the other nine are dealt three each.
		for (const r of RESOURCES) expect(s.players[1].resources[r]).toBeGreaterThanOrEqual(mine[r]);
		expect(s.players.map((p) => totalResources(p.resources))).toEqual([3, 6, 3]);

		// With more than three, three of the owner's own cards stay and the rest go in the pool.
		const big = withStore(ready(['jester', null, null]), 1);
		big.players[1].resources = hand(8);
		big.players[2].resources = hand(4);
		settle(big);
		const t = act(big, 0, { type: 'usePower' });
		const counts = t.players.map((p) => totalResources(p.resources));
		expect(counts.reduce((a, b) => a + b, 0)).toBe(12);
		// Nine cards pooled: three each, and the storehouse's three on top.
		expect(counts).toEqual([3, 6, 3]);
	});
});

describe('bots and storehouses', () => {
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

	it('build them with big hands and still finish their games', () => {
		let built = 0;
		for (const seed of [1, 2, 3, 4]) {
			const s = playOut(createGame(players(4), seed, undefined, extended()));
			expect(s.phase).toBe('ended');
			s.storehouses.forEach((on, v) => {
				if (!on) return;
				built++;
				expect(s.buildings[v]).not.toBe(null);
			});
			for (let p = 0; p < s.players.length; p++) expect(s.storehouses.filter((on, v) => on && s.buildings[v]?.owner === p).length).toBeLessThanOrEqual(1);
		}
		expect(built).toBeGreaterThan(0);
	});

	it('leave them alone when the host turned them off', () => {
		const s = playOut(createGame(players(4), 3, undefined, extended({ buildings: { ...allBuildings(), storehouse: false } })));
		expect(s.phase).toBe('ended');
		expect(s.storehouses.every((on) => !on)).toBe(true);
	});
});
