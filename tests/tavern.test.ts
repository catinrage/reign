import { describe, expect, it } from 'vitest';
import { botAction } from '../src/shared/rules/bot';
import { allBuildings } from '../src/shared/rules/buildings';
import { BANK_PER_RESOURCE, RESOURCES, totalResources, type ResourceCounts } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import { chooseEvent, nextFlip, rumorFor, startRound, topUp, type EventCard } from '../src/shared/rules/events';
import type { GameSettings } from '../src/shared/rules/modes';
import { builtKey, discardLimit, playersOnHex, tavernOf, tavernSpots, tradeRatios } from '../src/shared/rules/queries';
import type { Action, GameEvent, GameState } from '../src/shared/rules/types';
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
const NONE = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };

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

/** The first building player `p` has. */
const home = (s: GameState, p: number) => s.buildings.findIndex((b) => b?.owner === p);

/** Player `p` with a tavern on their first building (set straight on the state). */
function withTavern(s: GameState, p: number): GameState {
	const t = structuredClone(s);
	t.taverns[home(t, p)] = true;
	topUp(t);
	return t;
}

/** Start a new round on a copy of the state, the way the engine does: the cards it drew, in order. */
function nextRound(s: GameState): { s: GameState; drawn: EventCard[] } {
	const t = structuredClone(s);
	t.turn += t.players.length;
	const drawn: EventCard[] = [];
	const emit = (e: GameEvent) => {
		if (e.type === 'eventDrawn') drawn.push(e.card);
	};
	startRound(t, emit as never);
	return { s: t, drawn };
}

describe('taverns', () => {
	it('are not in Classic, nor without the Events deck, nor when the host turns them off', () => {
		for (const settings of [
			{ mode: 'classic' as const },
			extended({ events: { on: false, every: 1, wild: true, pulled: [] } }),
			extended({ buildings: { ...allBuildings(), tavern: false } })
		]) {
			const s = midGame(settings);
			const p = s.current;
			expect(s.buildingRules.tavern).toBe(false);
			expect(tavernSpots(s, p)).toEqual([]);
			expect(error(s, p, { type: 'buildTavern', vertex: home(s, p) })).toBe('Taverns are not part of this game.');
		}
		// The switch stays on when the game has the deck.
		expect(midGame(extended()).buildingRules.tavern).toBe(true);
	});

	it('go onto your own settlement or city for a Lumber and a Grain, one each', () => {
		const s = midGame(extended());
		const p = s.current;
		const other = home(s, (p + 1) % 3);
		expect(error(s, p, { type: 'buildTavern', vertex: other })).toBe('Pick one of your own settlements or cities.');
		const v = home(s, p);
		const t = act(s, p, { type: 'buildTavern', vertex: v });
		expect(t.taverns[v]).toBe(true);
		expect(tavernOf(t, p)).toBe(v);
		expect(t.players[p].resources).toEqual({ ...RICH, wood: 8, wheat: 8 });
		expect(t.builtTurns[builtKey('tavern', v)]).toBe(t.turn);
		expect(t.log.at(-1)).toMatchObject({ type: 'built', kind: 'tavern', at: v, player: p });
		expect(tavernSpots(t, p)).toEqual([]);
		const second = t.buildings.findIndex((b, i) => b?.owner === p && i !== v);
		expect(error(t, p, { type: 'buildTavern', vertex: second })).toBe('You already have a tavern.');
		// It shares its building with a storehouse.
		expect(act(t, p, { type: 'buildStorehouse', vertex: v }).storehouses[v]).toBe(true);
	});

	it("can't be built without the cards, before the roll or on someone else's turn", () => {
		const s = midGame(extended());
		const p = s.current;
		const v = home(s, p);
		const poor = structuredClone(s);
		poor.players[p].resources = { ...NONE, wood: 1 };
		expect(error(poor, p, { type: 'buildTavern', vertex: v })).toBeTruthy();
		const early = structuredClone(s);
		early.step = 'roll';
		expect(error(early, p, { type: 'buildTavern', vertex: v })).toBeTruthy();
		const q = (p + 1) % 3;
		expect(error(s, q, { type: 'buildTavern', vertex: home(s, q) })).toBeTruthy();
	});

	/** A game where the current player has just built a tavern on their first building. */
	function built() {
		const g = midGame(extended());
		const p = g.current;
		return { s: act(g, p, { type: 'buildTavern', vertex: home(g, p) }), p, q: (p + 1) % 3, v: home(g, p) };
	}

	it('let only their owner hear the rumor of the next card', () => {
		const { s, p, q } = built();
		const top = s.events!.deck.at(-1)!;
		expect(rumorFor(s, p)).toBe(top);
		expect(viewFor(s, p).events!.rumor).toBe(top);
		expect(viewFor(s, q).events!.rumor).toBeNull();
		expect(viewFor(s, -1).events!.rumor).toBeNull();
		expect(rumorFor(s, q)).toBeNull();
	});

	it('hear true: the rumored card is the one that turns over, round after round', () => {
		let s = withTavern(midGame(extended()), 0);
		let decrees = 0;
		// Round after round through several deals of the deck, a Royal Decree's choice included.
		for (let round = 0; round < 60; round++) {
			const rumor = rumorFor(s, 0);
			expect(rumor).not.toBeNull();
			const next = nextRound(s);
			expect(next.drawn[0]).toBe(rumor);
			s = next.s;
			const choice = s.events!.choice;
			if (choice) {
				decrees++;
				// The three cards to choose from are out of the deck, and stay out of it.
				for (const c of choice.cards) expect(s.events!.deck).not.toContain(c);
				const r = structuredClone(s);
				expect(chooseEvent(r, () => {}, choice.player, choice.cards[0])).toBeNull();
				s = r;
				// The two not picked went back under, and no card is in the deck twice.
				expect(new Set(s.events!.deck).size).toBe(s.events!.deck.length);
			}
			// The deck is never left empty while someone has a tavern.
			expect(s.events!.deck.length).toBeGreaterThan(0);
		}
		expect(decrees).toBeGreaterThan(0);
	});

	it('leave the deck to be dealt when it is needed in games without one', () => {
		const s = structuredClone(midGame(extended()));
		s.events!.deck = ['comet'];
		const plain = nextRound(s);
		expect(plain.drawn).toEqual(['comet']);
		expect(plain.s.events!.deck).toEqual([]);
		const heard = nextRound(withTavern(s, 0));
		expect(heard.drawn).toEqual(['comet']);
		expect(heard.s.events!.deck.length).toBe(heard.s.events!.pool.length);
	});

	it('say when the next card turns over in a deck that flips every other round', () => {
		expect(nextFlip(1, 1)).toBe(2);
		expect(nextFlip(1, 2)).toBe(3);
		expect(nextFlip(2, 2)).toBe(3);
	});

	it('show on the building: when the tavern went up, and its rumor to its owner alone', () => {
		const { s, p, q, v } = built();
		const mine = pieceTip(viewFor(s, p), { place: 'vertex', at: v })!;
		expect(mine.text).toContain(`Tavern added on turn ${s.turn}`);
		expect(mine.text).toContain('Rumor: the next event is');
		const theirs = pieceTip(viewFor(s, q), { place: 'vertex', at: v })!;
		expect(theirs.text).toContain(`Tavern added on turn ${s.turn}`);
		expect(theirs.text).not.toContain('Rumor');
	});
});

describe('bots and taverns', () => {
	/**
	 * A bot in its main step holding `hand`, with every building but the tavern switched off, and its
	 * trade offer for the turn already made and turned down.
	 */
	function botWith(hand: Partial<ResourceCounts>, tavern = false): GameState {
		const s = structuredClone(midGame(extended({ buildings: { ...allBuildings(false), tavern: true } })));
		s.players[s.current].resources = { ...NONE, ...hand };
		settle(s);
		const offer = { id: 1, from: s.current, give: { wood: 1 }, want: { ore: 1 }, responses: {} };
		s.log.push({ type: 'tradeOffered', offer, seq: s.nextEventSeq++ } as GameEvent);
		return tavern ? withTavern(s, s.current) : s;
	}

	it('build one with a hand at the limit, once there is nothing better to do', () => {
		// Two cards or more short of everything else, so there's nothing to build or trade for.
		const full = botWith({ wood: 4, wheat: 3 });
		const me = full.current;
		expect(totalResources(full.players[me].resources)).toBeGreaterThanOrEqual(discardLimit(full, me));
		expect(botAction(full, me)).toMatchObject({ type: 'buildTavern' });
		// With fewer cards it keeps them.
		const small = botWith({ wood: 3, wheat: 3 });
		expect(botAction(small, small.current)).toEqual({ type: 'endTurn' });
	});

	it('play a knight to be the Tournament champion they heard of', () => {
		const s = botWith({ sheep: 1 }, true);
		const me = s.current;
		s.players[me].devCards = [{ type: 'knight', boughtTurn: s.turn - 1 }];
		s.devCardPlayedThisTurn = false;
		// The robber away from its buildings, so it has no reason of its own to play the knight.
		s.robberHex = s.board.hexes.findIndex((_, h) => !playersOnHex(s, h).includes(me));
		s.events!.deck.push('tournament');
		expect(botAction(s, me)).toEqual({ type: 'playKnight' });
		// Without the rumor, its knight waits for the robber.
		const deaf = structuredClone(s);
		deaf.taverns = deaf.taverns.map(() => false);
		expect(botAction(deaf, me)).not.toEqual({ type: 'playKnight' });
	});

	it('hold off a 4:1 trade with a Traveling Fair on its way', () => {
		// One Ore short of a city, with four cards of a kind it has no 2:1 harbor for to trade.
		const probe = botWith({}, true);
		const give = (['wood', 'brick'] as const).find((r) => tradeRatios(probe, probe.current)[r] > 2)!;
		const s = structuredClone(probe);
		const me = s.current;
		s.players[me].resources = { ...NONE, [give]: 4, wheat: 2, ore: 2 };
		settle(s);
		s.buildingRules.tavern = false;
		s.events!.deck.push('travelingFair');
		expect(botAction(s, me)).toEqual({ type: 'endTurn' });
		const deaf = structuredClone(s);
		deaf.taverns = deaf.taverns.map(() => false);
		expect(botAction(deaf, me)).toMatchObject({ type: 'bankTrade', give, get: 'ore' });
	});

	it('take all of it in their stride and still finish their games, every rumor coming true', () => {
		let built = 0;
		let heard = 0;
		for (let seed = 1; seed <= 6; seed++) {
			let s = createGame(players(4), seed * 131, undefined, extended());
			// Each move as the server makes it: a round its end of turn starts turns over the card the
			// taverns heard of just before.
			const play = (p: number, a: Action) => {
				const owner = s.players.findIndex((_, q) => tavernOf(s, q) !== null);
				const rumor = owner >= 0 ? rumorFor(s, owner) : null;
				const seq = s.log.at(-1)?.seq ?? 0;
				s = act(s, p, a);
				for (const e of s.log) {
					if (e.seq <= seq || e.type !== 'eventDrawn' || e.by !== undefined || !rumor) continue;
					expect(e.card).toBe(rumor);
					heard++;
				}
			};
			for (let steps = 0; s.phase !== 'ended' && steps < 30000; steps++) {
				let moved = false;
				for (let p = 0; p < 4 && !moved; p++) {
					if (p === s.current) continue;
					const a = botAction(s, p);
					if (a) {
						play(p, a);
						moved = true;
					}
				}
				if (moved) continue;
				play(s.current, botAction(s, s.current)!);
			}
			expect(s.phase).toBe('ended');
			built += s.taverns.filter(Boolean).length;
		}
		expect(built).toBeGreaterThan(0);
		expect(heard).toBeGreaterThan(10);
	});
});
