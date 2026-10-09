import * as THREE from 'three';
import type { CityPath } from '../../../shared/rules/buildings';
import type { Resource } from '../../../shared/rules/config';
import { Mat, type VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';
import { DOOR, PIECE, STONE, WINDOW, build, cloneModel } from './models';

/**
 * Reign Extended city paths: a city that takes one becomes a castle (tall, with pointed towers and
 * a flag on its keep), a guild hall (a timber-framed market hall, striped awnings over its stalls
 * and the goods it trades piled out front, its sign swinging) or a fortress (low and crenellated,
 * a squat tower, barracks and a yard where a quintain spins). Each wears its owner's color on its
 * walls and roofs like the city it was, so it still reads as theirs from across the table.
 *
 * They are built at twice a piece's detail on about a city's footprint, centred on its corner and
 * facing +z, and placed like a city.
 */

/** Cells per piece voxel. */
const FINE = 2;

const GOLD = hex('#f2c14e');
const CREAM = hex('#f3e7c9');
const OPENING = hex('#24170e');
const IRON = hex('#3b3a40');
const STEEL = [hex('#c9cdd4'), hex('#b3b8c1')];
const TIMBER = [hex('#7a4a28'), hex('#6a3f22'), hex('#8a5632')];
const PLANK = [hex('#a76b38'), hex('#95602f'), hex('#b37742')];
const SANDSTONE = [hex('#cdbb9a'), hex('#bfae8e'), hex('#d8c8a8')];
const EARTH = [hex('#a9875c'), hex('#9b7a51'), hex('#b49266')];
const BURLAP = [hex('#d9bd86'), hex('#ccad74'), hex('#e3c994')];
const HAY = [hex('#e9c25a'), hex('#d9ad45'), hex('#f2d06a')];
const WOOL = [hex('#f6f3ec'), hex('#ebe6dc'), hex('#ffffff')];
const GRAIN = [hex('#f9d150'), hex('#ffe07a'), hex('#f3bd31')];
const STALK = hex('#d6951c');
const BARK = [hex('#6b4426'), hex('#7a4f2c'), hex('#5c3920')];
const RING = hex('#d9b27a');
const CLAY = [hex('#c4502c'), hex('#b2442a'), hex('#d8613a')];
const MORTAR = hex('#d9a986');
const ORE = [hex('#80838b'), hex('#6f7279'), hex('#9a9da4')];
const GLINT = [hex('#cfe0f5'), hex('#9fb8d8')];

type Color = (x: number, y: number, z: number) => number;
const any =
	(list: number[], seed = 0): Color =>
	(x, y, z) =>
		pick(list, hash3(x, y, z, seed));
/** The owner's color, a touch uneven so a wall doesn't read as one flat sheet. */
const paint =
	(color: number, f = 1, seed = 0): Color =>
	(x, y, z) =>
		shade(color, f * (0.94 + hash3(x, y, z, seed) * 0.1));
/** Grey stone, rough-cut. */
const stone: Color = (x, y, z) => shade(pick(STONE, hash3(x, y, z, 4)), 0.86 + hash3(x, y, z, 5) * 0.16);

/** A disc of cells round (cx, cz) at height y. */
function disc(g: VoxelGrid, cx: number, cz: number, y: number, r: number, color: Color) {
	for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
		for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x - cx, z - cz) <= r) g.set(x, y, z, color(x, y, z));
}

/** Merlons every other cell round the rim of a box's top, one row above it. */
function battlements(g: VoxelGrid, x0: number, z0: number, x1: number, z1: number, y: number, color: Color) {
	for (let z = z0; z <= z1; z++)
		for (let x = x0; x <= x1; x++) {
			const rim = x === x0 || x === x1 || z === z0 || z === z1;
			if (rim && (x + z) % 2 === 0) g.set(x, y, z, color(x, y, z));
		}
}

/** A round tower's merlons, every other cell of its rim. */
function roundBattlements(g: VoxelGrid, cx: number, cz: number, y: number, r: number, color: Color) {
	for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
		for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
			const d = Math.hypot(x - cx, z - cz);
			if (d <= r && d > r - 1.2 && (x + z) % 2 === 0) g.set(x, y, z, color(x, y, z));
		}
}

/** A piece voxel position of a cell corner, from a model whose center is cell (cx, 0, cz). */
const at = (x: number, y: number, z: number, cx: number, cz: number) =>
	new THREE.Vector3((x - cx) / FINE, y / FINE, (z - cz) / FINE);

// ---------------------------------------------------------------- castle

const CASTLE_C = [11, 0, 9] as const;
/** Where the keep's flag flies from: the top of its pole. */
const CASTLE_FLAG = at(10.5, 29, 5.5, CASTLE_C[0], CASTLE_C[2]);

/**
 * A castle: a tall keep under battlements with a turret on its roof, two round towers in front
 * under pointed roofs, a curtain wall between them and a gatehouse with its portcullis down and
 * torches burning either side. Walls in the owner's color on a footing of grey stone, roofs a
 * darker shade, gilded finials.
 */
export function castleModel(color: number): THREE.Group {
	return build(
		`castle:${color}`,
		[22, 30, 18],
		(g) => {
			const wall = paint(color, 0.97, 1);
			const light = paint(color, 1.1, 2);
			const roof: Color = (x, y, z) => shade(color, (0.6 + hash3(x, y, z, 3) * 0.08) * (y % 2 ? 0.94 : 1.04));
			const footed =
				(c: Color): Color =>
				(x, y, z) =>
					y <= 1 ? stone(x, y, z) : c(x, y, z);
			// The keep, its corners picked out in pale quoins and a band of light stone round it.
			g.box(6, 0, 1, 15, 15, 9, (x, y, z) => {
				if (y <= 1) return stone(x, y, z);
				const corner = (x === 6 || x === 15) && (z === 1 || z === 9);
				if (corner && y % 2 === 0) return shade(stone(x, y, z), 1.2);
				return y === 9 ? light(x, y, z) : wall(x, y, z);
			});
			for (const x of [8, 13]) g.box(x, 13, 9, x, 14, 9, WINDOW, Mat.Glow);
			for (const x of [6, 15]) g.box(x, 11, 5, x, 12, 5, WINDOW, Mat.Glow);
			// A banner hung from a rod on the keep's front, cream with a bar of the owner's color.
			g.box(9, 15, 10, 12, 15, 10, IRON);
			g.box(10, 11, 10, 11, 14, 10, (x, y) => (y === 11 && x === 11 ? -1 : y === 13 ? shade(color, 1.05) : CREAM));
			// Its parapet overhangs the walls a little, merlons along the edge.
			g.box(5, 16, 0, 16, 16, 10, light);
			battlements(g, 5, 0, 16, 10, 17, light);
			// A turret on the roof under a pyramid roof, the flag's pole on top.
			g.box(8, 17, 3, 13, 20, 7, wall);
			g.box(10, 19, 7, 11, 19, 7, WINDOW, Mat.Glow);
			for (let k = 0; k < 4; k++) g.box(7 + k, 21 + k, 2 + k, 14 - k, 21 + k, 8 - k, roof);
			g.box(10, 25, 5, 11, 25, 5, GOLD);
			g.box(10, 26, 5, 10, 28, 5, IRON);
			// Round towers at the front corners, pointed roofs with an overhang and a gilded tip.
			for (const cx of [3, 18]) {
				const cz = 13;
				for (let y = 0; y <= 12; y++) disc(g, cx, cz, y, 3.2, y === 12 ? light : footed(wall));
				g.box(cx, 7, cz + 3, cx, 8, cz + 3, WINDOW, Mat.Glow);
				for (let y = 13; y <= 20; y++) disc(g, cx, cz, y, 3.9 - (y - 13) * 0.5, roof);
				g.set(cx, 21, cz, GOLD);
			}
			// The curtain wall between the towers, and walls back to the keep.
			g.box(7, 0, 12, 14, 8, 14, footed(wall));
			for (let x = 7; x <= 14; x += 2) {
				g.set(x, 9, 14, light(x, 9, 14));
				g.set(x, 9, 12, light(x, 9, 12));
			}
			for (const [x0, x1, edge] of [
				[1, 5, 1],
				[16, 20, 20]
			]) {
				g.box(x0, 0, 2, x1, 8, 9, footed(wall));
				for (let z = 2; z <= 9; z++) if (z % 2 === 0) g.set(edge, 9, z, light(edge, 9, z));
				for (let x = x0; x <= x1; x++) if (x % 2 === 0) g.set(x, 9, 2, light(x, 9, 2));
			}
			g.box(7, 0, 10, 14, 0, 11, stone);
			// The gatehouse: a stone arch round the gate, the portcullis down, a torch either side.
			g.box(8, 0, 11, 13, 11, 15, footed(wall));
			battlements(g, 8, 11, 13, 15, 12, light);
			g.box(9, 0, 14, 12, 5, 15, (x, y, z) => {
				if (y === 5 && (x === 9 || x === 12)) return stone(x, y, z);
				if (z === 15 && (y === 1 || y === 3 || x === 10 || x === 11)) return IRON;
				return OPENING;
			});
			g.box(8, 0, 15, 8, 6, 15, (x, y, z) => shade(stone(x, y, z), 1.12));
			g.box(13, 0, 15, 13, 6, 15, (x, y, z) => shade(stone(x, y, z), 1.12));
			g.box(9, 6, 15, 12, 6, 15, (x, y, z) => shade(stone(x, y, z), 1.12));
			for (const x of [7, 14]) {
				g.set(x, 5, 15, IRON);
				g.set(x, 6, 15, hex('#ffb347'), Mat.Fire);
			}
		},
		[...CASTLE_C],
		1 / FINE,
		PIECE
	);
}

/** A flag in the owner's color, its hoist at the origin, flying out along +x. A swallowtail cuts its end. */
function flagModel(color: number, swallowtail: boolean) {
	return build(
		`pathFlag:${color}:${swallowtail}`,
		[7, 4, 1],
		(g) => {
			g.box(0, 0, 0, 6, 3, 0, (x, y, z) => {
				if (swallowtail && x === 6 && (y === 1 || y === 2)) return -1;
				if (x === 0) return GOLD;
				return shade(color, (y === 0 || y === 3 ? 0.88 : 1.04) * (0.96 + hash3(x, y, z, 7) * 0.08));
			});
		},
		[0, 4, 0.5],
		1 / FINE,
		PIECE
	);
}

// ---------------------------------------------------------------- guild hall

const GUILD_C = [13, 0, 9] as const;
/** Where the hall's sign hangs from its bracket. */
const GUILD_SIGN = at(2, 12, 11.5, GUILD_C[0], GUILD_C[2]);

/** Arches of the market arcade: their first and last column. */
const STALLS: [number, number][] = [
	[6, 8],
	[11, 14],
	[17, 19]
];

/**
 * A guild hall: a stone market arcade under a jettied upper floor, timber-framed with panels in the
 * owner's color, a tall roof with its gable to the front, striped awnings over the stalls, and the
 * goods the hall trades piled on crates before each one (one of each when it trades none yet).
 */
export function guildHallModel(color: number, goods: Resource | null): THREE.Group {
	return build(
		`guildHall:${color}:${goods ?? 'any'}`,
		[25, 26, 19],
		(g) => {
			const plaster = paint(color, 1.02, 1);
			const roofTile: Color = (x, y, z) => shade(color, (0.6 + hash3(x, y, z, 3) * 0.08) * (z % 2 ? 0.93 : 1.04));
			const timber = any(TIMBER, 2);
			const sand = (x: number, y: number, z: number) => shade(pick(SANDSTONE, hash3(x, y, z, 5)), 0.92 + hash3(x, y, z, 6) * 0.1);
			// The arcade: sandstone, three arches open on the dark of the stalls.
			g.box(5, 0, 3, 22, 6, 11, (x, y, z) => {
				const stall = z === 11 && y <= 4 && STALLS.some(([a, b]) => x >= a && x <= b);
				const corner = y === 4 && STALLS.some(([a, b]) => x === a || x === b);
				if (stall && !corner) return OPENING;
				return y === 6 ? shade(sand(x, y, z), 1.08) : sand(x, y, z);
			});
			g.box(5, 0, 10, 22, 4, 10, (x, y, z) => (STALLS.some(([a, b]) => x >= a && x <= b) ? OPENING : -1));
			// The upper floor overhangs it: posts and beams of dark timber, panels in the owner's color,
			// a lit window in each.
			const posts = new Set([4, 8, 13, 14, 19, 23]);
			g.box(4, 7, 2, 23, 12, 12, (x, y, z) => {
				const face = z === 2 || z === 12;
				const side = x === 4 || x === 23;
				if (y === 7 || y === 12) return timber(x, y, z);
				if (face && posts.has(x)) return timber(x, y, z);
				if (side && (z === 2 || z === 7 || z === 12)) return timber(x, y, z);
				const pane = (y === 9 || y === 10) && ((face && [6, 10, 11, 16, 17, 21].includes(x)) || (side && (z === 4 || z === 10)));
				return pane ? WINDOW : plaster(x, y, z);
			});
			for (const z of [2, 12])
				for (const x of [6, 10, 11, 16, 17, 21]) for (const y of [9, 10]) g.set(x, y, z, WINDOW, Mat.Glow);
			for (const x of [4, 23]) for (const z of [4, 10]) for (const y of [9, 10]) g.set(x, y, z, WINDOW, Mat.Glow);
			// A tall roof, its gable to the front: tiles on the slopes and the verges, the gable ends
			// timbered and plastered under them, a round window lit in the front one.
			for (let k = 0; k <= 10; k++) {
				const x0 = 3 + k;
				const x1 = 24 - k;
				if (x0 > x1) break;
				const y = 13 + k;
				for (let z = 1; z <= 13; z++)
					for (let x = x0; x <= x1; x++) {
						const verge = x <= x0 + 1 || x >= x1 - 1;
						if (verge) g.set(x, y, z, roofTile(x, y, z));
						else if (z === 2 || z === 12) {
							const mid = x === 13 || x === 14;
							g.set(x, y, z, y === 17 || mid ? timber(x, y, z) : plaster(x, y, z));
						} else if (z > 2 && z < 12) g.set(x, y, z, roofTile(x, y, z));
					}
			}
			for (const x of [12, 15]) g.box(x, 15, 12, x, 16, 12, WINDOW, Mat.Glow);
			g.box(13, 24, 12, 14, 24, 12, GOLD);
			// A chimney through the roof.
			g.box(20, 13, 5, 21, 21, 6, stone);
			// Striped awnings over the stalls, in the owner's color and cream.
			for (const [a, b] of STALLS) {
				for (let x = a - 1; x <= b + 1; x++) {
					const c = x % 2 ? CREAM : shade(color, 1.06);
					g.set(x, 6, 12, c);
					g.set(x, 5, 13, c);
					if ((x - a) % 2 === 0) g.set(x, 4, 13, shade(c, 0.92));
				}
				// The goods on a crate in front of the stall.
				goodsPile(g, Math.floor((a + b) / 2) - 1, 15, goods ?? (['wheat', 'ore', 'sheep'] as const)[STALLS.findIndex((s) => s[0] === a)]);
			}
			// The sign's iron bracket out of the side wall.
			g.box(1, 12, 11, 3, 12, 11, IRON);
		},
		[...GUILD_C],
		1 / FINE,
		PIECE
	);
}

/**
 * Goods for sale on a crate whose corner is (x, 0, z), about three cells each way, in the colors
 * of their cards so they read from across the table: golden sheaves, grey ore, logs, red bricks,
 * white wool.
 */
function goodsPile(g: VoxelGrid, x: number, z: number, goods: Resource) {
	g.box(x, 0, z, x + 2, 1, z + 1, (cx, cy, cz) => shade(pick(PLANK, hash3(cx, cy, cz, 8)), cy === 1 ? 1.08 : 0.9));
	switch (goods) {
		case 'wheat':
			// Sheaves standing on the crate, tied at the waist, and one leaning on it.
			for (const [dx, dz] of [
				[0, 0],
				[2, 0],
				[1, 1]
			])
				g.box(x + dx, 2, z + dz, x + dx, 4, z + dz, (cx, cy, cz) => (cy === 2 ? STALK : pick(GRAIN, hash3(cx, cy, cz, 2))));
			g.box(x + 3, 0, z + 1, x + 3, 3, z + 1, (cx, cy, cz) => (cy <= 1 ? STALK : pick(GRAIN, hash3(cx, cy, cz, 3))));
			break;
		case 'ore':
			// A heap of ore, glinting.
			g.box(x, 2, z, x + 2, 2, z + 1, (cx, cy, cz) => (hash3(cx, cy, cz, 4) > 0.72 ? pick(GLINT, hash3(cx, cy, cz, 5)) : pick(ORE, hash3(cx, cy, cz, 6))));
			g.box(x, 3, z, x + 1, 3, z + 1, (cx, cy, cz) => (cx === x + 1 && cz === z + 1 ? -1 : hash3(cx, cy, cz, 4) > 0.6 ? pick(GLINT, hash3(cx, cy, cz, 5)) : pick(ORE, hash3(cx, cy, cz, 6))));
			g.set(x, 4, z, pick(ORE, hash3(x, 4, z, 6)));
			break;
		case 'wood':
			// Logs stacked lengthwise, their cut ends pale.
			g.box(x, 2, z, x + 2, 2, z + 1, (cx, cy, cz) => (cx === x || cx === x + 2 ? RING : pick(BARK, hash3(cx, cy, cz, 1))));
			g.box(x, 3, z, x + 2, 3, z, (cx, cy, cz) => (cx === x || cx === x + 2 ? RING : pick(BARK, hash3(cx, cy, cz, 2))));
			g.box(x, 3, z + 1, x + 2, 3, z + 1, (cx, cy, cz) => (cx === x || cx === x + 2 ? shade(RING, 0.9) : pick(BARK, hash3(cx, cy, cz, 7))));
			g.box(x, 4, z, x + 2, 4, z, (cx, cy, cz) => (cx === x || cx === x + 2 ? RING : pick(BARK, hash3(cx, cy, cz, 9))));
			break;
		case 'brick':
			// Bricks stacked in courses.
			g.box(x, 2, z, x + 2, 4, z + 1, (cx, cy, cz) =>
				cy === 4 && cz === z + 1 ? -1 : (cx + cy * 2 + cz) % 4 === 0 ? MORTAR : pick(CLAY, hash3(cx, cy, cz, 3))
			);
			break;
		case 'sheep':
			// Bales of wool, heaped.
			g.box(x, 2, z, x + 2, 3, z + 1, (cx, cy, cz) => (cy === 3 && cx === x + 2 && cz === z ? -1 : pick(WOOL, hash3(cx, cy, cz, 4))));
			g.box(x, 4, z, x + 1, 4, z + 1, (cx, cy, cz) => (cx === x + 1 && cz === z ? -1 : pick(WOOL, hash3(cx, cy, cz, 5))));
			break;
	}
}

/** The hall's sign: a board in the owner's color in a gilded frame, on two chains; it hangs from the origin. */
function signModel(color: number) {
	return build(
		`guildSign:${color}`,
		[4, 5, 1],
		(g) => {
			g.set(0, 4, 0, IRON);
			g.set(3, 4, 0, IRON);
			g.box(0, 0, 0, 3, 3, 0, (x, y) => (x === 0 || x === 3 || y === 0 || y === 3 ? GOLD : shade(color, 1.05)));
		},
		[2, 5, 0.5],
		1 / FINE,
		PIECE
	);
}

// ---------------------------------------------------------------- fortress

const FORT_C = [11, 0, 9] as const;
const FORT_FLAG = at(4.5, 19, 4.5, FORT_C[0], FORT_C[2]);
const QUINTAIN = at(13.5, 7, 11.5, FORT_C[0], FORT_C[2]);

/**
 * A fortress: a squat tower under a machicolated parapet, barracks along the back, and low
 * crenellated walls with a turret at each front corner round a yard of beaten earth, where a
 * quintain stands ready and spears wait on a rack. Its gates are shut and barred.
 */
export function fortressModel(color: number): THREE.Group {
	return build(
		`fortress:${color}`,
		[22, 20, 18],
		(g) => {
			const wall = paint(color, 0.86, 1);
			const light = paint(color, 1.0, 2);
			const roof: Color = (x, y, z) => shade(color, (0.58 + hash3(x, y, z, 3) * 0.08) * (x % 2 ? 0.94 : 1.04));
			const footed =
				(c: Color, h = 1): Color =>
				(x, y, z) =>
					y <= h ? stone(x, y, z) : c(x, y, z);
			// The yard, beaten flat.
			g.box(2, 0, 7, 19, 0, 15, any(EARTH, 1));
			// A straw butt for the archers against the barracks, its rings painted.
			for (const x of [14, 18]) g.box(x, 0, 8, x, 2, 8, any(TIMBER, 3));
			for (let y = 1; y <= 5; y++)
				for (let x = 14; x <= 18; x++) {
					const d = Math.hypot(x - 16, y - 3);
					if (d <= 2.3) g.set(x, y, 7, d < 0.8 ? GOLD : d < 1.7 ? hex('#d8352a') : pick(HAY, hash3(x, y, 7, 2)));
				}
			// The tower: slits for archers, a parapet out over the walls, merlons, a flag.
			g.box(1, 0, 1, 8, 11, 8, footed(wall, 2));
			for (const [x, z] of [
				[4, 8],
				[8, 4]
			]) {
				g.box(x, 5, z, x, 6, z, OPENING);
				g.box(x, 9, z, x, 10, z, OPENING);
			}
			g.box(0, 12, 0, 9, 12, 9, light);
			for (let x = 0; x <= 9; x++)
				for (let z = 0; z <= 9; z++) if ((x === 0 || x === 9 || z === 0 || z === 9) && (x + z) % 3 !== 1) g.set(x, 11, z, shade(stone(x, 11, z), 0.7));
			battlements(g, 0, 0, 9, 9, 13, light);
			g.box(4, 13, 4, 4, 18, 4, IRON);
			// Barracks along the back, a door to the yard, a chimney.
			g.box(10, 0, 1, 20, 5, 6, footed(wall, 0));
			g.box(15, 0, 6, 16, 2, 6, DOOR);
			for (const x of [12, 18]) g.set(x, 3, 6, WINDOW, Mat.Glow);
			for (let k = 0; k < 4; k++) g.box(9, 6 + k, k, 21, 6 + k, 7 - k, roof);
			g.box(19, 6, 2, 19, 11, 2, stone);
			// Low walls round the yard, so it shows over them, and a turret at each front corner.
			g.box(1, 0, 15, 20, 5, 16, footed(wall));
			g.box(1, 0, 9, 2, 5, 16, footed(wall));
			g.box(19, 0, 7, 20, 5, 16, footed(wall));
			for (let x = 1; x <= 20; x += 2) g.set(x, 6, 16, light(x, 6, 16));
			for (let z = 9; z <= 16; z += 2) g.set(1, 6, z, light(1, 6, z));
			for (let z = 7; z <= 16; z += 2) g.set(20, 6, z, light(20, 6, z));
			for (const cx of [2, 19]) {
				for (let y = 0; y <= 8; y++) disc(g, cx, 15, y, 2.4, footed(wall));
				roundBattlements(g, cx, 15, 9, 2.4, light);
			}
			// The gate, shut and barred with iron.
			g.box(8, 0, 15, 12, 3, 16, (x, y) => (y === 1 || y === 3 ? IRON : x === 10 ? shade(DOOR, 0.8) : DOOR));
			g.box(8, 4, 16, 12, 4, 16, (x, y, z) => shade(stone(x, y, z), 1.12));
			g.box(8, 5, 15, 12, 5, 16, (x, y, z) => (x % 2 ? -1 : light(x, y, z)));
			// The quintain's post, and a rack of spears with a shield against it.
			g.box(13, 0, 11, 13, 6, 11, any(TIMBER, 4));
			for (const x of [4, 7]) g.box(x, 0, 13, x, 4, 13, any(TIMBER, 5));
			g.box(4, 4, 13, 7, 4, 13, any(TIMBER, 6));
			for (const x of [5, 6]) {
				g.box(x, 0, 14, x, 5, 14, any(TIMBER, 7));
				g.set(x, 6, 14, pick(STEEL, x));
			}
			g.box(8, 0, 13, 9, 2, 13, (x, y) => (x === 8 && y === 1 ? GOLD : shade(color, 1.08)));
		},
		[...FORT_C],
		1 / FINE,
		PIECE
	);
}

/** The quintain's arm: a shield in the owner's color at one end, a sandbag at the other, turning on the origin. */
function quintainModel(color: number) {
	return build(
		`quintain:${color}`,
		[7, 3, 1],
		(g) => {
			g.box(0, 1, 0, 6, 1, 0, any(TIMBER, 8));
			g.box(0, 0, 0, 1, 2, 0, (x, y) => (x === 1 && y === 1 ? GOLD : shade(color, 1.05)));
			g.box(6, 0, 0, 6, 1, 0, any(BURLAP, 9));
		},
		[3.5, 1, 0.5],
		1 / FINE,
		PIECE
	);
}

// ---------------------------------------------------------------- the pieces

/**
 * A city that took a path, ready to place like a city (its center on the corner, facing +z).
 * Clone-safe: its moving parts are found by name.
 */
export function pathObject(path: CityPath, color: number, goods: Resource | null = null): THREE.Group {
	const root = new THREE.Group();
	const part = (name: string, model: THREE.Group, pos: THREE.Vector3) => {
		const pivot = new THREE.Group();
		pivot.name = name;
		pivot.position.copy(pos);
		pivot.add(cloneModel(model));
		root.add(pivot);
	};
	if (path === 'castle') {
		root.add(cloneModel(castleModel(color)));
		part('flag', flagModel(color, true), CASTLE_FLAG);
	} else if (path === 'guildHall') {
		root.add(cloneModel(guildHallModel(color, goods)));
		part('sign', signModel(color), GUILD_SIGN);
	} else {
		root.add(cloneModel(fortressModel(color)));
		part('flag', flagModel(color, false), FORT_FLAG);
		part('quintain', quintainModel(color), QUINTAIN);
	}
	return root;
}

/**
 * Keep a city path's moving parts going: flags stream out and swing with the wind, the guild
 * hall's sign rocks on its chains, the fortress's quintain spins when struck and slows again.
 * `t` is the scene clock in seconds.
 */
export function animatePath(obj: THREE.Object3D, t: number) {
	const time = t + (obj.userData.phase ??= Math.random() * 100);
	for (const p of obj.children) {
		if (p.name === 'flag') {
			p.rotation.y = -0.5 + Math.sin(time * 0.7) * 0.35 + Math.sin(time * 2.3) * 0.08;
			p.scale.x = 0.94 + Math.sin(time * 4.1) * 0.06;
		} else if (p.name === 'sign') {
			p.rotation.x = Math.sin(time * 1.3) * 0.22 + Math.sin(time * 3.1) * 0.04;
		} else if (p.name === 'quintain') {
			// Struck every few seconds: a quick turn that runs down.
			const k = (time % 5) / 5;
			p.rotation.y = (time / 5 - k) * Math.PI * 2 + (1 - (1 - k) ** 3) * Math.PI * 2;
		}
	}
}

/**
 * How a city path sits on the table, in piece voxels: the ring round it when its owner is
 * highlighted, how high the beam of light starts over it, and where its chimney smokes (none for
 * a castle).
 */
export const PATH_LOOK: Record<CityPath, { ring: number; beam: number; chimney: THREE.Vector3 | null }> = {
	castle: { ring: 9.6, beam: 15.5, chimney: null },
	guildHall: { ring: 10, beam: 13, chimney: at(21, 22, 6, GUILD_C[0], GUILD_C[2]) },
	fortress: { ring: 9.8, beam: 10.5, chimney: at(19.5, 12, 2.5, FORT_C[0], FORT_C[2]) }
};
