import type * as THREE from 'three';
import type { PieceKind } from '../../../shared/gambit/types';
import { PIECE, build } from '../board/models';
import { Mat, type VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';

/**
 * Gambit's pieces in voxels, painted in their player's color, each on a round pedestal the way
 * chessmen stand: the guard behind a big shield, the archer with a bow, the seer in a tall mitre
 * with a lit staff, the lancer with a pennant on a long lance, the knight a horse's head, and the
 * monarch robed and crowned. Each faces +z with its foot at y = 0, centred on x and z, and is
 * meshed once per color (see `build`).
 */

/** World units per voxel of a piece. */
export const PIECE_VOXEL = 0.42;
/** Voxels across a piece's grid (its middle at half of this). */
const W = 13;
const MID = 6;

const SKIN = [hex('#f0c08a'), hex('#e8b47c')];
const STEEL = [hex('#b9c1ca'), hex('#a3acb6'), hex('#c8cfd6')];
const STEEL_DARK = hex('#6f7882');
const WOOD = [hex('#7a4a28'), hex('#6a3f22'), hex('#8a5632')];
const CREAM = hex('#f3e2b8');
const GOLD = [hex('#f0c24e'), hex('#e3b03c'), hex('#f7d26a')];
const HORSE = [hex('#efe6d6'), hex('#e6dccb'), hex('#f5ede0')];
const DARK = hex('#2a1a10');
const ERMINE = hex('#f7f2e8');

const cloth = (color: number, f = 1) => (x: number, y: number, z: number) => shade(color, f * (0.92 + hash3(x, y, z, 11) * 0.14));
const any = (cs: number[]) => (x: number, y: number, z: number) => pick(cs, hash3(x, y, z, 5));

/** A solid disc of radius r at height y, painted by `c`. */
function disc(g: VoxelGrid, y: number, r: number, c: (x: number, y: number, z: number) => number, mat?: Mat) {
	for (let z = 0; z < W; z++)
		for (let x = 0; x < W; x++) if (Math.hypot(x - MID, z - MID) <= r + 0.15) g.set(x, y, z, c(x, y, z), mat);
}

/** The round pedestal every piece stands on: a dark foot, a band in the player's color, a cream ring. */
function pedestal(g: VoxelGrid, color: number) {
	disc(g, 0, 5.2, () => shade(color, 0.45));
	disc(g, 1, 5, (x, y, z) => (Math.hypot(x - MID, z - MID) > 4.2 ? CREAM : cloth(color)(x, y, z)));
}

/** A column of discs from y0 to y1, its radius going from r0 to r1. */
function column(g: VoxelGrid, y0: number, y1: number, r0: number, r1: number, c: (x: number, y: number, z: number) => number, mat?: Mat) {
	for (let y = y0; y <= y1; y++) disc(g, y, r0 + ((r1 - r0) * (y - y0)) / Math.max(1, y1 - y0), c, mat);
}

function head(g: VoxelGrid, y: number) {
	column(g, y, y + 1, 1.5, 1.5, any(SKIN));
	g.set(MID - 1, y + 1, MID + 1, DARK);
	g.set(MID + 1, y + 1, MID + 1, DARK);
}

function guard(color: number) {
	return build(`gb-guard:${color}`, [W, 14, W], (g) => {
		pedestal(g, color);
		column(g, 2, 7, 2.4, 1.8, cloth(color));
		disc(g, 5, 2.2, () => hex('#5a3519'));
		head(g, 8);
		column(g, 10, 10, 2, 2, any(STEEL));
		disc(g, 11, 1, any(STEEL));
		// A big round shield in front: their color, a cream rim, a brass boss.
		for (let y = 3; y <= 9; y++)
			for (let x = MID - 3; x <= MID + 3; x++) {
				const d = Math.hypot(x - MID, y - 6);
				if (d > 3.2) continue;
				g.set(x, y, MID + 3, d > 2.4 ? CREAM : shade(color, 0.9));
			}
		g.set(MID, 6, MID + 4, GOLD[0]);
	}, [MID + 0.5, 0, MID + 0.5], PIECE_VOXEL, PIECE);
}

function archer(color: number) {
	return build(`gb-archer:${color}`, [W, 16, W], (g) => {
		pedestal(g, color);
		column(g, 2, 8, 2, 1.5, cloth(color, 0.85));
		head(g, 9);
		// A hood in their color.
		column(g, 11, 11, 1.8, 1.8, cloth(color, 0.75));
		g.set(MID, 12, MID, shade(color, 0.7));
		// A longbow held upright on the right, and a quiver on the back.
		for (let y = 3; y <= 13; y++) {
			const bow = Math.round(3 + Math.sin(((y - 3) / 10) * Math.PI) * 1.6);
			g.set(MID + bow, y, MID + 1, pick(WOOD, hash3(y, 1, 1)));
		}
		for (let y = 3; y <= 13; y++) g.set(MID + 3, y, MID + 1, hex('#e9e2d0'));
		column(g, 6, 9, 0.8, 0.8, () => hex('#5a3519'));
		g.box(MID - 1, 10, MID - 2, MID - 1, 11, MID - 2, () => hex('#d9d0bc'));
	}, [MID + 0.5, 0, MID + 0.5], PIECE_VOXEL, PIECE);
}

function seer(color: number) {
	return build(`gb-seer:${color}`, [W, 19, W], (g) => {
		pedestal(g, color);
		// A long robe, narrowing to the shoulders.
		column(g, 2, 9, 2.8, 1.6, cloth(color));
		column(g, 3, 9, 0.6, 0.6, () => CREAM);
		head(g, 10);
		// The tall mitre with its slit, the bishop's.
		column(g, 12, 16, 1.8, 0.6, cloth(color, 1.08));
		g.set(MID, 14, MID + 1, CREAM);
		g.set(MID, 15, MID + 1, CREAM);
		g.set(MID, 17, MID, GOLD[0]);
		// A staff with a lit orb.
		g.box(MID + 3, 2, MID, MID + 3, 13, MID, any(WOOD));
		g.box(MID + 3, 14, MID, MID + 3, 15, MID, () => hex('#9fe6ff'), undefined);
		g.set(MID + 3, 14, MID, hex('#c8f2ff'), Mat.Glow);
		g.set(MID + 3, 15, MID, hex('#c8f2ff'), Mat.Glow);
	}, [MID + 0.5, 0, MID + 0.5], PIECE_VOXEL, PIECE);
}

function lancer(color: number) {
	return build(`gb-lancer:${color}`, [W, 20, W], (g) => {
		pedestal(g, color);
		column(g, 2, 8, 2.3, 1.8, cloth(color));
		column(g, 5, 8, 1.9, 1.9, any(STEEL));
		head(g, 9);
		column(g, 11, 11, 1.7, 1.7, any(STEEL));
		disc(g, 12, 0.7, any(STEEL));
		g.set(MID, 13, MID - 1, shade(color, 1.1));
		g.set(MID, 13, MID - 2, shade(color, 1.1));
		// The lance, held up and forward, its pennant in their color.
		for (let y = 3; y <= 19; y++) g.set(MID + 3, y, MID + 2, y >= 18 ? STEEL_DARK : pick(WOOD, hash3(y, 2, 2)));
		for (let y = 14; y <= 16; y++) for (let z = 3; z <= 5 - (y - 14); z++) g.set(MID + 3, y, MID + z, cloth(color, 1.1)(0, y, z));
	}, [MID + 0.5, 0, MID + 0.5], PIECE_VOXEL, PIECE);
}

function knight(color: number) {
	return build(`gb-knight:${color}`, [W, 17, W], (g) => {
		pedestal(g, color);
		// A chess knight's horse head: the neck rising from the pedestal, the head reaching forward.
		column(g, 2, 5, 3, 2.4, cloth(color));
		g.box(MID - 2, 6, MID - 2, MID + 2, 11, MID + 1, any(HORSE));
		g.box(MID - 2, 10, MID, MID + 2, 13, MID + 4, any(HORSE));
		g.box(MID - 1, 10, MID + 5, MID + 1, 12, MID + 5, any(HORSE));
		g.set(MID - 1, 11, MID + 5, DARK);
		g.set(MID + 1, 11, MID + 5, DARK);
		// Eyes, ears, the mane in their color, the bridle in gold.
		g.set(MID - 2, 12, MID + 2, DARK);
		g.set(MID + 2, 12, MID + 2, DARK);
		g.set(MID - 1, 14, MID, HORSE[0]);
		g.set(MID + 1, 14, MID, HORSE[0]);
		for (let y = 6; y <= 13; y++) g.set(MID, y, MID - 3, cloth(color, 0.9)(0, y, 0));
		g.box(MID - 2, 11, MID + 3, MID + 2, 11, MID + 3, any(GOLD));
	}, [MID + 0.5, 0, MID + 0.5], PIECE_VOXEL, PIECE);
}

function monarch(color: number) {
	return build(`gb-monarch:${color}`, [W, 19, W], (g) => {
		pedestal(g, color);
		// A royal robe trimmed in ermine.
		column(g, 2, 10, 3, 2, cloth(color));
		disc(g, 2, 3, (x, y, z) => (hash3(x, y, z, 3) < 0.15 ? DARK : ERMINE));
		column(g, 10, 10, 2.2, 2.2, () => ERMINE);
		head(g, 11);
		// A gold crown with points, and a jewel in front.
		column(g, 13, 13, 1.9, 1.9, any(GOLD));
		for (const [x, z] of [
			[MID - 2, MID],
			[MID + 2, MID],
			[MID, MID - 2],
			[MID, MID + 2]
		])
			g.set(x, 14, z, GOLD[2]);
		g.set(MID, 14, MID, GOLD[1]);
		g.set(MID, 15, MID, GOLD[1]);
		g.set(MID, 16, MID, GOLD[2]);
		g.set(MID, 13, MID + 2, hex('#e0304a'), Mat.Glow);
	}, [MID + 0.5, 0, MID + 0.5], PIECE_VOXEL, PIECE);
}

const MODELS: Record<PieceKind, (color: number) => THREE.Group> = { guard, archer, seer, lancer, knight, monarch };

/** A fresh piece of this kind in this color (the mesh is shared; the group is the piece's own). */
export function pieceModel(kind: PieceKind, color: number): THREE.Group {
	return MODELS[kind](color).clone(true);
}
