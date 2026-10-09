import { describe, expect, it } from 'vitest';
import { getTopology } from '../src/shared/board/topology';
import { botAction } from '../src/shared/rules/bot';
import { CHARACTERS, type CharacterId } from '../src/shared/rules/characters';
import { BANK_PER_RESOURCE, RESOURCES } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import type { GameSettings } from '../src/shared/rules/modes';
import { draftLeft } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';

const COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'orange'] as const;
const players = (chars: (CharacterId | null)[]) =>
	chars.map((character, i) => ({ name: `P${i}`, color: COLORS[i], isBot: true, character }));
const extended: Partial<GameSettings> = { mode: 'extended', map: { preset: 'great' }, pointsToWin: 10 };
const hand = (wood = 0, brick = 0, sheep = 0, wheat = 0, ore = 0) => ({ wood, brick, sheep, wheat, ore });

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

/** A game past setup, played by bots, with these characters. */
function started(chars: (CharacterId | null)[], seed = 21): GameState {
	let g = createGame(players(chars), seed, undefined, extended);
	while (g.phase === 'setup') g = act(g, g.current, botAction(g, g.current)!);
	return g;
}

/** A copy of `g` with its dice rigged to roll `total` next (found by trying seeds). */
function rollTo(g: GameState, total: number): GameState {
	for (let tries = 0; tries < 2000; tries++) {
		const trial = structuredClone(g);
		trial.board = g.board;
		trial.rng = tries * 7919 + 1;
		const r = applyAction(trial, trial.current, { type: 'rollDice' });
		if (r.ok && r.state.dice![0] + r.state.dice![1] === total) return r.state;
	}
	throw new Error(`never rolled ${total}`);
}

describe('repeat character picks', () => {
	it('is off by default: a picked character is gone, and a short pool skips the draft', () => {
		let s = createGame(players([null, null, null]), 3, undefined, extended);
		expect(s.draft!.repeats).toBe(false);
		s = act(s, s.current, { type: 'pickCharacter', character: 'mason' });
		expect(draftLeft(s)).not.toContain('mason');
		expect(applyAction(s, s.current, { type: 'pickCharacter', character: 'mason' }).ok).toBe(false);
		const short = createGame(players([null, null, null]), 3, undefined, { ...extended, leftOut: allBut(['mason']) });
		expect(short.draft).toBeNull();
	});

	it('keeps a picked character on offer, so even a pool of one drafts a whole table', () => {
		let s = createGame(players([null, null, null, null]), 7, undefined, {
			...extended,
			repeatPicks: true,
			leftOut: allBut(['seer'])
		});
		expect(s.phase).toBe('draft');
		expect(s.draft!.repeats).toBe(true);
		for (let i = 0; i < 4; i++) {
			expect(draftLeft(s)).toEqual(['seer']);
			s = act(s, s.current, { type: 'pickCharacter', character: 'seer' });
		}
		expect(s.players.every((p) => p.character === 'seer')).toBe(true);
		expect(s.phase).toBe('setup');
	});

	it('bots take characters nobody has first, then double up', () => {
		let s = createGame(players([null, null, null, null]), 9, undefined, {
			...extended,
			repeatPicks: true,
			leftOut: allBut(['mason', 'shepherd'])
		});
		while (s.phase === 'draft') s = act(s, s.current, botAction(s, s.current)!);
		const picks = s.players.map((p) => p.character);
		expect(new Set(picks.slice(2))).toEqual(new Set(['mason', 'shepherd']));
		expect(picks.filter((c) => c === 'shepherd').length).toBe(3);
	});

	it('owes every Seer a card on a 2 or a 12', () => {
		const s = rollTo(started(['seer', null, 'seer']), 12);
		expect(s.picks[0]).toEqual(['seer']);
		expect(s.picks[2]).toEqual(['seer']);
		expect(s.picks[1]).toBeUndefined();
	});

	it('gives each Abbess her own alms while discarded cards last', () => {
		const g = started(['abbess', null, 'abbess'], 3);
		g.players[1].resources = hand(4, 4, 0, 0, 0);
		g.players[0].resources = hand();
		g.players[2].resources = hand();
		let s = rollTo(g, 7);
		s = act(s, 1, { type: 'discard', resources: { wood: 4 } });
		expect(s.players[0].resources).toEqual(hand(1));
		expect(s.players[2].resources).toEqual(hand(1));
		expect(s.step).toBe('moveRobber');
	});

	it('makes a road pay every Baron it touches', () => {
		const g = started(['baron', null, 'baron'], 5);
		const topo = getTopology(g.board);
		// Player 1 builds from a settlement at a to b, where both Barons have a road.
		const quiet = (v: number) => !g.buildings[v] && topo.vertices[v].edges.every((e) => g.roads[e] === null);
		const at = topo.edges.find((e) => quiet(e.a) && quiet(e.b) && topo.vertices[e.b].edges.length === 3)!;
		const [x, y] = topo.vertices[at.b].edges.filter((e) => e !== at.id);
		const trial = structuredClone(g);
		trial.board = g.board;
		trial.buildings[at.a] = { owner: 1, kind: 'settlement' };
		trial.roads[x] = 0;
		trial.roads[y] = 2;
		trial.current = 1;
		trial.step = 'main';
		trial.players[1].resources = hand(1, 1, 3);
		trial.players[0].resources = hand();
		trial.players[2].resources = hand();
		const r = act(trial, 1, { type: 'placeRoad', edge: at.id });
		expect(r.players[0].resources).toEqual(hand(0, 0, 1));
		expect(r.players[2].resources).toEqual(hand(0, 0, 1));
		expect(r.players[1].resources).toEqual(hand(0, 0, 1));
	});

	it('owes both Bards a card when they trade with each other', () => {
		const g = structuredClone(started(['bard', 'bard', null]));
		g.step = 'main';
		g.current = 0;
		g.players[0].resources = hand(2);
		g.players[1].resources = hand(0, 0, 2);
		let s = act(g, 0, { type: 'offerTrade', give: { wood: 1 }, want: { sheep: 1 } });
		s = act(s, 1, { type: 'respondTrade', offerId: s.trade!.id, accept: true });
		s = act(s, 0, { type: 'confirmTrade', offerId: s.trade!.id, with: 1 });
		expect(s.picks[0]).toEqual(['bard']);
		expect(s.picks[1]).toEqual(['bard']);
	});

	it('bots finish games with doubled characters, and no card is made or lost', () => {
		const groups: CharacterId[][] = [
			['baron', 'baron', 'abbess', 'abbess'],
			['seer', 'seer', 'bard', 'bard'],
			['witch', 'witch', 'rogue', 'rogue'],
			['merchant', 'merchant', 'merchant', 'merchant']
		];
		groups.forEach((chars, k) => {
			for (let seed = 1; seed <= 2; seed++) {
				let s = createGame(players(chars), seed * 613 + k, undefined, extended);
				s = playOut(s);
				expect(s.phase, `${chars.join(',')} seed ${seed}`).toBe('ended');
				for (const r of RESOURCES) {
					expect(s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0)).toBe(BANK_PER_RESOURCE);
				}
			}
		});
	}, 60000);
});

function allBut(keep: CharacterId[]): CharacterId[] {
	return CHARACTERS.filter((c) => !keep.includes(c));
}
