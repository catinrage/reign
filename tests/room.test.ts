import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../src/shared/protocol';
import { Room } from '../src/server/room';

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
