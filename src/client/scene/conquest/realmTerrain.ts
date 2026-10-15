import * as THREE from 'three';
import { type RealmMap, type RealmTerrain, realmRaster } from '../../../shared/conquest/realm';
import { C, type Raise, bush, cactus, distanceField, hayBale, pebble, roundTree } from '../board/terrain';
import { SEA_Y, VOXEL } from '../layout';
import { Mat, VoxelGrid, fbm, hash3, hex, mix, noise2, pick, shade } from '../voxel/grid';
import { meshesFor } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';
import { boulder, cottage, dryBush, hoodoo, iceRock, palm, pine, ruin } from './realmFeatures';

/**
 * Conquest's Realm in voxels, built the way Settlement's island is (the same palette and little
 * trees) but as a map of territories: each one keeps its own terrain, fading flat towards its
 * borders so the cream border lines and the owner's band inside them stay clear, with a cobbled
 * square where its armies stand. The sea fills a wooden map tray.
 *
 * Built at any detail S (voxels per VOXEL, the player's pick): grid voxels are VOXEL / S across,
 * world = voxel * VOXEL / S, and the sizes below are in VOXEL units, scaled by S. The map's
 * columns line up with `realmRaster(map, VOXEL / S)`, so the board shows exactly the territories
 * the rules know.
 */

/** Land columns fill VOXEL layers 0..G-1, so the flat land's top face is at G. */
const G = 8;
/** Top layer of the flat land. */
const GT = G - 1;
/** Water columns fill layers 0..SEA_TOP-1. */
const SEA_TOP = Math.round(SEA_Y / VOXEL);
/** The wooden frame round the map. */
const FRAME = 9;
const MAX_Y = 44;
/** The cobbled square each territory's armies stand on. */
const SQUARE_R = 5.4;
/** Rows of the grid built and meshed at a time (times S), so a Fine realm needs little memory. */
const SLAB = 64;
/** Rows round a slab built too: past the furthest a tree or a cottage reaches from its spot. */
const SLAB_MARGIN = 8;
/** Map columns between feature spots (each spot gets at most one tree, rock or cottage). */
const STEP = 4;

/** World y of the flat land's surface. */
export const REALM_LAND_TOP = G * VOXEL;

const P = {
	snow: [hex('#f5f8fb'), hex('#eaf0f6'), hex('#ffffff'), hex('#e3ebf3')],
	snowShade: hex('#c9daea'),
	taigaFloor: [hex('#2f5a2f'), hex('#386636'), hex('#2a522b'), hex('#41703a')],
	alpine: [hex('#7e9b52'), hex('#87a35a'), hex('#73904a')],
	hillGrass: [hex('#93c64a'), hex('#87bb42'), hex('#9fd052'), hex('#7fb33d')],
	jungleFloor: [hex('#3f9a34'), hex('#47a83a'), hex('#37892e'), hex('#52b443')],
	crops: [hex('#6fb83c'), hex('#5ea832'), hex('#7cc446')],
	cabbage: [hex('#9fd36a'), hex('#8cc85a')],
	stone: [hex('#ddd3c0'), hex('#d2c7b2'), hex('#e6ddcb'), hex('#cbbfa9')],
	stoneRim: [hex('#b5a68c'), hex('#a8997f')],
	border: [hex('#f3e2b8'), hex('#eedaa9'), hex('#f7e8c4'), hex('#e9d3a0')],
	regionBorder: [hex('#e2c48c'), hex('#dbbb80'), hex('#e8cc96')],
	wood: [hex('#7a4a26'), hex('#70431f'), hex('#84522b'), hex('#6a3f1d')],
	woodDark: [hex('#4e2d14'), hex('#45280f')],
	brass: [hex('#e0b24a'), hex('#d4a23c'), hex('#ecc463')],
	brassDark: hex('#a77a24'),
	inlay: [hex('#f1dfae'), hex('#ead499')],
	waterShallow: hex('#63abc4'),
	waterMid: hex('#4d90bd'),
	waterDeep: hex('#4579a8'),
	waterDeeper: hex('#3c6c9c'),
	foam: hex('#e6f3f8')
};

export interface RealmLaneEnds {
	/** Where the lane leaves each shore (world x, z): from the first territory, and into the second. */
	a: { x: number; z: number };
	b: { x: number; z: number };
}

export interface RealmBuild {
	group: THREE.Group;
	/** Per territory: the middle of its cobbled square, where its armies stand (world; the same at every detail). */
	anchors: THREE.Vector3[];
	/** Per territory: its land columns' bounds and middle (world), for labels and the camera. */
	extents: { minX: number; maxX: number; minZ: number; maxZ: number; cx: number; cz: number }[];
	/** Per lane of the map (in order): where it leaves the two shores. */
	lanes: RealmLaneEnds[];
	/** The map's columns for the realm shader: r = territory + 1, g = grid voxels to the nearest edge. */
	mapTexture: THREE.DataTexture;
	/** (x0, z0, nx, nz): the map's first column in grid voxels and its size, for `uRealmGrid`. */
	gridInfo: THREE.Vector4;
	/** Grid voxels per VOXEL, for `uRealmScale`. */
	detail: number;
	/** The board's outer half extents (world), frame included. */
	halfX: number;
	halfZ: number;
	/** The territory at world (x, z), or -1. */
	territoryAt(x: number, z: number): number;
	/** World y of the top of whatever stands at (x, z). */
	surfaceY(x: number, z: number): number;
	/** World y of the ground itself (under trees). */
	groundY(x: number, z: number): number;
	raycast(ray: THREE.Ray): THREE.Vector3 | null;
	dispose(): void;
}

/** A territory's map columns: on its edges, and how far each lies from them (in grid voxels). */
interface MapFields {
	/** 1: on a border between territories; 2: between regions too. */
	edge: Uint8Array;
	/** Land: to the nearest border or shore. */
	dEdge: Float32Array;
	/** Water: to the nearest land. */
	dLand: Float32Array;
	/** Land: to the nearest water. */
	dWater: Float32Array;
}

/** Edges `reach` columns wide on either side of each border, so they are a VOXEL wide at any detail. */
function mapFields(map: RealmMap, ids: Int16Array, W: number, D: number, reach: number): MapFields {
	const N = W * D;
	const land = new Uint8Array(N);
	const water = new Uint8Array(N);
	for (let i = 0; i < N; i++) {
		land[i] = ids[i] >= 0 ? 1 : 0;
		water[i] = 1 - land[i];
	}
	const edge = new Uint8Array(N);
	for (let iz = 0; iz < D; iz++)
		for (let ix = 0; ix < W; ix++) {
			const i = ix + iz * W;
			const t = ids[i];
			if (t < 0) continue;
			for (const [dx, dz] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1]
			])
				for (let k = 1; k <= reach; k++) {
					const x = ix + dx * k;
					const z = iz + dz * k;
					if (x < 0 || z < 0 || x >= W || z >= D) continue;
					const u = ids[x + z * W];
					if (u < 0 || u === t) continue;
					edge[i] = Math.max(edge[i], map.territories[u].region === map.territories[t].region ? 1 : 2);
				}
		}
	const edgeSeeds = new Uint8Array(N);
	for (let i = 0; i < N; i++) edgeSeeds[i] = !land[i] || edge[i] ? 1 : 0;
	return { edge, dEdge: distanceField(edgeSeeds, W, D), dLand: distanceField(land, W, D), dWater: distanceField(water, W, D) };
}

const squaresMade = new WeakMap<RealmMap, { x: number; z: number }[]>();

/**
 * Each territory's square (world x, z): as far from its edges as it can be, near where it was
 * drawn. Worked out on VOXEL columns whatever the detail, so armies stand in the same spots and a
 * board rebuilt at another detail keeps its tokens, names and lanes where they are.
 */
function realmSquares(map: RealmMap): { x: number; z: number }[] {
	const made = squaresMade.get(map);
	if (made) return made;
	const raster = realmRaster(map, VOXEL);
	const { nx: W, nz: D, ids } = raster;
	const bx = Math.round(raster.x0 / VOXEL);
	const bz = Math.round(raster.z0 / VOXEL);
	const { dEdge } = mapFields(map, ids, W, D, 1);
	const T = map.territories.length;
	const best = new Float32Array(T).fill(-Infinity);
	const at = map.territories.map(() => ({ x: 0, z: 0 }));
	for (let iz = 0; iz < D; iz++)
		for (let ix = 0; ix < W; ix++) {
			const i = ix + iz * W;
			const t = ids[i];
			if (t < 0) continue;
			const [sx, sz] = map.territories[t].blobs[0];
			const seat = Math.hypot(ix - (sx / VOXEL - bx), iz - (sz / VOXEL - bz));
			const score = Math.min(dEdge[i], 14) - seat * 0.06;
			if (score > best[t]) {
				best[t] = score;
				at[t] = { x: ix, z: iz };
			}
		}
	const out = at.map(({ x, z }) => ({ x: (x + bx + 0.5) * VOXEL, z: (z + bz + 0.5) * VOXEL }));
	squaresMade.set(map, out);
	return out;
}

interface FeatureSpot {
	/** Grid voxel of its foot. */
	x: number;
	z: number;
	t: number;
	r: number;
	s: number;
	/** VOXELs to its territory's nearest edge. */
	deep: number;
	/** Whether a taiga pine there wears snow. */
	snowy: boolean;
}

export function buildRealm(map: RealmMap, S = 1): RealmBuild {
	const vox = VOXEL / S;
	const raster = realmRaster(map, vox);
	const { nx: W, nz: D, ids } = raster;
	const seed = map.seed;
	/** Grid voxel of map column 0. */
	const bx = Math.round(raster.x0 / vox);
	const bz = Math.round(raster.z0 / vox);
	const F = FRAME * S;
	const GW = W + F * 2;
	const GD = D + F * 2;
	const ox = bx - F;
	const oz = bz - F;
	/** The top grid voxel of VOXEL layer y. */
	const layer = (y: number) => (y + 1) * S - 1;

	// ---- the map's columns: edges, and how far each lies from them (in VOXELs)
	const fields = mapFields(map, ids, W, D, S);
	const { edge } = fields;
	const inVoxels = (f: Float32Array) => (S === 1 ? f : f.map((d) => d / S));
	const dEdge = inVoxels(fields.dEdge);
	const dLand = inVoxels(fields.dLand);
	const dWater = inVoxels(fields.dWater);

	const squares = realmSquares(map);
	/** VOXELs from map column (ix, iz) to territory t's square. */
	const squareDist = (ix: number, iz: number, t: number) => Math.hypot((ix + bx + 0.5) * vox - squares[t].x, (iz + bz + 0.5) * vox - squares[t].z) / VOXEL;

	const extentsV = map.territories.map(() => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, sx: 0, sz: 0, n: 0 }));
	for (let iz = 0; iz < D; iz++)
		for (let ix = 0; ix < W; ix++) {
			const t = ids[ix + iz * W];
			if (t < 0) continue;
			const e = extentsV[t];
			e.minX = Math.min(e.minX, ix);
			e.maxX = Math.max(e.maxX, ix);
			e.minZ = Math.min(e.minZ, iz);
			e.maxZ = Math.max(e.maxZ, iz);
			e.sx += ix;
			e.sz += iz;
			e.n++;
		}

	const peaks = mountainPeaks(map, ids, W, D, dEdge, squareDist, bx, bz, seed, S);

	// ---- columns: the map's, then the frame round it
	/** Per grid column: its top voxel, with whatever stands on it, and the ground's alone. */
	const tops = new Int16Array(GW * GD).fill(-1);
	const ground = new Int16Array(GW * GD).fill(-1);
	const gi = (x: number, z: number) => x - ox + (z - oz) * GW;
	const raise: Raise = (x, z, y) => {
		const gx = Math.floor(x) - ox;
		const gz = Math.floor(z) - oz;
		if (gx < 0 || gz < 0 || gx >= GW || gz >= GD) return;
		const i = gx + gz * GW;
		if (y > tops[i]) tops[i] = y;
	};

	const mapColumn = (grid: VoxelGrid, ix: number, iz: number): number => {
		const i = ix + iz * W;
		const x = ix + bx;
		const z = iz + bz;
		const r = hash3(x, 0, z, seed);
		const t = ids[i];
		if (t < 0) return seaColumn(grid, x, z, dLand[i], r, seed, S);
		if (edge[i]) {
			const c = pick(edge[i] === 2 ? P.regionBorder : P.border, r);
			const top = layer(GT - 1);
			grid.box(x, 0, z, x, top, z, (_, y) => (y > top - S ? c : y > top - 3 * S ? shade(c, 0.86) : pick(C.dirt, r)));
			return top;
		}
		const sq = squareDist(ix, iz, t);
		if (sq < SQUARE_R) {
			// Cobbles, a ring of darker stones round them.
			const c = sq > SQUARE_R - 1.1 ? pick(P.stoneRim, r) : pick(P.stone, hash3(Math.floor(x / 2), 1, Math.floor(z / 2), seed + t));
			const top = layer(GT);
			grid.box(x, 0, z, x, top, z, (_, y) => (y > top - S ? c : y > top - 3 * S ? shade(c, 0.8) : pick(C.dirt, r)));
			return top;
		}
		// Tall ground eases off towards the edges and the square, so neither is ever hidden.
		const fade = smooth(2.5, 9, dEdge[i]) * smooth(SQUARE_R + 1.5, SQUARE_R + 9, sq);
		return column(grid, map.territories[t].terrain, x, z, r, seed + t * 101, fade, dWater[i], peaks[t], S);
	};
	const writeColumn = (grid: VoxelGrid, x: number, z: number) => {
		const ix = x - bx;
		const iz = z - bz;
		const top = ix >= 0 && iz >= 0 && ix < W && iz < D ? mapColumn(grid, ix, iz) : frameColumn(grid, x, z, bx, bz, W, D, seed, S);
		const i = gi(x, z);
		ground[i] = top;
		if (top > tops[i]) tops[i] = top;
	};

	// ---- features: trees, crops, rocks, cottages; never on the edges, the band or the square
	const spots: FeatureSpot[] = [];
	for (let cz = 0; cz * S < D; cz += STEP)
		for (let cx = 0; cx * S < W; cx += STEP) {
			const ix = Math.floor((cx + hash3(cx, 5, cz, seed) * STEP) * S);
			const iz = Math.floor((cz + hash3(cx, 6, cz, seed) * STEP) * S);
			if (ix >= W || iz >= D) continue;
			const i = ix + iz * W;
			const t = ids[i];
			if (t < 0 || dEdge[i] < 6) continue;
			if (squareDist(ix, iz, t) < SQUARE_R + 3.5) continue;
			spots.push({ x: ix + bx, z: iz + bz, t, r: hash3(cx, 7, cz, seed), s: seed + cx * 31 + cz * 17, deep: dEdge[i], snowy: hash3(Math.floor((ix + bx) / S), 2, Math.floor((iz + bz) / S), seed) < 0.55 });
		}
	const plant = (grid: VoxelGrid, f: FeatureSpot) => {
		const { x, z, r, s, deep } = f;
		const y = ground[gi(x, z)] + 1;
		/** The foot, in VOXEL layers. */
		const at = y / S;
		if (at <= GT) return;
		switch (map.territories[f.t].terrain) {
			case 'forest':
				if (r < 0.72) pine(grid, x, y, z, s, raise, false, S);
				else if (r < 0.9) roundTree(grid, x, y, z, s, raise, S);
				else if (r < 0.96) bush(grid, x, y, z, s, raise, S);
				break;
			case 'taiga':
				if (r < 0.62) pine(grid, x, y, z, s, raise, f.snowy, S);
				else if (r < 0.7) pebble(grid, x, y, z, s, raise, S);
				break;
			case 'snow':
				if (r < 0.1) pine(grid, x, y, z, s, raise, true, S);
				else if (r < 0.2) iceRock(grid, x, y, z, s, raise, S);
				break;
			case 'jungle':
				if (r < 0.42) palm(grid, x, y, z, s, raise, S);
				else if (r < 0.62) bush(grid, x, y, z, s, raise, S);
				else if (r < 0.74) roundTree(grid, x, y, z, s, raise, S);
				break;
			case 'meadow':
				if (r < 0.1) roundTree(grid, x, y, z, s, raise, S);
				else if (r < 0.22) bush(grid, x, y, z, s, raise, S);
				else if (r < 0.25 && deep > 9) cottage(grid, x, y, z, s, raise, S);
				break;
			case 'fields':
				if (r < 0.035 && deep > 9) cottage(grid, x, y, z, s, raise, S);
				else if (r < 0.07) hayBale(grid, x, (GT + 1) * S, z, raise, S);
				else if (r < 0.1) roundTree(grid, x, y, z, s, raise, S);
				break;
			case 'hills':
				if (r < 0.1) roundTree(grid, x, y, z, s, raise, S);
				else if (r < 0.2) bush(grid, x, y, z, s, raise, S);
				else if (r < 0.26) boulder(grid, x, y, z, s, raise, S);
				break;
			case 'mountains':
				if (r < 0.14 && at < GT + 5) pine(grid, x, y, z, s, raise, at > GT + 2, S);
				else if (r < 0.22) boulder(grid, x, y, z, s, raise, S);
				break;
			case 'desert':
				if (r < 0.08) cactus(grid, x, y, z, s, raise, S);
				else if (r < 0.15) pebble(grid, x, y, z, s, raise, S);
				else if (r < 0.18 && deep > 8) ruin(grid, x, y, z, s, raise, S);
				else if (r < 0.22) dryBush(grid, x, y, z, s, raise, S);
				break;
			case 'badlands':
				if (r < 0.06) cactus(grid, x, y, z, s, raise, S);
				else if (r < 0.14) boulder(grid, x, y, z, s, raise, S, true);
				else if (r < 0.22 && at === GT + 1) hoodoo(grid, x, y, z, s, raise, S);
				else if (r < 0.26) dryBush(grid, x, y, z, s, raise, S);
				break;
		}
	};

	// ---- the grid a slab of rows at a time: its columns and the features near it, meshed
	const group = new THREE.Group();
	group.name = 'realm';
	const slab = SLAB * S;
	const margin = SLAB_MARGIN * S;
	for (let z0 = 0; z0 < GD; z0 += slab) {
		const z1 = Math.min(GD, z0 + slab);
		const lo = Math.max(0, z0 - margin);
		const hi = Math.min(GD, z1 + margin);
		const grid = new VoxelGrid(GW, MAX_Y * S, hi - lo, ox, 0, oz + lo);
		for (let gz = lo; gz < hi; gz++) for (let gx = 0; gx < GW; gx++) writeColumn(grid, gx + ox, gz + oz);
		for (const f of spots) if (f.z - oz >= lo && f.z - oz < hi) plant(grid, f);
		const geos = meshGrid(grid, { jitter: 0.06, skipFloor: true, rows: [z0 - lo, z1 - lo] });
		const part = meshesFor(geos, vox, {
			[Mat.Solid]: { realm: true, lamps: true },
			[Mat.Sway]: { swayBase: G * S, swayScale: S, roughness: 0.7, realm: true, lamps: true },
			[Mat.Water]: { roughness: 0.22, bevel: 0.35, lamps: true }
		});
		group.add(...part.children);
	}

	// ---- the realm shader's map of columns
	const N = W * D;
	const tex = new Uint8Array(N * 4);
	for (let i = 0; i < N; i++) {
		if (ids[i] < 0) continue;
		tex[i * 4] = ids[i] + 1;
		tex[i * 4 + 1] = edge[i] ? 0 : Math.max(1, Math.min(255, Math.round(fields.dEdge[i])));
		tex[i * 4 + 3] = 255;
	}
	const mapTexture = new THREE.DataTexture(tex, W, D, THREE.RGBAFormat, THREE.UnsignedByteType);
	mapTexture.magFilter = THREE.NearestFilter;
	mapTexture.minFilter = THREE.NearestFilter;
	mapTexture.generateMipmaps = false;
	mapTexture.needsUpdate = true;

	// ---- what the board knows about places
	const anchors = squares.map(({ x, z }) => new THREE.Vector3(x, G * VOXEL, z));
	const extents = extentsV.map((e) => ({
		minX: (e.minX + bx) * vox,
		maxX: (e.maxX + bx + 1) * vox,
		minZ: (e.minZ + bz) * vox,
		maxZ: (e.maxZ + bz + 1) * vox,
		cx: (e.sx / Math.max(1, e.n) + bx + 0.5) * vox,
		cz: (e.sz / Math.max(1, e.n) + bz + 0.5) * vox
	}));
	const index = new Map(map.territories.map((t, k) => [t.id, k]));
	/** The map column (ix + iz * W) at world (x, z), or -1 off the map. */
	const mapIndex = (wx: number, wz: number) => {
		const ix = Math.floor(wx / vox) - bx;
		const iz = Math.floor(wz / vox) - bz;
		return ix < 0 || iz < 0 || ix >= W || iz >= D ? -1 : ix + iz * W;
	};
	const idAt = (wx: number, wz: number) => {
		const i = mapIndex(wx, wz);
		return i < 0 ? -1 : ids[i];
	};
	const lanes = map.lanes.map(([a, b]) => laneEnds(index.get(a)!, index.get(b)!, anchors, idAt));
	/** The column at world (x, z) in `cols`, or -1 off the grid. */
	const colAt = (cols: Int16Array, wx: number, wz: number) => {
		const gx = Math.floor(wx / vox) - ox;
		const gz = Math.floor(wz / vox) - oz;
		return gx < 0 || gz < 0 || gx >= GW || gz >= GD ? -1 : cols[gx + gz * GW];
	};

	let peak = 0;
	for (const t of tops) peak = Math.max(peak, t + 1);

	return {
		group,
		anchors,
		extents,
		lanes,
		mapTexture,
		gridInfo: new THREE.Vector4(bx, bz, W, D),
		detail: S,
		halfX: (GW / 2) * vox,
		halfZ: (GD / 2) * vox,
		territoryAt: idAt,
		surfaceY: (x, z) => {
			const t = colAt(tops, x, z);
			return t >= 0 ? (t + 1) * vox : 0;
		},
		groundY: (x, z) => {
			const t = mapIndex(x, z) >= 0 ? colAt(ground, x, z) : -1;
			return t >= 0 ? (t + 1) * vox : 0;
		},
		raycast: (ray) => columnRaycast(ray, tops, GW, GD, ox, oz, peak, vox),
		dispose: () => {
			group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
			mapTexture.dispose();
		}
	};
}

function smooth(a: number, b: number, v: number) {
	const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
	return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- sea and frame

/**
 * The sea: sand where it meets the land, turquoise shallows with foam, deepening blue out to the
 * frame. `d` is VOXELs to the nearest land; returns the column's top voxel.
 */
function seaColumn(grid: VoxelGrid, x: number, z: number, d: number, r: number, seed: number, S: number): number {
	const X = x / S;
	const Z = z / S;
	const beach = 1.5 + (noise2(X * 0.11, Z * 0.11, seed + 5) - 0.5) * 1.4;
	if (d < beach) {
		const layers = d < beach - 0.9 ? G - 2 : G - 3;
		const c = layers === G - 2 ? pick(C.sand, r) : pick(C.wetSand, r);
		const top = layers * S - 1;
		grid.box(x, 0, z, x, top, z, (_, y) => (y >= (layers - 2) * S ? c : pick(C.dirt, r)));
		return top;
	}
	const wx = X * VOXEL;
	const wz = Z * VOXEL;
	const dw = d * VOXEL + (noise2(wx * 0.3, wz * 0.3, seed) - 0.5) * 2.2;
	let c: number;
	if (dw < 2.8) c = mix(P.waterShallow, P.foam, r > 0.82 && dw < 2.4 ? 0.7 : 0.05);
	else if (dw < 6) c = mix(P.waterShallow, P.waterMid, (dw - 2.8) / 3.2);
	else if (dw < 12) c = mix(P.waterMid, P.waterDeep, (dw - 6) / 6);
	else c = mix(P.waterDeep, P.waterDeeper, Math.min(1, (dw - 12) / 10));
	const top = SEA_TOP * S - 1;
	const surface = shade(c, 0.97 + r * 0.06);
	const side = shade(c, 0.75);
	grid.box(x, 0, z, x, top, z, (_, y) => (y > top - S ? surface : side), Mat.Water);
	return top;
}

/**
 * One column of the walnut frame round the sea, with a cream inlay along its inner edge and brass
 * caps on the corners; returns its top voxel. Measured in VOXELs, so it looks the same at any detail.
 */
function frameColumn(grid: VoxelGrid, x: number, z: number, bx: number, bz: number, W: number, D: number, seed: number, S: number): number {
	const x0 = bx - FRAME * S;
	const z0 = bz - FRAME * S;
	const x1 = bx + W + FRAME * S - 1;
	const z1 = bz + D + FRAME * S - 1;
	// How far in from the outside, and whether this is a corner.
	const fromOut = Math.floor(Math.min(x - x0, z - z0, x1 - x, z1 - z) / S);
	const cx = Math.floor(Math.min(x - x0, x1 - x) / S);
	const cz = Math.floor(Math.min(z - z0, z1 - z) / S);
	const corner = cx < FRAME + 3 && cz < FRAME + 3;
	const r = hash3(x, 9, z, seed);
	// Planks run along each side, mitred at the corners.
	const along = Math.floor((cx < cz ? z : x) / S);
	const plank = Math.floor((cx < cz ? cx : cz) / 3);
	const grain = pick(P.wood, hash3(plank, Math.floor(along / 23), cx < cz ? 1 : 2, seed));
	let c = shade(grain, 0.96 + r * 0.08);
	let h = G;
	if (fromOut === 0) c = pick(P.woodDark, r);
	else if (fromOut === FRAME - 1) {
		c = pick(P.inlay, r);
		h = G - 1;
	}
	if (corner && fromOut > 0) {
		// A brass cap with a rivet in each corner.
		const ex = cx - 1;
		const ez = cz - 1;
		const rim = ex === 0 || ez === 0 || ex === FRAME + 1 || ez === FRAME + 1;
		const rivet = (ex === 2 || ex === FRAME - 1) && (ez === 2 || ez === FRAME - 1);
		c = rim ? P.brassDark : rivet ? hex('#fff1c2') : pick(P.brass, r);
		h = G + 1;
	}
	const top = (h + 1) * S - 1;
	grid.box(x, 0, z, x, top, z, (_, y) => (y > top - S ? c : shade(c, 0.78)));
	return top;
}

// ---------------------------------------------------------------- terrain columns

/** A mountain's peak: where (VOXELs, as grid x / S), how high and how wide (VOXELs). */
type Peak = { x: number; z: number; h: number; r: number };

/** Two to four peaks per mountain territory, deep inside it, none on its square. */
function mountainPeaks(
	map: RealmMap,
	ids: Int16Array,
	W: number,
	D: number,
	dEdge: Float32Array,
	squareDist: (ix: number, iz: number, t: number) => number,
	bx: number,
	bz: number,
	seed: number,
	S: number
): Peak[][] {
	const out: Peak[][] = map.territories.map(() => []);
	const spots: { x: number; z: number; d: number; r: number }[][] = map.territories.map(() => []);
	for (let iz = 0; iz < D; iz += 2 * S)
		for (let ix = 0; ix < W; ix += 2 * S) {
			const t = ids[ix + iz * W];
			if (t < 0 || map.territories[t].terrain !== 'mountains') continue;
			const d = dEdge[ix + iz * W];
			if (d < 9 || squareDist(ix, iz, t) < 15) continue;
			spots[t].push({ x: (ix + bx) / S, z: (iz + bz) / S, d, r: hash3(ix / S, 3, iz / S, seed) });
		}
	spots.forEach((list, t) => {
		list.sort((a, b) => b.d + b.r * 4 - (a.d + a.r * 4));
		for (const s of list) {
			if (out[t].length >= 4) break;
			if (out[t].some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 13)) continue;
			const h = Math.min(16, 8 + s.d * 0.5 + s.r * 3);
			out[t].push({ x: s.x, z: s.z, h, r: Math.min(s.d + 2, 9 + s.r * 3) });
		}
	});
	return out;
}

/**
 * One column of a territory: returns its top voxel. `fade` (0..1) is how much of the terrain's
 * height it may have; `shore` how far it is from the water (VOXELs). Heights are worked out in
 * VOXELs and laid in grid voxels, so finer grids round them off more finely.
 */
function column(grid: VoxelGrid, terrain: RealmTerrain, x: number, z: number, r: number, hs: number, fade: number, shore: number, peaks: Peak[], S: number): number {
	/** The top voxel of VOXEL layer y. */
	const layer = (y: number) => (y + 1) * S - 1;
	/** Fills the column up to `top`: its top layer in `topColor`, then `side` (by VOXEL layer) or darker over dirt. */
	const fill = (top: number, topColor: number, side?: (layer: number) => number) => {
		const under = shade(topColor, 0.74);
		const dirt = pick(C.dirt, r);
		grid.box(x, 0, z, x, top, z, (_, y) => (y > top - S ? topColor : side ? side(Math.floor(y / S)) : y > top - 3 * S ? under : dirt));
		return top;
	};
	/** Sets VOXEL layer y of the column. */
	const setLayer = (y: number, c: number, mat: Mat = Mat.Solid) => {
		for (let k = y * S; k <= layer(y); k++) grid.set(x, k, z, c, mat);
	};
	const X = x / S;
	const Z = z / S;
	const gt = layer(GT);
	// Land within a VOXEL or two of the water reads as a sandy or rocky shore.
	const shoreline = shore < 1.6 + (hash3(x, 4, z, hs) - 0.5) * 0.8;
	switch (terrain) {
		case 'snow': {
			const n = fbm(X * 0.05, Z * 0.05, hs);
			const h = Math.round(Math.max(0, n - 0.5) * 7 * fade * S);
			const rock = fbm(X * 0.13, Z * 0.13, hs + 4) > 0.72 && fade > 0.5;
			const c = rock ? pick(C.rock, r) : mix(pick(P.snow, r), P.snowShade, Math.max(0, 0.55 - n) * 0.9);
			return fill(gt + h, c, (l) => (l > GT - 2 ? shade(c, 0.86) : pick(C.dirt, r)));
		}
		case 'taiga': {
			const n = fbm(X * 0.07, Z * 0.07, hs);
			const snowy = n > 0.56 || shoreline;
			const c = snowy ? mix(pick(P.snow, r), P.snowShade, 0.25) : pick(P.taigaFloor, r);
			return fill(layer(GT + (n > 0.64 && fade > 0.6 ? 1 : 0)), c);
		}
		case 'forest': {
			const n = fbm(X * 0.09, Z * 0.09, hs);
			const c = shoreline ? pick(C.sand, r) : r > 0.9 ? pick(C.bush, hash3(x, 9, z, hs)) : pick(C.forestFloor, r);
			return fill(layer(GT + (n > 0.6 && fade > 0.5 ? 1 : 0)), c);
		}
		case 'jungle': {
			const n = fbm(X * 0.08, Z * 0.08, hs);
			const c = shoreline ? pick(C.sand, r) : mix(pick(P.jungleFloor, r), C.grassHi[0], Math.max(0, n - 0.55));
			return fill(layer(GT + (n > 0.62 && fade > 0.6 ? 1 : 0)), c);
		}
		case 'meadow': {
			const n = fbm(X * 0.07, Z * 0.07, hs);
			const c = shoreline ? pick(C.sand, r) : mix(pick(C.grass, r), C.grassHi[0], Math.max(0, n - 0.45) * 0.9);
			const top = fill(layer(GT + (n > 0.64 && fade > 0.6 ? 1 : 0)), c);
			if (!shoreline && fade > 0.3) {
				const blade = pick(C.grassHi, hash3(x, 6, z, hs));
				if (r > 0.975) {
					const flower = pick(C.flower, hash3(x, 5, z, hs));
					if (S === 1) {
						grid.set(x, top + 1, z, flower);
						return top + 1;
					}
					// Small voxels give each flower a stem.
					grid.set(x, top + 1, z, blade, Mat.Sway);
					grid.set(x, top + 2, z, flower, Mat.Sway);
					return top + 2;
				}
				if (r > 0.95) {
					// Grass tufts, up to a VOXEL tall where the voxels are small.
					const h = 1 + Math.floor(hash3(x, 7, z, hs) * S);
					for (let k = 1; k <= h; k++) grid.set(x, top + k, z, blade, Mat.Sway);
					return top + h;
				}
			}
			return top;
		}
		case 'hills': {
			const n = fbm(X * 0.055, Z * 0.055, hs, 3);
			const m = fbm(X * 0.2, Z * 0.2, hs + 9, 2);
			const h = Math.max(0, Math.round(((n - 0.36) * 12 + (m - 0.5) * 1.5) * fade * S));
			const c = shoreline ? pick(C.sand, r) : h >= 3 * S && r > 0.6 ? pick(C.grassHi, r) : pick(P.hillGrass, r);
			return fill(gt + h, c, (l) => (l > GT - 1 ? shade(pick(P.hillGrass, hash3(x, l, z, hs)), 0.72) : pick(C.dirt, r)));
		}
		case 'mountains': {
			let h = 0;
			for (const p of peaks) {
				const d = Math.hypot(X - p.x, Z - p.z);
				h = Math.max(h, p.h * Math.pow(Math.max(0, 1 - d / p.r), 1.05));
			}
			h += (fbm(X * 0.12, Z * 0.12, hs) - 0.35) * 3;
			h = Math.max(0, Math.floor(h * fade * S));
			// Terraces: the slopes snapped to two-voxel steps away from the summits.
			if (h > 3 * S && h < 12 * S) h -= h % 2;
			const top = gt + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				const rh = hash3(x, y, z, hs);
				const rel = (y - gt) / S;
				if (rel >= 10 + (rh > 0.5 ? 1 : 0)) return pick(C.snow, rh);
				if (y > top - S && rel >= 7 && rh > 0.4) return pick(C.snow, rh);
				if (y > top - S) return rel > 1 ? pick(C.rockHi.concat(C.rock), rh) : shoreline ? pick(C.rock, rh) : pick(P.alpine, rh);
				if (rh > 0.78) return pick(C.rockDark, rh);
				return y < (GT - 2) * S ? pick(C.dirt, r) : pick(C.rock, rh);
			});
			return top;
		}
		case 'fields': {
			// A patchwork of plots on a slanted grid: wheat, green crops, cabbages, bare furrows.
			const u = X * 0.8 + Z * 0.6;
			const v = -X * 0.6 + Z * 0.8;
			const pu = Math.floor(u / 11);
			const pv = Math.floor(v / 8);
			const lane = u - pu * 11 < 1 || v - pv * 8 < 1;
			if (shoreline || lane || fade < 0.35) return fill(gt, shoreline ? pick(C.sand, r) : pick(C.grass, r));
			const kind = hash3(pu, 11, pv, hs);
			if (kind < 0.45) {
				fill(layer(GT - 1), pick(C.soil, r));
				const row = Math.floor(v) % 2 === 0;
				if (!row) {
					setLayer(GT, pick(C.soil, hash3(x, 1, z, hs)));
					return gt;
				}
				const h = (1 + Math.round(fade * (1 + (hash3(x, 2, z, hs) > 0.5 ? 1 : 0)))) * S;
				for (let k = 0; k < h; k++) grid.set(x, GT * S + k, z, k >= h - S ? pick(C.wheatTip, hash3(x, k, z, hs)) : C.wheat[Math.min(4, Math.floor(k / S) + 2)], Mat.Sway);
				return GT * S + h - 1;
			}
			if (kind < 0.7) {
				fill(layer(GT - 1), pick(C.soil, r));
				const row = Math.floor(u * 0.9) % 2 === 0;
				setLayer(GT, row ? pick(P.crops, r) : pick(C.soil, r), row ? Mat.Sway : Mat.Solid);
				if (row && r > 0.5) {
					setLayer(GT + 1, pick(P.crops, hash3(x, 3, z, hs)), Mat.Sway);
					return layer(GT + 1);
				}
				return gt;
			}
			if (kind < 0.85) return fill(gt, mix(pick(C.grass, r), C.grassHi[0], 0.4));
			fill(layer(GT - 1), pick(C.soil, r));
			const furrow = Math.floor(u * 0.7) % 2 === 0;
			setLayer(GT, furrow ? shade(pick(C.soil, r), 0.82) : pick(C.soil, r));
			return gt;
		}
		case 'desert': {
			const f = fbm(X * 0.06, Z * 0.06, hs);
			const ripple = Math.sin((X * 0.5 + Z * 0.3) * 0.9 + f * 6) > 0.6;
			const dune = Math.min(4 * S, Math.round(Math.max(0, f - 0.46) * 11 * fade * S));
			const c = pick(C.sand, r);
			return fill(gt + dune, ripple ? shade(c, 0.92) : c);
		}
		case 'badlands': {
			// Red clay with flat-topped mesas, their sides striped like rock strata.
			const f = fbm(X * 0.045, Z * 0.045, hs);
			const m = f > 0.58 ? 6 : f > 0.53 ? 3 : 0;
			const h = Math.round(m * fade * S);
			const top = gt + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				if (y > top - S) return h > 0 ? pick(C.clayHi, r) : shoreline ? pick(C.sand, r) : pick(C.clay, r);
				const band = (Math.floor(y / S) + Math.floor(hash3(x, 8, z, hs) * 1.3)) % 3;
				return band === 0 ? pick(C.clayDark, r) : band === 1 ? pick(C.clay, hash3(x, y, z, hs)) : hex('#e08a5a');
			});
			return top;
		}
	}
}

// ---------------------------------------------------------------- lanes and picking

/** Where a sea lane leaves each shore: walking from each territory's square towards the other's. */
function laneEnds(a: number, b: number, anchors: THREE.Vector3[], idAt: (x: number, z: number) => number): RealmLaneEnds {
	const pa = anchors[a];
	const pb = anchors[b];
	const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
	const steps = Math.ceil(len / 0.3);
	const at = (k: number) => ({ x: pa.x + ((pb.x - pa.x) * k) / steps, z: pa.z + ((pb.z - pa.z) * k) / steps });
	let ka = 0;
	while (ka < steps && idAt(at(ka + 1).x, at(ka + 1).z) === a) ka++;
	let kb = steps;
	while (kb > 0 && idAt(at(kb - 1).x, at(kb - 1).z) === b) kb--;
	return { a: at(ka), b: at(kb) };
}

/** The first column top a ray meets, walking the grid's columns (`vox` world units across). */
function columnRaycast(ray: THREE.Ray, tops: Int16Array, W: number, D: number, ox: number, oz: number, peak: number, vox: number) {
	const o = ray.origin;
	const d = ray.direction;
	const gx = o.x / vox - ox;
	const gy = o.y / vox;
	const gz = o.z / vox - oz;
	let s0 = 0;
	let s1 = Infinity;
	const clip = (from: number, step: number, hi: number) => {
		if (step === 0) return from >= 0 && from <= hi;
		const a = -from / step;
		const b = (hi - from) / step;
		s0 = Math.max(s0, Math.min(a, b));
		s1 = Math.min(s1, Math.max(a, b));
		return s0 <= s1;
	};
	if (!clip(gx, d.x, W) || !clip(gz, d.z, D) || !clip(gy, d.y, peak)) return null;
	let ix = Math.max(0, Math.min(W - 1, Math.floor(gx + d.x * s0)));
	let iz = Math.max(0, Math.min(D - 1, Math.floor(gz + d.z * s0)));
	const stepX = d.x > 0 ? 1 : -1;
	const stepZ = d.z > 0 ? 1 : -1;
	let nextX = d.x === 0 ? Infinity : (ix + (d.x > 0 ? 1 : 0) - gx) / d.x;
	let nextZ = d.z === 0 ? Infinity : (iz + (d.z > 0 ? 1 : 0) - gz) / d.z;
	let s = s0;
	for (;;) {
		const out = Math.min(nextX, nextZ, s1);
		const top = tops[ix + iz * W] + 1;
		const y0 = gy + d.y * s;
		if (top > 0 && Math.min(y0, gy + d.y * out) <= top) return ray.at((y0 <= top ? s : (top - gy) / d.y) * vox, new THREE.Vector3());
		if (out >= s1) return null;
		if (nextX < nextZ) {
			ix += stepX;
			s = nextX;
			nextX += Math.abs(1 / d.x);
		} else {
			iz += stepZ;
			s = nextZ;
			nextZ += Math.abs(1 / d.z);
		}
		if (ix < 0 || iz < 0 || ix >= W || iz >= D) return null;
	}
}
