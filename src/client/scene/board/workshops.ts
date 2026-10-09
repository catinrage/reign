import * as THREE from 'three';
import type { Resource } from '../../../shared/rules/config';
import { Mat, type VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';
import { DOOR, PIECE, STONE, WINDOW, build, cloneModel, sheepModel } from './models';

/**
 * Reign Extended workshops: a Mill on fields, a Sawmill on forest, a Kiln on hills, a Mine Shaft
 * on mountains and a Sheepfold on pasture. Each stands on a little yard of its own, wears its
 * owner's color on a roof, and has a part that keeps working while the game runs: turning sails,
 * a water wheel, a smoking kiln, a mine cart under a spinning pulley, sheep that shuffle about.
 *
 * They stand beside a tile's number token, so they stay low enough not to hide it from the
 * usual camera, and keep to a round footprint about nine voxels across (their tile's plot).
 * Models face +z (their front) and are built at one voxel per unit like the other pieces.
 */

/** World size of a workshop voxel: a little under a settlement's, as they are smaller works. */
export const WORKSHOP_SCALE = 0.56;

const PLASTER = [hex('#f1e8d4'), hex('#e8dcc2'), hex('#f6efe0')];
const LIME = [hex('#efe4cb'), hex('#e6d8ba'), hex('#f5ecd8')];
const TIMBER = [hex('#7a4a28'), hex('#6a3f22'), hex('#8a5632')];
const DARK = hex('#4b2c17');
const PLANK = [hex('#a76b38'), hex('#95602f'), hex('#b37742')];
const BRICK = [hex('#9c3a22'), hex('#a8432a'), hex('#8e3420')];
const MORTAR = hex('#d9a986');
const CLOTH = [hex('#f7f0df'), hex('#efe5cd')];
const GRAVEL = [hex('#8b8378'), hex('#9a9287'), hex('#7c756b'), hex('#a39b8f')];
const EARTH = [hex('#8a5e34'), hex('#7c522c'), hex('#94673a')];
const IRON = hex('#3b3a40');
const STEEL = [hex('#c9cdd4'), hex('#b3b8c1')];
const WATER = [hex('#4d90bd'), hex('#5a9fca'), hex('#4685b2')];
const FIRE = [hex('#ff8a2a'), hex('#ffb347'), hex('#ff6a1a')];
const HAY = [hex('#e9c25a'), hex('#d9ad45'), hex('#f2d06a')];
const GRASS = [hex('#86c447'), hex('#7cb93e'), hex('#93cf52')];
const ORE = [hex('#80838b'), hex('#6f7279'), hex('#9a9da4')];
const GLINT = [hex('#cfe0f5'), hex('#9fb8d8')];
const RING = hex('#d9b27a');

type Color = (x: number, y: number, z: number) => number;
const any =
	(list: number[], seed = 0): Color =>
	(x, y, z) =>
		pick(list, hash3(x, y, z, seed));
/** The owner's color, a touch uneven so a roof doesn't read as one flat sheet. */
const paint =
	(color: number, f = 1, seed = 0): Color =>
	(x, y, z) =>
		shade(color, f * (0.93 + hash3(x, y, z, seed) * 0.12));

/** A round yard of radius r round cell (cx, cz) at y = 0, its rim a shade darker. */
function yard(g: VoxelGrid, cx: number, cz: number, r: number, color: Color) {
	for (let z = 0; z < g.nz; z++)
		for (let x = 0; x < g.nx; x++) {
			const d = Math.hypot(x - cx, z - cz);
			if (d <= r) g.set(x, 0, z, d > r - 0.9 ? shade(color(x, 0, z), 0.82) : color(x, 0, z));
		}
}

/** A disc of cells round (cx, cz) at height y. */
function disc(g: VoxelGrid, cx: number, cz: number, y: number, r: number, color: Color) {
	for (let z = 0; z < g.nz; z++)
		for (let x = 0; x < g.nx; x++) if (Math.hypot(x - cx, z - cz) <= r) g.set(x, y, z, color(x, y, z));
}

// ---------------------------------------------------------------- mill (fields)

function millBody(color: number) {
	return build(`mill:${color}`, [9, 12, 9], (g) => {
		yard(g, 4, 4, 4.3, any(STONE.concat(GRAVEL), 1));
		// A tapering whitewashed tower on a stone footing, a timber band halfway up.
		for (let y = 1; y <= 7; y++) {
			const r = 3.05 - (y - 1) * 0.13;
			const col: Color = y === 1 ? any(STONE, 2) : y === 4 ? any(TIMBER) : any(PLASTER, 3);
			disc(g, 4, 4, y, r, col);
		}
		// Door, windows, and a lit one up top.
		g.box(4, 1, 7, 4, 2, 7, DOOR);
		g.set(4, 5, 6, WINDOW, Mat.Glow);
		g.set(6, 3, 4, WINDOW, Mat.Glow);
		g.set(2, 6, 4, WINDOW, Mat.Glow);
		// The cap that turns the sails into the wind, in the owner's color.
		[2.95, 2.3, 1.4].forEach((r, k) => disc(g, 4, 4, 8 + k, r, paint(color, 0.9 + k * 0.08, 4)));
		g.set(4, 11, 4, hex('#f2d36b'), Mat.Glow);
		// The axle the sails hang on.
		g.set(4, 8, 7, DARK);
	}, undefined, 1, PIECE);
}

/** Four slender sails round a hub, in the x-y plane, their cloth in the owner's color; the hub is at the origin. */
function millSails(color: number) {
	const N = 13;
	const c = 6;
	return build(`mill:sails:${color}`, [N, N, 1], (g) => {
		const cloth = paint(color, 1.12, 2);
		g.set(c, c, 0, DARK);
		for (const [ux, uy] of [
			[1, 0],
			[0, 1],
			[-1, 0],
			[0, -1]
		]) {
			const vx = -uy;
			const vy = ux;
			for (let u = 1; u <= 6; u++) {
				g.set(c + ux * u, c + uy * u, 0, pick(TIMBER, hash3(u, ux, uy)));
				// Cloth on the trailing side, framed at the tip.
				const x = c + ux * u + vx;
				const y = c + uy * u + vy;
				if (u >= 2) g.set(x, y, 0, u === 6 ? DARK : cloth(x, y, 0));
			}
		}
	}, [N / 2, N / 2, 0.5], 1, PIECE);
}

// ---------------------------------------------------------------- sawmill (forest)

function sawmillBody(color: number) {
	return build(`sawmill:${color}`, [10, 9, 10], (g) => {
		// Packed earth, sawdust round the bench, and a stone-lined race on the right for the wheel.
		yard(g, 4.5, 4.5, 4.7, (x, y, z) => (z >= 7 && x <= 6 && hash3(x, y, z, 2) > 0.45 ? pick(HAY, hash3(z, x, 1)) : pick(EARTH, hash3(x, y, z, 5))));
		for (let z = 0; z < 10; z++)
			for (let x = 6; x < 10; x++) {
				const d = Math.hypot(x - 4.5, z - 4.5);
				if (d > 5) continue;
				const water = (x === 7 || x === 8) && d <= 4.6;
				g.set(x, 0, z, water ? pick(WATER, hash3(x, 0, z, 7)) : pick(STONE, hash3(x, 0, z, 6)), water ? Mat.Water : Mat.Solid);
			}
		// A plank hut with dark corner posts, a door and lit windows.
		g.box(1, 1, 1, 5, 4, 6, (x, y, z) => {
			const wall = x === 1 || x === 5 || z === 1 || z === 6;
			if (!wall) return -1;
			if ((x === 1 || x === 5) && (z === 1 || z === 6)) return DARK;
			return (x + z) % 2 === 0 ? pick(PLANK, hash3(x, y, z)) : pick(TIMBER, hash3(x, y, z));
		});
		g.box(3, 1, 6, 3, 2, 6, DOOR);
		g.set(3, 4, 6, WINDOW, Mat.Glow);
		g.set(1, 3, 3, WINDOW, Mat.Glow);
		// A steep gable roof, ridge front to back, in the owner's color; plank in the gables. It
		// keeps to the walls on the sides, so the wheel's axle comes out under it.
		const roof = paint(color, 1, 8);
		for (let k = 0; k < 3; k++)
			g.box(1 + k, 5 + k, 0, 5 - k, 5 + k, 7, (x, y, z) =>
				(z === 0 || z === 7) && x > 1 + k && x < 5 - k ? pick(PLANK, hash3(x, y, z, 2)) : shade(roof(x, y, z), 1 + k * 0.05)
			);
		// The axle out to the wheel.
		g.box(6, 4, 4, 6, 5, 5, DARK);
		// A big log in front, its cut ends pale, a saw blade stuck in it.
		g.box(2, 1, 7, 5, 2, 8, (x, y, z) => (x === 2 || x === 5 ? shade(RING, 0.94 + hash3(x, y, z) * 0.1) : pick(TIMBER, hash3(x, y, z, 9))));
		g.box(4, 3, 7, 4, 4, 8, (x, y, z) => (y === 4 && z === 8 ? DARK : pick(STEEL, hash3(x, y, z))));
	}, undefined, 1, PIECE);
}

/**
 * A water wheel taller than the hut, paddles all round, in the y-z plane and turning on the x
 * axis; its hub (between the middle four cells) is at the origin.
 */
function sawmillWheel() {
	return build('sawmill:wheel', [2, 10, 10], (g) => {
		const c = 4.5;
		for (let y = 0; y < 10; y++)
			for (let z = 0; z < 10; z++) {
				const d = Math.hypot(y - c, z - c);
				const paddle = Math.abs(Math.sin(Math.atan2(y - c, z - c) * 4)) < 0.45;
				for (let x = 0; x < 2; x++) {
					if (d > 3.1 && d <= 4.1) g.set(x, y, z, paddle ? pick(PLANK, hash3(y, z, x)) : pick(TIMBER, hash3(y, z, x)));
					else if (d > 4.1 && d <= 5.1 && paddle) g.set(x, y, z, pick(PLANK, hash3(z, y, x)));
					else if (d <= 3.1 && (Math.abs(y - c) < 1 || Math.abs(z - c) < 1)) g.set(x, y, z, DARK);
				}
			}
	}, [1, 5, 5], 1, PIECE);
}

// ---------------------------------------------------------------- kiln (hills)

/** The bottle kiln's outline: its radius at each height. */
const BOTTLE = [3.3, 3.3, 3.2, 3.0, 2.6, 2.0, 1.55, 1.4, 1.35, 1.6];

function kilnBody(color: number) {
	return build(`kiln:${color}`, [9, 11, 9], (g) => {
		// Dark brick paving in a running bond, so the pale kiln stands out on red clay.
		yard(g, 4, 4, 4.3, (x, _y, z) => ((x + (z % 2) * 2) % 4 === 0 ? shade(MORTAR, 0.85) : pick(BRICK, hash3(x, 0, z, 3))));
		// A bottle kiln: a limewashed body with hoops in the owner's color, a brick neck blackened at the top.
		BOTTLE.forEach((r, k) => {
			const y = k + 1;
			const col: Color =
				y === 1 ? any(BRICK, 4) : y === 3 || y === 6 ? paint(color, 0.95, 4) : y >= 7 ? (y === 10 ? () => shade(BRICK[2], 0.5) : any(BRICK, 5)) : any(LIME, 4);
			disc(g, 4, 4, y, r + 0.15, col);
		});
		for (let y = 7; y <= 10; y++) g.clear(4, y, 4);
		// The fire in its mouth, under a dark brick arch.
		for (const [x, y] of [
			[3, 1],
			[4, 1],
			[5, 1],
			[3, 2],
			[4, 2],
			[5, 2]
		]) {
			g.set(x, y, 7, pick(FIRE, hash3(x, y, 7)), Mat.Fire);
			g.set(x, y, 6, pick(FIRE, hash3(x, y, 6)), Mat.Fire);
		}
		for (const [x, y] of [
			[2, 1],
			[2, 2],
			[6, 1],
			[6, 2],
			[3, 3],
			[4, 3],
			[5, 3]
		])
			g.set(x, y, 7, shade(BRICK[2], 0.6));
		// A lean-to for the firewood, roofed in the owner's color.
		g.box(8, 0, 2, 8, 2, 2, DARK);
		g.box(8, 0, 6, 8, 2, 6, DARK);
		g.box(7, 1, 3, 8, 2, 5, (x, y, z) => (z % 2 === 0 ? RING : pick(TIMBER, hash3(x, y, z, 7))));
		const roof = paint(color, 1, 9);
		g.box(7, 4, 1, 7, 4, 7, roof);
		g.box(8, 3, 1, 8, 3, 7, (x, y, z) => shade(roof(x, y, z), 0.9));
	}, undefined, 1, PIECE);
}

/** Where the kiln's smoke rises from (the top of its neck), in its model's voxel units. */
const KILN_CHIMNEY = new THREE.Vector3(0, 11.3, 0);

// ---------------------------------------------------------------- mine shaft (mountains)

function mineBody(color: number) {
	return build(`mine:${color}`, [9, 11, 9], (g) => {
		yard(g, 4, 4, 4.5, any(GRAVEL, 2));
		// The shaft: a black hole in a timber collar.
		g.box(4, 0, 2, 6, 0, 4, hex('#140f0b'));
		g.box(3, 1, 1, 7, 1, 5, (x, _y, z) => (x === 3 || x === 7 || z === 1 || z === 5 ? pick(TIMBER, hash3(x, 1, z)) : -1));
		// The headframe over it: two braced trestles with a beam across the top of each.
		for (const [x, z] of [
			[3, 1],
			[7, 1],
			[3, 5],
			[7, 5]
		])
			g.box(x, 2, z, x, 8, z, pick(TIMBER, hash3(x, 0, z)));
		const beam = (x0: number, z0: number, x1: number, z1: number, y: number) => g.box(x0, y, z0, x1, y, z1, any(TIMBER, y));
		beam(3, 1, 3, 5, 8);
		beam(7, 1, 7, 5, 8);
		beam(3, 1, 7, 1, 5);
		beam(3, 5, 7, 5, 5);
		for (let k = 0; k < 3; k++) {
			g.set(3, 2 + k, 2 + k, DARK);
			g.set(7, 2 + k, 4 - k, DARK);
		}
		// Bearings for the pulley on the trestles, its axle, and the rope down the shaft.
		g.set(3, 9, 3, DARK);
		g.set(7, 9, 3, DARK);
		g.set(4, 9, 3, IRON);
		g.set(6, 9, 3, IRON);
		g.box(5, 1, 3, 5, 6, 3, RING);
		g.set(3, 6, 5, WINDOW, Mat.Glow);
		g.set(7, 6, 1, WINDOW, Mat.Glow);
		// The hoist house beside it, roofed in the owner's color.
		g.box(0, 0, 2, 2, 0, 5, any(STONE, 4));
		g.box(0, 1, 2, 2, 2, 5, (x, y, z) => (x === 0 || x === 2 || z === 2 || z === 5 ? pick(PLANK, hash3(x, y, z, 3)) : -1));
		g.set(1, 1, 5, DOOR);
		const roof = paint(color, 1, 3);
		g.box(0, 3, 1, 2, 3, 6, roof);
		g.box(1, 4, 1, 1, 4, 6, (x, y, z) => shade(roof(x, y, z), 1.1));
		// Rails out of the shaft to the front.
		for (let z = 5; z <= 8; z++) {
			g.set(4, 1, z, IRON);
			g.set(6, 1, z, IRON);
			if (z % 2 === 0) g.set(5, 1, z, pick(TIMBER, hash3(5, 1, z)));
		}
	}, undefined, 1, PIECE);
}

/** The pulley on top of the headframe, turning on the x axis; the hub is at the origin. */
function minePulley() {
	return build('mine:pulley', [1, 5, 5], (g) => {
		for (let y = 0; y < 5; y++)
			for (let z = 0; z < 5; z++) {
				const d = Math.hypot(y - 2, z - 2);
				if (d > 1.4 && d <= 2.4) g.set(0, y, z, IRON);
				else if (d <= 1.4 && (y === 2 || z === 2)) g.set(0, y, z, pick(TIMBER, hash3(y, z, 1)));
			}
	}, [0.5, 2.5, 2.5], 1, PIECE);
}

/** An ore cart in the owner's color; its base sits at the origin. */
function mineCart(color: number) {
	return build(`mine:cart:${color}`, [3, 4, 3], (g) => {
		g.box(0, 0, 0, 2, 0, 2, (x, _y, z) => ((x === 0 || x === 2) && z !== 1 ? IRON : -1));
		g.box(0, 1, 0, 2, 2, 2, paint(color, 1, 5));
		g.box(0, 3, 0, 2, 3, 2, (x, y, z) => (Math.abs(x - 1) + Math.abs(z - 1) > 1 ? -1 : hash3(x, y, z) > 0.6 ? pick(GLINT, hash3(z, x, y)) : pick(ORE, hash3(x, y, z))));
	}, [1.5, 0, 1.5], 1, PIECE);
}

// ---------------------------------------------------------------- sheepfold (pasture)

function foldBody(color: number) {
	return build(`fold:${color}`, [10, 9, 10], (g) => {
		// Grass and straw underfoot.
		yard(g, 4.5, 4.5, 4.8, (x, y, z) => (hash3(x, y, z, 3) > 0.72 ? pick(HAY, hash3(x, 1, z)) : pick(GRASS, hash3(x, 0, z))));
		// The barn across the back: timber walls on a plank floor, a big door, a tall roof in the
		// owner's color.
		g.box(1, 0, 1, 8, 0, 4, any(PLANK, 5));
		g.box(1, 1, 1, 8, 3, 4, (x, y, z) => {
			if (!(x === 1 || x === 8 || z === 1 || z === 4)) return -1;
			if ((x === 1 || x === 8) && (z === 1 || z === 4)) return DARK;
			return pick(TIMBER, hash3(x, y, z, 4));
		});
		g.box(4, 1, 4, 5, 3, 4, DOOR);
		for (const [x, y] of [
			[4, 1],
			[5, 2],
			[4, 3],
			[5, 3]
		])
			g.set(x, y, 4, shade(PLANK[2], 1.1));
		g.set(2, 2, 4, WINDOW, Mat.Glow);
		g.set(7, 2, 4, WINDOW, Mat.Glow);
		const roof = paint(color, 1, 6);
		for (let k = 0; k < 3; k++)
			g.box(0, 4 + k, k, 9, 4 + k, 5 - k, (x, y, z) =>
				(x === 0 || x === 9) && z > k && z < 5 - k ? pick(PLANK, hash3(x, y, z, 2)) : shade(roof(x, y, z), 1 + k * 0.05)
			);
		// The pen in front: a fence along the yard's rim with a gate, and a hay rack.
		for (let z = 5; z <= 9; z++)
			for (let x = 0; x <= 9; x++) {
				const d = Math.hypot(x - 4.5, z - 4.5);
				if (d <= 3.7 || d > 4.75 || (z >= 8 && (x === 4 || x === 5))) continue;
				const post = (x + z) % 2 === 1;
				if (post) g.set(x, 1, z, pick(TIMBER, hash3(x, 1, z)));
				g.set(x, 2, z, post ? DARK : pick(PLANK, hash3(x, 2, z)));
			}
		g.box(7, 1, 5, 8, 1, 6, any(HAY, 8));
		g.box(7, 2, 5, 8, 2, 5, any(HAY, 9));
	}, undefined, 1, PIECE);
}

// ---------------------------------------------------------------- assembled workshops

/**
 * A workshop for a tile of `res`, in its owner's color, ready to place: its base at the origin,
 * its front facing +z. Clone-safe: the moving parts are found by name.
 */
export function workshopObject(res: Resource, color: number): THREE.Group {
	const root = new THREE.Group();
	root.userData.workshop = res;
	const part = (model: THREE.Group | null, name: string, x: number, y: number, z: number) => {
		const pivot = new THREE.Group();
		pivot.name = name;
		pivot.position.set(x, y, z);
		if (model) pivot.add(cloneModel(model));
		root.add(pivot);
		return pivot;
	};
	switch (res) {
		case 'wheat':
			root.add(cloneModel(millBody(color)));
			part(millSails(color), 'sails', 0, 8.5, 4);
			break;
		case 'wood':
			root.add(cloneModel(sawmillBody(color)));
			part(sawmillWheel(), 'wheel', 3, 5, 0);
			break;
		case 'brick':
			root.add(cloneModel(kilnBody(color)));
			part(null, 'chimney', KILN_CHIMNEY.x, KILN_CHIMNEY.y, KILN_CHIMNEY.z);
			break;
		case 'ore':
			root.add(cloneModel(mineBody(color)));
			part(minePulley(), 'pulley', 1, 9.5, -1);
			part(mineCart(color), 'cart', 1, 2, 1);
			break;
		case 'sheep':
			root.add(cloneModel(foldBody(color)));
			for (const [x, z, a] of [
				[-2.0, 2.2, 0.4],
				[0.6, 2.6, 0]
			]) {
				const sheep = part(sheepModel(), 'sheep', x, 1, z);
				sheep.scale.setScalar(0.42);
				sheep.rotation.y = a;
				sheep.userData.home = new THREE.Vector2(x, z);
				sheep.userData.base = a;
				sheep.userData.heading = a;
			}
			break;
	}
	return root;
}

/** Keep a workshop's moving parts moving; `t` is the scene clock in seconds. */
export function animateWorkshop(obj: THREE.Object3D, t: number, dt: number) {
	const time = t + (obj.userData.phase ??= Math.random() * 100);
	for (const c of obj.children) {
		switch (c.name) {
			case 'sails':
				c.rotation.z = -time * 0.9;
				break;
			case 'wheel':
				c.rotation.x = time * 1.1;
				break;
			case 'pulley':
				// It winds one way as the cart comes up, and back as it goes down.
				c.rotation.x = Math.cos(time * 0.6) * 5;
				break;
			case 'cart': {
				// Out of the shaft, a pause at the end of the rails, back in.
				const k = (Math.sin(time * 0.6) + 1) / 2;
				c.position.z = 1 + k * k * (3 - 2 * k) * 2;
				break;
			}
			case 'sheep': {
				// They shuffle round now and then, never far from facing along the pen.
				const ud = c.userData;
				ud.wait = (ud.wait ?? Math.random() * 3) - dt;
				if (ud.wait <= 0) {
					ud.wait = 2 + Math.random() * 4;
					ud.heading = ud.base + (Math.random() - 0.5) * 1.2;
				}
				const turn = angleDelta(c.rotation.y, ud.heading);
				c.rotation.y += turn * Math.min(1, dt * 2);
				c.position.y = 1 + (Math.abs(turn) > 0.1 ? Math.max(0, Math.sin(time * 9 + ud.home.x)) * 0.25 : 0);
				break;
			}
		}
	}
}

/** Where smoke rises from a workshop (the kiln's neck), in world space, or null. */
export function workshopChimney(obj: THREE.Object3D): THREE.Vector3 | null {
	const c = obj.getObjectByName('chimney');
	return c ? c.getWorldPosition(new THREE.Vector3()) : null;
}

function angleDelta(a: number, b: number) {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}
