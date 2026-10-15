import { C, type Raise, block, put } from '../board/terrain';
import { type VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';

/**
 * The trees, rocks and cottages on Conquest's Realm. Like Settlement's (see board/terrain), they
 * are drawn at any detail S: x, y and z are grid voxels, while their sizes are in VOXELs. The pine
 * is drawn finer where the voxels are small; the rest are built of VOXEL-sized blocks.
 */

const P = {
	snow: [hex('#f5f8fb'), hex('#eaf0f6'), hex('#ffffff'), hex('#e3ebf3')],
	ice: [hex('#bfe3f2'), hex('#a8d6ea'), hex('#d4eef8')],
	palmTrunk: [hex('#a87c4a'), hex('#97693a'), hex('#b88b55')],
	palm: [hex('#2f9e3a'), hex('#38b044'), hex('#27892f'), hex('#45c04f')],
	wall: [hex('#f2ead8'), hex('#e8dfca')],
	roof: [hex('#c24b2a'), hex('#b13f22'), hex('#cf5a36')]
};

/** A pine, as on Settlement's forests; snowy ones have white on every tier. */
export function pine(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, snowy: boolean, S: number) {
	const tall = hash3(s, 1, 1);
	const trunkH = (1 + (tall > 0.5 ? 1 : 0)) * S;
	for (let k = 0; k < trunkH; k++) put(g, raise, x, y + k, z, pick(C.trunk, hash3(x, y + k, z, s)));
	const height = (6 + Math.floor(tall * 4)) * S;
	const base = 1.45 + hash3(s, 2, 1) * 0.45;
	const reach = 3 * S;
	let yy = y + trunkH;
	for (let l = 0; l < height; l++) {
		const t = l / height;
		// Tiers of three layers, each starting wide and tapering.
		const tier = 2 - ((l / S) % 3);
		const rad = base * (1 - t * 0.85) + tier * 0.3;
		for (let dz = -reach; dz <= reach; dz++)
			for (let dx = -reach; dx <= reach; dx++) {
				const d = Math.hypot(dx, dz) / S;
				if (d > rad) continue;
				const rr = hash3(x + dx, yy, z + dz, s);
				const lit = (dx - dz) / S < -0.5 && d > rad - 1.1;
				let c = lit && rr > 0.35 ? pick(C.pineHi, rr) : pick(C.pine, rr);
				if (snowy && tier > 1.25 && d > rad - 1.2 && rr > 0.25) c = pick(P.snow, rr);
				put(g, raise, x + dx, yy, z + dz, c);
			}
		yy++;
	}
	put(g, raise, x, yy, z, snowy ? P.snow[2] : pick(C.pineHi, hash3(s, 3, 3)));
}

/** A palm: a leaning ringed trunk and drooping fronds. */
export function palm(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const at = (dx: number, dy: number, dz: number, c: number) => block(g, raise, S, x, y, z, dx, dy, dz, () => c);
	const h = 6 + Math.floor(hash3(s, 1, 2) * 3);
	const lean = hash3(s, 2, 2) * Math.PI * 2;
	const lx = Math.cos(lean);
	const lz = Math.sin(lean);
	let tx = 0;
	let tz = 0;
	for (let k = 0; k < h; k++) {
		const off = ((k * k) / (h * h)) * 2;
		tx = Math.round(lx * off);
		tz = Math.round(lz * off);
		at(tx, k, tz, k % 2 ? P.palmTrunk[0] : P.palmTrunk[1]);
	}
	at(tx, h, tz, P.palm[3]);
	const fronds = 6;
	for (let f = 0; f < fronds; f++) {
		const a = (f / fronds) * Math.PI * 2 + hash3(s, f, 3);
		const cx = Math.cos(a);
		const cz = Math.sin(a);
		for (let k = 1; k <= 4; k++) {
			const fx = tx + Math.round(cx * k);
			const fz = tz + Math.round(cz * k);
			const fy = h - (k >= 3 ? k - 2 : 0);
			at(fx, fy, fz, pick(P.palm, hash3(x + fx, y + fy, z + fz, s)));
		}
	}
	// Coconuts.
	if (hash3(s, 4, 4) > 0.4) at(tx + 1, h - 1, tz, hex('#6b4a22'));
}

export function iceRock(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const n = 2 + Math.floor(hash3(s, 1, 1) * 3);
	for (let k = 0; k < n; k++) {
		const dx = Math.floor(hash3(s, k, 2) * 3) - 1;
		const dz = Math.floor(hash3(s, k, 3) * 3) - 1;
		const h = 1 + Math.floor(hash3(s, k, 4) * 3);
		for (let j = 0; j < h; j++) block(g, raise, S, x, y, z, dx, j, dz, (vx, vy, vz) => pick(P.ice, hash3(vx, vy, vz, s)));
	}
}

export function boulder(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number, red = false) {
	const pal = red ? C.clayDark.concat(C.clay) : C.rock.concat(C.rockHi);
	const color = (vx: number, vy: number, vz: number) => pick(pal, hash3(vx, vy, vz, s));
	const big = hash3(s, 5, 5) > 0.5;
	for (let dz = 0; dz <= (big ? 1 : 0); dz++)
		for (let dx = 0; dx <= 1; dx++) {
			block(g, raise, S, x, y, z, dx, 0, dz, color);
			if (big && dx === 0 && dz === 0) block(g, raise, S, x, y, z, 0, 1, 0, color);
		}
}

/** Sandstone columns of a ruin, some broken, one fallen. */
export function ruin(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const sand = [hex('#e8cf98'), hex('#dcc088'), hex('#f0daa8')];
	const color = (vx: number, vy: number, vz: number) => pick(sand, hash3(vx, vy, vz, s));
	for (let k = 0; k < 3; k++) {
		const h = 2 + Math.floor(hash3(s, k, 6) * 3);
		for (let j = 0; j < h; j++) block(g, raise, S, x, y, z, k * 2, j, 0, color);
		if (h >= 4) block(g, raise, S, x, y, z, k * 2, h, 0, () => shade(sand[0], 1.05));
	}
	block(g, raise, S, x, y, z, 0, 0, 2, () => pick(sand, hash3(s, 9, 9)));
	block(g, raise, S, x, y, z, 1, 0, 2, () => pick(sand, hash3(s, 9, 8)));
}

/** A red rock spire. */
export function hoodoo(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const h = 3 + Math.floor(hash3(s, 3, 7) * 3);
	for (let j = 0; j < h; j++) {
		const color = (vx: number, vy: number, vz: number) => (j % 2 ? pick(C.clay, hash3(vx, vy, vz, s)) : pick(C.clayDark, hash3(vx, vy, vz, s)));
		block(g, raise, S, x, y, z, 0, j, 0, color);
		if (j < 2) block(g, raise, S, x, y, z, 1, j, 0, color);
	}
	block(g, raise, S, x, y, z, 0, h, 0, () => pick(C.clayHi, s));
}

/** A dry, twiggy bush. */
export function dryBush(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const c = [hex('#a08a4a'), hex('#8f7a3e'), hex('#b39b56')];
	block(g, raise, S, x, y, z, 0, 0, 0, () => pick(c, hash3(s, 1, 1)));
	if (hash3(s, 2, 1) > 0.4) block(g, raise, S, x, y, z, 1, 0, 0, () => pick(c, hash3(s, 2, 2)));
	if (hash3(s, 3, 1) > 0.5) block(g, raise, S, x, y, z, 0, 1, 0, () => pick(c, hash3(s, 3, 3)));
}

/** A white cottage with a red gabled roof and a chimney. */
export function cottage(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const turn = hash3(s, 7, 1) > 0.5;
	const L = 4;
	const Wd = 3;
	const at = (a: number, b: number, h: number, c: number) => (turn ? block(g, raise, S, x, y, z, b, h, a, () => c) : block(g, raise, S, x, y, z, a, h, b, () => c));
	for (let a = 0; a < L; a++)
		for (let b = 0; b < Wd; b++) {
			for (let h = 0; h < 2; h++) {
				const door = h === 0 && a === 1 && b === Wd - 1;
				const window = h === 1 && (a === 2 || a === 0) && b === Wd - 1;
				at(a, b, h, door ? hex('#6b4224') : window ? hex('#ffd35a') : pick(P.wall, hash3(a, h, b, s)));
			}
			// The roof: a ridge down the middle.
			const ridge = b === 1;
			at(a, b, 2, pick(P.roof, hash3(a, 2, b, s)));
			if (ridge) at(a, b, 3, shade(pick(P.roof, hash3(a, 3, b, s)), 1.08));
		}
	at(L - 1, 0, 3, hex('#8a8c94'));
	at(L - 1, 0, 4, hex('#6f7179'));
}
