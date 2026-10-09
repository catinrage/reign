import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../src/client/state/client.svelte';
import { botAction } from '../src/shared/rules/bot';
import { applyAction, createGame } from '../src/shared/rules/engine';
import type { GameEvent, GameState, ResourceGain } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

/**
 * The interface shows what a roll did only once the dice have landed, and counts the cards the
 * board deals as they reach their hands. These tests feed the client the states of a bot game as
 * the server sends them to player 0, and play the 3D scene's part by hand.
 */

const players = (['red', 'blue', 'yellow'] as const).map((color, i) => ({
	name: `P${i}`,
	color,
	isBot: true
}));

/** A bot game played one action at a time, the way the server runs it. */
function botGame(seed: number) {
	let s = createGame(players, seed);
	let perTurn = 0;
	let lastTurn = -1;
	return {
		get state() {
			return s;
		},
		step(): GameState {
			if (s.turn !== lastTurn) {
				lastTurn = s.turn;
				perTurn = 0;
			}
			// Answers out of turn (discards) first, then the player whose turn it is.
			let p = s.players.findIndex((_, i) => i !== s.current && botAction(s, i));
			if (p < 0) p = s.current;
			const action = botAction(s, p, p === s.current ? perTurn++ : 0)!;
			const r = applyAction(s, p, action);
			if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
			return (s = r.state);
		}
	};
}

function receive(s: GameState) {
	(client as any).onMessage({ t: 'game', view: viewFor(s, 0), clock: null });
}

const newest = (log: GameEvent[]) => log[log.length - 1].seq;

/** Play on, sending each state to the client, until one holds a new roll. */
function rollNext(g: ReturnType<typeof botGame>) {
	const after = newest(g.state.log);
	for (let i = 0; i < 5000; i++) {
		const s = g.step();
		receive(s);
		const roll = s.log.find((e) => e.type === 'diceRolled' && e.seq > after);
		if (roll?.type === 'diceRolled') {
			const gains = s.log.flatMap((e) =>
				e.seq > roll.seq && e.type === 'produced' ? e.gains : []
			);
			return { s, roll, gains };
		}
	}
	throw new Error('nobody rolled');
}

const total = (gains: ResourceGain[], player: number) =>
	gains.filter((g) => g.player === player).reduce((n, g) => n + g.amount, 0);

describe('client: rolls and dealt cards', () => {
	let sent: unknown[];
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('location', new URL('http://localhost/'));
		vi.stubGlobal('history', { replaceState() {} });
		// Bots break ties at random: without it each test plays the same game every run.
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		sent = [];
		vi.spyOn(client, 'send').mockImplementation((m) => void sent.push(m));
		client.leave();
		sent.length = 0;
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('shows what a roll did only once the dice land', () => {
		const { s, roll } = rollNext(botGame(11));
		// The scene has the new state at once; the interface keeps the one from before the roll.
		expect(client.latest!.version).toBe(s.version);
		expect(newest(client.view!.log)).toBeLessThan(roll.seq);
		expect(client.tossing).toEqual({ seq: roll.seq, player: roll.player, dice: roll.dice });
		expect(client.lastRoll).toBeNull();
		// Nothing is played from that stale state while the dice are in the air.
		client.act({ type: 'endTurn' });
		expect(sent).toEqual([]);
		client.landed(roll.seq);
		expect(client.tossing).toBeNull();
		expect(client.view).toBe(client.latest);
		expect(client.lastRoll).toEqual({ seq: roll.seq, player: roll.player, dice: roll.dice });
	});

	it('lets the interface catch up when the dice never land', () => {
		rollNext(botGame(12));
		expect(client.tossing).not.toBeNull();
		vi.advanceTimersByTime(3900);
		expect(client.view).not.toBe(client.latest);
		vi.advanceTimersByTime(200);
		expect(client.tossing).toBeNull();
		expect(client.view).toBe(client.latest);
	});

	it('waits for the newest roll when an older one lands', () => {
		const g = botGame(13);
		const first = rollNext(g).roll;
		const second = rollNext(g).roll;
		expect(client.tossing!.seq).toBe(second.seq);
		client.landed(first.seq);
		expect(client.tossing).not.toBeNull();
		client.landed(second.seq);
		expect(client.tossing).toBeNull();
		expect(client.view).toBe(client.latest);
	});

	it('counts the cards a roll deals as they reach their hands, or after a while', () => {
		const g = botGame(14);
		// Past the setup and the cards it dealt.
		while (g.state.phase === 'setup') receive(g.step());
		vi.advanceTimersByTime(6000);
		let r = rollNext(g);
		for (let i = 0; i < 300 && !(total(r.gains, 0) && total(r.gains, 1)); i++) {
			client.landed(r.roll.seq);
			vi.advanceTimersByTime(6000);
			r = rollNext(g);
		}
		expect(total(r.gains, 0)).toBeGreaterThan(0);
		expect(client.dealt).toEqual([]);
		client.landed(r.roll.seq);
		for (const p of [0, 1, 2]) expect(client.onTheWay(p)).toBe(total(r.gains, p));
		// One card at a time, as each reaches its hand.
		const card = r.gains.find((x) => x.player === 0)!;
		const owed = client.onTheWay(0, card.resource);
		client.arrived(0, card.resource);
		expect(client.onTheWay(0, card.resource)).toBe(owed - 1);
		expect(client.onTheWay(0)).toBe(total(r.gains, 0) - 1);
		// Whatever hasn't arrived by then counts anyway.
		vi.advanceTimersByTime(5000);
		expect(client.dealt).toEqual([]);
	});

	it('deals the resources of a second settlement the same way', () => {
		const g = botGame(15);
		let gains: ResourceGain[] = [];
		for (let i = 0; i < 200 && !gains.length; i++) {
			const after = newest(g.state.log);
			const s = g.step();
			receive(s);
			gains = s.log.flatMap((e) =>
				e.seq > after && e.type === 'setupResources' && e.player === 0 ? e.gains : []
			);
		}
		expect(gains.length).toBeGreaterThan(0);
		expect(client.tossing).toBeNull();
		expect(client.onTheWay(0)).toBe(total(gains, 0));
		for (const x of gains) client.arrived(0, x.resource);
		expect(client.onTheWay(0)).toBe(0);
	});

	it('starts over with a new game, whose events count from the start again', () => {
		const g = botGame(16);
		const { roll } = rollNext(g);
		client.landed(roll.seq);
		expect(client.lastRoll).not.toBeNull();
		const next = botGame(17);
		receive(next.step());
		expect(client.tossing).toBeNull();
		expect(client.view).toBe(client.latest);
		expect(client.lastRoll).toBeNull();
		// Its first roll is held like any other.
		const first = rollNext(next).roll;
		expect(client.tossing?.seq).toBe(first.seq);
	});
});
