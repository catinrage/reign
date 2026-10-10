import * as THREE from 'three';
import { Mat, VoxelGrid, hash3, hex, mix, pick, shade } from '../voxel/grid';
import { type VoxelMaterialOptions, meshesFor } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';
import { addOutline } from '../voxel/outline';

/**
 * Small voxel models: player pieces, robber, sheep, ships, dice and resource items.
 * Each model is meshed once and cached; callers clone the returned group.
 */

const cache = new Map<string, THREE.Group>();

interface BuildOptions {
	jitter?: number;
	mats?: Partial<Record<Mat, VoxelMaterialOptions>>;
	/** A dark rim round the silhouette (see `addOutline`). */
	outline?: boolean;
}

export function build(
	key: string,
	size: [number, number, number],
	fill: (g: VoxelGrid) => void,
	center?: [number, number, number],
	scale = 1,
	opts: BuildOptions = {}
): THREE.Group {
	let g = cache.get(key);
	if (!g) {
		const grid = new VoxelGrid(size[0], size[1], size[2]);
		fill(grid);
		const c = center ?? [size[0] / 2, 0, size[2] / 2];
		const mats = { [Mat.Glow]: { emissive: 1.6 }, ...opts.mats };
		g = meshesFor(meshGrid(grid, { jitter: opts.jitter ?? 0.05 }), scale, mats, c);
		if (opts.outline) addOutline(g);
		cache.set(key, g);
	}
	return g;
}

export function cloneModel(g: THREE.Group): THREE.Group {
	const c = g.clone(true);
	return c;
}

// ---------------------------------------------------------------- player pieces

export const WINDOW = hex('#ffd77a');
export const DOOR = hex('#4a2c18');
export const STONE = [hex('#8e8a84'), hex('#a29d96')];
/** The dark joints between paving stones. */
const MORTAR = hex('#5f5a55');

/**
 * Player pieces are outlined and lit a little from within, so a green house still stands out
 * in a forest and a yellow road in a wheat field.
 */
export const PIECE: BuildOptions = { outline: true, mats: { [Mat.Solid]: { lift: 0.2 } } };

export function settlementModel(color: number): THREE.Group {
	return build(`settlement:${color}`, [7, 7, 7], (g) => {
		const wall = (x: number, y: number, z: number) => shade(color, 0.92 + hash3(x, y, z) * 0.14);
		const roof = (x: number, y: number, z: number) => shade(color, 0.62 + hash3(x, y, z, 3) * 0.1);
		g.box(1, 0, 1, 5, 2, 5, wall);
		// door and windows
		g.box(3, 0, 5, 3, 1, 5, DOOR);
		g.set(1, 1, 3, WINDOW, Mat.Glow);
		g.set(5, 1, 3, WINDOW, Mat.Glow);
		// gable roof along z with overhang
		g.box(0, 3, 0, 6, 3, 6, roof);
		g.box(1, 4, 0, 5, 4, 6, roof);
		g.box(2, 5, 0, 4, 5, 6, (x, y, z) => shade(roof(x, y, z), 1.08));
		g.box(3, 6, 0, 3, 6, 6, (x, y, z) => shade(roof(x, y, z), 1.15));
		// gable ends in wall color
		g.box(1, 3, 1, 5, 3, 1, wall);
		g.box(1, 3, 5, 5, 3, 5, wall);
		g.box(2, 4, 1, 4, 4, 1, wall);
		g.box(2, 4, 5, 4, 4, 5, wall);
		// chimney
		g.box(5, 4, 2, 5, 6, 2, (x, y, z) => pick(STONE, hash3(x, y, z)));
	}, undefined, 1, PIECE);
}

export function cityModel(color: number): THREE.Group {
	return build(`city:${color}`, [10, 12, 8], (g) => {
		const wall = (x: number, y: number, z: number) => shade(color, 0.9 + hash3(x, y, z) * 0.14);
		const roof = (x: number, y: number, z: number) => shade(color, 0.6 + hash3(x, y, z, 5) * 0.1);
		// hall
		g.box(1, 0, 2, 8, 3, 6, wall);
		g.box(0, 4, 1, 9, 4, 7, roof);
		g.box(1, 5, 2, 8, 5, 6, roof);
		g.box(2, 6, 3, 7, 6, 5, (x, y, z) => shade(roof(x, y, z), 1.1));
		g.box(3, 7, 4, 6, 7, 4, (x, y, z) => shade(roof(x, y, z), 1.18));
		// tower
		g.box(1, 0, 0, 3, 8, 2, wall);
		g.box(1, 9, 0, 3, 9, 2, (x, y, z) => ((x + z) % 2 === 0 ? wall(x, y, z) : -1));
		g.clear(2, 9, 1);
		g.box(2, 9, 1, 2, 10, 1, roof);
		g.set(2, 11, 1, hex('#f2d36b'), Mat.Glow);
		// doors and windows
		g.box(5, 0, 6, 6, 1, 6, DOOR);
		for (const x of [2, 7]) g.set(x, 2, 6, WINDOW, Mat.Glow);
		g.set(2, 6, 2, WINDOW, Mat.Glow);
		g.set(2, 4, 2, WINDOW, Mat.Glow);
		g.set(8, 2, 4, WINDOW, Mat.Glow);
		// stone foundation
		g.box(1, 0, 2, 8, 0, 6, (x, y, z) => (x === 5 || x === 6) && z === 6 ? DOOR : pick(STONE, hash3(x, y, z, 2)));
	}, undefined, 1, PIECE);
}

/**
 * One corner of the mark on a corner where a settlement can go: an L in the player's color, one
 * piece voxel high and thick (built at twice the detail, so the lit copy can have a top of its
 * own), with its outer corner at the origin and its arms along +x and +z. `hot` is the copy for
 * the spot under the pointer: the same sides under a glowing gold top.
 */
export function bracketModel(color: number, hot = false): THREE.Group {
	const top = hot ? mix(hex('#ffcf40'), color, 0.15) : shade(color, 1.08);
	return build(`bracket:${color}:${hot}`, [6, 2, 6], (g) => {
		const side = (x: number, y: number, z: number) => shade(color, 0.94 + hash3(x, y, z, 7) * 0.1);
		const lit = hot ? Mat.Glow : Mat.Solid;
		g.box(0, 0, 0, 5, 0, 1, side);
		g.box(0, 0, 2, 1, 0, 5, side);
		g.box(0, 1, 0, 5, 1, 1, top, lit);
		g.box(0, 1, 2, 1, 1, 5, top, lit);
	}, [0, 0, 0], 0.5, { outline: true, mats: { [Mat.Solid]: { lift: hot ? 0.6 : 0.35 }, [Mat.Glow]: { emissive: 1.2 } } });
}

/** Road along local +x, centered. Length in voxels. */
export function roadModel(color: number, length = 8): THREE.Group {
	return build(`road:${color}:${length}`, [length, 2, 2], (g) => {
		g.box(0, 0, 0, length - 1, 1, 1, (x, y) => {
			const plank = Math.floor(x / 2) % 2 === 0 ? 1 : 0.9;
			return shade(color, (y === 1 ? 1.05 : 0.82) * plank);
		});
	}, [length / 2, 0, 1], 1, PIECE);
}

/**
 * A road paved with stone (Reign Extended), along local +x and centered like `roadModel`, at four
 * times its detail: pale cobbles in staggered courses with dark mortar between, flush with curbs in
 * the owner's color on the road's bed. Up close it reads as stone, from across the table as the
 * owner's road.
 */
export function stoneRoadModel(color: number, length = 8): THREE.Group {
	const n = length * 4;
	return build(`stoneRoad:${color}:${length}`, [n, 7, 8], (g) => {
		// The bed is the road it was.
		g.box(0, 0, 0, n - 1, 4, 7, (x, y) => shade(color, y === 4 ? 0.9 : 0.76));
		// Curbs down both sides.
		for (const z of [0, 7]) g.box(0, 5, z, n - 1, 6, z, (x, y) => shade(color, y === 6 ? 1.08 : 0.95));
		// Cobbles four cells long in courses two cells wide, every other course set off by two.
		for (let z = 1; z <= 6; z++) {
			const course = (z - 1) >> 1;
			const off = course % 2 ? 2 : 0;
			for (let x = 0; x < n; x++) {
				const stone = Math.floor((x + off) / 4);
				const joint = (x + off) % 4 === 3;
				g.set(x, 5, z, MORTAR);
				g.set(x, 6, z, joint ? MORTAR : shade(pick(STONE, hash3(stone, course, 7)), 1.05 + hash3(stone, course, 3) * 0.25));
			}
		}
	}, [n / 2, 0, 4], 0.25, PIECE);
}

// ---------------------------------------------------------------- robber

export function robberModel(): THREE.Group {
	return build('robber', [7, 12, 7], (g) => {
		const dark = (x: number, y: number, z: number) => mix(hex('#24242a'), hex('#3a3a44'), hash3(x, y, z) * 0.7);
		const cx = 3;
		const cz = 3;
		for (let y = 0; y < 12; y++) {
			let r: number;
			if (y === 0) r = 3.2;
			else if (y === 1) r = 2.8;
			else if (y < 7) r = 2.4 - (y - 2) * 0.22;
			else if (y === 7) r = 1.4;
			else r = 2.2 - Math.abs(y - 9) * 0.55;
			for (let z = 0; z < 7; z++)
				for (let x = 0; x < 7; x++) if (Math.hypot(x - cx, z - cz) <= r) g.set(x, y, z, dark(x, y, z));
		}
		g.set(2, 9, 5, hex('#ff5a3c'), Mat.Glow);
		g.set(4, 9, 5, hex('#ff5a3c'), Mat.Glow);
	});
}

// ---------------------------------------------------------------- ambient life

export function sheepModel(): THREE.Group {
	return build('sheep', [7, 5, 4], (g) => {
		const wool = (x: number, y: number, z: number) => pick([hex('#f6f3ec'), hex('#ebe6dc'), hex('#ffffff')], hash3(x, y, z));
		g.box(1, 1, 0, 4, 3, 3, wool);
		g.clear(1, 3, 0);
		g.clear(4, 3, 3);
		g.box(5, 2, 1, 6, 3, 2, hex('#2f2a27'));
		g.set(6, 3, 1, hex('#2f2a27'));
		for (const [x, z] of [
			[1, 0],
			[4, 0],
			[1, 3],
			[4, 3]
		])
			g.set(x, 0, z, hex('#2f2a27'));
	}, [3.5, 0, 2]);
}

/** A little ship for a harbor. Its sails and pennant take the color of the harbor's owner. */
export function shipModel(color?: number): THREE.Group {
	return build(`ship:${color ?? 'none'}`, [14, 14, 7], (g) => {
		const wood = (x: number, y: number, z: number) => pick([hex('#7a4a28'), hex('#6a3f22'), hex('#8a5632')], hash3(x, y, z));
		// hull
		g.box(3, 0, 2, 10, 0, 4, wood);
		g.box(1, 1, 1, 12, 2, 5, wood);
		g.box(0, 2, 2, 0, 2, 4, wood);
		g.box(13, 2, 2, 13, 3, 4, wood);
		g.box(2, 2, 2, 11, 2, 4, hex('#c08a52'));
		g.box(1, 3, 1, 12, 3, 1, hex('#5a3519'));
		g.box(1, 3, 5, 12, 3, 5, hex('#5a3519'));
		// masts
		g.box(7, 3, 3, 7, 12, 3, hex('#5a3519'));
		g.box(3, 3, 3, 3, 9, 3, hex('#5a3519'));
		// sails
		const white = (x: number, y: number, z: number) => pick([hex('#f7f3ea'), hex('#ece6d8')], hash3(x, y, z));
		const sail =
			color === undefined
				? white
				: (x: number, y: number, z: number) =>
						y === 8 ? white(x, y, z) : shade(color, 0.96 + hash3(x, y, z) * 0.1);
		g.box(8, 6, 0, 8, 11, 6, sail);
		g.box(9, 7, 1, 9, 10, 5, sail);
		g.box(4, 5, 1, 4, 8, 5, sail);
		const pennant = color ?? hex('#efe6d2');
		g.box(7, 13, 3, 7, 13, 3, pennant);
		g.box(6, 13, 3, 6, 13, 3, pennant);
	}, [7, 1, 3.5]);
}

// ---------------------------------------------------------------- dice

/** Which face shows which number: +y 1, -y 6, +x 2, -x 5, +z 3, -z 4. */
export const DIE_FACES: Record<number, THREE.Vector3> = {
	1: new THREE.Vector3(0, 1, 0),
	6: new THREE.Vector3(0, -1, 0),
	2: new THREE.Vector3(1, 0, 0),
	5: new THREE.Vector3(-1, 0, 0),
	3: new THREE.Vector3(0, 0, 1),
	4: new THREE.Vector3(0, 0, -1)
};

const PIP_LAYOUT: Record<number, [number, number][]> = {
	1: [[0, 0]],
	2: [[-1, -1], [1, 1]],
	3: [[-1, -1], [0, 0], [1, 1]],
	4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
	5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
	6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
};

/** Voxels along each side of a die. */
export const DIE_VOXELS = 12;

/**
 * A white die with pips that read from across the table: each pip is a 2x2 block of near
 * black, and the 1 is one big red pip. The body is plain white with soft bevels, so the
 * voxel grid doesn't speckle the faces.
 */
export function dieModel(): THREE.Group {
	const N = DIE_VOXELS;
	return build(
		'die',
		[N, N, N],
		(g) => {
			g.box(0, 0, 0, N - 1, N - 1, N - 1, hex('#f7f2e6'));
			// round the corners and edges a bit
			for (let y = 0; y < N; y++)
				for (let z = 0; z < N; z++)
					for (let x = 0; x < N; x++) {
						const ex = x === 0 || x === N - 1;
						const ey = y === 0 || y === N - 1;
						const ez = z === 0 || z === N - 1;
						if ((ex && ey) || (ey && ez) || (ex && ez)) g.clear(x, y, z);
					}
			const ink = hex('#1c1411');
			const red = hex('#d3281c');
			// Voxel at (u, w) on a face.
			const at = (n: THREE.Vector3, u: number, w: number): [number, number, number] => {
				if (n.y !== 0) return [u, n.y > 0 ? N - 1 : 0, w];
				if (n.x !== 0) return [n.x > 0 ? N - 1 : 0, u, w];
				return [u, w, n.z > 0 ? N - 1 : 0];
			};
			for (const [num, n] of Object.entries(DIE_FACES)) {
				const v = Number(num);
				const cells: [number, number][] = [];
				if (v === 1) {
					for (let w = 4; w < 8; w++)
						for (let u = 4; u < 8; u++) if (!((u === 4 || u === 7) && (w === 4 || w === 7))) cells.push([u, w]);
				} else {
					for (const [a, b] of PIP_LAYOUT[v])
						for (const [du, dw] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells.push([5 + a * 3 + du, 5 + b * 3 + dw]);
				}
				for (const [u, w] of cells) g.set(...at(n, u, w), v === 1 ? red : ink);
			}
		},
		[N / 2, N / 2, N / 2],
		1,
		{ jitter: 0.02, mats: { [Mat.Solid]: { bevel: 0.2, bevelWidth: 0.08 } } }
	);
}

// ---------------------------------------------------------------- resource items (icons, trays)

export function resourceItemModel(kind: string): THREE.Group {
	switch (kind) {
		case 'wood':
			return build('item:wood', [8, 6, 8], (g) => {
				const bark = (x: number, y: number, z: number) => pick([hex('#6b4426'), hex('#7a4f2c'), hex('#5c3920')], hash3(x, y, z));
				const ring = hex('#d9b27a');
				const logs: [number, number][] = [[1, 0], [4, 0], [2.5, 2.6]];
				for (const [lx, ly] of logs)
					for (let z = 0; z < 8; z++)
						for (let dy = 0; dy < 3; dy++)
							for (let dx = 0; dx < 3; dx++) {
								if ((dx === 0 || dx === 2) && (dy === 0 || dy === 2)) continue;
								const x = Math.round(lx + dx);
								const y = Math.round(ly + dy);
								g.set(x, y, z, z === 0 || z === 7 ? (dx === 1 && dy === 1 ? hex('#b8874f') : ring) : bark(x, y, z));
							}
			});
		case 'brick':
			return build('item:brick', [8, 5, 6], (g) => {
				const b = (x: number, y: number, z: number) => pick([hex('#c4502c'), hex('#b2442a'), hex('#d8613a')], hash3(x, y, z));
				g.box(0, 0, 0, 7, 1, 2, b);
				g.box(0, 0, 3, 7, 1, 5, b);
				g.box(2, 2, 1, 6, 3, 4, b);
			});
		case 'sheep':
			return build('item:sheep', [7, 7, 7], (g) => {
				const wool = (x: number, y: number, z: number) => pick([hex('#f6f3ec'), hex('#e5dfd2'), hex('#ffffff')], hash3(x, y, z));
				for (let y = 0; y < 7; y++)
					for (let z = 0; z < 7; z++)
						for (let x = 0; x < 7; x++)
							if (Math.hypot(x - 3, (y - 3) * 1.1, z - 3) < 3.3 + hash3(x, y, z) * 0.5) g.set(x, y, z, wool(x, y, z));
			});
		case 'wheat':
			return build('item:wheat', [7, 10, 7], (g) => {
				for (let z = 1; z < 6; z++)
					for (let x = 1; x < 6; x++) {
						if (Math.hypot(x - 3, z - 3) > 2.3) continue;
						const h = 8 + Math.floor(hash3(x, 0, z) * 2);
						for (let y = 0; y < h; y++) {
							const head = y >= h - 3;
							g.set(x + (head && x !== 3 ? Math.sign(x - 3) : 0), y, z + (head && z !== 3 ? Math.sign(z - 3) : 0), head ? pick([hex('#f9d150'), hex('#ffe07a'), hex('#f3bd31')], hash3(x, y, z)) : hex('#d6951c'));
						}
					}
				g.box(1, 3, 1, 5, 3, 5, (x, y, z) => (Math.hypot(x - 3, z - 3) < 2.4 ? hex('#a0522d') : -1));
			});
		case 'ore':
		default:
			return build('item:ore', [8, 7, 8], (g) => {
				for (let y = 0; y < 7; y++)
					for (let z = 0; z < 8; z++)
						for (let x = 0; x < 8; x++) {
							const d = Math.hypot(x - 3.5, y * 1.25, z - 3.5);
							if (d < 4 + hash3(x, y, z) * 0.8)
								g.set(x, y, z, hash3(x, y, z, 4) > 0.78 ? pick([hex('#b9c7da'), hex('#d8e2f0')], hash3(x, z, y)) : pick([hex('#80838b'), hex('#6f7279'), hex('#9a9da4')], hash3(x, y, z)));
						}
			});
	}
}
