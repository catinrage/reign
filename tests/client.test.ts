import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../src/client/state/client.svelte';
import { botAction } from '../src/shared/rules/bot';
import { allBuildings } from '../src/shared/rules/buildings';
import { DEFAULT_EVENT_RULES, EVENT_CARDS, EVENT_SHOW_MS } from '../src/shared/rules/events';
import { applyAction, createGame } from '../src/shared/rules/engine';
import type { Action, GameEvent, GameState, ResourceGain } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';
import { settings } from '../src/client/ui/settings.svelte';

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
		// Game states only count for a player the server has seated.
		client.seat = 'p0';
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

	it('counts the cards a Monopoly or a Year of Plenty brings as they land', () => {
		const g = botGame(17);
		while (g.state.phase === 'setup') receive(g.step());
		vi.advanceTimersByTime(6000);
		// Player 0 holds both cards; the others hold wheat to lose.
		const s0 = g.state;
		const s: GameState = {
			...s0,
			current: 0,
			step: 'main',
			players: s0.players.map((pl, i) => ({
				...pl,
				resources: { ...pl.resources, wheat: i === 0 ? 0 : i + 1 },
				devCards:
					i === 0
						? [
								{ type: 'monopoly', boughtTurn: -1 },
								{ type: 'yearOfPlenty', boughtTurn: -1 }
							]
						: pl.devCards
			}))
		};
		receive(s);
		expect(client.dealt).toEqual([]);

		const mono = applyAction(s, 0, { type: 'playMonopoly', resource: 'wheat' });
		if (!mono.ok) throw new Error(mono.error);
		receive(mono.state);
		// The cards taken from the others are on their way to player 0, and count as they land.
		expect(client.onTheWay(0, 'wheat')).toBe(5);
		expect(client.onTheWay(1) + client.onTheWay(2)).toBe(0);
		client.arrived(0, 'wheat');
		expect(client.onTheWay(0, 'wheat')).toBe(4);

		const plenty = applyAction({ ...mono.state, devCardPlayedThisTurn: false }, 0, {
			type: 'playYearOfPlenty',
			resources: ['ore', 'ore']
		});
		if (!plenty.ok) throw new Error(plenty.error);
		receive(plenty.state);
		expect(client.onTheWay(0, 'ore')).toBe(2);
		// Whatever hasn't arrived by then counts anyway.
		vi.advanceTimersByTime(5000);
		expect(client.dealt).toEqual([]);
	});

	it('counts the cards a trade brings as they land', () => {
		const g = botGame(17);
		while (g.state.phase === 'setup') receive(g.step());
		vi.advanceTimersByTime(6000);
		const s0 = g.state;
		const s: GameState = {
			...s0,
			current: 0,
			step: 'main',
			players: s0.players.map((pl) => ({
				...pl,
				resources: { wood: 4, brick: 1, sheep: 1, wheat: 0, ore: 1 }
			}))
		};
		receive(s);
		expect(client.dealt).toEqual([]);

		const play = (state: GameState, p: number, a: Action) => {
			const r = applyAction(state, p, a);
			if (!r.ok) throw new Error(r.error);
			return r.state;
		};
		// The card bought from the bank flies over and counts as it lands; the wood paid just goes.
		const bank = play(s, 0, { type: 'bankTrade', give: 'wood', get: 'wheat' });
		receive(bank);
		expect(client.onTheWay(0)).toBe(1);
		client.arrived(0, 'wheat');
		expect(client.dealt).toEqual([]);

		// Between players, each side's cards are on their way to the other.
		const offered = play(bank, 0, {
			type: 'offerTrade',
			give: { brick: 1 },
			want: { ore: 1, sheep: 1 }
		});
		const offerId = offered.trade!.id;
		const accepted = play(offered, 1, { type: 'respondTrade', offerId, accept: true });
		receive(accepted);
		const traded = play(accepted, 0, { type: 'confirmTrade', offerId, with: 1 });
		receive(traded);
		expect(client.onTheWay(1, 'brick')).toBe(1);
		expect(client.onTheWay(0, 'ore')).toBe(1);
		expect(client.onTheWay(0, 'sheep')).toBe(1);
		client.arrived(0, 'ore');
		expect(client.onTheWay(0)).toBe(1);
		// Whatever hasn't arrived by then counts anyway.
		vi.advanceTimersByTime(5000);
		expect(client.dealt).toEqual([]);
	});

	it('counts a stolen card as it lands, face down when it is not yours or taken from you', () => {
		const g = botGame(17);
		while (g.state.phase === 'setup') receive(g.step());
		vi.advanceTimersByTime(6000);
		receive(g.state);
		expect(client.dealt).toEqual([]);
		// The thief may steal from the victim, whose only card is an ore.
		const steal = (state: GameState, thief: number, victim: number) => {
			const robbable: GameState = {
				...state,
				current: thief,
				step: 'steal',
				resumeStep: 'main',
				stealCandidates: [victim],
				players: state.players.map((pl, i) =>
					i === victim
						? { ...pl, resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 1 } }
						: pl
				)
			};
			const r = applyAction(robbable, thief, { type: 'steal', victim });
			if (!r.ok) throw new Error(r.error);
			receive(r.state);
			return r.state;
		};

		// Player 0 steals: the ore is on its way to their hand.
		const mine = steal(g.state, 0, 1);
		expect(client.onTheWay(0, 'ore')).toBe(1);
		client.arrived(0, 'ore');
		expect(client.dealt).toEqual([]);

		// Between two others: a card is on its way to the thief, but player 0 can't tell which.
		const theirs = steal(mine, 1, 2);
		expect(client.onTheWay(1)).toBe(1);
		expect(client.onTheWay(1, 'ore')).toBe(0);
		client.arrived(1, null);
		expect(client.dealt).toEqual([]);

		// Stolen from player 0, who knows what they lost; it counts anyway after a while.
		steal(theirs, 2, 0);
		expect(client.onTheWay(2, 'ore')).toBe(1);
		vi.advanceTimersByTime(5000);
		expect(client.dealt).toEqual([]);
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

	it('keeps the tile another player aims the robber at until the robber moves', () => {
		const g = botGame(7);
		let s = g.state;
		for (let i = 0; i < 5000 && s.step !== 'moveRobber'; i++) receive((s = g.step()));
		expect(s.step).toBe('moveRobber');
		const hex = s.board.hexes.findIndex((_, h) => h !== s.robberHex);
		(client as any).onMessage({ t: 'aim', player: s.current, hex });
		expect(client.aim).toEqual({ player: s.current, hex });
		// A state that changes nothing about the robber keeps it.
		receive(s);
		expect(client.aim).toEqual({ player: s.current, hex });
		receive(g.step());
		expect(client.aim).toBeNull();
	});
});

describe('client: following an invite link', () => {
	let sent: { t: string }[];
	const msg = (m: object) => (client as any).onMessage(m);
	const welcome = { t: 'welcome', code: 'ABCDE', seat: 's1', token: 'tok' };
	const lobby = (started = false) => ({
		t: 'lobby',
		lobby: { code: 'ABCDE', started, clock: null }
	});
	beforeEach(() => {
		vi.stubGlobal('location', new URL('http://localhost/?room=ABCDE'));
		vi.stubGlobal('history', { replaceState() {} });
		vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
		sent = [];
		vi.spyOn(client, 'send').mockImplementation((m) => void sent.push(m));
		client.leave();
		client.joining = { code: 'ABCDE', error: null };
		client.join('ABCDE');
		sent.length = 0;
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('keeps the loading screen up until the lobby arrives', () => {
		msg(welcome);
		expect(client.joining).not.toBeNull();
		msg(lobby());
		expect(client.joining).toBeNull();
		expect(client.lobby?.code).toBe('ABCDE');
	});

	it('waits for the game itself when the table is already playing', () => {
		msg(welcome);
		msg(lobby(true));
		expect(client.joining).not.toBeNull();
		const s = createGame(players, 3);
		msg({ t: 'game', view: viewFor(s, 0), clock: null });
		expect(client.joining).toBeNull();
	});

	it('says on the loading screen why the room could not be joined', () => {
		msg({ t: 'error', message: "That game doesn't exist (or it ended)." });
		expect(client.joining).toEqual({
			code: 'ABCDE',
			error: "That game doesn't exist (or it ended)."
		});
		expect(client.toasts.at(-1)?.text).not.toBe("That game doesn't exist (or it ended).");
		client.cancelJoin();
		expect(client.joining).toBeNull();
	});

	it('leaves the room straight away when the player backs out before the server answers', () => {
		client.cancelJoin();
		expect(client.joining).toBeNull();
		msg(welcome);
		msg(lobby());
		expect(sent).toEqual([{ t: 'leave' }]);
		expect(client.seat).toBeNull();
		expect(client.lobby).toBeNull();
	});
});

describe('client: Play vs bots and missions skip the lobby', () => {
	let sent: { t: string }[];
	const msg = (m: object) => (client as any).onMessage(m);
	const welcome = { t: 'welcome', code: 'ABCDE', seat: 's1', token: 'tok' };
	const lobby = (started = false) => ({
		t: 'lobby',
		lobby: { code: 'ABCDE', started, clock: null }
	});
	const game = () => msg({ t: 'game', view: viewFor(createGame(players, 3), 0), clock: null });
	beforeEach(() => {
		vi.stubGlobal('location', new URL('http://localhost/'));
		vi.stubGlobal('history', { replaceState() {} });
		vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
		sent = [];
		vi.spyOn(client, 'send').mockImplementation((m) => void sent.push(m));
		client.leave();
		sent.length = 0;
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("keeps the menu up through the bot table's lobby until the game arrives", () => {
		client.quickPlay(3);
		expect(client.launching).toBe(true);
		msg(welcome);
		msg(lobby());
		expect(sent.map((m) => m.t)).toEqual([
			'create',
			'offerWait',
			'addBot',
			'addBot',
			'addBot',
			'start'
		]);
		expect(client.launching).toBe(true);
		msg(lobby(true));
		expect(client.launching).toBe(true);
		game();
		expect(client.launching).toBe(false);
	});

	it('does the same for a campaign mission', () => {
		client.playMission('first-landing');
		msg(welcome);
		msg(lobby());
		expect(sent.at(-1)).toEqual({ t: 'mission', mission: 'first-landing' });
		expect(client.launching).toBe(true);
		game();
		expect(client.launching).toBe(false);
	});

	it('shows the lobby when the table could not start on its own', () => {
		client.quickPlay(3);
		msg(welcome);
		msg(lobby());
		msg({ t: 'error', message: 'Waiting for Ada to be ready.' });
		expect(client.launching).toBe(false);
		expect(client.lobby?.code).toBe('ABCDE');
	});
});

describe('client: event cards', () => {
	let sent: unknown[];
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('location', new URL('http://localhost/'));
		vi.stubGlobal('history', { replaceState() {} });
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		sent = [];
		vi.spyOn(client, 'send').mockImplementation((m) => void sent.push(m));
		client.leave();
		client.seat = 'p0';
		sent.length = 0;
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('holds the interface while an event card that turned over is shown, then plays it out', () => {
		let s = createGame(players, 21, undefined, {
			mode: 'extended',
			map: { preset: 'great' },
			characters: false,
			buildings: allBuildings(false),
			events: { ...DEFAULT_EVENT_RULES, pulled: EVENT_CARDS.filter((c) => c !== 'plagueOfRats') }
		});
		receive(s);
		// The setup's last placement turns the first card over.
		let before = s;
		while (s.phase === 'setup') {
			before = s;
			s = (applyAction(s, s.current, botAction(s, s.current)!) as { state: GameState }).state;
			if (s.phase === 'setup') receive(s);
		}
		receive(before);
		receive(s);
		const drawn = s.log.find((e) => e.type === 'eventDrawn')!;
		expect(client.presenting).toMatchObject({ seq: drawn.seq, card: 'plagueOfRats', phase: 'flip' });
		expect(client.view!.version).toBe(before.version);
		client.act({ type: 'rollDice' });
		expect(sent).toEqual([]);
		// Put down: the interface shows what it did while it plays out, and play still waits.
		client.reveal(drawn.seq);
		expect(client.presenting!.phase).toBe('effect');
		expect(client.view).toBe(client.latest);
		client.act({ type: 'rollDice' });
		expect(sent).toEqual([]);
		client.presented(drawn.seq);
		expect(client.presenting).toBeNull();
		if (s.current === 0) {
			client.act({ type: 'rollDice' });
			expect(sent).toHaveLength(1);
		}
	});

	it('lets play go on when an event card is never put down', () => {
		let s = createGame(players, 22, undefined, {
			mode: 'extended',
			map: { preset: 'great' },
			characters: false,
			buildings: allBuildings(false)
		});
		receive(s);
		while (s.phase === 'setup') {
			s = (applyAction(s, s.current, botAction(s, s.current)!) as { state: GameState }).state;
			receive(s);
		}
		expect(client.presenting).not.toBeNull();
		vi.advanceTimersByTime(EVENT_SHOW_MS + 1400);
		expect(client.presenting).not.toBeNull();
		vi.advanceTimersByTime(200);
		expect(client.presenting).toBeNull();
		expect(client.view).toBe(client.latest);
	});
});

describe("client: hiding offers you can't accept", () => {
	let sent: unknown[];
	beforeEach(() => {
		vi.stubGlobal('location', new URL('http://localhost/'));
		vi.stubGlobal('history', { replaceState() {} });
		sent = [];
		vi.spyOn(client, 'send').mockImplementation((m) => void sent.push(m));
		client.leave();
		client.seat = 'p0';
		sent.length = 0;
	});
	afterEach(() => {
		settings.setHideOffers(false);
		settings.setOfferWait(8);
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	const NONE = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };

	/** A game past its setup with player 1 asking the table for an Ore; player 0 holds `ore`. */
	function offered(ore: number): GameState {
		let s = createGame(players, 31);
		while (s.phase === 'setup') s = (applyAction(s, s.current, botAction(s, s.current)!) as { state: GameState }).state;
		s = structuredClone(s);
		s.step = 'main';
		s.current = 1;
		s.players[0].resources = { ...NONE, ore, wood: 3 };
		s.players[1].resources = { ...NONE, wood: 2 };
		s.trade = { id: 1, from: 1, give: { wood: 1 }, want: { ore: 1 }, responses: {} };
		return s;
	}
	const declines = () => sent.filter((m: any) => m.t === 'action' && m.action.type === 'respondTrade');

	it('declines an offer you have no cards for, once', () => {
		settings.setHideOffers(true);
		const s = offered(0);
		receive(s);
		expect(declines()).toEqual([{ t: 'action', action: { type: 'respondTrade', offerId: 1, accept: false } }]);
		// The same offer again, before the answer is back: not answered twice.
		receive(s);
		expect(declines()).toHaveLength(1);
	});

	it("leaves an offer you can accept, and every offer while it's off", () => {
		settings.setHideOffers(true);
		receive(offered(1));
		expect(declines()).toEqual([]);
		settings.setHideOffers(false);
		receive(offered(0));
		expect(declines()).toEqual([]);
		// Turned on with the offer open: declined then.
		client.setHideOffers(true);
		expect(declines()).toHaveLength(1);
	});

	it("answers the next offer with the same number (the next game's) too", () => {
		settings.setHideOffers(true);
		receive(offered(0));
		const closed = offered(0);
		closed.trade = null;
		receive(closed);
		receive(offered(0));
		expect(declines()).toHaveLength(2);
	});

	it('tells the table how long bots should wait, and only the waits there are', () => {
		client.setOfferWait(0);
		expect(sent).toEqual([{ t: 'offerWait', seconds: 0 }]);
		client.setOfferWait(45);
		expect(settings.offerWait).toBe(0);
		client.setOfferWait(15);
		expect(settings.offerWait).toBe(15);
	});
});
