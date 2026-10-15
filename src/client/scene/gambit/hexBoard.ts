import * as THREE from 'three';
import { hexToWorld, worldToHex, hexKey } from '../../../shared/board/hex';
import type { GambitBoard } from '../../../shared/gambit/types';
import { type Raise, block, pineTree, roundTree, pebble } from '../board/terrain';
import { VOXEL } from '../layout';
import { Mat, VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';
import { meshesFor } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';

/**
 * Gambit's board in voxels: a hex chessboard in a tray on the table. Open ground in three woods,
 * light, middle and dark, the way hex chessboards are; groves of little trees, hills raised in
 * stone, lakes sunk in water; marble shrines, the gilded Throne in the middle, and each keep ringed
 * in brass. Round the board's ragged edge lies sea, out to a hexagonal walnut frame with brass
 * along its inner edge.
 *
 * Built at any detail S (voxels per VOXEL, the player's pick): grid voxels are VOXEL / S across,
 * and sizes below are in VOXEL units, scaled by S. A hex is HEX world units from its middle to a
 * corner.
 */

/** World units from a hex's middle to a corner. */
export const HEX = 6.6;
/** Ground fills VOXEL units 0..G-1, so open ground's top face is at G (the sea's a few lower). */
const G = 6;
const SEA_TOP = G - 3;
/** The frame round the board, and the sea between it and the hexes (VOXEL units, hexes). */
const RIM = 7;
const SEA_MARGIN = 0.45;
const MAX_Y = 30;

/** World y of open ground's surface. */
export const BOARD_TOP = G * VOXEL;

const P = {
	woods: [
		[hex('#ead9b4'), hex('#e4d1a9'), hex('#efdfbd')],
		[hex('#c99f6c'), hex('#c29764'), hex('#cfa775')],
		[hex('#93693f'), hex('#8b6239'), hex('#9a7046')]
	],
	groove: hex('#4a3020'),
	moss: [hex('#4c7d33'), hex('#44732d'), hex('#558a3a')],
	hill: [hex('#a39784'), hex('#9a8e7b'), hex('#ada290'), hex('#958978')],
	hillTop: [hex('#b9ae9b'), hex('#c2b8a6')],
	water: [hex('#4f8fb6'), hex('#4a88ae'), hex('#5597bd')],
	marble: [hex('#f4f1ea'), hex('#ece8df'), hex('#f9f7f2')],
	marbleVein: hex('#cdc6b8'),
	gold: [hex('#e7bb4c'), hex('#dcae3e'), hex('#f0c95f')],
	goldDark: hex('#a8802a'),
	walnut: [hex('#5c3a20'), hex('#54341c'), hex('#633f24')],
	walnutDark: hex('#3a2312'),
	brass: [hex('#e0b24a'), hex('#d4a23c')]
};

export interface HexBoardBuild {
	group: THREE.Group;
	/** Per cell: the middle of its top (world), where a piece stands. */
	centers: THREE.Vector3[];
	/** The board's outer half width (world), rim included. */
	half: number;
	/** The cell at world (x, z), or -1. */
	cellAt(x: number, z: number): number;
	raycast(ray: THREE.Ray): THREE.Vector3 | null;
	dispose(): void;
}

/** A cell's world position (its middle, on the ground). */
export function cellWorld(board: GambitBoard, cell: number): { x: number; z: number } {
	const w = hexToWorld(board.cells[cell]);
	return { x: w.x * HEX, z: w.z * HEX };
}

export function buildHexBoard(board: GambitBoard, seed: number, S = 1): HexBoardBuild {
	const vox = VOXEL / S;
	/**
	 * The frame's inner face, out from the middle: past the board's flat sides (a hex and a half a
	 * ring, and a hex's corner) by a strip of sea. The frame's sides face the board's own (at 30,
	 * 90 and 150 degrees, between its corners).
	 */
	const inner = (1.5 * board.radius + 1 + SEA_MARGIN) * HEX;
	const outer = inner + RIM * VOXEL;
	const SIDES = [30, 90, 150].map((d) => (d * Math.PI) / 180);
	const frameInset = (wx: number, wz: number) => inner - Math.max(...SIDES.map((a) => Math.abs(wx * Math.cos(a) + wz * Math.sin(a))));
	// The frame's corners are furthest out: its flat distance over cos 30.
	const half = Math.ceil(outer / Math.cos(Math.PI / 6) / vox) + 2;
	const grid = new VoxelGrid(half * 2, MAX_Y * S, half * 2, -half, 0, -half);
	const tops = new Int16Array(grid.nx * grid.nz).fill(-1);
	const at = (x: number, z: number) => x + half + (z + half) * grid.nx;
	const raise: Raise = (x, z, y) => {
		const ix = Math.floor(x) + half;
		const iz = Math.floor(z) + half;
		if (ix < 0 || iz < 0 || ix >= grid.nx || iz >= grid.nz) return;
		const i = ix + iz * grid.nx;
		if (y > tops[i]) tops[i] = y;
	};
	const cellOf = (wx: number, wz: number) => {
		const a = worldToHex(wx / HEX, wz / HEX);
		return board.index[hexKey(a)] ?? -1;
	};
	/** How far in from its hex's edge a point is (world units). */
	const inset = (wx: number, wz: number, cell: number) => {
		const c = cellWorld(board, cell);
		const lx = (wx - c.x) / HEX;
		const lz = (wz - c.z) / HEX;
		const inR = Math.sqrt(3) / 2;
		const a = Math.abs(lx);
		const b = Math.abs(0.5 * lx + inR * lz);
		const d = Math.abs(-0.5 * lx + inR * lz);
		return (inR - Math.max(a, b, d)) * HEX;
	};
	/** A column of `top + 1` voxels (VOXEL units scaled to the grid's), its top face in `color`. */
	const column = (x: number, z: number, top: number, color: number, mat = Mat.Solid) => {
		const t = top * S + S - 1;
		const side = shade(color, 0.72);
		grid.box(x, 0, z, x, t, z, (_, y) => (y > t - S ? color : side), mat);
		tops[at(x, z)] = t;
	};

	// ---- ground, hex by hex; sea round it; the frame round that
	for (let iz = 0; iz < grid.nz; iz++)
		for (let ix = 0; ix < grid.nx; ix++) {
			const x = ix - half;
			const z = iz - half;
			const wx = (x + 0.5) * vox;
			const wz = (z + 0.5) * vox;
			// Colors vary by the VOXEL-sized block, not the grid voxel, so Fine keeps the same look.
			const r = hash3(Math.floor(x / S), 0, Math.floor(z / S), seed);
			const cell = cellOf(wx, wz);
			if (cell < 0) {
				const f = frameInset(wx, wz);
				if (f >= 0) {
					// Sea out to the frame, a little deeper the further from the board.
					column(x, z, SEA_TOP - 1, shade(pick(P.water, r), 0.9 + Math.min(1, f / HEX) * 0.06), Mat.Water);
					continue;
				}
				const out = -f / VOXEL;
				if (out > RIM) continue;
				// The walnut frame: brass along its inner edge, a dark lip on the outside.
				const edge = out > RIM - 1.2;
				const c = edge ? P.walnutDark : out < 1 ? pick(P.brass, r) : shade(pick(P.walnut, r), 0.95 + r * 0.1);
				column(x, z, edge ? G - 1 : G, c);
				continue;
			}
			const c = board.cells[cell];
			const ins = inset(wx, wz, cell);
			const groove = ins < VOXEL * 0.75;
			const tone = (((c.q - c.r) % 3) + 3) % 3;
			let top = G - 1;
			let color = shade(pick(P.woods[tone], r), 0.97 + r * 0.06);
			let mat = Mat.Solid;
			if (c.terrain === 'water') {
				top = SEA_TOP - 1;
				color = pick(P.water, r);
				mat = Mat.Water;
			} else if (c.terrain === 'hill') {
				// A low mound of stone, highest in the middle.
				const rise = Math.max(0, Math.min(2, Math.floor((ins / HEX) * 4)));
				top = G - 1 + rise;
				color = rise >= 2 ? pick(P.hillTop, r) : pick(P.hill, r);
			} else if (c.terrain === 'forest') color = pick(P.moss, r);
			if (c.shrine) color = r < 0.08 ? P.marbleVein : pick(P.marble, r);
			if (c.shrine === 2 && ins < 1.6) color = pick(P.gold, r);
			// A keep's brass ring (its player's color shines inside it, see the scene).
			if (c.keep >= 0 && ins > 1.0 && ins < 1.7) color = pick(P.brass, r);
			if (groove) {
				// The grooves between hexes, a step down, so every hex reads on its own.
				top = Math.min(top, G - 2);
				color = c.terrain === 'water' ? shade(pick(P.water, r), 0.85) : P.groove;
				mat = c.terrain === 'water' ? Mat.Water : Mat.Solid;
			}
			column(x, z, top, color, mat);
		}

	// ---- groves and stones, round the edge of their hex so a piece can stand in the middle
	board.cells.forEach((c, i) => {
		const w = cellWorld(board, i);
		const cx = Math.floor(w.x / vox);
		const cz = Math.floor(w.z / vox);
		const ring = (k: number, n: number, out: number) => {
			const a = (k / n) * Math.PI * 2 + hash3(i, 7, k, seed) * 0.6;
			return [cx + Math.round(Math.cos(a) * out * S), cz + Math.round(Math.sin(a) * out * S)] as const;
		};
		if (c.terrain === 'forest') {
			const n = 4;
			for (let k = 0; k < n; k++) {
				const [x, z] = ring(k, n, 6.5);
				const s = seed + i * 31 + k;
				if (hash3(i, k, 1, seed) < 0.55) pineTree(grid, x, G * S, z, s, raise, S);
				else roundTree(grid, x, G * S, z, s, raise, S);
			}
		} else if (c.terrain === 'hill') {
			for (let k = 0; k < 3; k++) {
				const [x, z] = ring(k, 3, 7);
				pebble(grid, x, (G + 1) * S, z, seed + i * 17 + k, raise, S);
			}
		}
		if (c.shrine) shrineStones(grid, cx, cz, c.shrine === 2, raise, seed + i, S);
	});

	const geos = meshGrid(grid, { jitter: 0.04, skipFloor: true });
	const group = meshesFor(geos, vox, {
		[Mat.Solid]: { lamps: true },
		[Mat.Sway]: { swayBase: G * S, swayScale: S, roughness: 0.7, lamps: true },
		[Mat.Water]: { roughness: 0.22, bevel: 0.35, lamps: true }
	});
	group.name = 'gambit-board';

	const centers = board.cells.map((c, i) => {
		const w = cellWorld(board, i);
		const lift = c.terrain === 'hill' ? 2 : c.terrain === 'water' ? SEA_TOP - G : 0;
		return new THREE.Vector3(w.x, (G + lift) * VOXEL, w.z);
	});
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -G * VOXEL);
	return {
		group,
		centers,
		half: half * vox,
		cellAt: cellOf,
		raycast: (ray) => ray.intersectPlane(plane, new THREE.Vector3()),
		dispose: () => group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
	};
}

/** Corner posts of marble round a shrine (gold capped round the Throne), clear of the middle. */
function shrineStones(grid: VoxelGrid, cx: number, cz: number, throne: boolean, raise: Raise, seed: number, S: number) {
	const posts = 6;
	const h = throne ? 4 : 3;
	for (let k = 0; k < posts; k++) {
		const a = (k / posts) * Math.PI * 2 + Math.PI / 6;
		const x = cx + Math.round(Math.cos(a) * 7.2 * S);
		const z = cz + Math.round(Math.sin(a) * 7.2 * S);
		for (let y = 0; y < h; y++)
			block(grid, raise, S, x, (G + y) * S, z, 0, 0, 0, () => (y === h - 1 && throne ? pick(P.gold, hash3(k, y, 1, seed)) : pick(P.marble, hash3(k, y, 2, seed))));
	}
}
