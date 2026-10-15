import { describe, expect, it } from 'vitest';
import { conquestBot } from '../src/shared/conquest/bot';
import { OMENS, OMEN_INFO, type OmenId } from '../src/shared/conquest/omens';
import { attackTargets, fortifyTargets, reinforcementsFor, setValue, startingArmies } from '../src/shared/conquest/queries';
import { REALM } from '../src/shared/conquest/realm';
import { applyConquest, conquestView, createConquest, timeOutConquest } from '../src/shared/conquest/rules';
import { DEFAULT_CONQUEST_SETTINGS, type Battle, type ConquestCard, type ConquestSettings, type CqAction, type CqEvent, type CqState } from '../src/shared/conquest/types';
import type { WarlordId } from '../src/shared/conquest/warlords';
import { PLAYER_COLORS } from '../src/shared/rules/config';

const T = (id: string) => {
	const i = REALM.territories.findIndex((t) => t.id === id);
	if (i < 0) throw new Error(id);
	return i;
};
const R = (id: string) => REALM.regions.findIndex((r) => r.id === id);
const seats = (n: number, bots = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: PLAYER_COLORS[i], isBot: bots }));
const settings = (o: Partial<ConquestSettings> = {}): ConquestSettings => ({ ...DEFAULT_CONQUEST_SETTINGS, ...o });

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
const of = <K extends CqEvent['type']>(events: CqEvent[], type: K) => events.filter((e): e is Extract<CqEvent, { type: K }> => e.type === type);

/** A game mid-turn: every territory player 1's with one army unless `layout` says otherwise; player 0 attacking. */
function table(n: number, layout: Record<string, [number, number]>, o: Partial<ConquestSettings> = {}): CqState {
	const s = createConquest(seats(n), 7, settings({ deploy: 'random', ...o, warlords: false }));
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
const withWarlord = (s: CqState, p: number, w: WarlordId) => (s.players[p].warlord = w, s);
const withOmen = (s: CqState, omen: OmenId, extra: { region?: number; target?: number } = {}) => {
	s.omens = { pool: [...OMENS], deck: [], current: omen, region: extra.region ?? null, target: extra.target ?? null };
	return s;
};

/** Try rng states until the action's battles come out as wanted. */
function rigged(s: CqState, p: number, a: CqAction, want: (b: Battle[]) => boolean) {
	for (let rng = 1; rng < 200000; rng++) {
		const r = applyConquest({ ...s, rng }, p, a);
		if (!r.ok) throw new Error(r.error);
		if (want(of(r.events, 'battle'))) return r;
	}
	throw new Error('no rng gives those dice');
}

describe('army sizes', () => {
	it('start a quarter fewer or more', () => {
		expect(startingArmies(4, REALM, 'standard')).toBe(26);
		expect(startingArmies(4, REALM, 'fewer')).toBe(19);
		expect(startingArmies(4, REALM, 'more')).toBe(32);
		const s = createConquest(seats(4), 1, settings({ start: 'more' }));
		expect(s.stats.players[0].armies).toBe(32);
	});

	it('never start too few to cover the territories dealt', () => {
		expect(startingArmies(2, REALM, 'fewer')).toBeGreaterThanOrEqual(18 + 3);
	});

	it('bring the table least each turn', () => {
		const s = table(2, { icewind: [0, 1] }, { minReinforce: 5 });
		expect(reinforcementsFor(s, 0).base).toBe(5);
		expect(reinforcementsFor(table(2, { icewind: [0, 1] }, { minReinforce: 2 }), 0).base).toBe(2);
	});
});

describe('fortify rules', () => {
	const chain = { icewind: [0, 5] as [number, number], wolfden: [0, 1] as [number, number], rimeholt: [0, 1] as [number, number] };

	it('only to a neighbour, when that is the rule', () => {
		const s = table(2, chain, { fortify: 'adjacent' });
		expect(fortifyTargets(s, T('icewind'))).toEqual([T('wolfden')]);
		expect(error(s, 0, { type: 'fortify', from: T('icewind'), to: T('rimeholt'), count: 1 })).toBe('Armies only move to a neighbouring territory of yours.');
	});

	it('as many moves as you like, ending the turn yourself, when moves are free', () => {
		let s = table(2, chain, { fortify: 'free' });
		s = act(s, 0, { type: 'fortify', from: T('icewind'), to: T('wolfden'), count: 2 });
		expect(s.current).toBe(0);
		expect(s.step).toBe('fortify');
		s = act(s, 0, { type: 'fortify', from: T('icewind'), to: T('rimeholt'), count: 1 });
		expect(s.current).toBe(0);
		// No attacking once the moving has begun.
		expect(applyConquest(s, 0, { type: 'attack', from: T('wolfden'), to: T('hoarfell') }).ok).toBe(false);
		s = act(s, 0, { type: 'endTurn' });
		expect(s.current).toBe(1);
	});

	it('once, and the turn is over, by the classic rule', () => {
		const s = act(table(2, chain), 0, { type: 'fortify', from: T('icewind'), to: T('rimeholt'), count: 1 });
		expect(s.current).toBe(1);
	});
});

describe('card options', () => {
	const hand = (s: CqState): ConquestCard[] => {
		const cards: ConquestCard[] = [
			{ id: 900, territory: T('icewind'), symbol: 'footman' },
			{ id: 901, territory: null, symbol: 'footman' },
			{ id: 902, territory: null, symbol: 'footman' }
		];
		s.players[0].cards = cards;
		return cards;
	};

	it('no cards: none drawn, none traded', () => {
		let s = table(2, { icewind: [0, 5], wolfden: [1, 1] }, { cards: 'none' });
		const r = (() => {
			for (let rng = 1; ; rng++) {
				const r = applyConquest({ ...s, rng }, 0, { type: 'attack', from: T('icewind'), to: T('wolfden'), blitz: true });
				if (r.ok && r.state.owner[T('wolfden')] === 0) return r;
			}
		})();
		s = r.state;
		if (s.step === 'occupy') s = act(s, 0, { type: 'occupy', count: s.occupy!.min });
		s = act(s, 0, { type: 'endTurn' });
		expect(s.players[0].cards).toEqual([]);
		const t = table(2, { icewind: [0, 5] }, { cards: 'none' });
		hand(t);
		t.step = 'reinforce';
		expect(error(t, 0, { type: 'trade', cards: [900, 901, 902] })).toBe('This war is fought without cards.');
	});

	it('no two armies for a pictured territory when the bonus is off', () => {
		const s = table(2, { icewind: [0, 5] }, { cardBonus: false });
		hand(s);
		s.step = 'reinforce';
		const after = act(s, 0, { type: 'trade', cards: [900, 901, 902] });
		expect(after.armies[T('icewind')]).toBe(5);
		const on = table(2, { icewind: [0, 5] });
		hand(on);
		on.step = 'reinforce';
		expect(act(on, 0, { type: 'trade', cards: [900, 901, 902] }).armies[T('icewind')]).toBe(7);
	});

	it('a trade forced at the table number of cards, when the hand holds a set', () => {
		const s = table(2, { icewind: [0, 5] }, { tradeAt: 4 });
		s.players[1].cards = [0, 1, 2, 3].map((i) => ({ id: 800 + i, territory: null, symbol: 'footman' as const }));
		s.step = 'fortify';
		expect(act(s, 0, { type: 'endTurn' }).mustTrade).toBe(true);
		// Two of one picture and two of another make no set: nothing to trade, so no trade forced.
		s.players[1].cards = (['footman', 'footman', 'knight', 'knight'] as const).map((symbol, i) => ({ id: 810 + i, territory: null, symbol }));
		expect(act(s, 0, { type: 'endTurn' }).mustTrade).toBe(false);
	});
});

describe('warlords', () => {
	it('are drafted in turn, the last to move first, from a few more than there are players', () => {
		let s = createConquest(seats(4), 3, settings({ warlords: true }));
		expect(s.phase).toBe('draft');
		expect(s.draft!.order).toEqual([3, 2, 1, 0]);
		expect(s.draft!.pool).toHaveLength(6);
		// Without fog, the Spymistress has nothing to see through.
		expect(s.draft!.pool).not.toContain('vey');
		expect(error(s, 0, { type: 'pickWarlord', warlord: s.draft!.pool[0] })).toBe("It's not your pick.");
		expect(error(s, 3, { type: 'place', territory: 0, count: 1 })).toBe('The warlords are being drafted.');
		for (const p of [3, 2, 1, 0]) s = act(s, p, { type: 'pickWarlord', warlord: s.draft!.pool[0] });
		expect(s.phase).toBe('deploy');
		expect(new Set(s.players.map((p) => p.warlord)).size).toBe(4);
		expect(s.draft).toBeNull();
	});

	it('are picked at random for whoever runs out of time, and bots pick their own', () => {
		let s = createConquest(seats(3), 4, settings({ warlords: true, deploy: 'random' }));
		s = timeOutConquest(s);
		expect(s.players[2].warlord).not.toBeNull();
		const bot = conquestBot(conquestView(s, 1));
		expect(bot).toMatchObject({ type: 'pickWarlord' });
		s = act(s, 1, bot!);
		s = act(s, 0, conquestBot(conquestView(s, 0))!);
		expect(s.phase).toBe('play');
	});

	it('Aldric wins a tie on his highest die, rolling three at a stronghold', () => {
		const s = withWarlord(table(2, { icewind: [0, 9], wolfden: [1, 5] }), 0, 'aldric');
		const tie = ([b]: Battle[]) => b.attack[0] === b.defend[0] && b.attack[1] === b.defend[1];
		const r = rigged(s, 0, { type: 'attack', from: T('icewind'), to: T('wolfden'), dice: 3 }, tie);
		expect(of(r.events, 'battle')[0]).toMatchObject({ defenderLoss: 1, attackerLoss: 1, tiesToAttacker: 1 });
		// Against a smaller army, ties go to the defender as ever.
		const small = withWarlord(table(2, { icewind: [0, 9], wolfden: [1, 4] }), 0, 'aldric');
		expect(of(rigged(small, 0, { type: 'attack', from: T('icewind'), to: T('wolfden'), dice: 3 }, tie).events, 'battle')[0]).toMatchObject({ attackerLoss: 2 });
	});

	it('Morwen defends with three dice where she has three armies', () => {
		const s = withWarlord(table(2, { icewind: [0, 6], wolfden: [1, 3] }), 1, 'morwen');
		const r = applyConquest(s, 0, { type: 'attack', from: T('icewind'), to: T('wolfden') });
		if (!r.ok) throw new Error(r.error);
		expect(of(r.events, 'battle')[0].defend).toHaveLength(3);
	});

	it('Ysra faces one die across a sea lane, two by land', () => {
		const s = withWarlord(table(2, { icewind: [0, 6], owlhollow: [1, 3], wolfden: [1, 3] }), 0, 'ysra');
		const sea = applyConquest(s, 0, { type: 'attack', from: T('icewind'), to: T('owlhollow') });
		const land = applyConquest(s, 0, { type: 'attack', from: T('icewind'), to: T('wolfden') });
		if (!sea.ok || !land.ok) throw new Error('attack failed');
		expect(of(sea.events, 'battle')[0].defend).toHaveLength(1);
		expect(of(land.events, 'battle')[0].defend).toHaveLength(2);
	});

	it('Rowan makes attackers into her woods roll two dice at most', () => {
		// Wolfden is taiga.
		const s = withWarlord(table(2, { icewind: [0, 6], wolfden: [1, 3] }), 1, 'rowan');
		const r = applyConquest(s, 0, { type: 'attack', from: T('icewind'), to: T('wolfden'), dice: 3 });
		if (!r.ok) throw new Error(r.error);
		expect(of(r.events, 'battle')[0].attack).toHaveLength(2);
	});

	it('Tobin trades sets for three more', () => {
		const s = withWarlord(table(2, {}), 0, 'tobin');
		const set: ConquestCard[] = [0, 1, 2].map((i) => ({ id: i, territory: null, symbol: 'knight' }));
		expect(setValue(s, set, 0)).toBe(setValue(s, set, 1) + 3);
	});

	it('Dunstan gets an army for every two mountains and hills, Gorm one after losing three territories', () => {
		const high = { highwatch: [0, 1], stonehelm: [0, 1], grimcrag: [0, 1], anvilpass: [0, 1] } as Record<string, [number, number]>;
		const s = withWarlord(table(2, high), 0, 'dunstan');
		expect(reinforcementsFor(s, 0).extra).toEqual([{ source: 'warlord', armies: 2 }]);
		const g = withWarlord(table(2, { icewind: [0, 1] }), 0, 'gorm');
		g.lostSince[0] = 2;
		expect(reinforcementsFor(g, 0).extra).toEqual([]);
		g.lostSince[0] = 30;
		expect(reinforcementsFor(g, 0).extra).toEqual([{ source: 'warlord', armies: 1 }]);
	});

	it('Brannoc plunders an army more into the first territory he takes each turn', () => {
		const s = withWarlord(table(2, { icewind: [0, 2], wolfden: [1, 1] }), 0, 'brannoc');
		const r = rigged(s, 0, { type: 'attack', from: T('icewind'), to: T('wolfden') }, ([b]) => b.defenderLoss === 1);
		expect(r.state.armies[T('wolfden')]).toBe(2);
		// A second territory the same turn: no more plunder.
		const again = withWarlord(table(2, { icewind: [0, 2], wolfden: [1, 1] }), 0, 'brannoc');
		again.conquered = true;
		const r2 = rigged(again, 0, { type: 'attack', from: T('icewind'), to: T('wolfden') }, ([b]) => b.defenderLoss === 1);
		expect(r2.state.armies[T('wolfden')]).toBe(1);
	});

	it('Kael fortifies twice', () => {
		let s = withWarlord(table(2, { icewind: [0, 5], wolfden: [0, 1], rimeholt: [0, 1] }), 0, 'kael');
		s = act(s, 0, { type: 'fortify', from: T('icewind'), to: T('wolfden'), count: 1 });
		expect(s.current).toBe(0);
		s = act(s, 0, { type: 'fortify', from: T('icewind'), to: T('rimeholt'), count: 1 });
		expect(s.current).toBe(1);
	});

	it('Vey sees through the fog of war', () => {
		const s = table(3, { icewind: [0, 5] }, { fog: true });
		expect(conquestView(s, 0).armies[T('sunspire')]).toBe(-1);
		withWarlord(s, 0, 'vey');
		expect(conquestView(s, 0).armies[T('sunspire')]).toBe(1);
	});
});

describe('omens', () => {
	it('are drawn as each round from the second begins', () => {
		let s = createConquest(seats(2), 5, settings({ omens: 'wild', deploy: 'random' }));
		expect(s.omens!.current).toBeNull();
		s.step = 'fortify';
		s.reserve.fill(0);
		s = act(s, 0, { type: 'endTurn' });
		expect(s.omens!.current).toBeNull();
		const r = applyConquest({ ...s, step: 'fortify', reserve: s.reserve.map(() => 0), mustTrade: false }, 1, { type: 'endTurn' });
		if (!r.ok) throw new Error(r.error);
		expect(r.state.round).toBe(2);
		expect(of(r.events, 'omen')).toEqual([expect.objectContaining({ round: 2, omen: r.state.omens!.current })]);
	});

	it('leave the calamities out of a gentle deck', () => {
		const s = createConquest(seats(3), 5, settings({ omens: 'gentle' }));
		expect(s.omens!.pool.every((o) => OMEN_INFO[o].tone !== 'calamity')).toBe(true);
		expect(createConquest(seats(3), 5, settings({ omens: 'wild' })).omens!.pool).toContain('dragon');
		expect(createConquest(seats(3), 5, settings()).omens).toBeNull();
	});

	it('bless, double and hire armies', () => {
		const s = table(2, { icewind: [0, 1], wolfden: [0, 1], rimeholt: [0, 1], hoarfell: [0, 1], frostgate: [0, 1], snowmere: [0, 1] });
		const plain = reinforcementsFor(s, 0).total;
		expect(reinforcementsFor(withOmen(structuredClone(s), 'harvestMoon'), 0).total).toBe(plain + 2);
		expect(reinforcementsFor(withOmen(structuredClone(s), 'musterBells'), 0).total).toBe(plain + 3);
		expect(reinforcementsFor(withOmen(structuredClone(s), 'mercenaries', { target: 0 }), 0).total).toBe(plain + 5);
		expect(reinforcementsFor(withOmen(structuredClone(s), 'mercenaries', { target: 1 }), 0).total).toBe(plain);
	});

	it('shield the smallest realm, a snowed-in region and the sea lanes from attack', () => {
		const s = table(3, { icewind: [0, 6], wolfden: [2, 1], owlhollow: [1, 1] });
		expect(attackTargets(withOmen(structuredClone(s), 'truce', { target: 2 }), T('icewind'))).toEqual([T('owlhollow')]);
		expect(attackTargets(withOmen(structuredClone(s), 'seaFog'), T('icewind'))).toEqual([T('wolfden')]);
		expect(attackTargets(withOmen(structuredClone(s), 'snowbound', { region: R('frostmarch') }), T('icewind'))).toEqual([T('owlhollow')]);
		expect(error(withOmen(structuredClone(s), 'seaFog'), 0, { type: 'attack', from: T('icewind'), to: T('owlhollow') })).toBe(
			'Sea Fog: nobody may cross a sea lane this round.'
		);
	});

	it('turn ties to the attacker, and stop all fortifying', () => {
		const s = withOmen(table(2, { icewind: [0, 5], wolfden: [1, 1], owlhollow: [0, 1] }), 'bloodMoon');
		const r = rigged(s, 0, { type: 'attack', from: T('icewind'), to: T('wolfden'), dice: 1 }, ([b]) => b.attack[0] === b.defend[0]);
		expect(of(r.events, 'battle')[0]).toMatchObject({ defenderLoss: 1, tiesToAttacker: 3 });
		const f = withOmen(table(2, { icewind: [0, 5], owlhollow: [0, 1] }), 'floods');
		expect(fortifyTargets(f, T('icewind'))).toEqual([]);
		expect(error(f, 0, { type: 'fortify', from: T('icewind'), to: T('owlhollow'), count: 1 })).toBe('Floods: nobody may fortify this round.');
	});

	it('strike with plague and dragon fire as they are drawn', () => {
		for (const [omen, check] of [
			['plague', (s: CqState) => expect([s.armies[T('icewind')], s.armies[T('wolfden')]]).toEqual([16, 9])],
			['dragon', (s: CqState) => expect(s.armies[T('icewind')]).toBe(10)]
		] as const) {
			let s = table(2, { icewind: [0, 20], wolfden: [1, 9] }, { omens: 'wild' });
			s.omens!.deck = [omen];
			s.current = 1;
			s.step = 'fortify';
			const r = applyConquest(s, 1, { type: 'endTurn' });
			if (!r.ok) throw new Error(r.error);
			s = r.state;
			expect(of(r.events, 'omenStruck')).toHaveLength(1);
			check(s);
		}
	});
});

describe('the fog of war', () => {
	it('hides the armies a player has no territory next to, and what happens there', () => {
		const s = table(3, { icewind: [0, 5], wolfden: [2, 4] }, { fog: true });
		const v = conquestView(s, 0);
		expect(v.fogged).toBe(true);
		expect(v.armies[T('icewind')]).toBe(5);
		expect(v.armies[T('wolfden')]).toBe(4);
		expect(v.armies[T('owlhollow')]).toBe(1);
		expect(v.armies[T('sunspire')]).toBe(-1);
		// Owners stay in plain sight.
		expect(v.owner).toEqual(s.owner);
		s.log.push({ seq: 999, type: 'placed', player: 1, territory: T('sunspire'), count: 3 });
		expect(conquestView(s, 0).log.some((e) => e.seq === 999)).toBe(false);
		expect(conquestView(s, 1).log.some((e) => e.seq === 999)).toBe(true);
	});

	it('lifts for spectators, the knocked out, and everyone once the war is over', () => {
		const s = table(3, { icewind: [0, 5] }, { fog: true });
		expect(conquestView(s, -1).fogged).toBe(false);
		expect(conquestView({ ...s, phase: 'ended' }, 0).fogged).toBe(false);
		s.players[0].out = true;
		expect(conquestView(s, 0).fogged).toBe(false);
	});

	it('is no fog at all unless the table plays with it', () => {
		expect(conquestView(table(3, { icewind: [0, 5] }), 0).fogged).toBe(false);
	});
});

describe('bots in a war with every rule', () => {
	it.each([
		{ fog: true, warlords: true, omens: 'wild' as const, fortify: 'free' as const, cards: 'none' as const },
		{ warlords: true, omens: 'gentle' as const, fortify: 'adjacent' as const, start: 'fewer' as const, tradeAt: 4 },
		{ fog: true, map: 'random' as const, world: { territories: 30, shape: 'archipelago' as const, regions: 5, lanes: 'many' as const, climate: 'verdant' as const, seed: 9 } },
		{ warlords: true, omens: 'wild' as const, victory: 'missions' as const, map: 'random' as const, world: { territories: 48, shape: 'ring' as const, regions: 8, lanes: 'some' as const, climate: 'mixed' as const, seed: 3 } }
	])('finish it: %o', (o) => {
		for (const n of [3, 5]) {
			let s = createConquest(seats(n, true), n * 13, settings({ deploy: 'random', ...o }));
			let actions = 0;
			while (s.phase !== 'ended' && actions < 20000) {
				const seat = s.phase === 'draft' ? s.draft!.order[s.draft!.picked] : s.phase === 'deploy' ? s.reserve.findIndex((r) => r > 0) : s.current;
				const a = conquestBot(conquestView(s, seat));
				if (!a) throw new Error(`seat ${seat} had nothing to do in ${s.phase}`);
				const r = applyConquest(s, seat, a);
				if (!r.ok) throw new Error(`bot ${seat} ${JSON.stringify(a)}: ${r.error}`);
				s = r.state;
				actions++;
			}
			expect(s.phase).toBe('ended');
			expect(s.armies.every((a) => a >= 1)).toBe(true);
		}
	});
});
