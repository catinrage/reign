import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { Room } from '../src/server/room';
import { getTopology } from '../src/shared/board/topology';
import type { ServerMessage } from '../src/shared/protocol';
import { botAction } from '../src/shared/rules/bot';
import { allBuildings } from '../src/shared/rules/buildings';
import { applyCheat } from '../src/shared/rules/cheats';
import { BANK_PER_RESOURCE, RESOURCES, TERRAIN_RESOURCE, totalResources } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import {
	DEFAULT_EVENT_RULES,
	EVENT_CARDS,
	EVENT_INFO,
	NO_EVENTS,
	busiestTile,
	cleanEventRules,
	eventPool,
	lastPlace,
	type EventCard,
	type EventRules
} from '../src/shared/rules/events';
import type { GameSettings } from '../src/shared/rules/modes';
import { playersOnHex, tradeRatios } from '../src/shared/rules/queries';
import type { Action, GameEvent, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (n: number) => COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));
const extended = (events: Partial<EventRules> = {}, more: Partial<GameSettings> = {}): Partial<GameSettings> => ({
	mode: 'extended',
	map: { preset: 'great' },
	characters: false,
	buildings: allBuildings(false),
	events: { ...DEFAULT_EVENT_RULES, ...events },
	...more
});
const RICH = { wood: 3, brick: 3, sheep: 3, wheat: 3, ore: 3 };

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

function error(s: GameState, p: number, a: Action): string | undefined {
	const r = applyAction(s, p, a);
	return r.ok ? undefined : r.error;
}

const setups = new Map<string, GameState>();
/**
 * Bots play the setup; the game then stands at the first roll of round 1. Bots break ties at
 * random, so each setup is played once and handed out again, for tests that compare two games.
 */
function afterSetup(settings: Partial<GameSettings>, n = 3, seed = 7): GameState {
	const key = JSON.stringify([settings, n, seed]);
	let s = setups.get(key);
	if (!s) {
		s = createGame(players(n), seed, undefined, settings);
		while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
		setups.set(key, s);
	}
	return s;
}

/** A game at a roll with everyone holding a few cards and the given card flipped by the dev cheat. */
function withEvent(card: EventCard, n = 3, seed = 7): GameState {
	let s = afterSetup(extended(), n, seed);
	s = structuredClone(s);
	if (s.step === 'eventChoice') {
		s.events!.choice = null;
		s.step = 'roll';
	}
	for (const p of s.players) p.resources = { ...RICH };
	for (const r of RESOURCES) s.bank[r] = BANK_PER_RESOURCE - n * 3;
	const res = applyCheat(s, 0, { type: 'event', card });
	if (!res.ok) throw new Error(res.error);
	return res.state;
}

/** Roll for the current player with the dice coming up `total`. */
function rollTotal(s: GameState, total: number): GameState {
	const cheat = applyCheat(s, s.current, { type: 'rigDice', total });
	if (!cheat.ok) throw new Error(cheat.error);
	return act(cheat.state, cheat.state.current, { type: 'rollDice' });
}

/** The newest event of a kind in a log. */
function lastOf<T extends GameEvent['type']>(log: GameEvent[], type: T): Extract<GameEvent, { type: T }> | undefined {
	for (let i = log.length - 1; i >= 0; i--) if (log[i].type === type) return log[i] as Extract<GameEvent, { type: T }>;
	return undefined;
}

function cardsHeld(s: GameState) {
	return s.players.map((p) => totalResources(p.resources));
}

function bankAndHands(s: GameState) {
	return RESOURCES.map((r) => s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0));
}

describe('the Events deck', () => {
	it('Classic never has one', () => {
		const s = afterSetup({ mode: 'classic', events: DEFAULT_EVENT_RULES });
		expect(s.events).toBeNull();
		expect(s.log.some((e) => e.type === 'eventDrawn')).toBe(false);
	});

	it('Reign Extended flips a card as the first round starts, from a deck of every card', () => {
		const s = afterSetup(extended());
		expect(s.events!.pool).toEqual([...EVENT_CARDS]);
		const drawn = s.log.filter((e) => e.type === 'eventDrawn');
		expect(drawn).toHaveLength(1);
		expect(drawn[0]).toMatchObject({ round: 1 });
		expect(s.events!.deck).toHaveLength(EVENT_CARDS.length - 1 - (s.events!.choice ? s.events!.choice.cards.length : 0));
	});

	it('leaves the island and the dice as they were (its deck has a seed of its own)', () => {
		const a = createGame(players(3), 11, undefined, extended());
		const b = createGame(players(3), 11, undefined, extended({ on: false }));
		expect(b.events).toBeNull();
		expect(a.board).toEqual(b.board);
		expect(a.rng).toBe(b.rng);
	});

	it('keeps harsh cards out of a gentle deck, and the cards the host pulled', () => {
		const gentle = eventPool({ ...DEFAULT_EVENT_RULES, wild: false });
		expect(gentle.length).toBeGreaterThan(0);
		for (const c of gentle) expect(['good', 'catchUp', 'chaos']).toContain(EVENT_INFO[c].tone);
		expect(gentle).not.toContain('tournament');
		expect(eventPool({ ...DEFAULT_EVENT_RULES, pulled: ['comet', 'earthquake'] })).not.toContain('comet');
		expect(eventPool(NO_EVENTS)).toEqual([]);
		// Pulling every card leaves no deck at all.
		expect(createGame(players(2), 1, undefined, extended({ pulled: [...EVENT_CARDS] })).events).toBeNull();
	});

	it('cleans up rules from the lobby', () => {
		expect(cleanEventRules(undefined)).toEqual(DEFAULT_EVENT_RULES);
		expect(cleanEventRules({ on: false, every: 3, wild: 'no', pulled: ['comet', 'dragon', 5] })).toEqual({
			on: false,
			every: 1,
			wild: true,
			pulled: ['comet']
		});
		expect(cleanEventRules({ every: 2 }).every).toBe(2);
	});

	it('flips once a round, or every other round, and the card lasts only its round', () => {
		for (const every of [1, 2] as const) {
			let s = afterSetup(extended({ every, pulled: EVENT_CARDS.filter((c) => c !== 'stormAtSea') }));
			expect(s.events!.current).toBe('stormAtSea');
			const n = s.players.length;
			const flips: number[] = [];
			const atRoundStart: (string | null)[] = [];
			for (let guard = 0; s.turn <= 4 * n && guard < 5000; guard++) {
				const others = [...Array(n).keys()].filter((p) => p !== s.current);
				const p = others.find((i) => botAction(s, i)) ?? s.current;
				const before = s.nextEventSeq;
				s = act(s, p, botAction(s, p, 99)!);
				for (const e of s.log) if (e.seq >= before && e.type === 'eventDrawn') flips.push(e.round);
				if (s.log.some((e) => e.seq >= before && e.type === 'turnStarted' && e.player === 0)) atRoundStart.push(s.events!.current);
			}
			expect(flips).toEqual(every === 1 ? [2, 3, 4, 5] : [3, 5]);
			expect(atRoundStart).toEqual(every === 1 ? Array(4).fill('stormAtSea') : [null, 'stormAtSea', null, 'stormAtSea']);
		}
	});
});

describe('event cards', () => {
	it('Harvest Festival: fields pay double', () => {
		let s = withEvent('harvestFestival');
		const fields = s.board.hexes.findIndex((h, i) => h.terrain === 'fields' && i !== s.robberHex && playersOnHex(s, i).length);
		const before = cardsHeld(s);
		s = rollTotal(s, s.board.hexes[fields].number!);
		const produced = lastOf(s.log, 'produced');
		expect(produced?.type).toBe('produced');
		if (produced?.type !== 'produced') return;
		for (const g of produced.gains) if (g.resource === 'wheat' && !g.workshop) expect(g.amount % 2).toBe(0);
		expect(cardsHeld(s).some((n, i) => n > before[i])).toBe(true);
	});

	it('Comet: the next roll pays twice, then no more', () => {
		let s = withEvent('comet');
		expect(s.events!.comet).toBe(true);
		const hex = s.board.hexes.findIndex((h, i) => TERRAIN_RESOURCE[h.terrain] && h.number !== 7 && i !== s.robberHex && playersOnHex(s, i).length);
		s = rollTotal(s, s.board.hexes[hex].number!);
		const produced = lastOf(s.log, 'produced');
		if (produced?.type !== 'produced') throw new Error('nothing produced');
		for (const g of produced.gains) expect(g.amount % 2).toBe(0);
		expect(s.events!.comet).toBe(false);
	});

	it('Traveling Fair and Storm at Sea bend every bank rate', () => {
		const fair = withEvent('travelingFair');
		expect(Object.values(tradeRatios(fair, 0))).toEqual([2, 2, 2, 2, 2]);
		const storm = withEvent('stormAtSea');
		const p = storm.buildings.findIndex((b, v) => b && getTopology(storm.board).vertices[v].port);
		const owner = p >= 0 ? storm.buildings[p]!.owner : 0;
		expect(Object.values(tradeRatios(storm, owner))).toEqual([4, 4, 4, 4, 4]);
	});

	it('Migrating Herds: pastures pay on a 7', () => {
		let s = withEvent('migratingHerds');
		s = rollTotal(s, 7);
		const produced = lastOf(s.log, 'produced');
		expect(produced?.type).toBe('produced');
		if (produced?.type === 'produced') for (const g of produced.gains) expect(g.resource).toBe('sheep');
	});

	it('Bountiful Year: everyone takes one resource of their choice, once', () => {
		let s = withEvent('bountifulYear');
		expect(s.events!.bounty).toEqual([0, 1, 2]);
		const ore = s.players[2].resources.ore;
		s = act(s, 2, { type: 'claimBounty', resource: 'ore' });
		expect(s.players[2].resources.ore).toBe(ore + 1);
		expect(error(s, 2, { type: 'claimBounty', resource: 'ore' })).toBe('You have nothing to take.');
		expect(s.events!.bounty).toEqual([0, 1]);
	});

	it('Royal Wedding: everyone gives a card to the player in last place', () => {
		const before = withEvent('comet');
		const last = lastPlace(before);
		const s = withEvent('royalWedding');
		const held = cardsHeld(s);
		expect(held[last]).toBe(15 + 2);
		expect(held.reduce((a, b) => a + b, 0)).toBe(45);
	});

	it('Tournament: the one knight champion takes a card from everyone', () => {
		let s = afterSetup(extended());
		s = structuredClone(s);
		s.events!.choice = null;
		s.step = 'roll';
		for (const p of s.players) p.resources = { ...RICH };
		s.players[1].knightsPlayed = 2;
		const res = applyCheat(s, 0, { type: 'event', card: 'tournament' });
		if (!res.ok) throw new Error(res.error);
		expect(cardsHeld(res.state)).toEqual([14, 17, 14]);
		// A tie: nobody pays.
		s.players[2].knightsPlayed = 2;
		const tie = applyCheat(s, 0, { type: 'event', card: 'tournament' });
		if (!tie.ok) throw new Error(tie.error);
		expect(cardsHeld(tie.state)).toEqual([15, 15, 15]);
	});

	it('Plague of Rats and the Tax Collector take cards to the bank', () => {
		const plague = withEvent('plagueOfRats');
		expect(cardsHeld(plague)).toEqual([14, 14, 14]);
		const s = withEvent('taxCollector');
		const cities = s.players.map((_, i) => s.buildings.filter((b) => b?.owner === i && b.kind === 'city').length);
		expect(cardsHeld(s)).toEqual(cities.map((c) => 15 - c));
		expect(bankAndHands(plague)).toEqual(bankAndHands(s));
	});

	it('Bandit Uprising: the robber jumps to the busiest tile and robs everyone there', () => {
		const before = withEvent('comet');
		const hex = busiestTile(before)!;
		const s = withEvent('banditUprising');
		expect(s.robberHex).toBe(hex);
		const around = playersOnHex(s, hex);
		cardsHeld(s).forEach((n, i) => expect(n).toBe(around.includes(i) ? 14 : 15));
	});

	it('Earthquake: two tokens swap for good, never a 6 or an 8', () => {
		const before = withEvent('comet');
		const s = withEvent('earthquake');
		const quake = lastOf(s.log, 'earthquake');
		if (quake?.type !== 'earthquake') throw new Error('no quake');
		const [a, b] = quake.hexes;
		expect(s.board).not.toBe(before.board);
		expect(s.board.hexes[a].number).toBe(before.board.hexes[b].number);
		expect(s.board.hexes[b].number).toBe(before.board.hexes[a].number);
		for (const h of [a, b]) expect([6, 8, null]).not.toContain(s.board.hexes[h].number);
		const changed = s.board.hexes.filter((h, i) => h.number !== before.board.hexes[i].number);
		expect(changed).toHaveLength(2);
	});

	it('Royal Decree: the player in last place picks the round from three cards before anyone rolls', () => {
		let s = withEvent('royalDecree');
		const choice = s.events!.choice!;
		expect(s.step).toBe('eventChoice');
		expect(choice.cards).toHaveLength(3);
		expect(choice.cards).not.toContain('royalDecree');
		expect(choice.player).toBe(lastPlace(s));
		const other = (choice.player + 1) % 3;
		expect(error(s, other, { type: 'chooseEvent', card: choice.cards[0] })).toBe('The player in last place picks the event.');
		expect(error(s, s.current, { type: 'rollDice' })).toBe("You can't roll right now.");
		const deck = s.events!.deck.length;
		s = act(s, choice.player, { type: 'chooseEvent', card: choice.cards[1] });
		expect(s.step === 'roll' || s.step === 'eventChoice').toBe(true);
		expect(s.events!.current).toBe(choice.cards[1]);
		expect(s.events!.deck.length).toBe(deck + 2);
		expect(lastOf(s.log, 'eventDrawn')).toMatchObject({ card: choice.cards[1], by: choice.player });
	});
});

describe('what players see', () => {
	it('keeps the deck order secret and who lost which card to whom', () => {
		const s = withEvent('royalWedding');
		const to = lastPlace(withEvent('comet'));
		const outsider = [0, 1, 2].find((i) => i !== to)!;
		const view = viewFor(s, outsider);
		expect(view.events).not.toHaveProperty('deck');
		expect(view.events!.deckCount).toBe(s.events!.deck.length);
		const moved = lastOf(view.log, 'eventCards');
		if (moved?.type !== 'eventCards') throw new Error('no moves');
		for (const m of moved.moves) expect(m.resource === null).toBe(m.from !== outsider);
		const theirs = lastOf(viewFor(s, to).log, 'eventCards');
		if (theirs?.type === 'eventCards') for (const m of theirs.moves) expect(m.resource).not.toBeNull();
	});
});

describe('bots', () => {
	// Every card on its own, every round: bots must finish a game whatever the deck holds.
	it.each(EVENT_CARDS.map((c) => [c]))('finish a game where every round is %s', (card) => {
		let s = afterSetup(extended({ pulled: EVENT_CARDS.filter((c) => c !== card) }, { pointsToWin: 7 }), 3, 21);
		const n = s.players.length;
		let perTurn = 0;
		let lastTurn = -1;
		for (let steps = 0; s.phase !== 'ended' && steps < 30000; steps++) {
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
			expect(bankAndHands(s)).toEqual(RESOURCES.map(() => BANK_PER_RESOURCE));
		}
		expect(s.phase).toBe('ended');
		expect(s.log.some((e) => e.type === 'eventDrawn' && e.card === card) || card === 'royalDecree').toBe(true);
	});
});

describe('the room', () => {
	function fakeSocket() {
		const sent: ServerMessage[] = [];
		const ws = { readyState: 1, OPEN: 1, send: (data: string) => sent.push(JSON.parse(data)) };
		return { ws: ws as unknown as WebSocket, sent };
	}

	it('lets only the host set the deck, asks guests to ready again, and plays it', () => {
		vi.useFakeTimers();
		const room = new Room('EVENT');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		room.handle(host, { t: 'setCharacters', on: false }, a.ws);
		expect(room.lobbyInfo().settings.events).toEqual(DEFAULT_EVENT_RULES);
		room.handle(guest, { t: 'setEvents', events: NO_EVENTS }, b.ws);
		expect(room.lobbyInfo().settings.events.on).toBe(true);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'setEvents', events: { ...DEFAULT_EVENT_RULES, every: 2, wild: false, pulled: ['comet', 'nope' as EventCard] } }, a.ws);
		expect(room.lobbyInfo().settings.events).toEqual({ on: true, every: 2, wild: false, pulled: ['comet'] });
		expect(guest.ready).toBe(false);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.events!.every).toBe(2);
		expect(room.game!.events!.pool).not.toContain('comet');
		expect(room.game!.events!.pool).not.toContain('plagueOfRats');
		// Locked while the game runs.
		room.handle(host, { t: 'setEvents', events: NO_EVENTS }, a.ws);
		expect(room.lobbyInfo().settings.events.on).toBe(true);
		room.dispose();
		vi.useRealTimers();
	});
});
