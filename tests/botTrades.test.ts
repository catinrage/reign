import { describe, expect, it } from 'vitest';
import { botAction, closeOffer } from '../src/shared/rules/bot';
import { BANK_PER_RESOURCE, RESOURCES, type ResourceCounts } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import { settlementSpots } from '../src/shared/rules/queries';
import type { Action, GameEvent, GameState } from '../src/shared/rules/types';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (n: number) =>
	COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true }));
const NONE = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

/**
 * A Classic game past its setup, at the start of the current player's main step, holding `hand`
 * (the others hold a few cards each). Its roads don't reach a corner to settle yet, so a city is
 * the one building it can save up for.
 */
function botWith(hand: Partial<ResourceCounts>): GameState {
	let s = createGame(players(3), 7);
	while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
	s = structuredClone(s);
	s.step = 'main';
	s.players.forEach(
		(p, i) => (p.resources = i === s.current ? { ...NONE, ...hand } : { ...NONE, ore: 2, wheat: 1 })
	);
	for (const r of RESOURCES)
		s.bank[r] = BANK_PER_RESOURCE - s.players.reduce((n, p) => n + p.resources[r], 0);
	s.log.push({
		type: 'turnStarted',
		player: s.current,
		turn: s.turn,
		seq: s.nextEventSeq++
	} as GameEvent);
	expect(settlementSpots(s, s.current, false)).toEqual([]);
	return s;
}

describe('bot trade offers', () => {
	it('ask the table for the card a city lacks, one for one, from their biggest stack', () => {
		// One Ore short of a city, with Wood and Sheep to spare (and too few of either for the bank).
		const s = botWith({ wheat: 2, ore: 2, wood: 2, sheep: 1 });
		expect(botAction(s, s.current)).toEqual({
			type: 'offerTrade',
			give: { wood: 1 },
			want: { ore: 1 }
		});
	});

	it('ask for two cards at most, two for two', () => {
		const s = botWith({ wheat: 2, ore: 1, wood: 3 });
		expect(botAction(s, s.current)).toEqual({
			type: 'offerTrade',
			give: { wood: 2 },
			want: { ore: 2 }
		});
		// Three short is too far to trade for.
		const far = botWith({ wheat: 2, wood: 3 });
		expect(botAction(far, far.current)).toEqual({ type: 'endTurn' });
	});

	it('make one offer a turn, then go to the bank', () => {
		let s = botWith({ wheat: 2, ore: 2, wood: 5 });
		const me = s.current;
		const offer = botAction(s, me)!;
		expect(offer.type).toBe('offerTrade');
		s = act(s, me, offer);
		// Waits for everyone to answer.
		expect(botAction(s, me)).toBeNull();
		for (const p of [1, 2].map((d) => (me + d) % 3))
			s = act(s, p, { type: 'respondTrade', offerId: s.trade!.id, accept: false });
		expect(botAction(s, me)).toEqual({ type: 'cancelTrade' });
		s = act(s, me, { type: 'cancelTrade' });
		expect(botAction(s, me)).toMatchObject({ type: 'bankTrade', get: 'ore' });
	});

	it("don't offer for a development card", () => {
		// One Sheep short of a card, with nothing within two cards of a building.
		const s = botWith({ wheat: 1, ore: 1, wood: 1 });
		expect(botAction(s, s.current)).toEqual({ type: 'endTurn' });
	});

	it("don't offer when nobody else has a card", () => {
		const s = botWith({ wheat: 2, ore: 2, wood: 2 });
		s.players.forEach((p, i) => i !== s.current && (p.resources = { ...NONE }));
		expect(botAction(s, s.current)?.type).not.toBe('offerTrade');
	});

	it('trade with whoever accepted with the fewest points, never someone close to winning', () => {
		let s = botWith({ wheat: 2, ore: 2, wood: 2 });
		const me = s.current;
		const [a, b] = [1, 2].map((d) => (me + d) % 3);
		s = act(s, me, botAction(s, me)!);
		const id = s.trade!.id;
		s = act(s, a, { type: 'respondTrade', offerId: id, accept: true });
		s = act(s, b, { type: 'respondTrade', offerId: id, accept: true });
		// Each has two settlements; the Largest Army puts one two points ahead.
		s.largestArmyHolder = a;
		expect(botAction(s, me)).toEqual({ type: 'confirmTrade', offerId: id, with: b });
		s.largestArmyHolder = b;
		expect(botAction(s, me)).toEqual({ type: 'confirmTrade', offerId: id, with: a });
		// Two points from the goal is too close.
		s.pointsToWin = 6;
		expect(closeOffer(s, me)).toEqual({ type: 'confirmTrade', offerId: id, with: a });
		s.pointsToWin = 4;
		expect(closeOffer(s, me)).toEqual({ type: 'cancelTrade' });
	});
});
