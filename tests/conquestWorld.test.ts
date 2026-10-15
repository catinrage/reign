import { describe, expect, it } from 'vitest';
import { conquestMap, missionDeck, regionTerritories } from '../src/shared/conquest/queries';
import { REALM_CELL, realmNeighbors, realmRaster, territoryAt } from '../src/shared/conquest/realm';
import { cleanConquestSettings, cleanWorld, maxRegions } from '../src/shared/conquest/settings';
import { DEFAULT_CONQUEST_SETTINGS, type WorldOptions } from '../src/shared/conquest/types';
import { generateWorld } from '../src/shared/conquest/world';

const pair = (a: string, b: string) => [a, b].sort().join('|');

/** Every territory reachable from `from` over these neighbours, staying inside `within` if given. */
function reach(nb: number[][], from: number, within?: Set<number>) {
	const seen = new Set([from]);
	const queue = [from];
	while (queue.length)
		for (const n of nb[queue.shift()!]) {
			if (seen.has(n) || (within && !within.has(n))) continue;
			seen.add(n);
			queue.push(n);
		}
	return seen;
}

const SAMPLES: WorldOptions[] = [
	{ territories: 18, shape: 'continents', regions: 4, lanes: 'few', climate: 'mixed', seed: 11 },
	{ territories: 30, shape: 'pangaea', regions: 5, lanes: 'some', climate: 'frozen', seed: 12 },
	{ territories: 42, shape: 'archipelago', regions: 7, lanes: 'many', climate: 'verdant', seed: 13 },
	{ territories: 48, shape: 'ring', regions: 8, lanes: 'some', climate: 'desert', seed: 14 },
	{ territories: 64, shape: 'continents', regions: 10, lanes: 'many', climate: 'mixed', seed: 15 }
];

describe('random worlds', () => {
	it.each(SAMPLES)('make a whole, playable world: $territories territories, $shape, $regions regions, $lanes lanes, $climate', (o) => {
		const map = generateWorld(o);
		const n = map.territories.length;
		expect(n).toBe(o.territories);
		expect(map.regions).toHaveLength(Math.min(o.regions, Math.floor(o.territories / 3)));
		const ids = map.territories.map((t) => t.id);
		expect(new Set(ids).size).toBe(n);
		expect(new Set(map.territories.map((t) => t.name)).size).toBe(n);
		expect(new Set(map.regions.map((r) => r.name)).size).toBe(map.regions.length);

		// The land borders the rules know are exactly the ones the board draws.
		const raster = realmRaster(map, REALM_CELL);
		const drawn = new Set<string>();
		const cells = new Array(n).fill(0);
		const { nx, nz } = raster;
		for (let iz = 0; iz < nz; iz++)
			for (let ix = 0; ix < nx; ix++) {
				const t = raster.ids[ix + iz * nx];
				if (t < 0) continue;
				cells[t]++;
				for (const u of [ix + 1 < nx ? raster.ids[ix + 1 + iz * nx] : -1, iz + 1 < nz ? raster.ids[ix + (iz + 1) * nx] : -1])
					if (u >= 0 && u !== t) drawn.add(pair(ids[t], ids[u]));
			}
		expect([...drawn].sort()).toEqual(map.borders.map(([a, b]) => pair(a, b)).sort());
		// Every territory a fair piece of land, with its seat on it.
		map.territories.forEach((t, i) => {
			expect(cells[i], t.id).toBeGreaterThan(150);
			expect(territoryAt(raster, t.blobs[0][0], t.blobs[0][1]), `${t.id}'s seat`).toBe(i);
		});

		// Sea lanes join territories that share no border, once each; and the world is one.
		const borders = new Set(map.borders.map(([a, b]) => pair(a, b)));
		for (const [a, b] of map.lanes) expect(borders.has(pair(a, b)), `${a}-${b}`).toBe(false);
		expect(new Set(map.lanes.map(([a, b]) => pair(a, b))).size).toBe(map.lanes.length);
		const nb = realmNeighbors(map);
		expect(reach(nb, 0).size).toBe(n);

		// Every region one piece (by land or sea lane), worth something, and the missions name real ones.
		regionTerritories(map).forEach((ts, r) => {
			expect(ts.length, map.regions[r].name).toBeGreaterThan(0);
			expect(reach(nb, ts[0], new Set(ts)).size, map.regions[r].name).toBe(ts.length);
			expect(map.regions[r].bonus).toBeGreaterThanOrEqual(1);
		});
		const regionIds = new Set(map.regions.map((r) => r.id));
		for (const m of map.missionRegions) for (const r of m.regions) expect(regionIds.has(r)).toBe(true);
		expect(missionDeck(map, 4).every((m) => m.kind !== 'regions' || m.regions.every((r) => r >= 0))).toBe(true);

		// The legend and the compass stand in open sea.
		for (const [x, z] of [map.legend!, map.compass!]) expect(territoryAt(raster, x, z)).toBe(-1);
	});

	it('is the same world for the same options, and another for another seed', () => {
		const a = generateWorld(SAMPLES[1]);
		expect(generateWorld({ ...SAMPLES[1] })).toBe(a);
		const b = generateWorld({ ...SAMPLES[1], seed: 99 });
		expect(b.territories.map((t) => t.blobs)).not.toEqual(a.territories.map((t) => t.blobs));
	});

	it('is quick enough to make at every table', () => {
		const t0 = performance.now();
		generateWorld({ territories: 64, shape: 'pangaea', regions: 9, lanes: 'some', climate: 'mixed', seed: 777 });
		expect(performance.now() - t0).toBeLessThan(3000);
	});

	it('suits the climate asked for', () => {
		const frozen = generateWorld({ territories: 36, shape: 'continents', regions: 6, lanes: 'some', climate: 'frozen', seed: 21 });
		const cold = frozen.territories.filter((t) => ['snow', 'taiga', 'mountains', 'hills', 'forest'].includes(t.terrain)).length;
		expect(cold).toBe(36);
		const desert = generateWorld({ territories: 36, shape: 'continents', regions: 6, lanes: 'some', climate: 'desert', seed: 21 });
		expect(desert.territories.filter((t) => ['desert', 'badlands'].includes(t.terrain)).length).toBeGreaterThan(12);
	});

	it('is what the settings name, with the Realm by default', () => {
		expect(conquestMap(DEFAULT_CONQUEST_SETTINGS).id).toBe('realm');
		const s = cleanConquestSettings({ map: 'random', world: SAMPLES[0] });
		expect(conquestMap(s)).toBe(generateWorld(SAMPLES[0]));
	});

	it('keeps the options in range, whatever arrives', () => {
		expect(cleanWorld({ territories: 500, regions: 50, shape: 'cube' as never, seed: 1.5 })).toEqual({
			territories: 64,
			shape: 'continents',
			regions: 10,
			lanes: 'some',
			climate: 'mixed',
			seed: 1
		});
		expect(cleanWorld({ territories: 18, regions: 9 }).regions).toBe(maxRegions(18));
		expect(maxRegions(18)).toBe(6);
	});
});
