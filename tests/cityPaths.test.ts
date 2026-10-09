import { describe, expect, it } from 'vitest';
import { getTopology } from '../src/shared/board/topology';
import { botAction } from '../src/shared/rules/bot';
import { BUILDING_INFO, CASTLE_POINTS, CITY_PATHS, allBuildings, type CityPath } from '../src/shared/rules/buildings';
import { applyCheat } from '../src/shared/rules/cheats';
import { BANK_PER_RESOURCE, RESOURCES, type Resource } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import type { EventCard, EventRules } from '../src/shared/rules/events';
import type { GameSettings } from '../src/shared/rules/modes';
import {
	armySize,
	builtKey,
	fortressOf,
	guildGoodsFor,
	guildGoodsOf,
	pathSpots,
	publicPoints,
	tradeRatios
} from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';
import { eventParts, pieceTip } from '../src/client/ui/helpers';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (n: number) => COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));
const NO_EVENTS: EventRules = { on: false, every: 1, wild: true, pulled: [] };
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

/** Give the bank whatever the hands don't hold. */
function settle(s: GameState) {
	for (const r of RESOURCES) s.bank[r] = BANK_PER_RESOURCE - s.players.reduce((n, p) => n + p.resources[r], 0);
}

/**
 * A game past its setup, in the current player's main step, with their first settlement grown
 * into a city and cards to spend.
 */
function withCity(settings: Partial<GameSettings>, seed = 7, n = 3): GameState {
	let s = createGame(players(n), seed, undefined, settings);
	while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
	s = structuredClone(s);
	s.step = 'main';
	if (s.events) s.events.choice = null;
	s.players[s.current].resources = { ...RICH };
	settle(s);
	s = act(s, s.current, { type: 'buildCity', vertex: s.buildings.findIndex((b) => b?.owner === s.current) });
	s.players[s.current].resources = { ...RICH };
	settle(s);
	return s;
}

const citiesOf = (s: GameState, p: number) => s.buildings.flatMap((b, v) => (b?.owner === p && b.kind === 'city' ? [v] : []));
const path = (vertex: number, kind: CityPath, resource?: Resource): Action => ({ type: 'buildCityPath', vertex, path: kind, resource });

/** Grow the player's next settlement into a city too. */
function secondCity(s: GameState, p: number): GameState {
	const v = s.buildings.findIndex((b) => b?.owner === p && b.kind === 'settlement');
	const t = act(s, p, { type: 'buildCity', vertex: v });
	t.players[p].resources = { ...RICH };
	settle(t);
	return t;
}

/** Flip an event card with the dev cheat. */
function flip(s: GameState, card: EventCard): GameState {
	const r = applyCheat(s, 0, { type: 'event', card });
	if (!r.ok) throw new Error(r.error);
	return r.state;
}

describe('city paths', () => {
	it('are not in Classic, nor when the host turns one off', () => {
		for (const kind of CITY_PATHS) {
			for (const settings of [{ mode: 'classic' as const }, extended({ buildings: { ...allBuildings(), [kind]: false } })]) {
				const s = withCity(settings);
				const p = s.current;
				const [v] = citiesOf(s, p);
				expect(pathSpots(s, p, kind)).toEqual([]);
				expect(error(s, p, path(v, kind, 'wood'))).toBe(`${BUILDING_INFO[kind].name} are not part of this game.`);
			}
		}
		// The others stay in.
		const s = withCity(extended({ buildings: { ...allBuildings(), castle: false } }));
		const [v] = citiesOf(s, s.current);
		expect(pathSpots(s, s.current, 'fortress')).toEqual([v]);
	});

	it('are for your own cities only, one path each and for good', () => {
		const s = withCity(extended());
		const p = s.current;
		const [v] = citiesOf(s, p);
		const settlement = s.buildings.findIndex((b) => b?.owner === p && b.kind === 'settlement');
		const theirs = s.buildings.findIndex((b) => b && b.owner !== p);
		for (const kind of CITY_PATHS) expect(pathSpots(s, p, kind)).toEqual([v]);
		expect(error(s, p, path(settlement, 'castle'))).toBe('Pick one of your own cities.');
		expect(error(s, p, path(theirs, 'castle'))).toBe('Pick one of your own cities.');
		expect(error(s, p, path(s.buildings.findIndex((b) => !b), 'castle'))).toBe('Pick one of your own cities.');
		expect(error(s, p, path(9999, 'castle'))).toBe('Pick a spot on the island.');
		expect(error(s, p, path(0.5, 'castle'))).toBe('Pick a spot on the island.');
		expect(error(s, p, path(v, 'palace' as CityPath))).toBe('Pick a castle, a guild hall or a fortress.');

		const after = act(s, p, path(v, 'fortress'));
		for (const kind of CITY_PATHS) {
			expect(pathSpots(after, p, kind)).toEqual([]);
			expect(error(after, p, path(v, kind, 'wood'))).toBe('That city has already taken its path.');
		}
		// The city is still a city: it still produces like one.
		expect(after.buildings[v]).toEqual({ owner: p, kind: 'city' });
	});

	it("can't be taken without the cards, before the roll or on someone else's turn", () => {
		const s = withCity(extended());
		const p = s.current;
		const [v] = citiesOf(s, p);
		const poor = structuredClone(s);
		poor.players[p].resources = { wood: 9, brick: 9, sheep: 9, wheat: 0, ore: 9 };
		settle(poor);
		for (const kind of CITY_PATHS) expect(error(poor, p, path(v, kind, 'wood'))).toBe("You don't have enough resources.");
		const early = structuredClone(s);
		early.step = 'roll';
		expect(error(early, p, path(v, 'castle'))).toBe('Roll the dice first.');
		const other = (p + 1) % s.players.length;
		expect(error(s, other, path(v, 'castle'))).toBe("It's not your turn.");
	});
});

describe('castles', () => {
	it('cost a Brick, two Grain and two Ore, and are worth 3 points', () => {
		const s = withCity(extended());
		const p = s.current;
		const [v] = citiesOf(s, p);
		const after = act(s, p, path(v, 'castle'));
		expect(after.cityPaths[v]).toBe('castle');
		expect(after.players[p].resources).toEqual({ ...RICH, brick: 8, wheat: 7, ore: 7 });
		expect(after.bank.ore).toBe(s.bank.ore + 2);
		expect(publicPoints(after, p)).toBe(publicPoints(s, p) - 2 + CASTLE_POINTS);
		expect(after.log.at(-1)).toMatchObject({ type: 'built', player: p, kind: 'castle', at: v, free: false, paid: { brick: 1, wheat: 2, ore: 2 } });
		expect(after.builtTurns[builtKey('castle', v)]).toBe(s.turn);
		// Any number of them, one a city.
		const two = secondCity(after, p);
		const w = citiesOf(two, p).find((c) => c !== v)!;
		const both = act(two, p, path(w, 'castle'));
		expect(publicPoints(both, p)).toBe(publicPoints(two, p) + 1);
	});

	it('still pay like a city when their tile comes up', () => {
		const s = withCity(extended({ events: NO_EVENTS }));
		const p = s.current;
		const [v] = citiesOf(s, p);
		const topo = getTopology(s.board);
		const h = topo.vertices[v].hexes.find((x) => s.board.hexes[x].number !== null && x !== s.robberHex)!;
		const roll = (g: GameState) => {
			const t = structuredClone(g);
			t.step = 'roll';
			for (const pl of t.players) pl.resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
			settle(t);
			const r = applyCheat(t, t.current, { type: 'rigDice', total: s.board.hexes[h].number! });
			if (!r.ok) throw new Error(r.error);
			return act(r.state, r.state.current, { type: 'rollDice' }).players[p].resources;
		};
		expect(roll(act(s, p, path(v, 'castle')))).toEqual(roll(s));
	});

	it('win the game when they bring the last point', () => {
		const s = withCity(extended());
		const p = s.current;
		const [v] = citiesOf(s, p);
		s.pointsToWin = publicPoints(s, p) + 1;
		const after = act(s, p, path(v, 'castle'));
		expect(after.phase).toBe('ended');
		expect(after.winner).toBe(p);
	});
});

describe('guild halls', () => {
	it('trade the goods you name with the bank at 2:1', () => {
		const s = withCity(extended({ events: NO_EVENTS }));
		const p = s.current;
		const [v] = citiesOf(s, p);
		const goods = guildGoodsFor(s, p).find((r) => tradeRatios(s, p)[r] > 2)!;
		expect(error(s, p, path(v, 'guildHall'))).toBe('Name the goods your guild hall trades.');
		expect(error(s, p, path(v, 'guildHall', 'gold' as Resource))).toBe('Name the goods your guild hall trades.');
		const after = act(s, p, path(v, 'guildHall', goods));
		expect(after.guildGoods[v]).toBe(goods);
		expect(guildGoodsOf(after, p)).toEqual([goods]);
		expect(tradeRatios(after, p)[goods]).toBe(2);
		expect(after.players[p].resources).toEqual({ ...RICH, wood: 8, sheep: 7, wheat: 8 });
		expect(after.log.at(-1)).toMatchObject({ type: 'built', player: p, kind: 'guildHall', at: v, resource: goods });
		const get = RESOURCES.find((r) => r !== goods)!;
		const traded = act(after, p, { type: 'bankTrade', give: goods, get });
		expect(traded.players[p].resources[goods]).toBe(after.players[p].resources[goods] - 2);
		expect(traded.players[p].resources[get]).toBe(after.players[p].resources[get] + 1);
		// Nobody else trades at 2:1 through it.
		for (let o = 0; o < s.players.length; o++) if (o !== p) expect(tradeRatios(after, o)).toEqual(tradeRatios(s, o));
	});

	it("can't take goods you already trade at 2:1, at a harbor or another guild hall", () => {
		const base = withCity(extended({ events: NO_EVENTS }));
		const p = base.current;
		const topo = getTopology(base.board);
		// A 2:1 harbor of the player's own (set straight on the state).
		const harbor = topo.vertices.findIndex((x, i) => x.port && x.port !== 'any' && !base.buildings[i]);
		const port = topo.vertices[harbor].port as Resource;
		const s = secondCity(base, p);
		s.buildings[harbor] = { owner: p, kind: 'settlement' };
		const [v, w] = citiesOf(s, p);
		expect(guildGoodsFor(s, p)).not.toContain(port);
		expect(error(s, p, path(v, 'guildHall', port))).toBe('You already trade those at 2:1.');
		const goods = guildGoodsFor(s, p)[0];
		const after = act(s, p, path(v, 'guildHall', goods));
		expect(error(after, p, path(w, 'guildHall', goods))).toBe('You already trade those at 2:1.');
		const more = guildGoodsFor(after, p);
		expect(more).toEqual(RESOURCES.filter((r) => r !== port && r !== goods));
		const two = act(after, p, path(w, 'guildHall', more[0]));
		expect(guildGoodsOf(two, p).sort()).toEqual([goods, more[0]].sort());
	});

	it("stay open in a Storm at Sea, when the harbors shut", () => {
		const base = withCity(extended());
		const p = base.current;
		const topo = getTopology(base.board);
		const harbor = topo.vertices.findIndex((x, i) => x.port && x.port !== 'any' && !base.buildings[i]);
		const port = topo.vertices[harbor].port as Resource;
		base.buildings[harbor] = { owner: p, kind: 'settlement' };
		const [v] = citiesOf(base, p);
		const goods = guildGoodsFor(base, p)[0];
		const s = act(base, p, path(v, 'guildHall', goods));
		expect(tradeRatios(s, p)[port]).toBe(2);
		const storm = flip(s, 'stormAtSea');
		expect(tradeRatios(storm, p)[port]).toBe(4);
		expect(tradeRatios(storm, p)[goods]).toBe(2);
	});

	it('say their goods in the chronicle and the tooltip, in every view', () => {
		const s = withCity(extended({ events: NO_EVENTS }));
		const p = s.current;
		const [v] = citiesOf(s, p);
		const goods = guildGoodsFor(s, p)[0];
		const after = act(s, p, path(v, 'guildHall', goods));
		for (let i = -1; i < after.players.length; i++) {
			expect(viewFor(after, i).cityPaths[v]).toBe('guildHall');
			expect(viewFor(after, i).guildGoods[v]).toBe(goods);
		}
		const view = viewFor(after, p);
		expect(eventParts(after.log.at(-1)!, view)).toEqual([
			{ text: 'You', player: p },
			{ text: ' built a guild hall for ' },
			{ text: '', res: goods, count: 1 },
			{ text: ' at 2:1' }
		]);
		const tip = pieceTip(view, { place: 'vertex', at: v })!;
		expect(tip.head).toBe('Guild hall');
		const label = { wood: 'Lumber', brick: 'Brick', sheep: 'Wool', wheat: 'Grain', ore: 'Ore' }[goods];
		expect(tip.text).toBe(
			`Owner: You\nSettled during setup\nBecame a city on turn ${s.turn}\nBecame a guild hall on turn ${s.turn}\nTrades ${label} with the bank at 2:1`
		);
	});
});

describe('fortresses', () => {
	it('count your knights double, and can take the Largest Army there and then', () => {
		const s = withCity(extended({ events: NO_EVENTS }));
		const p = s.current;
		const rival = (p + 1) % s.players.length;
		const [v] = citiesOf(s, p);
		s.players[p].knightsPlayed = 2;
		s.players[rival].knightsPlayed = 3;
		s.largestArmyHolder = rival;
		expect(armySize(s, p)).toBe(2);
		const after = act(s, p, path(v, 'fortress'));
		expect(after.players[p].resources).toEqual({ ...RICH, brick: 7, wheat: 8, ore: 7 });
		expect(fortressOf(after, p)).toBe(v);
		expect(armySize(after, p)).toBe(4);
		expect(after.largestArmyHolder).toBe(p);
		expect(after.log).toContainEqual(expect.objectContaining({ type: 'largestArmy', player: p, knights: 4 }));
		expect(publicPoints(after, p)).toBe(publicPoints(s, p) + 2);
		expect(publicPoints(after, rival)).toBe(publicPoints(s, rival) - 2);
	});

	it('only take the Largest Army with more, not a tie', () => {
		const s = withCity(extended({ events: NO_EVENTS }));
		const p = s.current;
		const rival = (p + 1) % s.players.length;
		const [v] = citiesOf(s, p);
		s.players[p].knightsPlayed = 2;
		s.players[rival].knightsPlayed = 4;
		s.largestArmyHolder = rival;
		const after = act(s, p, path(v, 'fortress'));
		expect(after.largestArmyHolder).toBe(rival);
		// The next knight does it: three count six.
		after.players[p].devCards = [{ type: 'knight', boughtTurn: -1 }];
		const knight = act(after, p, { type: 'playKnight' });
		expect(armySize(knight, p)).toBe(6);
		expect(knight.largestArmyHolder).toBe(p);
	});

	it('reach the Largest Army with two knights, where it takes three without', () => {
		const s = withCity(extended({ events: NO_EVENTS }));
		const p = s.current;
		const [v] = citiesOf(s, p);
		s.players[p].knightsPlayed = 1;
		const fort = act(s, p, path(v, 'fortress'));
		expect(fort.largestArmyHolder).toBe(null);
		fort.players[p].devCards = [{ type: 'knight', boughtTurn: -1 }];
		const knight = act(fort, p, { type: 'playKnight' });
		expect(knight.largestArmyHolder).toBe(p);
		expect(knight.log).toContainEqual(expect.objectContaining({ type: 'largestArmy', player: p, knights: 4 }));
	});

	it('are one each', () => {
		const base = withCity(extended());
		const p = base.current;
		const s = secondCity(base, p);
		const [v, w] = citiesOf(s, p);
		const after = act(s, p, path(v, 'fortress'));
		expect(pathSpots(after, p, 'fortress')).toEqual([]);
		expect(error(after, p, path(w, 'fortress'))).toBe('You already have a fortress.');
		// The other paths are still open to the second city.
		expect(pathSpots(after, p, 'castle')).toEqual([w]);
	});
});

describe('bots and city paths', () => {
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

	it('take all three paths and still finish their games', () => {
		const built = { castle: 0, guildHall: 0, fortress: 0 };
		for (const seed of [1, 2, 3, 4, 5, 6]) {
			const s = playOut(createGame(players(4), seed, undefined, extended()));
			expect(s.phase).toBe('ended');
			s.cityPaths.forEach((kind, v) => {
				if (!kind) return;
				built[kind]++;
				expect(s.buildings[v]?.kind).toBe('city');
				if (kind === 'guildHall') expect(s.guildGoods[v]).not.toBe(null);
			});
			for (let p = 0; p < s.players.length; p++) {
				expect(s.cityPaths.filter((k, v) => k === 'fortress' && s.buildings[v]?.owner === p).length).toBeLessThanOrEqual(1);
				const goods = guildGoodsOf(s, p);
				expect(new Set(goods).size).toBe(goods.length);
			}
		}
		expect(built.castle).toBeGreaterThan(0);
		expect(built.guildHall).toBeGreaterThan(0);
		expect(built.fortress).toBeGreaterThan(0);
	});

	it('leave them alone when the host turned them off', () => {
		const s = playOut(
			createGame(players(4), 3, undefined, extended({ buildings: { ...allBuildings(), castle: false, guildHall: false, fortress: false } }))
		);
		expect(s.phase).toBe('ended');
		expect(s.cityPaths.every((k) => !k)).toBe(true);
	});
});
