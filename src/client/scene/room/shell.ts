import * as THREE from 'three';
import { VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';
import { FLOOR_Y, ROOM_HALF, RUG_PLAID, grain, rand, tartan, voxels } from './util';

/** Floor, rug and walls use 6-unit voxels. */
const S = 6;
const N = Math.round(ROOM_HALF / S); // 50

const FLOOR = [hex('#5b311d'), hex('#663720'), hex('#512c1a'), hex('#6e3d23'), hex('#4b2817')];
const WALL = [hex('#3d2216'), hex('#45271a'), hex('#38200f'), hex('#4a2b1b')];
const TRIM = hex('#2e190f');

export function buildFloor(): THREE.Group {
	const g = new VoxelGrid(2 * N, 1, 2 * N, -N, -1, -N);
	const r = rand(5);
	const rows: { off: number; len: number }[] = [];
	for (let i = 0; i < 2 * N; i++) rows.push({ off: Math.floor(r() * 20), len: 9 + Math.floor(r() * 9) });
	const rug = 37; // rug half size in voxels (222 units)
	for (let z = -N; z < N; z++)
		for (let x = -N; x < N; x++) {
			const ax = Math.abs(x + 0.5);
			const az = Math.abs(z + 0.5);
			let c: number;
			if (ax < rug && az < rug - 2) {
				const e = Math.min(rug - ax, rug - 2 - az);
				c = tartan(x + 100, z + 100, RUG_PLAID, 10);
				if (e < 2.5) c = e < 1.5 ? shade(RUG_PLAID.dark, 1.1) : shade(RUG_PLAID.light, 0.85);
				c = shade(c, 0.92 + hash3(x, 1, z) * 0.08);
			} else if (ax < rug && az < rug) {
				// fringe at both ends
				c = (x & 1) === 0 ? hex('#d9c39a') : shade(FLOOR[0], 0.9);
			} else {
				// planks along x, 2 voxels wide
				const row = rows[(z + N) >> 1];
				const seg = Math.floor((x + N + row.off) / row.len);
				c = grain(pick(FLOOR, hash3(z >> 1, seg, 0, 8)), x, z >> 1, 2, 0.16);
				if (((z + N) & 1) === 0) c = shade(c, 0.8);
				if ((x + N + row.off) % row.len === 0) c = shade(c, 0.72);
			}
			g.set(x, -1, z, c);
		}
	const mesh = voxels(g, S, { jitter: 0.05, drop: (_x, y) => y < 0 });
	mesh.traverse((o) => (o.castShadow = false));
	return mesh;
}

export type Side = 'nx' | 'px' | 'nz' | 'pz';

/** One wall along a side, inner face at ±ROOM_HALF, 216 units high, 8-unit voxels. */
export function buildWall(side: Side): THREE.Group {
	const WS = 8;
	const H = 27;
	const NW = Math.ceil(ROOM_HALF / WS); // 38
	// Built as the -z wall, then turned into place.
	const g = new VoxelGrid(2 * NW + 4, H, 2, -NW - 2, 0, -NW - 2);
	for (let x = -NW - 2; x < NW + 2; x++)
		for (let y = 0; y < H; y++) {
			const plank = x >> 1;
			let c = grain(pick(WALL, hash3(plank, 0, 0, 21)), y, plank, 4, 0.2);
			if ((x & 1) === 0) c = shade(c, 0.85);
			if (y < 2) c = shade(TRIM, 0.95 + hash3(x, y, 0) * 0.1);
			if (y === 2) c = shade(TRIM, 1.25);
			if (y === 14) c = shade(TRIM, 1.2 + hash3(x, y, 3) * 0.08);
			if (y >= H - 2) c = shade(TRIM, 1.1);
			g.set(x, y, -NW - 1, c);
			g.set(x, y, -NW - 2, shade(c, 0.6));
		}
	// timber posts
	for (const px of [-NW - 2, -15, 14, NW - 1])
		for (let y = 0; y < H; y++)
			for (let x = px; x < px + 2; x++) g.set(x, y, -NW, grain(hex('#3a1f12'), y, x, 6, 0.22));
	const mesh = voxels(g, WS, { jitter: 0.05, drop: (_x, y, z) => z < 0 || y < 0, shadows: false });
	mesh.position.z = NW * WS - ROOM_HALF;
	const rot = { nz: 0, px: -Math.PI / 2, pz: Math.PI, nx: Math.PI / 2 }[side];
	const holder = new THREE.Group();
	holder.add(mesh);
	holder.rotation.y = rot;
	holder.position.y = FLOOR_Y;
	return holder;
}

/** Turn a point given in "-z wall" local space (x along the wall, z out from it) to world. */
export function wallFrame(side: Side) {
	const rot = { nz: 0, px: -Math.PI / 2, pz: Math.PI, nx: Math.PI / 2 }[side];
	return (along: number, out: number) => {
		const lx = along;
		const lz = -ROOM_HALF + out;
		const c = Math.cos(rot);
		const s = Math.sin(rot);
		return { x: lx * c + lz * s, z: -lx * s + lz * c, rot };
	};
}
