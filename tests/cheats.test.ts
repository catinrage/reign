import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { Room } from '../src/server/room';
import type { ServerMessage } from '../src/shared/protocol';
import { applyCheat, type Cheat } from '../src/shared/rules/cheats';
import { applyAction } from '../src/shared/rules/engine';

function fakeSocket() {
	const sent: ServerMessage[] = [];
	const ws = { readyState: 1, OPEN: 1, send: (data: string) => sent.push(JSON.parse(data)) };
	return { ws: ws as unknown as WebSocket, sent };
}

function table(cheats: boolean) {
	vi.useFakeTimers();
	const room = new Room('CHEAT', cheats);
	const me = fakeSocket();
	const seat = room.join(me.ws, 'Komeil');
	if (typeof seat === 'string') throw new Error(seat);
	room.handle(seat, { t: 'addBot' }, me.ws);
	room.handle(seat, { t: 'start' }, me.ws);
	const cheat = (c: Cheat) => room.handle(seat, { t: 'cheat', cheat: c }, me.ws);
	return { room, seat, me, cheat, index: () => room.seats.indexOf(seat) };
}

describe('dev cheats', () => {
	afterEach(() => vi.useRealTimers());

	it('are refused unless the room was made by the dev server', () => {
		const { room, me, cheat, index } = table(false);
		expect(me.sent.find((m) => m.t === 'welcome')).not.toHaveProperty('cheats');
		cheat({ type: 'resources', player: index(), resources: { ore: 5 } });
		expect(room.game!.players[index()].resources.ore).toBe(0);
		expect(me.sent.at(-1)).toMatchObject({ t: 'error' });
		room.dispose();
	});

	it('tell the client they are on and hand out cards', () => {
		const { room, me, cheat, index } = table(true);
		expect(me.sent.find((m) => m.t === 'welcome')).toMatchObject({ cheats: true });
		cheat({ type: 'resources', player: index(), resources: { ore: 5, wood: 2 } });
		expect(room.game!.players[index()].resources).toMatchObject({ ore: 5, wood: 2 });
		expect(room.game!.log.at(-1)).toMatchObject({ type: 'cheat', text: 'took 2 Lumber, 5 Ore' });
		cheat({ type: 'clearHand', player: index() });
		expect(room.game!.players[index()].resources.ore).toBe(0);
		room.dispose();
	});

	it('finish the setup, give a playable card, rig the dice and win', () => {
		const { room, cheat, index } = table(true);
		cheat({ type: 'finishSetup' });
		const g = room.game!;
		expect(g.phase).toBe('main');
		expect(g.buildings.filter(Boolean)).toHaveLength(4);

		const me = index();
		const deck = g.devDeck.length;
		cheat({ type: 'devCard', player: me, card: 'monopoly' });
		expect(room.game!.devDeck.length).toBe(deck - 1);
		// Playable straight away, not only from the next turn.
		const mine = { ...room.game!, current: me, step: 'main' as const };
		expect(applyAction(mine, me, { type: 'playMonopoly', resource: 'ore' }).ok).toBe(true);

		for (const total of [2, 7, 12]) {
			const rigged = applyCheat(room.game!, me, { type: 'rigDice', total });
			if (!rigged.ok) throw new Error(rigged.error);
			const s = { ...rigged.state, step: 'roll' as const, current: me };
			const rolled = applyAction(s, me, { type: 'rollDice' });
			if (!rolled.ok) throw new Error(rolled.error);
			expect(rolled.state.dice![0] + rolled.state.dice![1]).toBe(total);
		}

		cheat({ type: 'win', player: me });
		expect(room.game!.phase).toBe('ended');
		expect(room.game!.winner).toBe(me);
		expect(room.game!.log.at(-1)).toMatchObject({ type: 'gameOver', winner: me });
		room.dispose();
	});

	it('make bots move without the human pause', () => {
		const { room, seat, me, cheat, index } = table(true);
		cheat({ type: 'finishSetup' });
		if (room.game!.current === index()) {
			cheat({ type: 'rigDice', total: 6 });
			room.handle(seat, { t: 'action', action: { type: 'rollDice' } }, me.ws);
			room.handle(seat, { t: 'action', action: { type: 'endTurn' } }, me.ws);
		}
		expect(room.seats[room.game!.current].isBot).toBe(true);
		cheat({ type: 'fastBots', on: true });
		const before = room.game!.log.length;
		// A bot normally waits well over half a second before each move.
		vi.advanceTimersByTime(300);
		expect(room.game!.log.length).toBeGreaterThan(before);
		room.dispose();
	});
});
