import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildBoard } from '../src/client/scene/board/terrain';
import { generateBoard } from '../src/shared/board/generate';
import { hexKey, worldToHex } from '../src/shared/board/hex';
import { presetById } from '../src/shared/board/maps';
import { HEX_R } from '../src/client/scene/layout';

const board = generateBoard(presetById('classic')!.tiles, { rng: 42 });
const build = buildBoard(board, 7);
build.group.updateMatrixWorld(true);
const tileOf = (p: THREE.Vector3) => hexKey(worldToHex(p.x / HEX_R, p.z / HEX_R));

describe('the island raycast', () => {
	it('meets the blocks where a raycast against their triangles does', () => {
		const caster = new THREE.Raycaster();
		const gaps: number[] = [];
		let sameTile = 0;
		// From high over the table and from low at its side, at spots all over the island.
		for (const eye of [new THREE.Vector3(40, 160, 140), new THREE.Vector3(-150, 90, 40)])
			for (let i = -4; i <= 4; i++)
				for (let j = -4; j <= 4; j++) {
					caster.set(eye, new THREE.Vector3(i * 12 + 0.37, 5, j * 12 + 0.61).sub(eye).normalize());
					const want = caster.intersectObject(build.group, true)[0]?.point;
					if (!want) continue;
					const got = build.raycast(caster.ray);
					expect(got).not.toBeNull();
					gaps.push(got!.distanceTo(want));
					if (tileOf(got!) === tileOf(want)) sameTile++;
				}
		gaps.sort((a, b) => a - b);
		expect(gaps.length).toBeGreaterThan(100);
		// The same spot but for the blocks' jitter, except where a ray slips under a treetop.
		expect(gaps[Math.floor(gaps.length / 2)]).toBeLessThan(0.1);
		expect(sameTile / gaps.length).toBeGreaterThan(0.98);
	});

	it('lands on top of the column straight below', () => {
		for (const [x, z] of [
			[0, 0],
			[HEX_R * 1.5, -HEX_R],
			[-HEX_R * 2, HEX_R * 0.5]
		]) {
			const hit = build.raycast(
				new THREE.Ray(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0))
			);
			expect(hit!.y).toBeCloseTo(build.surfaceY(x, z), 5);
		}
	});

	it('misses rays that pass the island by', () => {
		expect(
			build.raycast(new THREE.Ray(new THREE.Vector3(0, 300, 0), new THREE.Vector3(0, 1, 0)))
		).toBeNull();
		expect(
			build.raycast(new THREE.Ray(new THREE.Vector3(5000, 40, 0), new THREE.Vector3(0, 0, 1)))
		).toBeNull();
	});
});
