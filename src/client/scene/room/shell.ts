import * as THREE from 'three';
import { VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';
import { FLOOR_Y, ROOM_HALF, RUG_PLAID, WALL_H, grain, rand, tartan, voxels } from './util';

/** The floor and rug use 6-unit voxels, the walls and ceiling 8-unit ones. */
const S = 6;
const WS = 8;

const FLOOR = [hex('#5b311d'), hex('#663720'), hex('#512c1a'), hex('#6e3d23'), hex('#4b2817')];
const WALL = [hex('#3d2216'), hex('#45271a'), hex('#38200f'), hex('#4a2b1b')];
const TRIM = hex('#2e190f');
const TIMBER = hex('#3a1f12');
const BOARDS = [hex('#3a2014'), hex('#41241a'), hex('#35190f'), hex('#462a1c')];

/**
 * The floor out to walls `half` room units from the center, with a plaid rug `rug` voxels from
 * the center to its edge.
 */
export function buildFloor(half = ROOM_HALF, rug = 37): THREE.Group {
	const N = Math.ceil(half / S);
	const g = new VoxelGrid(2 * N, 1, 2 * N, -N, -1, -N);
	const r = rand(5);
	const rows: { off: number; len: number }[] = [];
	for (let i = 0; i < 2 * N; i++) rows.push({ off: Math.floor(r() * 20), len: 9 + Math.floor(r() * 9) });
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

/** How far each wall is turned from the -z wall it is built as. */
const TURN: Record<Side, number> = { nz: 0, px: -Math.PI / 2, pz: Math.PI, nx: Math.PI / 2 };

/**
 * The four walls, inner faces `half` room units from the center and `height` from the floor to
 * the ceiling, 8-unit voxels: boards with a chair rail and a rail at shelf height, and timber
 * posts in the corners. They start a voxel under the floor, so no crack opens along the
 * skirting. The walls are all alike, so they share one mesh.
 */
export function buildWalls(half = ROOM_HALF, height = WALL_H): Record<Side, THREE.Group> {
	const H = Math.round(height / WS);
	const NW = Math.ceil(half / WS);
	// Built as the -z wall, then turned into place.
	const g = new VoxelGrid(2 * NW + 4, H + 1, 3, -NW - 2, -1, -NW - 2);
	for (let x = -NW - 2; x < NW + 2; x++)
		for (let y = -1; y < H; y++) {
			const plank = x >> 1;
			let c = grain(pick(WALL, hash3(plank, 0, 0, 21)), y, plank, 4, 0.2);
			if ((x & 1) === 0) c = shade(c, 0.85);
			if (y < 2) c = shade(TRIM, 0.95 + hash3(x, y, 0) * 0.1);
			if (y === 2) c = shade(TRIM, 1.25);
			if (y === 14) c = shade(TRIM, 1.2 + hash3(x, y, 3) * 0.08);
			if (y === 25 || y === 26 || y >= H - 2) c = shade(TRIM, 1.1);
			g.set(x, y, -NW - 1, c);
			g.set(x, y, -NW - 2, shade(c, 0.6));
		}
	// timber posts in the corners
	for (const px of [-NW, NW - 2])
		for (let y = 0; y < H; y++)
			for (let x = px; x < px + 2; x++) g.set(x, y, -NW, grain(TIMBER, y, x, 6, 0.22));
	const mesh = voxels(g, WS, { jitter: 0.05, drop: (_x, y, z) => z < 0 || y < 0, shadows: false });
	mesh.position.z = NW * WS - half;
	const wall = (side: Side) => {
		const holder = new THREE.Group();
		holder.add(side === 'nz' ? mesh : mesh.clone());
		holder.rotation.y = TURN[side];
		holder.position.y = FLOOR_Y;
		return holder;
	};
	return { nx: wall('nx'), px: wall('px'), nz: wall('nz'), pz: wall('pz') };
}

/**
 * The ceiling over walls `half` room units from the center, `height` over the floor: dark boards
 * on a grid of heavy beams, 8-unit voxels. It casts no shadow, so the key light still reaches the
 * table.
 */
export function buildCeiling(half = ROOM_HALF, height = WALL_H): THREE.Group {
	const NW = Math.ceil(half / WS) + 2;
	// The beams cross a little over a third of the way from the middle to the walls.
	const P = Math.round(Math.ceil(half / WS) * 0.37);
	const g = new VoxelGrid(2 * NW, 4, 2 * NW, -NW, -3, -NW);
	const r = rand(9);
	const rows: { off: number; len: number }[] = [];
	for (let i = 0; i < NW; i++)
		rows.push({ off: Math.floor(r() * 20), len: 10 + Math.floor(r() * 10) });
	// boards along x, 2 voxels wide
	for (let z = -NW; z < NW; z++)
		for (let x = -NW; x < NW; x++) {
			const row = rows[(z + NW) >> 1];
			const seg = Math.floor((x + NW + row.off) / row.len);
			let c = grain(pick(BOARDS, hash3(z >> 1, seg, 0, 13)), x, z >> 1, 6, 0.16);
			if (((z + NW) & 1) === 0) c = shade(c, 0.82);
			if ((x + NW + row.off) % row.len === 0) c = shade(c, 0.7);
			g.set(x, 0, z, c);
		}
	// beams, two each way, three voxels deep
	for (const b of [-P - 1, P - 1]) {
		g.box(b, -3, -NW, b + 1, -1, NW - 1, (x, y, z) => grain(TIMBER, z, x + y * 3, 8, 0.22));
		g.box(-NW, -3, b, NW - 1, -1, b + 1, (x, y, z) => grain(TIMBER, x, z + y * 3, 9, 0.22));
	}
	const mesh = voxels(g, WS, { jitter: 0.05, drop: (_x, y) => y > 0, shadows: false });
	mesh.position.y = FLOOR_Y + height;
	return mesh;
}

/** Turn a point given in "-z wall" local space (x along the wall, z out from it) to world. */
export function wallFrame(side: Side, half = ROOM_HALF) {
	const rot = TURN[side];
	return (along: number, out: number) => {
		const lx = along;
		const lz = -half + out;
		const c = Math.cos(rot);
		const s = Math.sin(rot);
		return { x: lx * c + lz * s, z: -lx * s + lz * c, rot };
	};
}
