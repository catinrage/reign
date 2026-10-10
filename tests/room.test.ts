import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../src/shared/protocol';
import { BOT_OFFER_MS, EMPTY_GRACE_MS, Room } from '../src/server/room';
import { randomMap } from '../src/shared/board/random';
import { botAction } from '../src/shared/rules/bot';
import { BANK_PER_RESOURCE, RESOURCES } from '../src/shared/rules/config';
import { applyAction } from '../src/shared/rules/engine';
import { settlementSpots } from '../src/shared/rules/queries';
import type { Action, GameEvent } from '../src/shared/rules/types';

/** A stand-in socket that records what the room sends. */
function fakeSocket() {
	const sent: ServerMessage[] = [];
	const ws = { readyState: 1, OPEN: 1, send: (data: string) => sent.push(JSON.parse(data)) };
	return { ws: ws as unknown as WebSocket, sent };
}

function soloTable() {
	vi.useFakeTimers();
	const room = new Room('ABCDE');
	const me = fakeSocket();
	const seat = room.join(me.ws, 'Komeil');
	if (typeof seat === 'string') throw new Error(seat);
	room.handle(seat, { t: 'addBot' }, me.ws);
	room.handle(seat, { t: 'addBot' }, me.ws);
	room.handle(seat, { t: 'start' }, me.ws);
	return { room, seat, me };
}

describe('game menu pause', () => {
	afterEach(() => vi.useRealTimers());

	it('stops bots while the only player has the menu open, and resumes after', () => {
		const { room, seat, me } = soloTable();
		room.handle(seat, { t: 'pause', paused: true }, me.ws);
		expect(room.lobbyInfo().paused).toBe(true);
		const log = room.game!.log.length;
		vi.advanceTimersByTime(60_000);
		expect(room.game!.log.length).toBe(log);

		room.handle(seat, { t: 'pause', paused: false }, me.ws);
		expect(room.lobbyInfo().paused).toBe(false);
		// Bots play the setup until it's the player's turn (or keep going if they move first).
		vi.advanceTimersByTime(60_000);
		const myIndex = room.seats.indexOf(seat);
		expect(room.game!.log.length > log || room.game!.current === myIndex).toBe(true);
		room.dispose();
	});

	it('does not pause when another player is still at the table', () => {
		vi.useFakeTimers();
		const room = new Room('FGHIJ');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		room.handle(host, { t: 'pause', paused: true }, a.ws);
		expect(room.lobbyInfo().paused).toBe(false);
		room.handle(guest, { t: 'pause', paused: true }, b.ws);
		expect(room.lobbyInfo().paused).toBe(true);
		// Dropping the connection clears that player's pause.
		room.disconnect(b.ws);
		expect(room.lobbyInfo().paused).toBe(true);
		room.handle(host, { t: 'pause', paused: false }, a.ws);
		expect(room.lobbyInfo().paused).toBe(false);
		room.dispose();
	});

	it('a reconnect starts with the menu closed', () => {
		const { room, seat, me } = soloTable();
		room.handle(seat, { t: 'pause', paused: true }, me.ws);
		room.disconnect(me.ws);
		const again = fakeSocket();
		room.join(again.ws, 'Komeil', seat.token);
		expect(room.lobbyInfo().paused).toBe(false);
		room.dispose();
	});
});

describe('pause for everyone', () => {
	afterEach(() => vi.useRealTimers());

	it('lets any player pause the game and anyone resume it', () => {
		const { room, host, guest, a, b } = twoPlayers(30);
		const first = room.game!.current;
		const seat = room.seats[first];
		const socket = seat === host ? a : b;
		const place = () =>
			room.handle(
				seat,
				{
					t: 'action',
					action: { type: 'placeSettlement', vertex: settlementSpots(room.game!, first, true)[0] }
				},
				socket.ws
			);
		vi.advanceTimersByTime(10_000);
		room.handle(guest, { t: 'pauseGame', paused: true }, b.ws);
		expect(last(a.sent, 'lobby').lobby).toMatchObject({
			paused: true,
			pausedBy: guest.id,
			clock: { left: 20_000, running: false }
		});
		// Nobody can play while it is paused, and the turn doesn't run out.
		place();
		expect(last(socket.sent, 'error').message).toBe('The game is paused.');
		vi.advanceTimersByTime(5 * 60_000);
		expect(room.game!.current).toBe(first);
		expect(room.game!.buildings.some(Boolean)).toBe(false);

		room.handle(host, { t: 'pauseGame', paused: false }, a.ws);
		expect(last(b.sent, 'lobby').lobby).toMatchObject({
			paused: false,
			pausedBy: null,
			clock: { left: 20_000, running: true }
		});
		place();
		expect(room.game!.buildings.some(Boolean)).toBe(true);
		room.dispose();
	});

	it('stops the bots in a game against bots until someone resumes', () => {
		const { room, seat, me } = soloTable();
		room.handle(seat, { t: 'pauseGame', paused: true }, me.ws);
		const log = room.game!.log.length;
		vi.advanceTimersByTime(60_000);
		expect(room.game!.log.length).toBe(log);
		// Closing the game menu doesn't resume a paused game.
		room.handle(seat, { t: 'pause', paused: true }, me.ws);
		room.handle(seat, { t: 'pause', paused: false }, me.ws);
		expect(room.lobbyInfo()).toMatchObject({ paused: true, pausedBy: seat.id });

		room.handle(seat, { t: 'pauseGame', paused: false }, me.ws);
		expect(room.lobbyInfo()).toMatchObject({ paused: false, pausedBy: null });
		vi.advanceTimersByTime(60_000);
		const myIndex = room.seats.indexOf(seat);
		expect(room.game!.log.length > log || room.game!.current === myIndex).toBe(true);
		room.dispose();
	});
});

/** The last message of one kind a socket was sent. */
function last<T extends ServerMessage['t']>(sent: ServerMessage[], t: T) {
	return [...sent].reverse().find((m): m is Extract<ServerMessage, { t: T }> => m.t === t)!;
}

/** Two people and no bots, so nothing moves unless someone acts or the turn clock runs out. */
function twoPlayers(turnTime: number) {
	vi.useFakeTimers();
	const room = new Room('KLMNO');
	const a = fakeSocket();
	const b = fakeSocket();
	const host = room.join(a.ws, 'Ada');
	const guest = room.join(b.ws, 'Bram');
	if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
	room.handle(host, { t: 'setTurnTime', seconds: turnTime }, a.ws);
	room.handle(guest, { t: 'setReady', ready: true }, b.ws);
	room.handle(host, { t: 'start' }, a.ws);
	const act = (action: Action) => {
		const seat = room.seats[room.game!.current];
		room.handle(seat, { t: 'action', action }, [...seat.sockets][0]);
	};
	return { room, host, guest, a, b, act };
}

/** What a timed-out main-phase turn may do: only the steps it can't end without. */
const FORCED: GameEvent['type'][] = [
	'turnTimedOut',
	'diceRolled',
	'produced',
	'nothingProduced',
	'mustDiscard',
	'discarded',
	'robberMoved',
	'stole',
	'nothingToSteal',
	'tradeCancelled',
	'turnStarted'
];

describe('turn timer', () => {
	afterEach(() => vi.useRealTimers());

	it('is picked by the host in the lobby and locked once the game starts', () => {
		vi.useFakeTimers();
		const room = new Room('PQRST');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		expect(room.lobbyInfo().turnTime).toBe(0);
		room.handle(guest, { t: 'setTurnTime', seconds: 60 }, b.ws);
		room.handle(host, { t: 'setTurnTime', seconds: 45 }, a.ws);
		expect(room.lobbyInfo().turnTime).toBe(0);
		room.handle(host, { t: 'setTurnTime', seconds: 90 }, a.ws);
		expect(last(b.sent, 'lobby').lobby.turnTime).toBe(90);
		expect(last(b.sent, 'lobby').lobby.clock).toBeNull();

		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		room.handle(host, { t: 'setTurnTime', seconds: 30 }, a.ws);
		expect(room.lobbyInfo().turnTime).toBe(90);
		// Players get the time left, not a timestamp.
		expect(last(b.sent, 'game').clock).toEqual({ left: 90_000, running: true });
		room.dispose();
	});

	it('ends a setup turn by placing the settlement and road, and times each placement', () => {
		const { room, a } = twoPlayers(30);
		const first = room.game!.current;
		vi.advanceTimersByTime(29_999);
		expect(room.game!.current).toBe(first);
		expect(room.game!.buildings.some(Boolean)).toBe(false);

		vi.advanceTimersByTime(1);
		let g = room.game!;
		expect(g.buildings.filter((b) => b?.owner === first)).toHaveLength(1);
		expect(g.roads.filter((r) => r === first)).toHaveLength(1);
		expect(g.log.some((e) => e.type === 'turnTimedOut' && e.player === first)).toBe(true);
		const second = g.current;
		expect(second).not.toBe(first);
		expect(last(a.sent, 'game').clock).toEqual({ left: 30_000, running: true });

		// The snake order gives the second player two placements in a row, each with its own time.
		vi.advanceTimersByTime(30_000);
		g = room.game!;
		expect(g.current).toBe(second);
		expect(g.buildings.filter((b) => b?.owner === second)).toHaveLength(1);
		expect(room.lobbyInfo().clock).toEqual({ left: 30_000, running: true });

		vi.advanceTimersByTime(2 * 30_000);
		g = room.game!;
		expect(g.phase).toBe('main');
		expect(g.buildings.filter(Boolean)).toHaveLength(4);
		expect(g.roads.filter((r) => r !== null)).toHaveLength(4);
		room.dispose();
	});

	it('ends a main-phase turn, rolling first for a player who has not', () => {
		const { room, act } = twoPlayers(30);
		vi.advanceTimersByTime(4 * 30_000);
		let g = room.game!;
		expect(g.phase).toBe('main');
		expect(g.step).toBe('roll');
		const p = g.current;
		const since = g.nextEventSeq;

		vi.advanceTimersByTime(30_000);
		g = room.game!;
		expect(g.turn).toBe(2);
		expect(g.current).not.toBe(p);
		const events = g.log.filter((e) => e.seq >= since);
		expect(events.some((e) => e.type === 'diceRolled' && e.player === p)).toBe(true);
		expect(events.filter((e) => !FORCED.includes(e.type))).toEqual([]);

		// Rolling doesn't restart the clock; sitting on the rest of the turn ends it.
		act({ type: 'rollDice' });
		expect(room.game!.dice).not.toBeNull();
		vi.advanceTimersByTime(29_999);
		expect(room.game!.turn).toBe(2);
		vi.advanceTimersByTime(1);
		expect(room.game!.turn).toBe(3);
		room.dispose();
	});

	it('settles discards still owed after a 7, moves the robber and ends the turn', () => {
		const { room } = twoPlayers(30);
		vi.advanceTimersByTime(4 * 30_000);
		const g = room.game!;
		const p = g.current;
		const other = 1 - p;
		// The current player rolled a 7 and the other player still has to give back 4 of 8 cards.
		room.game = {
			...g,
			step: 'discard',
			dice: [3, 4],
			pendingDiscards: { [other]: 4 },
			players: g.players.map((pl, i) =>
				i === other ? { ...pl, resources: { wood: 2, brick: 2, sheep: 2, wheat: 1, ore: 1 } } : pl
			)
		};
		vi.advanceTimersByTime(30_000);
		const after = room.game!;
		const discarded = after.log.find((e) => e.type === 'discarded');
		expect(discarded).toMatchObject({ player: other, count: 4 });
		expect(after.log.some((e) => e.type === 'robberMoved' && e.player === p)).toBe(true);
		expect(after.pendingDiscards).toEqual({});
		expect(after.current).toBe(other);
		expect(after.step).toBe('roll');
		room.dispose();
	});

	it('withdraws an open offer and gives up free roads instead of building them', () => {
		const { room } = twoPlayers(30);
		vi.advanceTimersByTime(4 * 30_000);
		let g = room.game!;
		const p = g.current;
		room.game = {
			...g,
			step: 'main',
			dice: [2, 3],
			trade: { id: 99, from: p, give: { wood: 1 }, want: { ore: 1 }, responses: {} }
		};
		vi.advanceTimersByTime(30_000);
		g = room.game!;
		expect(g.trade).toBeNull();
		expect(g.log.some((e) => e.type === 'tradeCancelled' && e.from === p)).toBe(true);
		expect(g.current).not.toBe(p);

		// Road Building was played and both free roads are still to place.
		const q = g.current;
		const roads = g.roads.filter((r) => r === q).length;
		room.game = {
			...g,
			step: 'roadBuilding',
			roadBuildingLeft: 2,
			resumeStep: 'main',
			dice: [2, 3]
		};
		vi.advanceTimersByTime(30_000);
		g = room.game!;
		expect(g.roads.filter((r) => r === q)).toHaveLength(roads);
		expect(g.roadBuildingLeft).toBe(0);
		expect(g.current).toBe(p);
		room.dispose();
	});

	it('freezes while the table is paused and resumes with the time that was left', () => {
		const { room, host, guest, a, b } = twoPlayers(30);
		const first = room.game!.current;
		vi.advanceTimersByTime(10_000);
		// One player in the menu doesn't pause the table.
		room.handle(host, { t: 'pause', paused: true }, a.ws);
		expect(room.lobbyInfo().clock?.running).toBe(true);
		room.handle(guest, { t: 'pause', paused: true }, b.ws);
		expect(room.lobbyInfo().clock).toEqual({ left: 20_000, running: false });
		expect(last(b.sent, 'lobby').lobby.clock).toEqual({ left: 20_000, running: false });

		vi.advanceTimersByTime(5 * 60_000);
		expect(room.game!.current).toBe(first);
		expect(room.game!.buildings.some(Boolean)).toBe(false);

		room.handle(guest, { t: 'pause', paused: false }, b.ws);
		expect(last(a.sent, 'lobby').lobby.clock).toEqual({ left: 20_000, running: true });
		vi.advanceTimersByTime(19_999);
		expect(room.game!.current).toBe(first);
		vi.advanceTimersByTime(1);
		expect(room.game!.current).not.toBe(first);
		room.dispose();
	});

	it('never runs out when turns are unlimited', () => {
		const { room, a } = twoPlayers(0);
		vi.advanceTimersByTime(30 * 60_000);
		expect(room.game!.step).toBe('setupSettlement');
		expect(room.game!.setupIndex).toBe(0);
		expect(room.game!.log.some((e) => e.type === 'turnTimedOut')).toBe(false);
		expect(room.lobbyInfo().clock).toBeNull();
		expect(last(a.sent, 'game').clock).toBeNull();
		room.dispose();
	});

	it('keeps a game against bots going', () => {
		vi.useFakeTimers();
		const room = new Room('UVWXY');
		const me = fakeSocket();
		const seat = room.join(me.ws, 'Komeil');
		if (typeof seat === 'string') throw new Error(seat);
		room.handle(seat, { t: 'addBot' }, me.ws);
		room.handle(seat, { t: 'addBot' }, me.ws);
		room.handle(seat, { t: 'setTurnTime', seconds: 30 }, me.ws);
		room.handle(seat, { t: 'start' }, me.ws);
		vi.advanceTimersByTime(10 * 60_000);
		expect(room.game!.phase).not.toBe('setup');
		expect(room.game!.turn).toBeGreaterThan(3);
		room.dispose();
	});
});

describe('Reign Extended lobby', () => {
	afterEach(() => vi.useRealTimers());

	it('lets only the host pick the mode, map and points, and plays them', () => {
		vi.useFakeTimers();
		const room = new Room('EXTND');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(guest, { t: 'setMode', mode: 'extended' }, b.ws);
		expect(room.lobbyInfo().settings.mode).toBe('classic');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		room.handle(host, { t: 'setMap', map: { preset: 'realm' } }, a.ws);
		room.handle(host, { t: 'setPointsToWin', points: 12 }, a.ws);
		room.handle(host, { t: 'setPointsToWin', points: 99 }, a.ws);
		expect(room.lobbyInfo().settings).toMatchObject({ mode: 'extended', map: { preset: 'realm' }, pointsToWin: 12 });
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.board.hexes).toHaveLength(37);
		expect(room.game!.pointsToWin).toBe(12);
		// Settings are locked while the game runs.
		room.handle(host, { t: 'setMode', mode: 'classic' }, a.ws);
		expect(room.lobbyInfo().settings.mode).toBe('extended');
		room.dispose();
	});

	it('lets the host turn characters off or leave some out, and drafts them in the game', () => {
		vi.useFakeTimers();
		const room = new Room('CHARS');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		room.handle(host, { t: 'addBot' }, a.ws);
		room.handle(guest, { t: 'leaveOut', character: 'rogue', out: true }, b.ws);
		expect(room.lobbyInfo().settings.leftOut).toEqual([]);
		for (const c of ['shepherd', 'rogue', 'merchant'] as const) room.handle(host, { t: 'leaveOut', character: c, out: true }, a.ws);
		expect(room.lobbyInfo().settings.leftOut).toEqual(['merchant', 'rogue', 'shepherd']);
		room.handle(host, { t: 'leaveOut', character: 'rogue', out: false }, a.ws);
		expect(room.lobbyInfo().settings.leftOut).toEqual(['merchant', 'shepherd']);

		// Too few characters for the table: the host can't start.
		for (const c of ['mason', 'scholar', 'veteran', 'steward', 'explorer', 'seer', 'alchemist', 'bard', 'witch', 'cartographer', 'baron', 'abbess', 'jester'] as const) {
			room.handle(host, { t: 'leaveOut', character: c, out: true }, a.ws);
		}
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game).toBeNull();
		expect(a.sent.some((m) => m.t === 'error' && m.message.includes('3 players need at least 3 characters'))).toBe(true);
		for (const c of ['mason', 'scholar'] as const) room.handle(host, { t: 'leaveOut', character: c, out: false }, a.ws);

		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		const g = room.game!;
		expect(g.phase).toBe('draft');
		expect(g.draft!.pool).toEqual(['mason', 'scholar', 'rogue']);
		// Whoever places the first settlement (seat 0) picks last.
		expect(g.draft!.order).toEqual([2, 1, 0]);
		expect(g.current).toBe(2);
		// People pick for themselves; the bot picks when its go comes.
		const order = g.draft!.order.map((i) => room.seats[i]);
		for (const seat of order) {
			if (seat.isBot) vi.advanceTimersByTime(3000);
			else {
				const left = room.game!.draft!.pool.filter((c) => !room.game!.players.some((p) => p.character === c));
				const ws = seat === host ? a.ws : b.ws;
				room.handle(seat, { t: 'action', action: { type: 'pickCharacter', character: left[left.length - 1] } }, ws);
			}
		}
		expect(room.game!.phase).toBe('setup');
		expect(new Set(room.game!.players.map((p) => p.character)).size).toBe(3);
		room.dispose();
	});

	it('picks for a player whose draft pick runs out of time', () => {
		vi.useFakeTimers();
		const room = new Room('SLOWP');
		const a = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		if (typeof host === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		room.handle(host, { t: 'setTurnTime', seconds: 30 }, a.ws);
		room.handle(host, { t: 'addBot' }, a.ws);
		room.handle(host, { t: 'start' }, a.ws);
		const me = room.seats.indexOf(host);
		// Let the bot pick if it goes first, then run the human's clock out.
		vi.advanceTimersByTime(3000);
		expect(room.game!.current).toBe(me);
		expect(room.game!.phase).toBe('draft');
		vi.advanceTimersByTime(31_000);
		expect(room.game!.players[me].character).not.toBeNull();
		expect(room.game!.phase).toBe('setup');
		room.dispose();
	});

	it('lets only the host set the hand limit, within range, and plays it', () => {
		const room = new Room('HANDS');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		expect(room.lobbyInfo().settings.handLimit).toBe(7);
		room.handle(guest, { t: 'setHandLimit', cards: 9 }, b.ws);
		expect(room.lobbyInfo().settings.handLimit).toBe(7);
		room.handle(host, { t: 'setHandLimit', cards: 10 }, a.ws);
		for (const bad of [2, 21, 8.5, '9']) room.handle(host, { t: 'setHandLimit', cards: bad as number }, a.ws);
		expect(room.lobbyInfo().settings.handLimit).toBe(10);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.handLimit).toBe(10);
		room.dispose();
	});

	it('lets only the host set character powers and how often they come back', () => {
		const room = new Room('POWER');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bo');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		expect(room.lobbyInfo().settings.powers).toBe(true);
		expect(room.lobbyInfo().settings.powerRecharge).toBe(0);
		room.handle(guest, { t: 'setPowers', on: false }, b.ws);
		expect(room.lobbyInfo().settings.powers).toBe(true);
		room.handle(host, { t: 'setRecharge', rounds: 6 }, a.ws);
		for (const bad of [5, -1, 2.5, '4']) room.handle(host, { t: 'setRecharge', rounds: bad as number }, a.ws);
		expect(room.lobbyInfo().settings.powerRecharge).toBe(6);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.powers).toBe(true);
		expect(room.game!.powerRecharge).toBe(6);
		room.dispose();

		const off = new Room('NOPWR');
		const c = fakeSocket();
		const solo = off.join(c.ws, 'Cy');
		if (typeof solo === 'string') throw new Error('join failed');
		off.handle(solo, { t: 'setMode', mode: 'extended' }, c.ws);
		off.handle(solo, { t: 'setPowers', on: false }, c.ws);
		off.handle(solo, { t: 'addBot' }, c.ws);
		off.handle(solo, { t: 'start' }, c.ws);
		expect(off.game!.powers).toBe(false);
		off.dispose();
	});

	it('lets only the host allow repeat character picks, which lifts the short-pool block', () => {
		const room = new Room('REPEAT');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bo');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		room.handle(host, { t: 'addBot' }, a.ws);
		expect(room.lobbyInfo().settings.repeatPicks).toBe(false);
		room.handle(guest, { t: 'setRepeatPicks', on: true }, b.ws);
		expect(room.lobbyInfo().settings.repeatPicks).toBe(false);
		// One character for three players: only with repeat picks.
		for (const c of ['merchant', 'mason', 'scholar', 'veteran', 'rogue', 'steward', 'shepherd', 'explorer', 'seer', 'alchemist', 'bard', 'witch', 'cartographer', 'baron', 'abbess'] as const) {
			room.handle(host, { t: 'leaveOut', character: c, out: true }, a.ws);
		}
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'setRepeatPicks', on: true }, a.ws);
		expect(room.lobbyInfo().settings.repeatPicks).toBe(true);
		// Changing it clears the guest's ready.
		expect(room.lobbyInfo().seats.find((s) => s.name === 'Bo')!.ready).toBe(false);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		const g = room.game!;
		expect(g.phase).toBe('draft');
		expect(g.draft!.pool).toEqual(['jester']);
		expect(g.draft!.repeats).toBe(true);
		room.dispose();
	});

	it('plays without characters when the host turns them off', () => {
		const room = new Room('NOCHR');
		const a = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		if (typeof host === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		room.handle(host, { t: 'setCharacters', on: false }, a.ws);
		room.handle(host, { t: 'addBot' }, a.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.phase).toBe('setup');
		expect(room.game!.players.every((p) => p.character === null)).toBe(true);
		room.dispose();
	});

	it('checks custom maps', () => {
		const room = new Room('MAPPY');
		const a = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		if (typeof host === 'string') throw new Error('join failed');
		const tiles = [{ q: 0, r: 0, terrain: null }];
		room.handle(host, { t: 'setMap', map: { custom: { name: 'Tiny', tiles } } }, a.ws);
		expect(room.lobbyInfo().settings.map).toEqual({ preset: 'great' });
		expect(a.sent.some((m) => m.t === 'error')).toBe(true);
		room.dispose();
	});
});

describe('ready check', () => {
	afterEach(() => vi.useRealTimers());

	function table() {
		vi.useFakeTimers();
		const room = new Room('READY');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'addBot' }, a.ws);
		return { room, host, guest, a, b };
	}

	it('keeps the host from starting until every player is ready', () => {
		const { room, host, guest, a, b } = table();
		const ready = () => room.lobbyInfo().seats.map((s) => s.ready);
		// The host and bots count as ready; the guest has to say so.
		expect(ready()).toEqual([true, false, true]);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game).toBeNull();
		expect(last(a.sent, 'error').message).toBe('Waiting for Bram to be ready.');

		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		expect(last(a.sent, 'lobby').lobby.seats[1].ready).toBe(true);
		room.handle(guest, { t: 'setReady', ready: false }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game).toBeNull();

		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game).not.toBeNull();
		room.dispose();
	});

	it('asks again when the host changes the game', () => {
		const { room, host, guest, a, b } = table();
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		// Picking what is already set changes nothing.
		room.handle(host, { t: 'setTurnTime', seconds: 0 }, a.ws);
		expect(guest.ready).toBe(true);
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		expect(guest.ready).toBe(false);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'setMap', map: { preset: 'realm' } }, a.ws);
		expect(guest.ready).toBe(false);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'setPointsToWin', points: 12 }, a.ws);
		expect(guest.ready).toBe(false);
		room.dispose();
	});

	it('needs everyone ready again for a rematch, unless they left', () => {
		const { room, host, guest, a, b } = table();
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(guest.ready).toBe(false);
		// Ready can't be changed mid-game.
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		expect(guest.ready).toBe(false);

		room.game = { ...room.game!, phase: 'ended' };
		const first = room.game;
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game).toBe(first);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game).not.toBe(first);

		// A player who walked away doesn't hold the table up.
		room.game = { ...room.game!, phase: 'ended' };
		const second = room.game;
		room.handle(guest, { t: 'leave' }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game).not.toBe(second);
		room.dispose();
	});
});

describe('table size', () => {
	it('seats six on a big island and four in Classic', () => {
		const room = new Room('SIXES');
		const a = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		if (typeof host === 'string') throw new Error('join failed');
		expect(room.lobbyInfo().maxPlayers).toBe(4);
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		// The default Extended island is the 30-tile Great Isle.
		expect(room.lobbyInfo().maxPlayers).toBe(6);
		for (let i = 0; i < 6; i++) room.handle(host, { t: 'addBot' }, a.ws);
		expect(room.seats).toHaveLength(6);
		expect(last(a.sent, 'error').message).toBe('The table is full.');
		expect(typeof room.join(fakeSocket().ws, 'Late')).toBe('string');

		// A smaller island, or Classic, can't be picked while six are seated.
		room.handle(host, { t: 'setMode', mode: 'classic' }, a.ws);
		expect(room.lobbyInfo().settings.mode).toBe('extended');
		expect(last(a.sent, 'error').message).toBe('Classic seats up to 4 players, and 6 are at the table.');
		room.handle(host, { t: 'setMap', map: { preset: 'twin' } }, a.ws);
		expect(room.lobbyInfo().settings.map).toEqual({ preset: 'great' });
		room.handle(host, { t: 'setMap', map: { preset: 'realm' } }, a.ws);
		expect(room.lobbyInfo().settings.map).toEqual({ preset: 'realm' });

		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.players).toHaveLength(6);
		room.dispose();
	});
});

describe('pigeon post', () => {
	afterEach(() => vi.useRealTimers());

	/** Three players and a bot, mid-game. */
	function table() {
		vi.useFakeTimers();
		const room = new Room('PIGEO');
		const a = fakeSocket();
		const b = fakeSocket();
		const c = fakeSocket();
		const ada = room.join(a.ws, 'Ada');
		const bram = room.join(b.ws, 'Bram');
		const cleo = room.join(c.ws, 'Cleo');
		if (typeof ada === 'string' || typeof bram === 'string' || typeof cleo === 'string') {
			throw new Error('join failed');
		}
		room.handle(ada, { t: 'addBot' }, a.ws);
		room.handle(bram, { t: 'setReady', ready: true }, b.ws);
		room.handle(cleo, { t: 'setReady', ready: true }, c.ws);
		room.handle(ada, { t: 'start' }, a.ws);
		const bot = room.seats.find((s) => s.isBot)!;
		return { room, a, b, c, ada, bram, cleo, bot };
	}
	const pigeons = (sent: ServerMessage[]) =>
		sent.flatMap((m) => (m.t === 'pigeon' ? [m.note] : []));

	it('carries a note to its reader and back to its writer, and nobody else hears of it', () => {
		const { room, a, b, c, ada, bram } = table();
		const before = { log: room.game!.log.length, c: c.sent.length };
		room.handle(ada, { t: 'pigeon', to: bram.id, text: '  Trade me wheat?  ' }, a.ws);
		const note = { id: 1, from: ada.id, to: bram.id, text: 'Trade me wheat?' };
		expect(pigeons(b.sent)).toEqual([note]);
		expect(pigeons(a.sent)).toEqual([note]);
		// The third player gets nothing at all, and the game log doesn't change.
		expect(c.sent.length).toBe(before.c);
		expect(room.game!.log.length).toBe(before.log);
		expect(JSON.stringify(c.sent)).not.toContain('Trade me');
		room.dispose();
	});

	it('only flies to other players, never to bots or to yourself', () => {
		const { room, a, ada, bot } = table();
		room.handle(ada, { t: 'pigeon', to: bot.id, text: 'hi' }, a.ws);
		room.handle(ada, { t: 'pigeon', to: ada.id, text: 'hi' }, a.ws);
		room.handle(ada, { t: 'pigeon', to: 'nobody', text: 'hi' }, a.ws);
		expect(pigeons(a.sent)).toEqual([]);
		expect(a.sent.filter((m) => m.t === 'error')).toHaveLength(3);
		room.dispose();
	});

	it('keeps notes short, drops empty ones and keeps a pause between pigeons', () => {
		const { room, a, b, ada, bram } = table();
		room.handle(ada, { t: 'pigeon', to: bram.id, text: '   ' }, a.ws);
		room.handle(ada, { t: 'pigeon', to: bram.id, text: 'x'.repeat(500) }, a.ws);
		room.handle(ada, { t: 'pigeon', to: bram.id, text: 'too soon' }, a.ws);
		vi.advanceTimersByTime(1000);
		room.handle(ada, { t: 'pigeon', to: bram.id, text: 'line\nbreak' }, a.ws);
		expect(pigeons(b.sent).map((n) => n.text)).toEqual(['x'.repeat(240), 'line break']);
		room.dispose();
	});

	it('hands a returning player only the notes they wrote or were sent', () => {
		const { room, a, b, c, ada, bram, cleo } = table();
		room.handle(ada, { t: 'pigeon', to: bram.id, text: 'for Bram' }, a.ws);
		room.handle(cleo, { t: 'pigeon', to: ada.id, text: 'for Ada' }, c.ws);
		vi.advanceTimersByTime(1000);
		room.handle(bram, { t: 'pigeon', to: cleo.id, text: 'for Cleo' }, b.ws);
		room.disconnect(b.ws);
		const again = fakeSocket();
		room.join(again.ws, 'Bram', bram.token);
		const history = again.sent.find((m) => m.t === 'pigeons');
		expect(history?.t === 'pigeons' && history.notes.map((n) => n.text)).toEqual(['for Bram', 'for Cleo']);
		room.dispose();
	});
});

describe('robber aim', () => {
	afterEach(() => vi.useRealTimers());

	type Aim = Extract<ServerMessage, { t: 'aim' }>;
	const aims = (sent: ServerMessage[]) => sent.filter((m): m is Aim => m.t === 'aim');

	/** Two people, and the one whose turn it is has to move the robber. */
	function robberStep() {
		const t = twoPlayers(0);
		const g = t.room.game!;
		t.room.game = { ...g, phase: 'main', step: 'moveRobber', resumeStep: 'main' };
		const p = g.current;
		const moverIsHost = t.room.seats[p] === t.host;
		const mover = { seat: moverIsHost ? t.host : t.guest, ...(moverIsHost ? t.a : t.b) };
		const watcher = { seat: moverIsHost ? t.guest : t.host, ...(moverIsHost ? t.b : t.a) };
		const target = g.board.hexes.findIndex((_, h) => h !== g.robberHex);
		return { ...t, g, p, mover, watcher, target };
	}

	it('shows the other players the tile the robber is aimed at', () => {
		const { room, g, p, mover, watcher, target } = robberStep();
		room.handle(mover.seat, { t: 'aim', hex: target }, mover.ws);
		expect(aims(watcher.sent)).toEqual([{ t: 'aim', player: p, hex: target }]);
		// The player aiming isn't told, and the same tile again isn't news.
		room.handle(mover.seat, { t: 'aim', hex: target }, mover.ws);
		expect(aims(mover.sent)).toEqual([]);
		expect(aims(watcher.sent)).toHaveLength(1);

		// Only the player moving the robber aims it, and only at a tile it can go to.
		room.handle(watcher.seat, { t: 'aim', hex: target + 1 }, watcher.ws);
		for (const hex of [g.robberHex, 999, 1.5, -1]) room.handle(mover.seat, { t: 'aim', hex }, mover.ws);
		expect(aims(watcher.sent)).toHaveLength(1);
		expect(aims(mover.sent)).toEqual([]);

		// Someone who joins the table now sees it too, after the board.
		const again = fakeSocket();
		room.join(again.ws, 'Bram', watcher.seat.token);
		expect(again.sent.at(-1)).toEqual({ t: 'aim', player: p, hex: target });
		expect(again.sent.findIndex((m) => m.t === 'game')).toBeLessThan(again.sent.length - 1);

		room.handle(mover.seat, { t: 'aim', hex: null }, mover.ws);
		expect(aims(watcher.sent).at(-1)).toEqual({ t: 'aim', player: p, hex: null });
		room.dispose();
	});

	it('forgets the aim once the robber has moved', () => {
		const { room, mover, watcher, target } = robberStep();
		room.handle(mover.seat, { t: 'aim', hex: target }, mover.ws);
		room.handle(mover.seat, { t: 'action', action: { type: 'moveRobber', hex: target } }, mover.ws);
		expect(room.game!.robberHex).toBe(target);
		// Aiming now does nothing, and nobody joining later is told of the old aim.
		room.handle(mover.seat, { t: 'aim', hex: target + 1 }, mover.ws);
		expect(aims(watcher.sent)).toHaveLength(1);
		const again = fakeSocket();
		room.join(again.ws, 'Bram', watcher.seat.token);
		expect(aims(again.sent)).toEqual([]);
		room.dispose();
	});

	it('lets a bot point at the tile before it moves the robber there', () => {
		vi.useFakeTimers();
		const room = new Room('UVWXY');
		const me = fakeSocket();
		const seat = room.join(me.ws, 'Komeil');
		if (typeof seat === 'string') throw new Error(seat);
		room.handle(seat, { t: 'addBot' }, me.ws);
		room.handle(seat, { t: 'start' }, me.ws);
		// Hold the table while the bot is handed the robber.
		room.handle(seat, { t: 'pauseGame', paused: true }, me.ws);
		const bot = room.seats.findIndex((s) => s.isBot);
		const g = room.game!;
		room.game = { ...g, phase: 'main', step: 'moveRobber', resumeStep: 'main', current: bot };
		room.handle(seat, { t: 'pauseGame', paused: false }, me.ws);

		let aim: Aim | undefined;
		for (let ms = 0; ms < 5000 && !aim; ms += 50) {
			vi.advanceTimersByTime(50);
			aim = aims(me.sent)[0];
		}
		expect(aim).toMatchObject({ player: bot });
		expect(aim!.hex).not.toBe(g.robberHex);
		// It points first, and the robber jumps there a moment later.
		expect(room.game!.robberHex).toBe(g.robberHex);
		vi.advanceTimersByTime(1000);
		expect(room.game!.robberHex).toBe(aim!.hex);
		room.dispose();
	});
});

describe('leaving a game', () => {
	afterEach(() => vi.useRealTimers());

	function twoPlayers() {
		vi.useFakeTimers();
		const room = new Room('LEAVE');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'addBot' }, a.ws);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		const token = (sent: ServerMessage[]) => {
			const welcome = sent.find((m) => m.t === 'welcome');
			if (welcome?.t !== 'welcome') throw new Error('no welcome');
			return welcome.token;
		};
		return { room, host, guest, a, b, hostToken: token(a.sent), guestToken: token(b.sent) };
	}

	it('keeps the game open while one player stays, and lets the others rejoin their seat', () => {
		const { room, guest, b, guestToken } = twoPlayers();
		room.handle(guest, { t: 'leave' }, b.ws);
		expect(room.abandoned()).toBe(false);
		vi.advanceTimersByTime(60 * 60_000);
		expect(room.abandoned()).toBe(false);
		expect(room.lobbyInfo().seats.find((s) => s.id === guest.id)).toMatchObject({ connected: false, left: true });
		expect(room.peek(guestToken)).toEqual({ open: true, players: ['Ada'] });

		const back = fakeSocket();
		const again = room.join(back.ws, 'Bram', guestToken);
		expect(again).toBe(guest);
		expect(room.lobbyInfo().seats.find((s) => s.id === guest.id)).toMatchObject({ connected: true, left: false });
		expect(back.sent.some((m) => m.t === 'game')).toBe(true);
		room.dispose();
	});

	it('is cancelled at once when every player has left', () => {
		const { room, host, guest, a, b, guestToken } = twoPlayers();
		room.handle(guest, { t: 'leave' }, b.ws);
		room.handle(host, { t: 'leave' }, a.ws);
		expect(room.abandoned()).toBe(true);
		expect(room.peek(guestToken).open).toBe(false);
		room.dispose();
	});

	it('waits a little for a player who only lost the connection', () => {
		const { room, guest, a, b } = twoPlayers();
		room.handle(guest, { t: 'leave' }, b.ws);
		room.disconnect(a.ws);
		expect(room.abandoned()).toBe(false);
		vi.advanceTimersByTime(EMPTY_GRACE_MS - 1000);
		expect(room.abandoned()).toBe(false);
		vi.advanceTimersByTime(1000);
		expect(room.abandoned()).toBe(true);
		room.dispose();
	});

	it('hands hosting to a player still at the table when the host leaves', () => {
		const { room, host, guest, a, hostToken } = twoPlayers();
		room.handle(host, { t: 'leave' }, a.ws);
		expect(room.hostId).toBe(guest.id);
		// Coming back doesn't take it away again.
		room.join(fakeSocket().ws, 'Ada', hostToken);
		expect(room.hostId).toBe(guest.id);
		room.dispose();
	});

	it('holds a game against bots while its player is away, and goes on when they are back', () => {
		const { room, me } = soloTable();
		const token = me.sent.find((m) => m.t === 'welcome')!;
		room.disconnect(me.ws);
		const log = room.game!.log.length;
		vi.advanceTimersByTime(10 * 60_000);
		expect(room.game!.log.length).toBe(log);
		expect(room.abandoned()).toBe(false);

		room.join(fakeSocket().ws, 'Komeil', token.t === 'welcome' ? token.token : undefined);
		vi.advanceTimersByTime(60_000);
		const myIndex = room.seats.findIndex((s) => !s.isBot);
		expect(room.game!.log.length > log || room.game!.current === myIndex).toBe(true);
		room.dispose();
	});

	it('cancels a game against bots when its player leaves', () => {
		const { room, seat, me } = soloTable();
		room.handle(seat, { t: 'leave' }, me.ws);
		expect(room.abandoned()).toBe(true);
		room.dispose();
	});

	it('does not offer a seat to someone who never had one', () => {
		const { room } = twoPlayers();
		expect(room.peek('not-a-token').open).toBe(false);
		expect(room.peek().open).toBe(false);
		room.dispose();
	});
});

describe('spectators', () => {
	afterEach(() => vi.useRealTimers());

	it('see the game without any hand, and can not act or chat', () => {
		const { room, seat, me } = soloTable();
		const fan = fakeSocket();
		room.watch(fan.ws);
		expect(fan.sent[0]).toEqual({ t: 'watching', code: 'ABCDE' });
		const views = () => fan.sent.flatMap((m) => (m.t === 'game' ? [m.view] : []));
		expect(views().length).toBe(1);
		expect(room.lobbyInfo().spectators).toBe(1);
		// The table moves on and they keep up, still without a hand in sight.
		room.handle(seat, { t: 'chat', text: 'Hello watchers' }, me.ws);
		vi.advanceTimersByTime(60_000);
		expect(views().length).toBeGreaterThan(1);
		for (const v of views()) {
			expect(v.me).toBe(-1);
			for (const p of v.players) {
				expect(p.resources).toBeUndefined();
				expect(p.devCards).toBeUndefined();
				expect(p.totalPoints).toBeUndefined();
			}
		}
		// They hold no seat, so nothing they could send reaches the game.
		expect(room.hasSeat(undefined)).toBe(false);
		room.disconnect(fan.ws);
		expect(room.lobbyInfo().spectators).toBe(0);
		room.dispose();
	});

	it('do not keep a table going or count as players', () => {
		const { room, me } = soloTable();
		const fan = fakeSocket();
		room.watch(fan.ws);
		room.disconnect(me.ws);
		expect(room.isEmpty()).toBe(true);
		expect(room.seats.length).toBe(3);
		room.dispose();
		expect(fan.sent.at(-1)).toMatchObject({ t: 'error' });
	});
});

describe('big custom islands and custom goals', () => {
	it('takes any size of island, seats eight on 40 tiles or more, and any goal from 3 to 30', () => {
		const room = new Room('HUGE1');
		const a = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		if (typeof host === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		const tiles = [];
		for (let r = -9; r <= 9; r++)
			for (let q = -9; q <= 9; q++) if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 9) tiles.push({ q, r, terrain: null });
		room.handle(host, { t: 'setMap', map: { custom: { name: 'Vast', tiles } } }, a.ws);
		const map = room.lobbyInfo().settings.map;
		expect('custom' in map ? map.custom.tiles : []).toHaveLength(271);
		expect(room.lobbyInfo().maxPlayers).toBe(8);
		for (let i = 0; i < 8; i++) room.handle(host, { t: 'addBot' }, a.ws);
		expect(room.seats).toHaveLength(8);
		expect(new Set(room.seats.map((s) => s.color)).size).toBe(8);

		room.handle(host, { t: 'setPointsToWin', points: 17 }, a.ws);
		expect(room.lobbyInfo().settings.pointsToWin).toBe(17);
		for (const bad of [2, 31, 12.5, '20']) {
			room.handle(host, { t: 'setPointsToWin', points: bad as number }, a.ws);
			expect(room.lobbyInfo().settings.pointsToWin).toBe(17);
		}
		room.dispose();
	});
});

describe('random islands and balanced goals', () => {
	it('shows a generated island to everyone and caps the goal by island size and players', () => {
		const room = new Room('RAND1');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		const island = randomMap({ tiles: 30, shape: 'islands', lakes: true, seed: 42 });
		room.handle(guest, { t: 'setMap', map: { custom: island } }, b.ws);
		expect(room.lobbyInfo().settings.map).toEqual({ preset: 'great' });
		room.handle(host, { t: 'setMap', map: { custom: island } }, a.ws);
		// The guest's lobby carries the island and how it was made, so they see it too.
		const seen = [...b.sent].reverse().find((m) => m.t === 'lobby');
		const map = seen && seen.t === 'lobby' ? seen.lobby.settings.map : null;
		expect(map && 'custom' in map ? map.custom : null).toEqual(island);

		// Three players on 30 tiles can play to 20; adding three more brings the goal down to 12.
		room.handle(host, { t: 'addBot' }, a.ws);
		room.handle(host, { t: 'setPointsToWin', points: 20 }, a.ws);
		expect(room.lobbyInfo().settings.pointsToWin).toBe(20);
		for (let i = 0; i < 3; i++) room.handle(host, { t: 'addBot' }, a.ws);
		expect(room.seats).toHaveLength(6);
		expect(room.lobbyInfo().settings.pointsToWin).toBe(12);
		// Six players on 30 tiles: 20 points would never end, 12 is the most.
		room.handle(host, { t: 'setPointsToWin', points: 20 }, a.ws);
		expect(room.lobbyInfo().settings.pointsToWin).toBe(12);
		expect(a.sent.some((m) => m.t === 'error' && m.message.includes('at most 12'))).toBe(true);
		room.handle(host, { t: 'setPointsToWin', points: 8 }, a.ws);
		expect(room.lobbyInfo().settings.pointsToWin).toBe(8);
		room.dispose();
	});
});

describe('bot trade offers', () => {
	afterEach(() => vi.useRealTimers());

	/** A person and a bot, past the setup: the bot one Ore short of a city, the person holding Ore. */
	function table() {
		vi.useFakeTimers();
		const room = new Room('OFFER');
		const me = fakeSocket();
		const seat = room.join(me.ws, 'Komeil');
		if (typeof seat === 'string') throw new Error(seat);
		room.handle(seat, { t: 'addBot' }, me.ws);
		room.handle(seat, { t: 'start' }, me.ws);
		// Hold the table while the bot is handed its turn.
		room.handle(seat, { t: 'pauseGame', paused: true }, me.ws);
		const bot = room.seats.findIndex((s) => s.isBot);
		const person = 1 - bot;
		let g = room.game!;
		while (g.phase === 'setup') {
			const r = applyAction(g, g.current, botAction(g, g.current)!);
			if (!r.ok) throw new Error(r.error);
			g = r.state;
		}
		g = structuredClone(g);
		g.step = 'main';
		g.current = bot;
		const none = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
		g.players[bot].resources = { ...none, wheat: 2, ore: 2, wood: 2 };
		g.players[person].resources = { ...none, ore: 2 };
		for (const r of RESOURCES) g.bank[r] = BANK_PER_RESOURCE - g.players.reduce((n, p) => n + p.resources[r], 0);
		g.log.push({ type: 'turnStarted', player: bot, turn: g.turn, seq: g.nextEventSeq++ } as GameEvent);
		room.game = g;
		room.handle(seat, { t: 'pauseGame', paused: false }, me.ws);
		// The bot asks for the Ore.
		for (let ms = 0; ms < 5000 && !room.game.trade; ms += 50) vi.advanceTimersByTime(50);
		expect(room.game.trade).toMatchObject({ from: bot, give: { wood: 1 }, want: { ore: 1 } });
		return { room, seat, me, bot, person };
	}

	it('waits a while for a person to answer, then withdraws the offer', () => {
		const { room } = table();
		const id = room.game!.trade!.id;
		vi.advanceTimersByTime(BOT_OFFER_MS - 1000);
		expect(room.game!.trade?.id).toBe(id);
		// Withdrawn after the bot's usual pause.
		vi.advanceTimersByTime(2500);
		expect(room.game!.trade?.id).not.toBe(id);
		expect(room.game!.log.some((e) => e.type === 'tradeCancelled')).toBe(true);
		room.dispose();
	});

	it('trades as soon as the person accepts', () => {
		const { room, seat, me, bot, person } = table();
		const offerId = room.game!.trade!.id;
		vi.advanceTimersByTime(1000);
		room.handle(seat, { t: 'action', action: { type: 'respondTrade', offerId, accept: true } }, me.ws);
		vi.advanceTimersByTime(2000);
		expect(room.game!.log.find((e) => e.type === 'tradeCompleted')).toMatchObject({ from: bot, to: person });
		expect(room.game!.players[person].resources).toMatchObject({ ore: 1, wood: 1 });
		room.dispose();
	});
});
