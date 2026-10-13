import { describe, expect, it } from 'vitest';
import { conquestBot } from '../src/shared/conquest/bot';
import {
	attackSources,
	attackTargets,
	bestSet,
	escalatingValue,
	fortifyTargets,
	isSet,
	majorityGoal,
	nextSetValue,
	regionsHeld,
	reinforcementsFor,
	setValue,
	startingArmies
} from '../src/shared/conquest/queries';
import { REALM } from '../src/shared/conquest/realm';
import {
	CQ_LOG_LIMIT,
	addConquestChat,
	applyConquest,
	conquestView,
	createConquest,
	timeOutConquest
} from '../src/shared/conquest/rules';
import type {
	Battle,
	CardRule,
	CardSymbol,
	ConquestCard,
	ConquestSettings,
	CqAction,
	CqEvent,
	CqState,
	DeployRule,
	VictoryRule
} from '../src/shared/conquest/types';
import { PLAYER_COLORS } from '../src/shared/rules/config';

const T = (id: string) => {
	const i = REALM.territories.findIndex((t) => t.id === id);
	if (i < 0) throw new Error(id);
	return i;
};
const COUNT = REALM.territories.length;

const seats = (n: number) =>
	Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: PLAYER_COLORS[i], isBot: false }));
const settings = (o: Partial<ConquestSettings> = {}): ConquestSettings => ({
	map: 'realm',
	cards: 'escalating',
	victory: 'domination',
	deploy: 'placed',
	...o
});

function act(s: CqState, p: number, a: CqAction): CqState {
	const r = applyConquest(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

function error(s: CqState, p: number, a: CqAction): string {
	const r = applyConquest(s, p, a);
	if (r.ok) throw new Error(`${a.type} should have failed`);
	return r.error;
}

const of = <K extends CqEvent['type']>(events: CqEvent[], type: K) =>
	events.filter((e): e is Extract<CqEvent, { type: K }> => e.type === type);

/**
 * A game in play, mid-turn, with the board laid out by hand: every territory player 1's with
 * one army unless `layout` says otherwise ([player, armies]). Player 0 is attacking.
 */
function table(
	n: number,
	layout: Record<string, [number, number]>,
	o: Partial<ConquestSettings> = {}
): CqState {
	const s = createConquest(seats(n), 7, settings({ deploy: 'random', ...o }));
	s.owner.fill(1);
	s.armies.fill(1);
	for (const [id, [p, a]] of Object.entries(layout)) {
		s.owner[T(id)] = p;
		s.armies[T(id)] = a;
	}
	s.current = 0;
	s.step = 'attack';
	s.reserve.fill(0);
	s.placed.fill(0);
	s.mustTrade = false;
	s.conquered = false;
	return s;
}

let nextCardId = 1000;
const card = (symbol: CardSymbol, territory: string | null = null): ConquestCard => ({
	id: nextCardId++,
	symbol,
	territory: territory === null ? null : T(territory)
});

/** Try rng states until the action's battles come out as wanted. */
function rigged(s: CqState, p: number, a: CqAction, want: (b: Battle[]) => boolean) {
	for (let rng = 1; rng < 200000; rng++) {
		const r = applyConquest({ ...s, rng }, p, a);
		if (!r.ok) throw new Error(r.error);
		if (want(of(r.events, 'battle'))) return r;
	}
	throw new Error('no rng gives those dice');
}

describe('setting up', () => {
	it('scales the starting armies to the map', () => {
		expect([2, 3, 4, 5, 6].map((n) => startingArmies(n))).toEqual([34, 30, 26, 21, 17]);
		expect(majorityGoal()).toBe(24);
	});

	it('deals every territory round-robin with one army, the rest in reserve', () => {
		for (let n = 2; n <= 6; n++) {
			const s = createConquest(seats(n), 42 + n, settings());
			const held = s.players.map((_, p) => s.owner.filter((o) => o === p).length);
			expect(held.reduce((a, b) => a + b)).toBe(COUNT);
			expect(Math.max(...held) - Math.min(...held)).toBeLessThanOrEqual(1);
			// The first player gets the first territory dealt, so never fewer than anyone.
			expect(held[0]).toBe(Math.max(...held));
			expect(s.armies.every((a) => a === 1)).toBe(true);
			expect(s.reserve).toEqual(held.map((h) => startingArmies(n) - h));
			expect(s.phase).toBe('deploy');
			expect(s.turn).toBe(0);
			expect(s.log.map((e) => e.type)).toEqual(['gameStarted', 'dealt']);
			expect(s.deck).toHaveLength(COUNT + 2);
			expect(s.stats.held.map((h) => h[0])).toEqual(held);
		}
	});

	it('is the same game for the same seed', () => {
		const a = createConquest(seats(4), 99, settings({ deploy: 'random' }));
		const b = createConquest(seats(4), 99, settings({ deploy: 'random' }));
		expect(a).toEqual(b);
		expect(createConquest(seats(4), 100, settings()).owner).not.toEqual(a.owner);
	});

	it('spreads armies at random with random deployment and starts at once', () => {
		const s = createConquest(seats(3), 5, settings({ deploy: 'random' }));
		expect(s.phase).toBe('play');
		expect(s.turn).toBe(1);
		expect(s.round).toBe(1);
		expect(s.current).toBe(0);
		expect(s.step).toBe('reinforce');
		for (let p = 0; p < 3; p++) {
			expect(s.armies.reduce((n, a, t) => n + (s.owner[t] === p ? a : 0), 0)).toBe(
				startingArmies(3)
			);
		}
		expect(s.log.map((e) => e.type)).toEqual([
			'gameStarted',
			'dealt',
			'turnStarted',
			'reinforcements'
		]);
		expect(s.reserve).toEqual([reinforcementsFor(s, 0).total, 0, 0]);
		expect(s.stats.players[0].armies).toBe(startingArmies(3) + s.reserve[0]);
	});
});

describe('deploying', () => {
	it('lets everyone place at once, take back what they placed, and starts when all are down', () => {
		let s = createConquest(seats(2), 3, settings());
		const mine = (p: number) => s.owner.findIndex((o) => o === p);
		const t0 = mine(0);
		const t1 = mine(1);
		s = act(s, 1, { type: 'place', territory: t1, count: 3 });
		s = act(s, 0, { type: 'place', territory: t0, count: 5 });
		s = act(s, 0, { type: 'place', territory: t0, count: -2 });
		expect(s.armies[t0]).toBe(4);
		expect(s.placed[t0]).toBe(3);
		expect(error(s, 0, { type: 'place', territory: t0, count: -4 })).toMatch(/take back only 3/);
		expect(error(s, 0, { type: 'place', territory: t1, count: 1 })).toBe(
			"That territory isn't yours."
		);
		expect(error(s, 0, { type: 'place', territory: t0, count: 0 })).toBe(
			'Place at least one army.'
		);
		expect(error(s, 0, { type: 'place', territory: t0, count: 1000 })).toMatch(/only/);
		expect(error(s, 0, { type: 'endTurn' })).toBe('Place your starting armies first.');
		const other = s.owner.findIndex((o, t) => o === 0 && t !== t0);
		expect(error(s, 0, { type: 'place', territory: other, count: -1 })).toBe(
			'You placed no armies there to take back.'
		);
		const r = applyConquest(s, 0, { type: 'place', territory: t0, count: s.reserve[0] });
		expect(r.ok && of(r.events, 'deployDone')).toEqual([expect.objectContaining({ player: 0 })]);
		s = (r as { state: CqState }).state;
		expect(s.phase).toBe('deploy');
		const last = applyConquest(s, 1, { type: 'place', territory: t1, count: s.reserve[1] });
		expect(last.ok).toBe(true);
		if (!last.ok) return;
		expect(last.events.map((e) => e.type)).toEqual([
			'placed',
			'deployDone',
			'turnStarted',
			'reinforcements'
		]);
		expect(last.state.phase).toBe('play');
		expect(last.state.turn).toBe(1);
		expect(last.state.current).toBe(0);
		expect(last.state.placed.every((n) => n === 0)).toBe(true);
	});
});

describe('reinforcements', () => {
	it('gives a third of the territories, at least three, and region bonuses', () => {
		const s = table(2, {});
		const frost = ['icewind', 'wolfden', 'rimeholt', 'hoarfell', 'frostgate', 'snowmere'];
		for (const id of frost) s.owner[T(id)] = 0;
		expect(regionsHeld(s, 0)).toEqual([0]);
		expect(reinforcementsFor(s, 0)).toEqual({
			territories: 6,
			base: 3,
			regions: [{ region: 0, bonus: 3 }],
			total: 6
		});
		for (const id of ['owlhollow', 'thornwick', 'elderheart', 'mossvale', 'briarmoor', 'fernmere'])
			s.owner[T(id)] = 0;
		expect(reinforcementsFor(s, 0)).toEqual({
			territories: 12,
			base: 4,
			regions: [
				{ region: 0, bonus: 3 },
				{ region: 1, bonus: 4 }
			],
			total: 11
		});
		s.owner[T('snowmere')] = 1;
		expect(reinforcementsFor(s, 0).total).toBe(3 + 4);
		expect(reinforcementsFor(s, 1)).toMatchObject({ territories: 25, base: 8 });
	});

	it('arrive at the start of a turn', () => {
		let s = table(2, {
			icewind: [0, 3],
			wolfden: [0, 1],
			rimeholt: [0, 1],
			hoarfell: [0, 1],
			frostgate: [0, 1],
			snowmere: [0, 1]
		});
		s.current = 1;
		s = act(s, 1, { type: 'endTurn' });
		expect(s.current).toBe(0);
		expect(s.step).toBe('reinforce');
		expect(s.reserve).toEqual([6, 0]);
		const ev = of(s.log, 'reinforcements').at(-1)!;
		expect(ev).toMatchObject({ player: 0, territories: 6, base: 3, total: 6 });
	});
});

describe('placing in a turn', () => {
	it('places, takes back and locks in once the attacks start', () => {
		let s = table(2, { icewind: [0, 3], wolfden: [0, 1] });
		s.step = 'reinforce';
		s.reserve[0] = 4;
		s = act(s, 0, { type: 'place', territory: T('icewind'), count: 4 });
		s = act(s, 0, { type: 'place', territory: T('icewind'), count: -1 });
		expect(s.reserve[0]).toBe(1);
		expect(error(s, 0, { type: 'attack', from: T('icewind'), to: T('owlhollow') })).toBe(
			'Place all your armies first.'
		);
		expect(error(s, 0, { type: 'endTurn' })).toBe('Place all your armies first.');
		expect(error(s, 1, { type: 'place', territory: T('owlhollow'), count: 1 })).toBe(
			"It's not your turn."
		);
		s = act(s, 0, { type: 'place', territory: T('wolfden'), count: 1 });
		s = act(s, 0, { type: 'endAttack' });
		expect(s.step).toBe('fortify');
		expect(error(s, 0, { type: 'place', territory: T('icewind'), count: -1 })).toBe(
			'Armies are placed at the start of your turn.'
		);
	});
});

describe('cards', () => {
	it('knows a set', () => {
		expect(isSet([card('footman'), card('footman'), card('footman')])).toBe(true);
		expect(isSet([card('footman'), card('knight'), card('catapult')])).toBe(true);
		expect(isSet([card('footman'), card('footman'), card('knight')])).toBe(false);
		expect(isSet([card('wild'), card('footman'), card('knight')])).toBe(true);
		expect(isSet([card('wild'), card('wild'), card('catapult')])).toBe(true);
		expect(isSet([card('footman'), card('footman')])).toBe(false);
	});

	it('values sets by the rule', () => {
		expect([0, 1, 2, 3, 4, 5, 6, 7].map(escalatingValue)).toEqual([4, 6, 8, 10, 12, 15, 20, 25]);
		const fixed = { settings: settings({ cards: 'fixed' }), trades: 9 };
		expect(setValue(fixed, [card('footman'), card('footman'), card('footman')])).toBe(4);
		expect(setValue(fixed, [card('knight'), card('knight'), card('knight')])).toBe(6);
		expect(setValue(fixed, [card('catapult'), card('catapult'), card('catapult')])).toBe(8);
		expect(setValue(fixed, [card('footman'), card('knight'), card('catapult')])).toBe(10);
		expect(setValue(fixed, [card('wild'), card('knight'), card('knight')])).toBe(10);
		expect(setValue(fixed, [card('footman'), card('knight'), card('knight')])).toBe(0);
		expect(nextSetValue(fixed)).toEqual({ min: 4, max: 10 });
		expect(nextSetValue({ settings: settings(), trades: 6 })).toEqual({ min: 20, max: 20 });
	});

	it('escalates with every set anyone trades, and adds two on a pictured territory held', () => {
		let s = table(2, { icewind: [0, 3], wolfden: [0, 1] });
		s.step = 'reinforce';
		s.trades = 5;
		const set = [
			card('footman', 'owlhollow'),
			card('footman', 'wolfden'),
			card('footman', 'icewind')
		];
		s.players[0].cards = [...set, card('knight')];
		const r = applyConquest(s, 0, { type: 'trade', cards: set.map((c) => c.id) });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(of(r.events, 'cardsTraded')).toEqual([
			expect.objectContaining({ armies: 15, bonus: T('wolfden') })
		]);
		s = r.state;
		expect(s.reserve[0]).toBe(15);
		expect(s.armies[T('wolfden')]).toBe(3);
		expect(s.armies[T('icewind')]).toBe(3);
		expect(s.trades).toBe(6);
		expect(s.discard.map((c) => c.id)).toEqual(set.map((c) => c.id));
		expect(s.players[0].cards).toHaveLength(1);
		expect(s.stats.players[0]).toMatchObject({ sets: 1, fromCards: 17 });
		// The next set is worth more, whoever trades it.
		s.players[0].cards.push(card('knight'), card('wild'));
		s = act(s, 0, { type: 'trade', cards: s.players[0].cards.map((c) => c.id) });
		expect(s.reserve[0]).toBe(35);
	});

	it('pays fixed values', () => {
		let s = table(2, { icewind: [0, 3] }, { cards: 'fixed' });
		s.step = 'reinforce';
		s.players[0].cards = [
			card('catapult'),
			card('catapult'),
			card('catapult'),
			card('footman'),
			card('knight'),
			card('wild')
		];
		s = act(s, 0, { type: 'trade', cards: s.players[0].cards.slice(0, 3).map((c) => c.id) });
		expect(s.reserve[0]).toBe(8);
		s = act(s, 0, { type: 'trade', cards: s.players[0].cards.map((c) => c.id) });
		expect(s.reserve[0]).toBe(18);
	});

	it('refuses what is not a set, or not in hand', () => {
		const s = table(2, { icewind: [0, 3] });
		s.step = 'reinforce';
		s.players[0].cards = [card('footman'), card('footman'), card('knight')];
		const ids = s.players[0].cards.map((c) => c.id);
		expect(error(s, 0, { type: 'trade', cards: ids })).toMatch(/not a set/);
		expect(error(s, 0, { type: 'trade', cards: [ids[0], ids[0], ids[1]] })).toBe(
			'Trade three different cards.'
		);
		expect(error(s, 0, { type: 'trade', cards: [ids[0], ids[1], 9999] })).toBe(
			"You don't have those cards."
		);
		s.step = 'attack';
		s.players[0].cards = [card('footman'), card('footman'), card('footman')];
		expect(error(s, 0, { type: 'trade', cards: s.players[0].cards.map((c) => c.id) })).toBe(
			'Cards are traded at the start of your turn.'
		);
	});

	it('makes a player with five cards trade before anything else', () => {
		let s = table(2, { icewind: [0, 3], wolfden: [0, 1] });
		s.current = 1;
		s.players[0].cards = [
			card('footman', 'icewind'),
			card('knight'),
			card('knight'),
			card('catapult'),
			card('catapult')
		];
		s = act(s, 1, { type: 'endTurn' });
		expect(s.current).toBe(0);
		expect(s.mustTrade).toBe(true);
		expect(error(s, 0, { type: 'place', territory: T('icewind'), count: 1 })).toBe(
			'Trade in a set of cards first.'
		);
		expect(error(s, 0, { type: 'endTurn' })).toBe('Trade in a set of cards first.');
		const best = bestSet(s.players[0].cards, s, 0)!;
		expect(best.bonus).toBe(T('icewind'));
		s = act(s, 0, { type: 'trade', cards: best.cards.map((c) => c.id) });
		expect(s.mustTrade).toBe(false);
		expect(s.players[0].cards).toHaveLength(2);
		expect(s.reserve[0]).toBe(3 + 4);
	});

	it('prefers sets that keep wild cards', () => {
		const s = table(2, {});
		const hand = [card('wild'), card('footman'), card('footman'), card('footman')];
		expect(bestSet(hand, s, 0)!.cards.map((c) => c.symbol)).toEqual([
			'footman',
			'footman',
			'footman'
		]);
		expect(bestSet([card('footman'), card('footman'), card('knight')], s, 0)).toBeNull();
	});
});

describe('attacking', () => {
	it('rolls as many dice as the armies allow', () => {
		const s = table(2, { icewind: [0, 2], wolfden: [0, 3], rimeholt: [1, 5], owlhollow: [1, 1] });
		const one = applyConquest(s, 0, { type: 'attack', from: T('icewind'), to: T('owlhollow') });
		expect(one.ok && of(one.events, 'battle')[0].attack).toHaveLength(1);
		const two = applyConquest(s, 0, { type: 'attack', from: T('wolfden'), to: T('rimeholt') });
		expect(two.ok && of(two.events, 'battle')[0].attack).toHaveLength(2);
		expect(two.ok && of(two.events, 'battle')[0].defend).toHaveLength(2);
		s.armies[T('wolfden')] = 10;
		const three = applyConquest(s, 0, { type: 'attack', from: T('wolfden'), to: T('rimeholt') });
		expect(three.ok && of(three.events, 'battle')[0].attack).toHaveLength(3);
		const asked = applyConquest(s, 0, {
			type: 'attack',
			from: T('wolfden'),
			to: T('rimeholt'),
			dice: 1
		});
		expect(asked.ok && of(asked.events, 'battle')[0].attack).toHaveLength(1);
		expect(error(s, 0, { type: 'attack', from: T('wolfden'), to: T('rimeholt'), dice: 4 })).toBe(
			'Roll one, two or three dice.'
		);
	});

	it('checks where the attack comes from and goes', () => {
		const s = table(2, { icewind: [0, 1], wolfden: [0, 5], hoarfell: [1, 2] });
		expect(error(s, 0, { type: 'attack', from: T('icewind'), to: T('owlhollow') })).toBe(
			'Attack from a territory with at least two armies.'
		);
		expect(error(s, 0, { type: 'attack', from: T('owlhollow'), to: T('icewind') })).toBe(
			'Attack from a territory of yours.'
		);
		expect(error(s, 0, { type: 'attack', from: T('wolfden'), to: T('hoarfell') })).toBe(
			'You can only attack a neighbouring territory.'
		);
		expect(error(s, 0, { type: 'attack', from: T('wolfden'), to: T('icewind') })).toBe(
			"You can't attack your own territory."
		);
		expect(error(s, 1, { type: 'attack', from: T('hoarfell'), to: T('rimeholt') })).toBe(
			"It's not your turn."
		);
		expect(attackTargets(s, T('wolfden'))).toEqual([T('rimeholt')]);
		expect(attackSources(s, 0)).toEqual([T('wolfden')]);
	});

	it('gives ties to the defender', () => {
		const s = table(2, { wolfden: [0, 10], rimeholt: [1, 5] });
		const tie = rigged(
			s,
			0,
			{ type: 'attack', from: T('wolfden'), to: T('rimeholt') },
			([b]) => b.attack[0] === b.defend[0] && b.attack[1] > b.defend[1]
		);
		const [b] = of(tie.events, 'battle');
		expect(b).toMatchObject({ attackerLoss: 1, defenderLoss: 1 });
		const all = rigged(
			s,
			0,
			{ type: 'attack', from: T('wolfden'), to: T('rimeholt') },
			([b]) => b.attack[0] === b.defend[0] && b.attack[1] === b.defend[1]
		);
		expect(of(all.events, 'battle')[0]).toMatchObject({ attackerLoss: 2, defenderLoss: 0 });
		expect(all.ok && all.state.armies[T('wolfden')]).toBe(8);
		expect(all.ok && all.state.stats.players[0]).toMatchObject({
			attacks: 1,
			fallen: 2,
			killed: 0
		});
		expect(all.ok && all.state.stats.players[1]).toMatchObject({
			defences: 1,
			killed: 2,
			fallen: 0
		});
	});

	it('takes a territory and moves in between the dice rolled and all but one', () => {
		const s = table(2, { wolfden: [0, 6], rimeholt: [1, 1], icewind: [0, 2] });
		const r = rigged(
			s,
			0,
			{ type: 'attack', from: T('wolfden'), to: T('rimeholt') },
			([b]) => b.defenderLoss === 1
		);
		if (!r.ok) return;
		let t = r.state;
		expect(of(r.events, 'captured')).toEqual([
			expect.objectContaining({ player: 0, defender: 1, to: T('rimeholt') })
		]);
		expect(t.owner[T('rimeholt')]).toBe(0);
		expect(t.step).toBe('occupy');
		expect(t.occupy).toEqual({ from: T('wolfden'), to: T('rimeholt'), min: 3, max: 5 });
		expect(t.conquered).toBe(true);
		expect(error(t, 0, { type: 'occupy', count: 2 })).toBe('Move between 3 and 5 armies in.');
		expect(error(t, 0, { type: 'endTurn' })).toBe('Move armies into the territory you took first.');
		expect(error(t, 0, { type: 'attack', from: T('icewind'), to: T('owlhollow') })).toBe(
			'Move armies into the territory you took first.'
		);
		t = act(t, 0, { type: 'occupy', count: 4 });
		expect(t.armies[T('rimeholt')]).toBe(4);
		expect(t.armies[T('wolfden')]).toBe(2);
		expect(t.step).toBe('attack');
		expect(t.occupy).toBeNull();
	});

	it('moves in by itself when there is no choice', () => {
		const s = table(2, { icewind: [0, 2], owlhollow: [1, 1] });
		const r = rigged(
			s,
			0,
			{ type: 'attack', from: T('icewind'), to: T('owlhollow') },
			([b]) => b.defenderLoss === 1
		);
		if (!r.ok) return;
		expect(of(r.events, 'occupied')).toEqual([expect.objectContaining({ count: 1 })]);
		expect(r.state.step).toBe('attack');
		expect(r.state.armies[T('owlhollow')]).toBe(1);
		expect(r.state.armies[T('icewind')]).toBe(1);
	});

	it('blitzes roll after roll until the territory falls or the attack runs out', () => {
		const s = table(2, { wolfden: [0, 30], rimeholt: [1, 6] });
		const r = applyConquest(s, 0, {
			type: 'attack',
			from: T('wolfden'),
			to: T('rimeholt'),
			blitz: true,
			dice: 1
		});
		if (!r.ok) throw new Error(r.error);
		const battles = of(r.events, 'battle');
		expect(battles.length).toBeGreaterThan(1);
		expect(
			battles.every(
				(b) => b.attack.length === 3 || b.attack.length === r.state.armies[T('wolfden')]
			)
		).toBe(true);
		expect(r.state.owner[T('rimeholt')] === 0 || r.state.armies[T('wolfden')] < 2).toBe(true);
		const weak = table(2, { wolfden: [0, 3], rimeholt: [1, 40] });
		const lost = applyConquest(weak, 0, {
			type: 'attack',
			from: T('wolfden'),
			to: T('rimeholt'),
			blitz: true
		});
		if (!lost.ok) throw new Error(lost.error);
		expect(lost.state.armies[T('wolfden')]).toBe(1);
		expect(lost.state.owner[T('rimeholt')]).toBe(1);
	});

	it('knocks a player out, takes their cards and makes six or more be traded down', () => {
		let s = table(3, { wolfden: [0, 10], rimeholt: [2, 1], icewind: [0, 1] });
		s.players[0].cards = [card('footman'), card('footman'), card('knight'), card('catapult')];
		s.players[2].cards = [card('knight', 'wolfden'), card('wild')];
		const r = rigged(
			s,
			0,
			{ type: 'attack', from: T('wolfden'), to: T('rimeholt') },
			([b]) => b.defenderLoss === 1
		);
		if (!r.ok) return;
		expect(of(r.events, 'eliminated')).toEqual([
			expect.objectContaining({ player: 2, by: 0, cards: 2 })
		]);
		s = r.state;
		expect(s.players[2].out).toBe(true);
		expect(s.players[2].cards).toEqual([]);
		expect(s.players[0].cards).toHaveLength(6);
		expect(s.stats.players[2]).toMatchObject({ outTurn: s.turn, outBy: 0 });
		expect(s.mustTrade).toBe(true);
		expect(s.step).toBe('occupy');
		s = act(s, 0, { type: 'occupy', count: 5 });
		expect(s.step).toBe('reinforce');
		expect(error(s, 0, { type: 'attack', from: T('wolfden'), to: T('rimeholt') })).toBe(
			'Trade in a set of cards first.'
		);
		const set = bestSet(s.players[0].cards, s, 0)!;
		s = act(s, 0, { type: 'trade', cards: set.cards.map((c) => c.id) });
		expect(s.mustTrade).toBe(false);
		expect(s.players[0].cards).toHaveLength(3);
		expect(s.reserve[0]).toBeGreaterThan(0);
		s = act(s, 0, { type: 'place', territory: T('wolfden'), count: s.reserve[0] });
		expect(canAttack(s)).toBe(true);
		expect(applyConquest(s, 0, { type: 'attack', from: T('rimeholt'), to: T('hoarfell') }).ok).toBe(
			true
		);
		// Player 2 is skipped from now on.
		s = act(s, 0, { type: 'endTurn' });
		expect(s.current).toBe(1);
		s = act(s, 1, { type: 'place', territory: T('hoarfell'), count: s.reserve[1] });
		s = act(s, 1, { type: 'endTurn' });
		expect(s.current).toBe(0);
	});

	it('wins by taking everything', () => {
		const layout: Record<string, [number, number]> = {};
		for (const t of REALM.territories) layout[t.id] = [0, 1];
		layout.wolfden = [0, 5];
		layout.rimeholt = [1, 1];
		const s = table(2, layout);
		const r = rigged(
			s,
			0,
			{ type: 'attack', from: T('wolfden'), to: T('rimeholt') },
			([b]) => b.defenderLoss === 1
		);
		if (!r.ok) return;
		expect(r.events.map((e) => e.type)).toEqual([
			'battle',
			'captured',
			'eliminated',
			'occupied',
			'gameOver'
		]);
		expect(of(r.events, 'gameOver')[0]).toMatchObject({ winner: 0, reason: 'domination' });
		expect(r.state.phase).toBe('ended');
		expect(r.state.winner).toBe(0);
		expect(r.state.armies[T('rimeholt')]).toBe(4);
		expect(r.state.occupy).toBeNull();
		expect(error(r.state, 0, { type: 'endTurn' })).toBe('The game is over.');
	});

	it('wins by holding two thirds with the majority rule', () => {
		const layout: Record<string, [number, number]> = {};
		REALM.territories.slice(0, 24).forEach((t) => (layout[t.id] = [0, 1]));
		layout.goldmeadow = [0, 6];
		layout.millbrook = [1, 1];
		layout.tidewell = [2, 1];
		for (const o of [{ victory: 'majority' as const }, { victory: 'domination' as const }]) {
			const s = table(3, layout, o);
			expect(s.owner.filter((x) => x === 0)).toHaveLength(23);
			const take = rigged(
				s,
				0,
				{ type: 'attack', from: T('goldmeadow'), to: T('millbrook') },
				([b]) => b.defenderLoss === 1
			);
			if (!take.ok) return;
			if (o.victory === 'majority') {
				expect(of(take.events, 'gameOver')).toEqual([
					expect.objectContaining({ winner: 0, reason: 'majority' })
				]);
				expect(take.state.phase).toBe('ended');
			} else {
				expect(take.state.phase).toBe('play');
				expect(take.state.step).toBe('occupy');
			}
		}
	});
});

/** The current player may attack now. */
function canAttack(s: CqState) {
	return (
		s.step === 'attack' || (s.step === 'reinforce' && s.reserve[s.current] === 0 && !s.mustTrade)
	);
}

describe('fortifying', () => {
	it('moves along a chain of territories held, sea lanes included, and ends the turn', () => {
		let s = table(2, {
			wolfden: [0, 6],
			icewind: [0, 1],
			owlhollow: [0, 1],
			rimeholt: [0, 1],
			hoarfell: [1, 1]
		});
		expect(fortifyTargets(s, T('wolfden'))).toEqual(
			[T('icewind'), T('rimeholt'), T('owlhollow')].sort((a, b) => a - b)
		);
		expect(
			error(s, 0, { type: 'fortify', from: T('wolfden'), to: T('elderheart'), count: 1 })
		).toBe('Move armies between territories of yours.');
		expect(error(s, 0, { type: 'fortify', from: T('wolfden'), to: T('wolfden'), count: 1 })).toBe(
			'Move armies between two different territories.'
		);
		expect(error(s, 0, { type: 'fortify', from: T('wolfden'), to: T('owlhollow'), count: 6 })).toBe(
			'Move between 1 and 5 armies.'
		);
		const r = applyConquest(s, 0, {
			type: 'fortify',
			from: T('wolfden'),
			to: T('owlhollow'),
			count: 5
		});
		if (!r.ok) throw new Error(r.error);
		expect(r.events.map((e) => e.type)).toEqual(['fortified', 'turnStarted', 'reinforcements']);
		s = r.state;
		expect(s.armies[T('owlhollow')]).toBe(6);
		expect(s.current).toBe(1);
	});

	it('refuses territories cut off from each other', () => {
		const s = table(2, { icewind: [0, 4], rimeholt: [0, 1] });
		expect(fortifyTargets(s, T('icewind'))).toEqual([]);
		expect(
			error(s, 0, { type: 'fortify', from: T('icewind'), to: T('rimeholt'), count: 1 })
		).toMatch(/not joined/);
	});

	it('waits until every army is placed', () => {
		const s = table(2, { icewind: [0, 4], wolfden: [0, 1] });
		s.step = 'reinforce';
		s.reserve[0] = 2;
		expect(error(s, 0, { type: 'fortify', from: T('icewind'), to: T('wolfden'), count: 1 })).toBe(
			'Place all your armies first.'
		);
		s.reserve[0] = 0;
		expect(
			applyConquest(s, 0, { type: 'fortify', from: T('icewind'), to: T('wolfden'), count: 1 }).ok
		).toBe(true);
		s.step = 'fortify';
		expect(error(s, 0, { type: 'attack', from: T('icewind'), to: T('owlhollow') })).toBe(
			'Your attacks are over for this turn.'
		);
	});
});

describe('ending a turn', () => {
	it('draws a card only after taking a territory', () => {
		let s = table(2, { icewind: [0, 4] });
		let r = applyConquest(s, 0, { type: 'endTurn' });
		expect(r.ok && of(r.events, 'cardDrawn')).toEqual([]);
		s.conquered = true;
		const top = s.deck.at(-1)!;
		r = applyConquest(s, 0, { type: 'endTurn' });
		if (!r.ok) throw new Error(r.error);
		expect(of(r.events, 'cardDrawn')).toEqual([expect.objectContaining({ player: 0, card: top })]);
		expect(r.state.players[0].cards).toEqual([top]);
		expect(r.state.deck).toHaveLength(s.deck.length - 1);
		expect(r.state.conquered).toBe(false);
	});

	it('shuffles the traded cards back when the deck runs out', () => {
		const s = table(2, { icewind: [0, 4] });
		s.conquered = true;
		s.discard = s.deck.splice(0, 5);
		s.players[1].cards = s.deck.splice(0);
		const r = applyConquest(s, 0, { type: 'endTurn' });
		if (!r.ok) throw new Error(r.error);
		expect(r.state.discard).toEqual([]);
		expect(r.state.deck).toHaveLength(4);
		expect(r.state.players[0].cards).toHaveLength(1);
		s.discard = [];
		const none = applyConquest(s, 0, { type: 'endTurn' });
		expect(none.ok && of(none.events, 'cardDrawn')).toEqual([]);
	});

	it('counts turns and rounds and notes territories at the end of each round', () => {
		let s = createConquest(seats(3), 11, settings({ deploy: 'random' }));
		for (let i = 0; i < 3; i++) {
			s = act(s, s.current, {
				type: 'place',
				territory: s.owner.indexOf(s.current),
				count: s.reserve[s.current]
			});
			s = act(s, s.current, { type: 'endTurn' });
		}
		expect(s.turn).toBe(4);
		expect(s.round).toBe(2);
		expect(s.current).toBe(0);
		expect(s.stats.held.map((h) => h.length)).toEqual([2, 2, 2]);
		expect(of(s.log, 'turnStarted').at(-1)).toMatchObject({ player: 0, turn: 4, round: 2 });
	});

	it('refuses to end a turn with armies to place', () => {
		const s = createConquest(seats(2), 11, settings({ deploy: 'random' }));
		expect(error(s, 0, { type: 'endTurn' })).toBe('Place all your armies first.');
		expect(error(s, 1, { type: 'endTurn' })).toBe("It's not your turn.");
		expect(error(s, 5, { type: 'endTurn' })).toBe('Unknown player.');
	});

	it('bumps the version and keeps the log short', () => {
		let s = table(2, { wolfden: [0, 200], rimeholt: [1, 200] });
		const v = s.version;
		for (let i = 0; i < 100; i++)
			s = act(s, 0, { type: 'attack', from: T('wolfden'), to: T('rimeholt'), dice: 1 });
		expect(s.version).toBe(v + 100);
		expect(s.log).toHaveLength(CQ_LOG_LIMIT);
		expect(s.log.at(-1)!.seq).toBe(s.nextEventSeq - 1);
	});
});

describe('the turn clock', () => {
	it('passes the turn from any step', () => {
		// Deploying: everyone's armies are spread and the first turn begins.
		const d = timeOutConquest(createConquest(seats(3), 2, settings()));
		expect(d.phase).toBe('play');
		expect(d.reserve.slice(1)).toEqual([0, 0]);
		expect(of(d.log, 'turnTimedOut')).toHaveLength(3);
		for (let p = 0; p < 3; p++)
			expect(d.armies.reduce((n, a, t) => n + (d.owner[t] === p ? a : 0), 0)).toBe(
				startingArmies(3)
			);
		// Reinforcing with cards to trade.
		const s = table(2, { icewind: [0, 3], wolfden: [0, 1] });
		s.step = 'reinforce';
		s.reserve[0] = 5;
		s.mustTrade = true;
		s.players[0].cards = [
			card('footman'),
			card('footman'),
			card('footman'),
			card('knight'),
			card('knight'),
			card('wild')
		];
		const t = timeOutConquest(s);
		expect(t.current).toBe(1);
		expect(t.players[0].cards.length).toBeLessThan(5);
		expect(t.armies[T('icewind')] + t.armies[T('wolfden')]).toBeGreaterThan(4 + 5);
		// Occupying.
		const o = table(2, { wolfden: [0, 1], rimeholt: [0, 0] });
		o.step = 'occupy';
		o.occupy = { from: T('wolfden'), to: T('rimeholt'), min: 3, max: 5 };
		o.armies[T('wolfden')] = 6;
		const u = timeOutConquest(o);
		expect(u.armies[T('rimeholt')]).toBe(3);
		expect(u.current).toBe(1);
		expect(timeOutConquest({ ...u, phase: 'ended' }).current).toBe(1);
	});
});

describe('views', () => {
	it('hide other hands, the deck and the cards others draw', () => {
		let s = table(3, { icewind: [0, 4] });
		s.players[1].cards = [card('knight')];
		s.players[2].cards = [card('wild'), card('footman')];
		s.conquered = true;
		s = act(s, 0, { type: 'endTurn' });
		const drawn = s.players[0].cards[0];
		const mine = conquestView(s, 0);
		expect('rng' in mine).toBe(false);
		expect('deck' in mine).toBe(false);
		expect(mine.deckCount).toBe(s.deck.length);
		expect(mine.players.map((p) => p.cardCount)).toEqual([1, 1, 2]);
		expect(mine.players[0].cards).toEqual([drawn]);
		expect(mine.players[1].cards).toBeUndefined();
		expect(of(mine.log, 'cardDrawn')[0].card).toEqual(drawn);
		const theirs = conquestView(s, 1);
		expect(theirs.players[0].cards).toBeUndefined();
		expect(theirs.players[1].cards).toHaveLength(1);
		expect(of(theirs.log, 'cardDrawn')[0].card).toBeNull();
		const watcher = conquestView(s, -1);
		expect(watcher.players.every((p) => p.cards === undefined)).toBe(true);
		expect(of(watcher.log, 'cardDrawn')[0].card).toBeNull();
		expect(JSON.stringify(watcher)).not.toContain('"wild"');
		const all = conquestView(s, -1, true);
		expect(all.players.every((p) => p.cards)).toBe(true);
		expect(conquestView({ ...s, phase: 'ended' }, -1).players[2].cards).toHaveLength(2);
	});

	it('carry chat', () => {
		const s = table(2, {});
		const c = addConquestChat(s, 1, `  ${'x'.repeat(300)} `);
		expect(of(c.log, 'chat').at(-1)).toMatchObject({ player: 1, text: 'x'.repeat(240) });
		expect(addConquestChat(s, 1, '   ')).toBe(s);
	});
});

/** Plays a game with bots in every seat, checking each move as it goes. */
function botGame(
	n: number,
	seed: number,
	o: Partial<ConquestSettings>,
	each?: (s: CqState, seat: number, a: CqAction) => void
) {
	let s = createConquest(
		Array.from({ length: n }, (_, i) => ({ name: `B${i}`, color: PLAYER_COLORS[i], isBot: true })),
		seed,
		settings(o)
	);
	let actions = 0;
	while (s.phase !== 'ended' && actions < 20000) {
		const seat = s.phase === 'deploy' ? s.reserve.findIndex((r) => r > 0) : s.current;
		const view = conquestView(s, seat);
		const a = conquestBot(view);
		expect(a, `seat ${seat} step ${s.step}`).not.toBeNull();
		each?.(s, seat, a!);
		const r = applyConquest(s, seat, a!);
		if (!r.ok) throw new Error(`bot ${seat} ${JSON.stringify(a)}: ${r.error} (seed ${seed})`);
		s = r.state;
		actions++;
	}
	return { s, actions };
}

describe('bots', () => {
	it('see only their own view and only make legal moves', () => {
		botGame(4, 5, { deploy: 'placed' }, (s, seat) => {
			const view = conquestView(s, seat);
			// What others hold can't change what the bot does.
			const other = structuredClone(s);
			other.players.forEach((p, i) => {
				if (i !== seat) p.cards = [];
			});
			other.deck.reverse();
			other.rng ^= 12345;
			expect(conquestBot(conquestView(other, seat))).toEqual(conquestBot(view));
			// Nobody else has anything to do in someone's turn.
			if (s.phase === 'play')
				for (let p = 0; p < s.players.length; p++)
					if (p !== seat) expect(conquestBot(conquestView(s, p))).toBeNull();
		});
	});

	it('pass the turn clock test: a timeout always hands the turn on', () => {
		botGame(3, 8, { cards: 'fixed' }, (s) => {
			if (s.phase !== 'play') return;
			const t = timeOutConquest(s);
			expect(t.phase === 'ended' || t.current !== s.current).toBe(true);
			expect(t.step).toBe('reinforce');
			expect(t.reserve.filter((r, p) => p !== t.current).every((r) => r === 0)).toBe(true);
			expect(t.armies.every((a) => a >= 1)).toBe(true);
		});
	});

	const combos: [number, CardRule, VictoryRule, DeployRule][] = [];
	for (let n = 2; n <= 6; n++)
		for (const cards of ['escalating', 'fixed'] as CardRule[])
			for (const victory of ['domination', 'majority'] as VictoryRule[])
				for (const deploy of ['placed', 'random'] as DeployRule[])
					combos.push([n, cards, victory, deploy]);

	it.each(combos)(
		'finish a game: %i players, %s cards, %s, %s deployment',
		(n, cards, victory, deploy) => {
			for (const seed of [1, 2]) {
				const { s, actions } = botGame(n, seed * 31 + n, { cards, victory, deploy });
				expect(s.phase).toBe('ended');
				expect(s.winner).not.toBeNull();
				expect(actions).toBeLessThan(20000);
				const winner = s.winner!;
				const held = s.owner.filter((o) => o === winner).length;
				expect(held).toBeGreaterThanOrEqual(victory === 'majority' ? majorityGoal() : COUNT);
				expect(s.armies.every((a) => a >= 1)).toBe(true);
				expect(s.stats.players[winner].peak).toBe(held);
			}
		}
	);
});
