import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../src/shared/protocol';
import { Room } from '../src/server/room';
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
		expect(room.lobbyInfo().settings).toEqual({ mode: 'extended', map: { preset: 'realm' }, pointsToWin: 12 });
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.board.hexes).toHaveLength(37);
		expect(room.game!.pointsToWin).toBe(12);
		// Settings are locked while the game runs.
		room.handle(host, { t: 'setMode', mode: 'classic' }, a.ws);
		expect(room.lobbyInfo().settings.mode).toBe('extended');
		room.dispose();
	});

	it('deals every seat a different character and refuses a taken one', () => {
		const room = new Room('CHARS');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'addBot' }, a.ws);
		const chars = room.lobbyInfo().seats.map((s) => s.character);
		expect(new Set(chars).size).toBe(3);
		room.handle(guest, { t: 'setCharacter', character: host.character! }, b.ws);
		expect(guest.character).not.toBe(host.character);
		expect(b.sent.some((m) => m.t === 'error')).toBe(true);
		const free = (['merchant', 'mason', 'scholar', 'veteran'] as const).find((c) => !chars.includes(c))!;
		room.handle(guest, { t: 'setCharacter', character: free }, b.ws);
		expect(guest.character).toBe(free);
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
