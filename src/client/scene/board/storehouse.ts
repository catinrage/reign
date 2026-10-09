import * as THREE from 'three';
import { getTopology } from '../../../shared/board/topology';
import type { Terrain } from '../../../shared/rules/config';
import { hash3, hex, pick, shade } from '../voxel/grid';
import type { BoardView } from './boardView';
import { PIECE, STONE, build, cloneModel } from './models';

/**
 * Reign Extended storehouses: a little stone strongroom set against one wall of its owner's
 * settlement or city, on the side that looks out over open ground, with a hoist beside it that
 * winches a sack up and down. It is built at twice a piece's detail, so a padlock and barrel hoops
 * fit on something this small, and the hoist's pennant stands about as tall as the house.
 */

const PLANK = [hex('#a76b38'), hex('#95602f'), hex('#b37742')];
const TIMBER = [hex('#7a4a28'), hex('#6a3f22'), hex('#8a5632')];
const SHINGLE = [hex('#7b4e2c'), hex('#6c4326'), hex('#8a5a34')];
const WALL = [hex('#9a958e'), hex('#8a857e'), hex('#aaa59d'), hex('#7f7a73')];
const DARK = hex('#4b2c17');
const IRON = hex('#3b3a40');
const BRASS = hex('#f2c14e');
const BURLAP = [hex('#d9bd86'), hex('#ccad74'), hex('#e3c994')];
const TIE = hex('#7d5a2e');
const ROPE = hex('#c9a46a');

/** Cells per piece voxel. */
const FINE = 2;
/** Rows of stone footing below the ground, which show where the land falls away (on a shore). */
const FOOT = 4;
/** Where the hoist's rope hangs from, in piece voxels from the storehouse's origin. */
const PULLEY = new THREE.Vector3(-0.5, 5.5, 3.25);
/** The hoisted sack's height, in piece voxels. */
const SACK = 1.25;

/**
 * A storehouse's body in its owner's color: a stone strongroom under a roof of wooden shingles
 * that slopes down away from the house it leans on, its eaves and its door painted, an iron band
 * and a brass padlock on the door, a barrel by it, and a hoist with a pennant at the corner. Its
 * back stands at the origin and it faces +z; in piece voxels the strongroom is 4.5 wide, 2.5 deep
 * and 3 tall, low enough to fit under a settlement's eaves. The shingles set it apart from the
 * house's own roof.
 */
export function storehouseModel(color: number): THREE.Group {
	return build(
		`storehouse:${color}`,
		[12, FOOT + 15, 7],
		(g) => {
			const G = FOOT;
			// Rough-cut stone in courses, paler quoins at the corners.
			const stone = (x: number, y: number, z: number) => {
				if ((x === 3 || x === 9) && (y + (z === 3 ? 0 : 1)) % 2 === 0) return shade(pick(WALL, hash3(x, y, z, 8)), 1.12);
				return shade(pick(WALL, hash3((x + (y % 2)) >> 1, y, z, 7)), 0.94 + hash3(x, y, z, 9) * 0.1);
			};
			// The footing, its top course just above the ground.
			g.box(3, 0, 0, 9, G, 3, (x, y, z) => shade(pick(STONE, hash3(x, y, z, 1)), y === G ? 0.92 : 0.8));
			// The walls, taller at the back where the roof meets the house.
			g.box(3, G + 1, 0, 9, G + 4, 1, (x, y, z) => (x === 3 || x === 9 || z === 0 ? stone(x, y, z) : -1));
			g.box(3, G + 1, 2, 9, G + 3, 3, (x, y, z) => (x === 3 || x === 9 || z === 3 ? stone(x, y, z) : -1));
			// A painted door in a dark frame, an iron band across it and a brass padlock on the hasp.
			for (const x of [4, 8]) g.box(x, G + 1, 3, x, G + 3, 3, DARK);
			g.box(5, G + 1, 3, 7, G + 3, 3, (x, y) => (y === G + 2 ? IRON : shade(color, x === 6 ? 0.95 : 0.8)));
			g.set(6, G + 2, 4, BRASS);
			// Wooden shingles in three steps down from the house, over the sides, the eaves painted.
			const shingle = (f: number) => (x: number, y: number, z: number) =>
				shade(pick(SHINGLE, hash3(x, y, z, 6)), f * ((x + z) % 2 ? 0.92 : 1.04));
			g.box(2, G + 5, 0, 10, G + 5, 1, shingle(1.05));
			g.box(2, G + 4, 2, 10, G + 4, 3, shingle(0.95));
			g.box(2, G + 3, 4, 10, G + 3, 4, (x, y, z) => shade(color, 0.86 + hash3(x, y, z, 6) * 0.1));
			// A barrel by the door, hooped in iron.
			g.box(8, G, 4, 9, G + 2, 5, (x, y, z) => (y === G + 1 ? IRON : pick(TIMBER, hash3(x, y, z, 3))));
			g.box(8, G + 2, 4, 9, G + 2, 5, (x, y, z) => shade(pick(PLANK, hash3(x, y, z, 4)), 1.12));
			// The hoist: a post at the front corner, its arm out over the door with the pulley at the
			// end, a brace under it, and the owner's pennant flying from the top.
			g.box(2, G, 6, 2, G + 14, 6, (x, y, z) => pick(TIMBER, hash3(x, y, z, 10)));
			g.box(3, G + 12, 6, 5, G + 12, 6, (x, y, z) => pick(TIMBER, hash3(x, y, z, 11)));
			g.set(3, G + 11, 6, DARK);
			g.set(5, G + 11, 6, IRON);
			g.box(0, G + 13, 6, 1, G + 14, 6, (x, y, z) => shade(color, (x === 0 ? 0.9 : 1.04) + hash3(x, y, z, 12) * 0.06));
		},
		[6.5, FOOT, 0],
		1 / FINE,
		PIECE
	);
}

/** A sack of grain tied at the neck; its top is at the origin. */
function sackModel() {
	return build(
		'storehouse:sack',
		[4, 5, 4],
		(g) => {
			g.box(0, 0, 0, 3, 3, 3, (x, y, z) => {
				const rim = (x === 0 || x === 3) && (z === 0 || z === 3);
				return rim && (y === 0 || y === 3) ? -1 : shade(pick(BURLAP, hash3(x, y, z, 5)), y === 0 ? 0.88 : 1);
			});
			g.box(1, 4, 1, 2, 4, 2, TIE);
		},
		[2, 5, 2],
		1 / 4,
		PIECE
	);
}

/** One length of rope, a quarter voxel long, hanging from the origin; stretched to fit. */
function ropeModel() {
	return build('storehouse:rope', [1, 1, 1], (g) => g.set(0, 0, 0, ROPE), [0.5, 1, 0.5], 1 / 4);
}

/**
 * A storehouse in its owner's color, ready to place: its back at the origin against the wall,
 * facing +z. Clone-safe: the hoist's rope and sack are found by name.
 */
export function storehouseObject(color: number): THREE.Group {
	const root = new THREE.Group();
	root.add(cloneModel(storehouseModel(color)));
	for (const [name, model] of [
		['rope', ropeModel()],
		['sack', sackModel()]
	] as const) {
		const pivot = new THREE.Group();
		pivot.name = name;
		pivot.add(cloneModel(model));
		root.add(pivot);
	}
	hoistTo(root, 0.5, 0);
	return root;
}

/**
 * Hang a storehouse's sack `k` of the way down its rope, from just under the pulley (0) to the
 * ground (1), the rope swung `sway` radians out of true.
 */
function hoistTo(obj: THREE.Object3D, k: number, sway: number) {
	const drop = 0.4 + k * (PULLEY.y - SACK - 0.4);
	for (const part of obj.children) {
		if (part.name === 'rope') {
			part.position.copy(PULLEY);
			part.rotation.z = sway;
			part.scale.y = drop * 4;
		} else if (part.name === 'sack') {
			part.position.set(PULLEY.x + Math.sin(sway) * drop, PULLEY.y - Math.cos(sway) * drop, PULLEY.z);
			part.rotation.z = sway;
		}
	}
}

/**
 * Keep a storehouse's hoist at work: the sack comes down to the ground, waits, and is winched up
 * to the pulley again, swaying a little on its rope. `t` is the scene clock in seconds.
 */
export function animateStorehouse(obj: THREE.Object3D, t: number) {
	const time = t + (obj.userData.phase ??= Math.random() * 100);
	// Clipped, so it rests a while at each end.
	const s = THREE.MathUtils.clamp(Math.sin(time * 0.45) * 1.6, -1, 1);
	const k = (s + 1) / 2;
	hoistTo(obj, k * k * (3 - 2 * k), Math.sin(time * 1.9) * 0.06 * (1 - k));
}

/** A wall a storehouse can stand against, in its building's voxels: where the middle of its back goes, and which way it faces. */
interface Wall {
	x: number;
	z: number;
	nx: number;
	nz: number;
	/** Extra cost: it would hide the building's front door. */
	cost?: number;
}

const WALLS: Record<'settlement' | 'city', Wall[]> = {
	settlement: [
		{ x: 2.5, z: 0, nx: 1, nz: 0 },
		{ x: -2.5, z: 0, nx: -1, nz: 0 },
		{ x: 0, z: -2.5, nx: 0, nz: -1 },
		{ x: 0, z: 2.5, nx: 0, nz: 1, cost: 0.5 }
	],
	city: [
		// Tucked in beside the tower.
		{ x: 1.25, z: -2, nx: 0, nz: -1 },
		// Beside the door.
		{ x: -2, z: 3, nx: 0, nz: 1 },
		{ x: 4, z: 0.5, nx: 1, nz: 0 },
		{ x: -4, z: -0.5, nx: -1, nz: 0 }
	]
};

/** How far a storehouse reaches out from its back (piece voxels), and half its width. */
const DEPTH = 3;
const HALF = 2.25;

/**
 * How much a storehouse would rather not look out over each kind of tile: pasture and desert stay
 * flat right up to the corner, trees keep their distance, but wheat grows tall round it, hills and
 * mountains rise, and over the sea its footing shows.
 */
const FACING: Record<Terrain | 'sea', number> = {
	pasture: 0,
	desert: 0.1,
	forest: 0.3,
	sea: 0.8,
	fields: 1.4,
	hills: 1.5,
	mountains: 2
};

/**
 * Where the storehouse of the building on vertex `v` stands, and which way it faces. The building
 * (a settlement or city turned by `yaw`, its voxels `scale` world units) has four walls; of those
 * that look out over a tile rather than along a road, the storehouse takes the one with the
 * clearest ground in front of it.
 */
export function storehouseSpot(bv: BoardView, v: number, kind: 'settlement' | 'city', yaw: number, scale: number) {
	const topo = getTopology(bv.board);
	const vert = topo.vertices[v];
	const dir = (p: { x: number; z: number }) => Math.atan2(p.z - vert.z, p.x - vert.x);
	// The three tiles round a corner, land or sea, lie a third of a turn apart.
	const a0 = dir(topo.hexes[vert.hexes[0]]);
	const tiles = [0, 1, 2].map((k) => {
		const a = a0 + (k * 2 * Math.PI) / 3;
		const h = vert.hexes.find((id) => Math.abs(turn(dir(topo.hexes[id]), a)) < 0.5);
		return { a, cost: FACING[h === undefined ? 'sea' : bv.board.hexes[h].terrain] };
	});
	const roads = vert.edges.map((e) => {
		const ed = topo.edges[e];
		return dir(topo.vertices[ed.a === v ? ed.b : ed.a]);
	});
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	let best: Wall = WALLS[kind][0];
	let bestCost = Infinity;
	for (const w of WALLS[kind]) {
		// Which way the wall looks out on the board.
		const a = Math.atan2(-w.nx * sin + w.nz * cos, w.nx * cos + w.nz * sin);
		const facing = tiles.reduce((m, t) => (Math.abs(turn(t.a, a)) < Math.abs(turn(m.a, a)) ? t : m));
		const road = Math.min(Math.PI, ...roads.map((r) => Math.abs(turn(r, a))));
		// The further out its far corners reach, the likelier it runs into trees and rocks.
		const reach = Math.max(
			...[-HALF, HALF].map((s) => Math.hypot(w.x + w.nz * s + w.nx * DEPTH, w.z - w.nx * s + w.nz * DEPTH))
		);
		const cost =
			facing.cost + (w.cost ?? 0) + (road < 0.6 ? 4 : 0) + Math.max(0, reach - 5.6) * 0.8 + hash3(v, w.nx + 2, w.nz + 2) * 0.05;
		if (cost < bestCost) {
			bestCost = cost;
			best = w;
		}
	}
	const pos = bv.vertexPos(v);
	pos.x += (best.x * cos + best.z * sin) * scale;
	pos.z += (-best.x * sin + best.z * cos) * scale;
	return { pos, yaw: yaw + Math.atan2(best.nx, best.nz) };
}

/**
 * The yard trodden flat in front of a storehouse whose back stands at `pos` and which faces `yaw`
 * (its voxels `scale` world units), so the wheat of a field doesn't bury it: written into `out` as
 * (center x, center z, radius, ground height) for the crops' shader (`sharedUniforms.uYards`).
 */
export function storehouseYard(pos: THREE.Vector3, yaw: number, scale: number, out: THREE.Vector4) {
	const ahead = (DEPTH / 2) * scale;
	return out.set(pos.x + Math.sin(yaw) * ahead, pos.z + Math.cos(yaw) * ahead, (HALF + 1) * scale, pos.y + 0.15);
}

/** The signed turn from angle a to angle b, in (-π, π]. */
function turn(a: number, b: number) {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d <= -Math.PI) d += Math.PI * 2;
	return d;
}
