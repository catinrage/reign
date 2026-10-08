import * as THREE from 'three';
import { VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';
import { FLOOR_Y, RED_PLAID, grain, rand, shadowProxy, tartan, voxels } from './util';

/** Table voxels are 4 world units: top surface at y = 0, x, z in [-148, 148]. */
const S = 4;
/** Chairs use 3-unit voxels. */
const CS = 3;

const DIM = 0.52;
const PLANK = ['#8e3a24', '#983e27', '#a0442a', '#923c25', '#9a4229'].map((c) => shade(hex(c), DIM));
const FRAME = ['#6e301e', '#76341f', '#6a2e1c'].map((c) => shade(hex(c), DIM));
const LEG = ['#5e2818', '#682c1a'].map((c) => shade(hex(c), DIM));

export const TABLE_HALF = 37 * S;

export function buildTable(): THREE.Group {
	const half = 37; // voxels
	const floor = Math.round(FLOOR_Y / S); // -28
	const g = new VoxelGrid(2 * half, 6, 2 * half, -half, -6, -half);
	const r = rand(11);
	// Plank rows (4 voxels wide, running along x) are cut into staggered boards.
	const PW = 4;
	const rows: { off: number; len: number; seed: number }[] = [];
	for (let i = 0; i < 30; i++) rows.push({ off: Math.floor(r() * 30), len: 16 + Math.floor(r() * 14), seed: i });
	const rim = 2;
	for (let z = -half; z < half; z++)
		for (let x = -half; x < half; x++) {
			const ex = Math.min(x + half, half - 1 - x);
			const ez = Math.min(z + half, half - 1 - z);
			const e = Math.min(ex, ez);
			let c: number;
			if (e < rim) {
				// Frame boards run along the edge, mitred at the corners.
				const alongX = ez <= ex;
				const along = alongX ? x : z;
				c = grain(pick(FRAME, hash3(alongX ? 1 : 2, z < 0 || x < 0 ? 1 : 0, 0, 4)), along, e, 7, 0.14);
				if (ex === ez) c = shade(c, 0.8);
				g.box(x, -3, z, x, -1, z, c);
				continue;
			}
			const zi = z + half - rim;
			const row = rows[Math.floor(zi / PW)];
			const seg = Math.floor((x + half + row.off) / row.len);
			const segX = (x + half + row.off) % row.len;
			c = grain(pick(PLANK, hash3(row.seed, seg, 0, 3)), x, Math.floor(zi / PW) * PW + seg, 3, 0.12);
			if (zi % PW === 0 || segX === 0) c = shade(c, 0.8);
			if (e === rim) c = shade(c, 0.84);
			g.box(x, -2, z, x, -1, z, c);
		}
	// Apron under the rim.
	const ap = half - 2;
	for (const s of [-1, 1]) {
		g.box(-ap, -5, s < 0 ? -ap : ap - 1, ap - 1, -4, s < 0 ? -ap : ap - 1, (x, y) => grain(FRAME[1], x, y, 5));
		g.box(s < 0 ? -ap : ap - 1, -5, -ap, s < 0 ? -ap : ap - 1, -4, ap - 1, (_x, y, z) => grain(FRAME[1], z, y, 6));
	}
	const table = voxels(g, S, { jitter: 0.035, drop: (_x, y) => y < 0 });
	// The top has no undersides, so an invisible slab casts its shadow onto the floor.
	const slab = shadowProxy(2 * TABLE_HALF, 8, 2 * TABLE_HALF);
	slab.position.y = -5;
	table.add(slab);
	// Legs: one meshed leg, cloned to the four corners.
	const lg = new VoxelGrid(3, -3 - floor, 3, 0, floor, 0);
	lg.box(0, floor, 0, 2, -4, 2, (x, y, z) => grain(pick(LEG, hash3(x, 0, z)), y, x + z * 3, 2, 0.2));
	lg.box(0, -7, 0, 2, -6, 2, (x, y, z) => shade(LEG[0], 0.85 + hash3(x, y, z) * 0.1));
	lg.box(0, floor, 0, 2, floor + 1, 2, (x, y, z) => shade(LEG[0], 0.75 + hash3(x, y, z) * 0.08));
	const leg = voxels(lg, S, { jitter: 0.04, drop: (_x, y) => y < 0 });
	for (const lx of [-ap, ap - 3])
		for (const lz of [-ap, ap - 3]) {
			const l = leg.clone(true);
			l.position.set(lx * S, 0, lz * S);
			table.add(l);
		}
	return table;
}

/** A high-backed wooden chair with a red plaid seat and back, facing +z. */
export function buildChair(): THREE.Group {
	const g = new VoxelGrid(18, 53, 18, -9, 0, -9);
	const wood = [hex('#6e3420'), hex('#7a3b22'), hex('#663019')];
	const w = (x: number, y: number, z: number) => grain(pick(wood, hash3(x, 0, z, 1)), y, x + z, 4, 0.16);
	// legs
	for (const lx of [-8, 6]) for (const lz of [-8, 6]) g.box(lx, 0, lz, lx + 1, 12, lz + 1, w);
	// stretchers
	g.box(-8, 4, -8, 7, 4, -8, w);
	g.box(-8, 4, 6, 7, 4, 7, w);
	// seat frame and cushion
	g.box(-8, 13, -8, 7, 13, 7, (x, y, z) => grain(wood[1], x, z, 9));
	g.box(-7, 14, -7, 6, 15, 6, (x, y, z) => (y === 15 ? tartan(x + 40, z + 40, RED_PLAID, 8) : shade(tartan(x + 40, y + 40, RED_PLAID, 8), 0.8)));
	// back posts with knobs
	for (const px of [-8, 6]) {
		g.box(px, 14, -8, px + 1, 49, -7, w);
		g.box(px, 50, -8, px + 1, 51, -7, (x, y, z) => shade(wood[0], 1.1 + hash3(x, y, z) * 0.08));
	}
	g.box(-8, 46, -8, 7, 48, -7, (x, y) => grain(wood[1], x, y, 12));
	g.box(-8, 16, -8, 7, 17, -7, (x, y) => grain(wood[1], x, y, 13));
	// upholstered back panel, padded a little to the front
	g.box(-6, 18, -8, 5, 45, -7, (x, y) => tartan(x + 40, y + 40, RED_PLAID, 8));
	g.box(-5, 20, -6, 4, 43, -6, (x, y) => shade(tartan(x + 40, y + 40, RED_PLAID, 8), 1.04));
	return voxels(g, CS, { jitter: 0.04, drop: (_x, y) => y < 0 });
}

export function placeChairs(group: THREE.Group, dist = 178) {
	const chair = buildChair();
	const spots: [number, number, number][] = [
		[0, -dist, 0],
		[0, dist, Math.PI],
		[-dist, 0, Math.PI / 2],
		[dist, 0, -Math.PI / 2]
	];
	const out: THREE.Object3D[] = [];
	spots.forEach(([x, z, rot], i) => {
		const c = i === 0 ? chair : chair.clone(true);
		const holder = new THREE.Group();
		holder.add(c);
		// Chairs are pulled out a bit and turned a few degrees, as if people just stood up.
		const off = [-30, 18, -12, 34][i];
		holder.position.set(x + (z !== 0 ? off : 0), FLOOR_Y, z + (x !== 0 ? off : 0));
		holder.rotation.y = rot + (hash3(i, 5, 1) - 0.5) * 0.18;
		group.add(holder);
		out.push(holder);
	});
	return out;
}
