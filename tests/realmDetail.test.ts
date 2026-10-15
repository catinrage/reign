import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REALM } from '../src/shared/conquest/realm';
import { buildRealm } from '../src/client/scene/conquest/realmTerrain';

describe('the Realm at either board detail', () => {
	const standard = buildRealm(REALM, 1);
	const fine = buildRealm(REALM, 2);

	it('keeps every square, so tokens, names and lanes stay put when the detail changes', () => {
		fine.anchors.forEach((a, i) => expect(a.distanceTo(standard.anchors[i])).toBe(0));
		// A lane leaves the shore where it meets it, which a finer coast moves a little at most.
		fine.lanes.forEach((l, i) => {
			const s = standard.lanes[i];
			expect(Math.hypot(l.a.x - s.a.x, l.a.z - s.a.z)).toBeLessThan(1);
			expect(Math.hypot(l.b.x - s.b.x, l.b.z - s.b.z)).toBeLessThan(1);
		});
	});

	it('shows the same territories, only with finer borders', () => {
		let same = 0;
		let n = 0;
		for (let x = -110; x < 110; x += 1.7)
			for (let z = -95; z < 95; z += 1.7) {
				n++;
				if (fine.territoryAt(x, z) === standard.territoryAt(x, z)) same++;
			}
		expect(same / n).toBeGreaterThan(0.97);
	});

	it('stands every square on flat ground at the same height', () => {
		for (const a of fine.anchors) {
			expect(fine.groundY(a.x, a.z)).toBeCloseTo(a.y, 5);
			expect(standard.groundY(a.x, a.z)).toBeCloseTo(a.y, 5);
		}
	});

	it('finds the land under a ray straight down', () => {
		const a = fine.anchors[0];
		const hit = fine.raycast(new THREE.Ray(a.clone().setY(40), new THREE.Vector3(0, -1, 0)));
		expect(hit?.y).toBeCloseTo(a.y, 5);
	});

	it('tells the realm shader its detail', () => {
		expect(standard.detail).toBe(1);
		expect(fine.detail).toBe(2);
		expect(fine.gridInfo.z).toBeGreaterThanOrEqual(standard.gridInfo.z * 2 - 1);
	});
});
