import { describe, expect, it } from 'vitest';
import { hexKey, hexNeighbors } from '../src/shared/board/hex';
import { mapSeats, validateCustomMap } from '../src/shared/board/maps';
import { RANDOM_MAX_TILES, RANDOM_SHAPES, cleanRandomOptions, randomMap } from '../src/shared/board/random';
import { createGame } from '../src/shared/rules/engine';
import { maxPointsFor, pieceLimits, suggestedPoints } from '../src/shared/rules/modes';

function oneLandmass(tiles: { q: number; r: number }[]) {
	const land = new Set(tiles.map(hexKey));
	const seen = new Set([hexKey(tiles[0])]);
	const todo = [tiles[0]];
	while (todo.length) for (const n of hexNeighbors(todo.pop()!)) if (land.has(hexKey(n)) && !seen.has(hexKey(n))) seen.add(hexKey(n)), todo.push(n);
	return seen.size === land.size;
}

describe('random islands', () => {
	it('grows a valid island of exactly the size asked, for every shape and with lakes', () => {
		for (const shape of RANDOM_SHAPES)
			for (const lakes of [false, true])
				for (const tiles of [12, 30, 77, 150])
					for (let seed = 1; seed <= 4; seed++) {
						const map = randomMap({ tiles, shape, lakes, seed });
						expect(validateCustomMap(map), `${shape} ${tiles} ${seed}`).toBeNull();
						expect(map.tiles).toHaveLength(tiles);
						expect(oneLandmass(map.tiles)).toBe(true);
						expect(map.tiles.every((t) => t.terrain === null)).toBe(true);
						expect(map.random).toEqual({ tiles, shape, lakes, seed });
					}
	});

	it('gives the same island for the same seed and a new one for the next', () => {
		const a = randomMap({ tiles: 40, shape: 'ragged', lakes: true, seed: 7 });
		expect(randomMap({ tiles: 40, shape: 'ragged', lakes: true, seed: 7 })).toEqual(a);
		expect(randomMap({ tiles: 40, shape: 'ragged', lakes: true, seed: 8 }).tiles).not.toEqual(a.tiles);
	});

	it('leaves lakes inside the island when asked', () => {
		let inland = 0;
		for (let seed = 1; seed <= 6; seed++) {
			const map = randomMap({ tiles: 80, shape: 'round', lakes: true, seed });
			const land = new Set(map.tiles.map(hexKey));
			// A lake is a sea hex with land on every side.
			const seas = new Set(map.tiles.flatMap((t) => hexNeighbors(t)).map(hexKey).filter((k) => !land.has(k)));
			for (const k of seas) {
				const [q, r] = k.split(',').map(Number);
				if (hexNeighbors({ q, r }).filter((n) => land.has(hexKey(n))).length >= 5) inland++;
			}
		}
		expect(inland).toBeGreaterThan(0);
	});

	it('is quick even at the biggest size', () => {
		const t = performance.now();
		const map = randomMap({ tiles: RANDOM_MAX_TILES, shape: 'islands', lakes: true, seed: 3 });
		expect(map.tiles).toHaveLength(RANDOM_MAX_TILES);
		expect(performance.now() - t).toBeLessThan(3000);
		expect(mapSeats(map.tiles.length)).toBe(8);
	});

	it('cleans options from the wire', () => {
		expect(cleanRandomOptions({ tiles: 9999, shape: 'moon' as never, lakes: 1 as never, seed: 2.5 })).toEqual({
			tiles: RANDOM_MAX_TILES,
			shape: 'round',
			lakes: true,
			seed: 1
		});
	});
});

describe('island size, players and points', () => {
	it('caps the goal by tiles per player', () => {
		expect(maxPointsFor(19, 4)).toBe(11);
		expect(maxPointsFor(30, 6)).toBe(12);
		expect(maxPointsFor(30, 6)).toBeLessThan(20);
		expect(maxPointsFor(271, 3)).toBe(30);
		expect(maxPointsFor(12, 8)).toBe(5);
		for (const [tiles, players] of [[19, 4], [37, 6], [60, 8], [12, 2]])
			expect(suggestedPoints(tiles, players)).toBeLessThanOrEqual(maxPointsFor(tiles, players));
	});

	it('hands out more pieces when the goal is past what the classic set can reach', () => {
		expect(pieceLimits(10)).toEqual({ road: 15, settlement: 5, city: 4 });
		expect(pieceLimits(20)).toEqual({ road: 25, settlement: 10, city: 9 });
		const players = (['red', 'blue'] as const).map((color, i) => ({ name: `P${i}`, color, isBot: false }));
		const map = { custom: randomMap({ tiles: 80, shape: 'round', lakes: false, seed: 5 }) };
		const game = createGame(players, 1, undefined, { mode: 'extended', map, pointsToWin: 20 });
		expect(game.players[0].piecesLeft).toEqual({ road: 25, settlement: 10, city: 9 });
		const classic = createGame(players, 1);
		expect(classic.players[0].piecesLeft).toEqual({ road: 15, settlement: 5, city: 4 });
	});
});
