import * as THREE from 'three';
import { PIECE, build } from '../board/models';
import { hash3, hex, pick, shade } from '../voxel/grid';
import type { UnitKind } from './troopPlan';

/**
 * The troops' miniatures in voxels, painted in their player's color: a footman with spear and
 * shield, a knight on a caparisoned horse with a lance, and a catapult flying a banner. Each faces
 * +z with its feet at y = 0, centred on x and z, and is meshed once per color (see `build`).
 */

/** World units per voxel of a miniature. */
export const TROOP_VOXEL = 0.32;

const SKIN = [hex('#f0c08a'), hex('#e8b47c')];
const STEEL = [hex('#b9c1ca'), hex('#a3acb6'), hex('#c8cfd6')];
const STEEL_DARK = hex('#6f7882');
const WOOD = [hex('#7a4a28'), hex('#6a3f22'), hex('#8a5632')];
const WOOD_DARK = [hex('#4e2d14'), hex('#45280f')];
const LEATHER = hex('#3a2614');
const CLOTH_DARK = hex('#44403c');
const CREAM = hex('#f3e2b8');
const BRASS = hex('#e0b24a');
const HORSE = [hex('#8a5a34'), hex('#7d5030'), hex('#94643c')];
const HORSE_DARK = hex('#3b2414');
const STONE = [hex('#8e8a84'), hex('#a29d96'), hex('#7d7973')];

/** The player's color, a voxel lighter or darker here and there, as cloth takes the light. */
const cloth = (color: number, f = 1) => (x: number, y: number, z: number) => shade(color, f * (0.92 + hash3(x, y, z, 11) * 0.14));
const any = (cs: number[]) => (x: number, y: number, z: number) => pick(cs, hash3(x, y, z, 5));

function footman(color: number) {
	return build(`cq-footman:${color}`, [7, 14, 6], (g) => {
		// Boots and legs.
		g.box(2, 0, 2, 2, 0, 3, LEATHER);
		g.box(4, 0, 2, 4, 0, 3, LEATHER);
		g.box(2, 1, 2, 2, 3, 3, CLOTH_DARK);
		g.box(4, 1, 2, 4, 3, 3, CLOTH_DARK);
		// The tunic in his colors, belted.
		g.box(1, 3, 2, 5, 7, 3, cloth(color));
		g.box(1, 5, 2, 5, 5, 3, hex('#5a3519'));
		g.set(3, 5, 3, BRASS);
		// Arms, hands.
		g.box(0, 5, 2, 0, 7, 3, cloth(color, 0.85));
		g.box(6, 5, 2, 6, 7, 3, cloth(color, 0.85));
		g.set(0, 4, 3, SKIN[0]);
		g.set(6, 4, 3, SKIN[0]);
		// Head and a kettle hat.
		g.box(2, 8, 2, 4, 9, 3, any(SKIN));
		g.set(2, 9, 3, hex('#2a1a10'));
		g.set(4, 9, 3, hex('#2a1a10'));
		g.box(1, 10, 1, 5, 10, 4, any(STEEL));
		g.box(2, 11, 2, 4, 11, 3, any(STEEL));
		// A spear in the right hand.
		g.box(0, 1, 4, 0, 11, 4, any(WOOD));
		g.box(0, 12, 4, 0, 13, 4, STEEL_DARK);
		// A kite shield on the left arm: his color, a cream rim, a brass boss.
		g.box(5, 3, 4, 6, 7, 4, (x, y) => (y === 3 || y === 7 ? CREAM : shade(color, 0.95)));
		g.set(6, 5, 5, BRASS);
	}, [3.5, 0, 3], TROOP_VOXEL, PIECE);
}

function knight(color: number) {
	return build(`cq-knight:${color}`, [9, 15, 14], (g) => {
		// The horse: four legs, body, neck and head, mane and tail.
		for (const [x, z] of [
			[3, 4],
			[5, 4],
			[3, 9],
			[5, 9]
		]) {
			g.box(x, 1, z, x, 3, z, any(HORSE));
			g.set(x, 0, z, HORSE_DARK);
		}
		g.box(3, 4, 3, 5, 6, 10, any(HORSE));
		g.box(3, 6, 10, 5, 8, 11, any(HORSE));
		g.box(3, 8, 11, 5, 9, 13, any(HORSE));
		g.box(4, 8, 13, 4, 8, 13, HORSE_DARK);
		g.set(3, 10, 11, HORSE_DARK);
		g.set(5, 10, 11, HORSE_DARK);
		g.box(4, 7, 10, 4, 10, 10, HORSE_DARK);
		g.box(4, 4, 2, 4, 6, 2, HORSE_DARK);
		g.set(4, 4, 1, HORSE_DARK);
		// The caparison down both flanks in the rider's colors, trimmed in cream.
		g.box(2, 3, 3, 2, 6, 10, (x, y) => (y === 3 ? CREAM : shade(color, 0.9 + hash3(x, y, 0, 3) * 0.12)));
		g.box(6, 3, 3, 6, 6, 10, (x, y) => (y === 3 ? CREAM : shade(color, 0.9 + hash3(x, y, 1, 3) * 0.12)));
		g.box(3, 7, 4, 5, 7, 9, cloth(color));
		// The rider: steel legs, his tabard, arms, a great helm with a slit, a plume.
		g.box(2, 7, 6, 2, 8, 7, any(STEEL));
		g.box(6, 7, 6, 6, 8, 7, any(STEEL));
		g.box(3, 8, 6, 5, 10, 7, cloth(color));
		g.set(4, 9, 7, BRASS);
		g.box(2, 9, 6, 2, 10, 7, any(STEEL));
		g.box(6, 9, 6, 6, 10, 7, any(STEEL));
		g.box(3, 11, 6, 5, 12, 7, any(STEEL));
		g.box(3, 11, 7, 5, 11, 7, STEEL_DARK);
		g.box(4, 13, 6, 4, 14, 7, cloth(color, 1.1));
		// A couched lance in the right hand, its pennant; a shield on the left.
		g.box(1, 9, 3, 1, 9, 12, any(WOOD));
		g.set(1, 9, 13, STEEL_DARK);
		g.box(1, 10, 11, 1, 10, 12, cloth(color));
		g.box(7, 7, 6, 7, 10, 7, (x, y) => (y === 7 || y === 10 ? CREAM : shade(color, 0.95)));
	}, [4.5, 0, 7], TROOP_VOXEL, PIECE);
}

function catapult(color: number) {
	return build(`cq-catapult:${color}`, [9, 12, 14], (g) => {
		// Four wheels: a dark rim, a brass hub.
		for (const x of [0, 8])
			for (const zc of [3, 10]) {
				g.box(x, 0, zc - 1, x, 2, zc + 1, any(WOOD_DARK));
				g.set(x, 1, zc, BRASS);
			}
		// The bed: two long beams, cross beams, planks.
		g.box(1, 1, 1, 1, 2, 12, any(WOOD));
		g.box(7, 1, 1, 7, 2, 12, any(WOOD));
		for (const z of [2, 7, 11]) g.box(2, 1, z, 6, 1, z, any(WOOD));
		g.box(2, 2, 5, 6, 2, 9, (x, y, z) => shade(pick(WOOD, hash3(x, y, z)), 1.12));
		// The beams painted in the player's colors.
		g.box(1, 2, 3, 1, 2, 10, (x, y, z) => (z % 2 ? cloth(color)(x, y, z) : pick(WOOD, hash3(x, y, z))));
		g.box(7, 2, 3, 7, 2, 10, (x, y, z) => (z % 2 ? cloth(color)(x, y, z) : pick(WOOD, hash3(x, y, z))));
		// The frame the arm swings in.
		g.box(2, 3, 7, 2, 6, 7, any(WOOD_DARK));
		g.box(6, 3, 7, 6, 6, 7, any(WOOD_DARK));
		g.box(2, 7, 7, 6, 7, 7, any(WOOD));
		// The arm, cocked back, and its bucket with a stone in it.
		for (let i = 0; i <= 7; i++) g.box(4, 2 + i, 10 - i, 4, 2 + i, 10 - i, pick(WOOD, hash3(4, i, 0)));
		g.box(3, 9, 2, 5, 10, 3, any(WOOD_DARK));
		g.box(4, 11, 2, 4, 11, 3, any(STONE));
		// A banner flying at the back.
		g.box(7, 3, 12, 7, 11, 12, any(WOOD_DARK));
		g.box(7, 8, 13, 7, 11, 13, (x, y) => (y === 8 ? CREAM : cloth(color)(x, y, 13)));
	}, [4.5, 0, 7], TROOP_VOXEL, PIECE);
}

/** The stone a catapult throws. */
export function rockModel() {
	return build('cq-rock', [3, 3, 3], (g) => {
		g.box(0, 1, 1, 2, 1, 1, any(STONE));
		g.box(1, 0, 1, 1, 2, 1, any(STONE));
		g.box(1, 1, 0, 1, 1, 2, any(STONE));
		g.set(0, 2, 1, STONE[2]);
	}, [1.5, 1.5, 1.5], 0.32);
}

/** One mesh of a miniature: what to draw it with, and where it sits in the miniature. */
export interface TroopPart {
	geometry: THREE.BufferGeometry;
	material: THREE.Material;
	/** The mesh's own place in the model (its scale and offset). */
	local: THREE.Matrix4;
	castShadow: boolean;
}

const parts = new Map<string, TroopPart[]>();

/** The meshes a miniature is drawn with, for drawing many of them at once. */
export function troopParts(kind: UnitKind, color: number): TroopPart[] {
	const key = `${kind}:${color}`;
	let p = parts.get(key);
	if (!p) {
		const model = kind === 'footman' ? footman(color) : kind === 'knight' ? knight(color) : catapult(color);
		p = model.children
			.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
			.map((m) => {
				m.updateMatrix();
				return { geometry: m.geometry, material: m.material as THREE.Material, local: m.matrix.clone(), castShadow: m.castShadow && m.name !== 'outline' };
			});
		parts.set(key, p);
	}
	return p;
}
