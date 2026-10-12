import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { Room } from '../src/server/room';
import { MISSIONS, missionById, missionOpen, nextMission, type Mission } from '../src/shared/campaign/missions';
import { cleanProgress, withResult } from '../src/shared/campaign/progress';
import { createMissionGame, missionSeats } from '../src/shared/campaign/start';
import type { ServerMessage } from '../src/shared/protocol';
import { botAction, closeOffer } from '../src/shared/rules/bot';
import { campaignRound, goalMet, missionResult } from '../src/shared/rules/campaign';
import { BANK_PER_RESOURCE, RESOURCES, totalResources } from '../src/shared/rules/config';
import { applyAction } from '../src/shared/rules/engine';
import type { Action, GameEvent, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'orange'] as const;
const RICH = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };

function mission(id: string): Mission {
	const m = missionById(id);
	if (!m) throw new Error(`no mission ${id}`);
	return m;
}

/** A mission's game (the bot logic plays the hero's seat too, in playUntil). */
function deal(id: string, seed = 7): GameState {
	const m = mission(id);
	return createMissionGame(m, missionSeats(m, { name: 'Hero', color: 'red' }, COLORS, () => 0.5), seed);
}

/** Everything the moves in this test did (the game's own log keeps only the latest). */
let heard: GameEvent[] = [];
beforeEach(() => {
	heard = [];
});

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	heard.push(...r.events);
	return r.state;
}

function error(s: GameState, p: number, a: Action): string | undefined {
	const r = applyAction(s, p, a);
	return r.ok ? undefined : r.error;
}

/** Bots play every seat until `done` (or the game ends): anyone off-turn who has a move first. */
function playUntil(s: GameState, done: (s: GameState) => boolean, limit = 40000): GameState {
	let perTurn = 0;
	let lastTurn = -1;
	for (let i = 0; i < limit && s.phase !== 'ended' && !done(s); i++) {
		if (s.turn !== lastTurn) {
			lastTurn = s.turn;
			perTurn = 0;
		}
		const other = s.players.findIndex((_, p) => p !== s.current && botAction(s, p));
		if (other >= 0) {
			s = act(s, other, botAction(s, other)!);
			continue;
		}
		const a = botAction(s, s.current, perTurn++) ?? (s.trade?.from === s.current ? closeOffer(s, s.current) : null);
		if (!a) throw new Error(`no move for ${s.current} in ${s.phase}/${s.step}`);
		s = act(s, s.current, a);
	}
	return s;
}

/** Past setup, in the hero's main step, with plenty in hand. */
function heroMain(id: string): GameState {
	let s = playUntil(deal(id), (s) => s.phase === 'main');
	s = playUntil(s, (s) => s.current === s.campaign!.hero && s.step === 'main');
	s = structuredClone(s);
	s.players[s.campaign!.hero].resources = { ...RICH };
	for (const r of RESOURCES) s.bank[r] = BANK_PER_RESOURCE - s.players.reduce((n, p) => n + p.resources[r], 0);
	return s;
}

const lines = () => heard.filter((e): e is Extract<GameEvent, { type: 'campaignLine' }> => e.type === 'campaignLine');

describe('mission list', () => {
	it('has unique ids, rivals and goals that make sense', () => {
		expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
		for (const m of MISSIONS) {
			expect(m.rivals.length).toBeGreaterThan(0);
			expect(m.rivals.filter((r) => r.boss).length).toBeLessThanOrEqual(1);
			expect(m.goals.length).toBe(2);
			expect(m.intro.length).toBeGreaterThan(0);
			// Every line has someone at the table to say it, and nobody sits there twice.
			const cast = m.rivals.map((r) => r.character);
			expect(new Set(cast).size, m.id).toBe(cast.length);
			if (m.hero?.character) expect(cast, m.id).not.toContain(m.hero.character);
			for (const b of m.beats) if (!['narrator', 'boss', 'them'].includes(b.speaker)) expect(cast, `${m.id}: ${b.line}`).toContain(b.speaker);
			if (m.mode === 'classic') expect(m.hero?.character, m.id).toBeUndefined();
		}
	});

	it('fills all three acts', () => {
		for (const act of [1, 2, 3]) expect(MISSIONS.filter((m) => m.act === act).length).toBe(4);
	});

	it('opens one mission after another', () => {
		const [a, b, c] = MISSIONS;
		expect(missionOpen(a.id, () => false)).toBe(true);
		expect(missionOpen(b.id, () => false)).toBe(false);
		expect(missionOpen(b.id, (id) => id === a.id)).toBe(true);
		expect(missionOpen(c.id, (id) => id === a.id)).toBe(false);
		// Every act can be started straight away.
		for (const act of [2, 3]) {
			const [first, second] = MISSIONS.filter((m) => m.act === act);
			expect(missionOpen(first.id, () => false)).toBe(true);
			expect(missionOpen(second.id, () => false)).toBe(false);
			expect(missionOpen(second.id, (id) => id === first.id)).toBe(true);
		}
		expect(missionOpen('nope', () => true)).toBe(false);
		expect(nextMission(a.id)?.id).toBe(b.id);
		expect(nextMission(MISSIONS[MISSIONS.length - 1].id)).toBeUndefined();
	});
});

describe('dealing a mission', () => {
	it('seats the hero where the mission says and names the rivals', () => {
		const m = mission('washed-ashore');
		const seats = missionSeats(m, { name: 'Hero', color: 'blue' }, COLORS);
		expect(seats[0]).toMatchObject({ name: 'Hero', isBot: false, cast: null });
		expect(seats[1]).toMatchObject({ isBot: true, cast: 'shepherd' });
		expect(seats[1].color).not.toBe('blue');
	});

	it('deals the same island every attempt, and the mission rules', () => {
		const a = deal('barons-shard', 1);
		const b = deal('barons-shard', 2);
		expect(a.board.hexes).toEqual(b.board.hexes);
		const c = a.campaign!;
		expect(c.roundLimit).toBe(24);
		expect(a.pointsToWin).toBe(10);
		// The baron starts with a hidden point, taken out of the deck.
		const boss = a.players[c.boss!];
		expect(boss.devCards.filter((d) => d.type === 'victoryPoint')).toHaveLength(1);
		expect(a.devDeck.length + 1).toBe(deal('washed-ashore').devDeck.length);
		// Starting cards come out of the bank.
		const held = a.players.reduce((n, p) => n + totalResources(p.resources), 0);
		expect(RESOURCES.reduce((n, r) => n + a.bank[r], 0) + held).toBe(BANK_PER_RESOURCE * RESOURCES.length);
	});

	it('gives characters their traits only where the mission says', () => {
		const company = deal('company-you-keep');
		const c = company.campaign!;
		expect(company.players[c.hero].character).toBe('explorer');
		expect(company.players[c.boss!].character).toBe('cartographer');
		expect(company.powers).toBe(true);
		const guilds = deal('greywater-guilds');
		expect(guilds.players.every((p) => p.character === null)).toBe(true);
		expect(guilds.buildingRules).toMatchObject({ workshop: true, storehouse: true, castle: false });
		expect(guilds.events).toBeNull();
		expect(deal('omens-lagoon').events).not.toBeNull();
	});

	it('deals a mission on a grown island the same way every time', () => {
		const a = deal('isles-of-ash', 1);
		const b = deal('isles-of-ash', 2);
		expect(a.board.hexes).toEqual(b.board.hexes);
		expect(a.mapName).toBe('The Ash Isles');
		expect(a.pointsToWin).toBe(12);
		expect(a.players[0].piecesLeft.settlement).toBeGreaterThan(5);
	});

	it('sends the campaign to the player in the view', () => {
		const s = deal('millers-grudge');
		expect(viewFor(s, s.campaign!.hero).campaign?.bans).toEqual(['playerTrade']);
	});
});

describe('mission bans', () => {
	it('keeps the hero from buying development cards, and nobody else', () => {
		const s = heroMain('thieves-crossing');
		const hero = s.campaign!.hero;
		expect(error(s, hero, { type: 'buyDevCard' })).toBe('This mission forbids you development cards.');
		const other = structuredClone(s);
		other.campaign!.hero = (hero + 1) % s.players.length;
		expect(error(other, hero, { type: 'buyDevCard' })).toBeUndefined();
	});

	it('keeps the hero from trading with players', () => {
		const s = heroMain('millers-grudge');
		const hero = s.campaign!.hero;
		expect(error(s, hero, { type: 'offerTrade', give: { wood: 1 }, want: { ore: 1 } })).toBe('This mission forbids you trading with players.');
		// The bank still trades.
		expect(error(s, hero, { type: 'bankTrade', give: 'wood', get: 'ore' })).toBeUndefined();
	});

	it('keeps the bots from trying what the hero may not', () => {
		let s = deal('thieves-crossing');
		s = playUntil(s, (s) => campaignRound(s) > 12 && s.phase === 'main');
		const hero = s.campaign!.hero;
		expect(s.players[hero].devCards).toHaveLength(0);
		expect(heard.some((e) => e.type === 'devCardBought' && e.player === hero)).toBe(false);
	});
});

describe('round limit and tribute', () => {
	it('ends the game when the hero runs out of rounds, and a rival wins', () => {
		let s = deal('barons-shard');
		s = playUntil(s, (s) => s.phase === 'main');
		s = structuredClone(s);
		s.campaign!.roundLimit = 2;
		s.pointsToWin = 99;
		s = playUntil(s, () => false);
		expect(s.phase).toBe('ended');
		expect(s.campaign!.outOfTime).toBe(true);
		expect(s.winner).not.toBe(s.campaign!.hero);
		expect(campaignRound(s)).toBe(3);
		const r = missionResult(s)!;
		expect(r).toMatchObject({ won: false, outOfTime: true, stars: 0 });
	});

	it('pays the boss a card of tribute every few rounds', () => {
		let s = deal('thieves-crossing');
		s = playUntil(s, (s) => s.phase === 'main');
		s = playUntil(s, (s) => campaignRound(s) >= 10);
		const tributes = heard.filter((e) => e.type === 'tribute');
		// Rounds 5 and 9.
		expect(tributes).toHaveLength(2);
		for (const e of tributes) expect(e.type === 'tribute' && e.player).toBe(s.campaign!.boss);
	});
});

describe('story beats', () => {
	it('speaks each beat once, starting when play does', () => {
		let s = deal('washed-ashore');
		s = playUntil(s, (s) => s.phase === 'main');
		const opening = lines();
		expect(opening).toHaveLength(1);
		expect(opening[0].speaker).toBeNull();
		s = playUntil(s, () => false);
		const all = lines();
		expect(new Set(all.map((e) => e.line)).size).toBe(all.length);
		expect(s.campaign!.fired.length).toBe(all.length);
		// Somebody's ending was said.
		const m = mission('washed-ashore');
		const ends = m.beats.filter((b) => b.when.on === 'end').map((b) => b.line);
		if (ends.length) expect(all.some((e) => ends.includes(e.line))).toBe(true);
	});

	it('gives rival lines to the rival in the story', () => {
		let s = deal('millers-grudge', 11);
		s = playUntil(s, () => false);
		const c = s.campaign!;
		for (const e of lines()) if (e.speaker !== null) expect(c.cast[e.speaker]).not.toBeNull();
	});
});

describe('mission result', () => {
	it('gives a star for the win and one for each goal met', () => {
		const s = structuredClone(deal('washed-ashore'));
		const c = s.campaign!;
		s.phase = 'ended';
		s.winner = c.hero;
		s.turn = 10 * s.players.length;
		expect(missionResult(s)).toMatchObject({ won: true, goals: [true, false], stars: 2 });
		s.winner = c.boss;
		expect(missionResult(s)).toMatchObject({ won: false, goals: [false, false], stars: 0 });
	});

	it("shows the hero how a cards-lost goal stands before the end, and nobody else", () => {
		const s = structuredClone(heroMain('witchs-shard'));
		const c = s.campaign!;
		const goal = c.goals.find((g) => g.kind === 'lostAtMost')!;
		s.stats!.players[c.hero].lost = goal.n;
		expect(viewFor(s, c.hero).tally).toEqual({ lost: goal.n, discarded: s.stats!.players[c.hero].discarded });
		expect(viewFor(s, c.hero).stats).toBeUndefined();
		expect(viewFor(s, c.boss).tally).toBeUndefined();
		expect(goalMet(viewFor(s, c.hero), c.hero, goal)).toBe(true);
		s.stats!.players[c.hero].lost = goal.n + 1;
		expect(goalMet(viewFor(s, c.hero), c.hero, goal)).toBe(false);
	});

	it('every mission plays to an end with bots in every seat', () => {
		for (const m of MISSIONS) {
			const s = playUntil(deal(m.id, 3), () => false);
			expect(s.phase, m.id).toBe('ended');
			expect(missionResult(s), m.id).not.toBeNull();
		}
	});
});

describe('campaign progress', () => {
	const win = { won: true, outOfTime: false, goals: [true, false], stars: 2, round: 12 };
	it('keeps the best stars and the fewest rounds, and ignores losses', () => {
		let p = withResult({}, 'washed-ashore', win);
		expect(p['washed-ashore']).toEqual({ stars: 2, bestRound: 12 });
		p = withResult(p, 'washed-ashore', { ...win, stars: 1, round: 9 });
		expect(p['washed-ashore']).toEqual({ stars: 2, bestRound: 9 });
		expect(withResult(p, 'millers-grudge', { ...win, won: false, stars: 0 })).toBe(p);
		expect(withResult(p, 'no-such-mission', win)).toBe(p);
	});

	it('drops unknown missions and broken records', () => {
		expect(
			cleanProgress({ 'washed-ashore': { stars: 3, bestRound: 8 }, nope: { stars: 2, bestRound: 3 }, 'millers-grudge': { stars: 9 } })
		).toEqual({ 'washed-ashore': { stars: 3, bestRound: 8 } });
		expect(cleanProgress(null)).toEqual({});
	});
});

describe('room', () => {
	afterEach(() => vi.useRealTimers());

	function fakeSocket() {
		const sent: ServerMessage[] = [];
		const ws = { readyState: 1, OPEN: 1, send: (data: string) => sent.push(JSON.parse(data)) };
		return { ws: ws as unknown as WebSocket, sent };
	}

	it('starts a mission for a player alone, with its rivals', () => {
		vi.useFakeTimers();
		const room = new Room('CAMPA');
		const me = fakeSocket();
		const seat = room.join(me.ws, 'Komeil');
		if (typeof seat === 'string') throw new Error(seat);
		room.handle(seat, { t: 'mission', mission: 'barons-shard' }, me.ws);
		const g = room.game!;
		expect(g.campaign?.mission).toBe('barons-shard');
		expect(room.seats).toHaveLength(4);
		expect(room.seats[g.campaign!.hero]).toBe(seat);
		expect(room.lobbyInfo().mission).toBe('barons-shard');
		room.dispose();
	});

	it('refuses a mission at a table with other players, or one that does not exist', () => {
		vi.useFakeTimers();
		const room = new Room('CAMPB');
		const me = fakeSocket();
		const seat = room.join(me.ws, 'Komeil');
		if (typeof seat === 'string') throw new Error(seat);
		room.handle(seat, { t: 'mission', mission: 'nope' }, me.ws);
		expect(me.sent.some((m) => m.t === 'error' && m.message === 'Unknown mission.')).toBe(true);
		const friend = fakeSocket();
		room.join(friend.ws, 'Friend');
		room.handle(seat, { t: 'mission', mission: 'washed-ashore' }, me.ws);
		expect(room.game).toBeNull();
		room.dispose();
	});
});

describe('Extended beats', () => {
	it('speaks up when an Event card turns and when a power is used', () => {
		let s = deal('jesters-crown', 5);
		s = playUntil(s, (s) => campaignRound(s) > 8);
		const said = lines().map((e) => e.line);
		const beats = mission('jesters-crown').beats;
		const line = (on: string) => beats.find((b) => b.when.on === on)!.line;
		expect(said).toContain(line('event'));
		expect(heard.some((e) => e.type === 'powerUsed' && e.player !== s.campaign!.hero)).toBe(true);
		expect(said).toContain(line('power'));
	});
});
