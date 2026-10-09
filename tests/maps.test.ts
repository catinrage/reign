import { describe, expect, it } from 'vitest';
import { hexKey } from '../src/shared/board/hex';
import {
	MAP_PRESETS,
	decodeMap,
	encodeMap,
	parseAscii,
	validateCustomMap
} from '../src/shared/board/maps';
import { generateBoard, numberPool, terrainMix } from '../src/shared/board/generate';
import { getTopology } from '../src/shared/board/topology';

describe('map presets', () => {
	it('parse into joined islands of the expected sizes', () => {
		const sizes = Object.fromEntries(MAP_PRESETS.map((p) => [p.id, p.tiles.length]));
		expect(sizes.classic).toBe(19);
		expect(sizes.great).toBe(30);
		expect(sizes.realm).toBe(37);
		for (const p of MAP_PRESETS) {
			expect(validateCustomMap({ name: p.name, tiles: p.tiles }), p.id).toBeNull();
		}
	});

	it('center the classic isle on the origin', () => {
		const keys = new Set(MAP_PRESETS[0].tiles.map(hexKey));
		expect(keys.has('0,0')).toBe(true);
		expect(keys.has('2,0')).toBe(true);
		expect(keys.has('-2,0')).toBe(true);
	});

	it('reject tiles off the hex grid', () => {
		expect(() => parseAscii(['x x', 'x x'])).toThrow();
	});
});

describe('custom maps', () => {
	it('round-trip through a map code', () => {
		const map = { name: 'Test', tiles: MAP_PRESETS[1].tiles.map((t, i) => ({ ...t, terrain: i === 3 ? ('forest' as const) : null })) };
		expect(decodeMap(encodeMap(map))).toEqual(map);
	});

	it('must be one island', () => {
		const tiles = [...MAP_PRESETS[0].tiles, { q: 4, r: -4, terrain: null }];
		expect(validateCustomMap({ name: 'x', tiles })).toMatch(/one island/);
	});
});

describe('generateBoard', () => {
	it('deals every preset with classic proportions, no touching reds, and harbors', () => {
		for (const p of MAP_PRESETS) {
			for (let seed = 1; seed < 30; seed++) {
				const board = generateBoard(p.tiles, { rng: seed });
				expect(board.hexes.length).toBe(p.tiles.length);
				const topo = getTopology(board);
				for (const h of topo.hexes) {
					const red = (n: number | null) => n === 6 || n === 8;
					if (!red(board.hexes[h.id].number)) continue;
					for (const nb of h.neighbors) expect(red(board.hexes[nb].number), `${p.id} seed ${seed}`).toBe(false);
				}
				expect(board.hexes.some((h) => h.terrain === 'desert')).toBe(true);
				expect(board.hexes.filter((h) => h.terrain !== 'desert').every((h) => h.number !== null)).toBe(true);
				expect(board.ports.length).toBeGreaterThanOrEqual(5);
				const corners = topo.portEdges.flatMap((pe) => [topo.edges[pe.edge].a, topo.edges[pe.edge].b]);
				expect(new Set(corners).size).toBe(corners.length);
			}
		}
	});

	it('keeps fixed tiles', () => {
		const tiles = MAP_PRESETS[0].tiles.map((t, i) => ({ ...t, terrain: i === 0 ? ('mountains' as const) : null }));
		const board = generateBoard(tiles, { rng: 7 });
		expect(board.hexes[0].terrain).toBe('mountains');
	});

	it('matches the classic mix and numbers on 19 tiles', () => {
		expect(terrainMix(18).sort()).toEqual(
			['forest', 'forest', 'forest', 'forest', 'pasture', 'pasture', 'pasture', 'pasture', 'fields', 'fields', 'fields', 'fields', 'hills', 'hills', 'hills', 'mountains', 'mountains', 'mountains'].sort()
		);
		expect(numberPool(18).sort((a, b) => a - b)).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
	});
});
