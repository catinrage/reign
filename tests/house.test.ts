import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { Room } from '../src/server/room';
import type { ServerMessage } from '../src/shared/protocol';
import { botAction } from '../src/shared/rules/bot';
import { BANK_PER_RESOURCE, DEV_CARDS, DEV_DECK, PIECE_LIMITS, RESOURCES, type DevCardType } from '../src/shared/rules/config';
import { applyAction, createGame, totalPoints } from '../src/shared/rules/engine';
import { STANDARD_HOUSE_RULES, cleanHouseRules, standardBank, standardDeck, type DevDeck } from '../src/shared/rules/house';
import { DEFAULT_SETTINGS, type GameSettings } from '../src/shared/rules/modes';
import type { Action, GameState } from '../src/shared/rules/types';

const COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'purple', 'pink'] as const;
const bots = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: COLORS[i], isBot: true }));

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
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

const deckCounts = (s: GameState) => {
	const held = s.players.flatMap((p) => p.devCards.map((c) => c.type));
	const counts = Object.fromEntries(DEV_CARDS.map((c) => [c, 0])) as Record<DevCardType, number>;
	for (const c of [...s.devDeck, ...held]) counts[c]++;
	return counts;
};

const inPlay = (s: GameState, r: (typeof RESOURCES)[number]) => s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0);

describe('house rules in the engine', () => {
	it('standard house rules deal exactly the game as before, in both modes', () => {
		for (const mode of ['classic', 'extended'] as const) {
			for (const n of [2, 3, 4]) {
				const plain = createGame(bots(n), 77 + n, undefined, { mode });
				const standard = createGame(bots(n), 77 + n, undefined, {
					mode,
					pointsToWin: 10,
					handLimit: 7,
					house: { bank: null, deck: null }
				});
				expect(JSON.stringify(standard)).toBe(JSON.stringify(plain));
			}
		}
		const s = createGame(bots(4), 5);
		expect(s.pointsToWin).toBe(10);
		expect(s.handLimit).toBe(7);
		expect(s.players[0].piecesLeft).toEqual(PIECE_LIMITS);
		for (const r of RESOURCES) expect(s.bank[r]).toBe(BANK_PER_RESOURCE);
		expect(deckCounts(s)).toEqual(DEV_DECK);
		expect(DEFAULT_SETTINGS.house).toEqual(STANDARD_HOUSE_RULES);
	});

	it('the standard bank and deck follow the number of players', () => {
		expect([2, 4, 5, 6, 7, 8].map(standardBank)).toEqual([19, 19, 24, 24, 29, 29]);
		const size = (d: DevDeck) => DEV_CARDS.reduce((n, c) => n + d[c], 0);
		expect([4, 6, 8].map((n) => size(standardDeck(n)))).toEqual([25, 34, 43]);
		const six = createGame(bots(6), 3, undefined, { mode: 'extended', map: { preset: 'great' }, house: { bank: null, deck: null } });
		expect(six.bank.wood).toBe(24);
		expect(six.devDeck).toHaveLength(34);
	});

	it('Classic plays to the host’s points and ends the game there', () => {
		for (const goal of [6, 13]) {
			for (let seed = 1; seed <= 3; seed++) {
				let s = createGame(bots(3), seed * 41 + goal, undefined, { mode: 'classic', pointsToWin: goal });
				expect(s.pointsToWin).toBe(goal);
				expect(s.mapName).toBe('Classic Isle');
				// Goals over 10 bring more pieces to build them with, as in Reign Extended.
				if (goal > 10) expect(s.players[0].piecesLeft).toEqual({ road: 19, settlement: 7, city: 6 });
				s = playOut(s);
				expect(s.phase).toBe('ended');
				const won = totalPoints(s, s.winner!);
				expect(won).toBeGreaterThanOrEqual(goal);
				// The game stops at the goal: the winner reached it on their own turn, within a point or two.
				expect(won).toBeLessThanOrEqual(goal + 2);
			}
		}
	});

	it('honors the bank and deck counts, and bots finish with them', () => {
		const cases: GameSettings['house'][] = [
			{ bank: 10, deck: { knight: 0, roadBuilding: 0, yearOfPlenty: 0, monopoly: 0, victoryPoint: 1 } },
			{ bank: 40, deck: { knight: 30, roadBuilding: 6, yearOfPlenty: 0, monopoly: 4, victoryPoint: 2 } },
			{ bank: null, deck: { knight: 0, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2, victoryPoint: 0 } }
		];
		cases.forEach((house, k) => {
			for (const mode of ['classic', 'extended'] as const) {
				let s = createGame(bots(4), 900 + k, undefined, { mode, map: { preset: 'great' }, house });
				const bank = house.bank ?? BANK_PER_RESOURCE;
				for (const r of RESOURCES) expect(s.bank[r]).toBe(bank);
				expect(deckCounts(s)).toEqual(house.deck);
				s = playOut(s);
				expect(s.phase, `${mode} case ${k}`).toBe('ended');
				for (const r of RESOURCES) expect(inPlay(s, r)).toBe(bank);
			}
		});
	});

	it('checks house rules', () => {
		expect(cleanHouseRules({ bank: null, deck: null })).toEqual(STANDARD_HOUSE_RULES);
		expect(cleanHouseRules(undefined)).toEqual(STANDARD_HOUSE_RULES);
		expect(cleanHouseRules({ bank: 25 })).toEqual({ bank: 25, deck: null });
		for (const bank of [9, 41, 12.5, '20', -1]) expect(typeof cleanHouseRules({ bank, deck: null })).toBe('string');
		const deck = { ...DEV_DECK };
		expect(cleanHouseRules({ bank: null, deck })).toEqual({ bank: null, deck });
		for (const bad of [
			{ ...deck, knight: -1 },
			{ ...deck, knight: 41 },
			{ ...deck, monopoly: 13 },
			{ ...deck, victoryPoint: 1.5 },
			{ knight: 3 },
			{ knight: 0, roadBuilding: 0, yearOfPlenty: 0, monopoly: 0, victoryPoint: 0 },
			'lots',
			[1, 2, 3, 4, 5]
		]) {
			expect(typeof cleanHouseRules({ bank: null, deck: bad })).toBe('string');
		}
		// Extra fields are dropped.
		expect(cleanHouseRules({ bank: 12, deck: { ...deck, dragon: 3 }, cheat: true })).toEqual({ bank: 12, deck });
	});
});

/** A stand-in socket that records what the room sends. */
function fakeSocket() {
	const sent: ServerMessage[] = [];
	const ws = { readyState: 1, OPEN: 1, send: (data: string) => sent.push(JSON.parse(data)) };
	return { ws: ws as unknown as WebSocket, sent };
}

function table(code: string) {
	vi.useFakeTimers();
	const room = new Room(code);
	const a = fakeSocket();
	const b = fakeSocket();
	const host = room.join(a.ws, 'Ada');
	const guest = room.join(b.ws, 'Bram');
	if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
	return { room, a, b, host, guest };
}

const lastError = (sent: ServerMessage[]) => {
	const m = [...sent].reverse().find((x) => x.t === 'error');
	return m && m.t === 'error' ? m.message : null;
};

describe('house rules in the lobby', () => {
	afterEach(() => vi.useRealTimers());

	it('lets only the host set them, checks every value, and plays them in Classic', () => {
		const { room, a, b, host, guest } = table('HOUSE');
		const deck = { knight: 10, roadBuilding: 1, yearOfPlenty: 0, monopoly: 3, victoryPoint: 2 };
		room.handle(guest, { t: 'setHouseRules', house: { bank: 30, deck } }, b.ws);
		expect(room.lobbyInfo().settings.house).toEqual(STANDARD_HOUSE_RULES);
		room.handle(host, { t: 'setHouseRules', house: { bank: 30, deck } }, a.ws);
		expect(room.lobbyInfo().settings.house).toEqual({ bank: 30, deck });
		for (const bad of [{ bank: 50, deck: null }, { bank: 30, deck: { ...deck, knight: 99 } }, { bank: 30, deck: { ...deck, knight: 0, roadBuilding: 0, monopoly: 0, victoryPoint: 0 } }]) {
			room.handle(host, { t: 'setHouseRules', house: bad as never }, a.ws);
			expect(room.lobbyInfo().settings.house).toEqual({ bank: 30, deck });
		}
		expect(lastError(a.sent)).toBe('Keep at least one card in the development deck.');
		// Points to win in Classic, capped by the classic island and the table.
		room.handle(host, { t: 'setPointsToWin', points: 15 }, a.ws);
		expect(room.lobbyInfo().settings.pointsToWin).toBe(15);
		room.handle(host, { t: 'setHandLimit', cards: 9 }, a.ws);
		room.handle(host, { t: 'addBot' }, a.ws);
		room.handle(host, { t: 'addBot' }, a.ws);
		// Four players on the 19-tile isle play to 11 at most.
		expect(room.lobbyInfo().settings.pointsToWin).toBe(11);
		room.handle(host, { t: 'setPointsToWin', points: 14 }, a.ws);
		expect(lastError(a.sent)).toBe('Classic Isle with 4 players plays to at most 11 points.');
		room.handle(host, { t: 'setPointsToWin', points: 8 }, a.ws);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		const g = room.game!;
		expect(g.mode).toBe('classic');
		expect(g.pointsToWin).toBe(8);
		expect(g.handLimit).toBe(9);
		expect(g.bank.ore).toBe(30);
		expect(deckCounts(g)).toEqual(deck);
		// Locked while the game runs.
		room.handle(host, { t: 'setHouseRules', house: STANDARD_HOUSE_RULES }, a.ws);
		room.handle(host, { t: 'setPointsToWin', points: 10 }, a.ws);
		expect(room.lobbyInfo().settings.house).toEqual({ bank: 30, deck });
		expect(room.lobbyInfo().settings.pointsToWin).toBe(8);
		room.dispose();
	});

	it('clears the ready check only when the house rules really change', () => {
		const { room, a, b, host, guest } = table('READY');
		const ready = () => room.lobbyInfo().seats.find((s) => s.id === guest.id)!.ready;
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'setHouseRules', house: { bank: null, deck: null } }, a.ws);
		expect(ready()).toBe(true);
		room.handle(host, { t: 'setHouseRules', house: { bank: 25, deck: null } }, a.ws);
		expect(ready()).toBe(false);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'setHouseRules', house: { bank: 25, deck: null } }, a.ws);
		expect(ready()).toBe(true);
		room.handle(host, { t: 'setPointsToWin', points: 12 }, a.ws);
		expect(ready()).toBe(false);
		room.dispose();
	});

	it('keeps a standard bank and deck following the table, and a custom one as set', () => {
		const { room, a, b, host, guest } = table('GROWS');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		room.handle(host, { t: 'setMap', map: { preset: 'great' } }, a.ws);
		for (let i = 0; i < 4; i++) room.handle(host, { t: 'addBot' }, a.ws);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.bank.wood).toBe(24);
		expect(room.game!.devDeck).toHaveLength(34);
		room.dispose();

		const t2 = table('GROW2');
		t2.room.handle(t2.host, { t: 'setMode', mode: 'extended' }, t2.a.ws);
		t2.room.handle(t2.host, { t: 'setHouseRules', house: { bank: 15, deck: null } }, t2.a.ws);
		for (let i = 0; i < 4; i++) t2.room.handle(t2.host, { t: 'addBot' }, t2.a.ws);
		// A smaller island that seats fewer can't be picked with six at the table; the rules stay.
		t2.room.handle(t2.host, { t: 'setMode', mode: 'classic' }, t2.a.ws);
		expect(t2.room.lobbyInfo().settings.house).toEqual({ bank: 15, deck: null });
		t2.room.handle(t2.guest, { t: 'setReady', ready: true }, t2.b.ws);
		t2.room.handle(t2.host, { t: 'start' }, t2.a.ws);
		expect(t2.room.game!.bank.wood).toBe(15);
		expect(t2.room.game!.devDeck).toHaveLength(34);
		t2.room.dispose();
	});
});
