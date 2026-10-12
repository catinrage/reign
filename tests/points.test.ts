import { describe, expect, it } from 'vitest';
import { botAction } from '../src/shared/rules/bot';
import { CASTLE_POINTS } from '../src/shared/rules/buildings';
import { applyAction, createGame, totalPoints } from '../src/shared/rules/engine';
import type { GameSettings } from '../src/shared/rules/modes';
import { POINT_SOURCES, POINT_VALUE, pointsBreakdown, pointsOf, publicPoints } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';
import { pointParts, pointsTip } from '../src/client/ui/helpers';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (n: number) => COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));
// Castles, events and the rest of Reign Extended, played a little longer so castles get built.
const EXTENDED: Partial<GameSettings> = { mode: 'extended', map: { preset: 'great' }, characters: false, pointsToWin: 13 };

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

/** Bots play the game out; `look` sees the state after every action. */
function playOut(s: GameState, look: (s: GameState) => void, limit = 30000) {
	let perTurn = 0;
	let lastTurn = -1;
	for (let steps = 0; s.phase !== 'ended' && steps < limit; steps++) {
		if (s.turn !== lastTurn) {
			lastTurn = s.turn;
			perTurn = 0;
		}
		let acted = false;
		for (let p = 0; p < s.players.length && !acted; p++) {
			if (p === s.current) continue;
			const a = botAction(s, p);
			if (a) {
				s = act(s, p, a);
				acted = true;
			}
		}
		if (!acted) s = act(s, s.current, botAction(s, s.current, perTurn++)!);
		look(s);
	}
	return s;
}

/** The score counted the long way, piece by piece, without the breakdown. */
function counted(s: GameState, p: number, withCards: boolean): number {
	let n = 0;
	s.buildings.forEach((b, v) => {
		if (b?.owner !== p) return;
		n += b.kind === 'settlement' ? 1 : s.cityPaths?.[v] === 'castle' ? CASTLE_POINTS : 2;
	});
	if (s.longestRoadHolder === p) n += 2;
	if (s.largestArmyHolder === p) n += 2;
	if (withCards) n += s.players[p].devCards.filter((c) => c.type === 'victoryPoint').length;
	return n;
}

/** Everything a breakdown promises, checked on one state. Returns the sources seen. */
function check(s: GameState): Set<string> {
	const seen = new Set<string>();
	s.players.forEach((pl, p) => {
		const open = pointsBreakdown(s, p);
		const all = pointsBreakdown(s, p, pl.devCards);
		for (const part of all) {
			seen.add(part.source);
			expect(part.count).toBeGreaterThan(0);
			expect(part.points).toBe(part.count * POINT_VALUE[part.source]);
		}
		// In source order, each at most once.
		expect(all.map((x) => x.source)).toEqual(POINT_SOURCES.filter((k) => all.some((x) => x.source === k)));
		expect(open.some((x) => x.source === 'victoryCard')).toBe(false);
		expect(pointsOf(open)).toBe(publicPoints(s, p));
		expect(pointsOf(all)).toBe(totalPoints(s, p));
		expect(publicPoints(s, p)).toBe(counted(s, p, false));
		expect(totalPoints(s, p)).toBe(counted(s, p, true));
	});
	// What each seat (and a spectator) is sent adds up to the score it shows, and only your own
	// hidden cards are in it while the game is on.
	for (let me = -1; me < s.players.length; me++) {
		const view = viewFor(s, me);
		view.players.forEach((pl, i) => {
			const parts = pointParts(view, i);
			expect(pointsOf(parts)).toBe(pl.totalPoints ?? pl.publicPoints);
			if (s.phase !== 'ended' && i !== me) {
				expect(parts.some((x) => x.source === 'victoryCard')).toBe(false);
				expect(pointsOf(parts)).toBe(publicPoints(s, i));
			} else expect(pointsOf(parts)).toBe(totalPoints(s, i));
		});
	}
	return seen;
}

describe('points breakdown', () => {
	it('adds up to every score through Classic games', () => {
		for (let seed = 1; seed <= 3; seed++) {
			const seen = new Set<string>();
			let steps = 0;
			const s = playOut(createGame(players(4), seed * 61), (s) => {
				if (steps++ % 7 === 0) check(s).forEach((k) => seen.add(k));
			});
			expect(s.phase).toBe('ended');
			check(s).forEach((k) => seen.add(k));
			expect(seen.has('castle')).toBe(false);
			expect([...seen]).toEqual(expect.arrayContaining(['settlement', 'city']));
		}
	});

	it('adds up to every score through Reign Extended games, castles and events included', () => {
		const seen = new Set<string>();
		let events = 0;
		for (let seed = 1; seed <= 4; seed++) {
			let steps = 0;
			const s = playOut(createGame(players(4), seed * 83, undefined, EXTENDED), (s) => {
				if (s.events?.current) events++;
				if (steps++ % 7 === 0) check(s).forEach((k) => seen.add(k));
			});
			expect(s.phase).toBe('ended');
			check(s).forEach((k) => seen.add(k));
		}
		expect(events).toBeGreaterThan(0);
		expect([...seen].sort()).toEqual([...POINT_SOURCES].sort());
	}, 60_000);

	it('lists each source with its count, and keeps other hands hidden', () => {
		let s = createGame(players(3), 5, undefined, EXTENDED);
		s = playOut(s, () => {}, 400);
		s = structuredClone(s);
		s.phase = 'main';
		// Player 0: two cities (one a castle), a settlement, both awards and two hidden cards.
		s.buildings = s.buildings.map(() => null);
		s.cityPaths = s.cityPaths.map(() => null);
		s.buildings[0] = { owner: 0, kind: 'city' };
		s.buildings[10] = { owner: 0, kind: 'city' };
		s.cityPaths[10] = 'castle';
		s.buildings[20] = { owner: 0, kind: 'settlement' };
		s.buildings[30] = { owner: 1, kind: 'settlement' };
		s.longestRoadHolder = 0;
		s.largestArmyHolder = 0;
		s.players[0].devCards = [
			{ type: 'victoryPoint', boughtTurn: 1 },
			{ type: 'knight', boughtTurn: 1 },
			{ type: 'victoryPoint', boughtTurn: 2 }
		];
		expect(pointsBreakdown(s, 0, s.players[0].devCards)).toEqual([
			{ source: 'settlement', count: 1, points: 1 },
			{ source: 'city', count: 1, points: 2 },
			{ source: 'castle', count: 1, points: CASTLE_POINTS },
			{ source: 'longestRoad', count: 1, points: 2 },
			{ source: 'largestArmy', count: 1, points: 2 },
			{ source: 'victoryCard', count: 2, points: 2 }
		]);
		expect(totalPoints(s, 0)).toBe(12);
		expect(publicPoints(s, 0)).toBe(10);
		expect(pointsBreakdown(s, 1)).toEqual([{ source: 'settlement', count: 1, points: 1 }]);
		expect(pointsBreakdown(s, 2)).toEqual([]);

		// Your own coin lists your hidden cards and says only you see them.
		const mine = pointsTip(viewFor(s, 0), 0);
		expect(mine.head).toBe('Victory points: 12 of 13 to win');
		expect(mine.text.split('\n')).toEqual([
			'Settlements: 1 × 1 = 1',
			'Cities: 1 × 2 = 2',
			'Castles: 1 × 3 = 3',
			'Longest Road: +2',
			'Largest Army: +2',
			'Hidden victory point cards: 2 × 1 = 2'
		]);
		expect(mine.note).toBe('Only you can see your hidden cards.');
		// Anyone else, a spectator too, sees the public 10 and a word about the unknown cards.
		for (const me of [1, -1]) {
			const theirs = pointsTip(viewFor(s, me), 0);
			expect(theirs.head).toBe('Victory points: 10 of 13 to win');
			expect(theirs.text).not.toContain('Hidden');
			expect(theirs.note).toBe('Their 3 development cards could hide victory points.');
		}
		expect(pointsTip(viewFor(s, 0), 2).text).toBe('No points yet.');
		// Once the game is over the cards are shown to everyone.
		s.phase = 'ended';
		const end = pointsTip(viewFor(s, 1), 0);
		expect(end.head).toBe('Victory points: 12 of 13 to win');
		expect(end.text).toContain('Hidden victory point cards: 2 × 1 = 2');
		expect(end.note).toBe('');
	});
});
