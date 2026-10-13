import { describe, expect, it } from 'vitest';
import { REALM, realmNeighbors, realmRaster, territoryAt } from '../src/shared/conquest/realm';

/** The cell size the board is drawn at (see scene/conquest). */
const BOARD_CELL = 0.6;

describe('the Realm', () => {
	const raster = realmRaster(REALM, BOARD_CELL);
	const ids = REALM.territories.map((t) => t.id);
	const pair = (a: string, b: string) => [a, b].sort().join('|');

	it('draws the land borders the rules know, no more and no fewer', () => {
		const drawn = new Map<string, number>();
		const { nx, nz } = raster;
		for (let iz = 0; iz < nz; iz++)
			for (let ix = 0; ix < nx; ix++) {
				const t = raster.ids[ix + iz * nx];
				if (t < 0) continue;
				for (const n of [ix + 1 < nx ? raster.ids[ix + 1 + iz * nx] : -1, iz + 1 < nz ? raster.ids[ix + (iz + 1) * nx] : -1]) {
					if (n >= 0 && n !== t) drawn.set(pair(ids[t], ids[n]), (drawn.get(pair(ids[t], ids[n])) ?? 0) + BOARD_CELL);
				}
			}
		const known = new Set(REALM.borders.map(([a, b]) => pair(a, b)));
		expect([...drawn.keys()].filter((p) => !known.has(p))).toEqual([]);
		expect([...known].filter((p) => !drawn.has(p))).toEqual([]);
		// No two territories meet at a mere corner, where nobody could tell whether they border.
		expect([...drawn].filter(([, len]) => len < 4).map(([p]) => p)).toEqual([]);
	});

	it('gives every territory one piece of land with its seat on it', () => {
		const cells = new Map<number, number>();
		for (const t of raster.ids) cells.set(t, (cells.get(t) ?? 0) + 1);
		REALM.territories.forEach((t, i) => {
			// At least a small island's worth of land.
			expect((cells.get(i) ?? 0) * BOARD_CELL ** 2, t.id).toBeGreaterThan(150);
			const [x, z] = t.blobs[0];
			expect(territoryAt(raster, x, z), `${t.id}'s seat`).toBe(i);
		});
	});

	it('only runs sea lanes across water, between territories that share no border', () => {
		const known = new Set(REALM.borders.map(([a, b]) => pair(a, b)));
		for (const [a, b] of REALM.lanes) {
			expect(ids).toContain(a);
			expect(ids).toContain(b);
			expect(known.has(pair(a, b)), `${a}-${b}`).toBe(false);
		}
		expect(new Set(REALM.lanes.map(([a, b]) => pair(a, b))).size).toBe(REALM.lanes.length);
	});

	it('is one realm: every territory can reach every other', () => {
		const nb = realmNeighbors(REALM);
		const seen = new Set([0]);
		const queue = [0];
		while (queue.length) for (const n of nb[queue.shift()!]) if (!seen.has(n)) seen.add(n), queue.push(n);
		expect(seen.size).toBe(REALM.territories.length);
		// Every region has a territory, and every territory a region.
		REALM.regions.forEach((_, r) => expect(REALM.territories.some((t) => t.region === r)).toBe(true));
		REALM.territories.forEach((t) => expect(REALM.regions[t.region], t.id).toBeTruthy());
	});
});
