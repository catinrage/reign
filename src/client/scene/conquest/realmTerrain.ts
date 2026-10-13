import * as THREE from 'three';
import { type RealmMap, type RealmTerrain, realmRaster } from '../../../shared/conquest/realm';
import { C, type Raise, bush, cactus, distanceField, hayBale, pebble, put, roundTree } from '../board/terrain';
import { SEA_Y, VOXEL } from '../layout';
import { Mat, VoxelGrid, fbm, hash3, hex, mix, noise2, pick, shade } from '../voxel/grid';
import { meshesFor } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';

/**
 * Conquest's Realm in voxels, built the way Settlement's island is (one VOXEL-sized grid, the
 * same palette and little trees) but as a map of territories: each one keeps its own terrain,
 * fading flat towards its borders so the cream border lines and the owner's band inside them stay
 * clear, with a cobbled square where its armies stand. The sea fills a wooden map tray.
 *
 * Grid coordinates are voxels; world = voxel * VOXEL. The map's columns line up with
 * `realmRaster(map, VOXEL)`, so the board shows exactly the territories the rules know.
 */

/** Land columns fill y = 0..G-1, so the flat land's top face is at y = G. */
const G = 8;
/** Top voxel of the flat land. */
const GT = G - 1;
/** Water columns fill y = 0..SEA_TOP-1. */
const SEA_TOP = Math.round(SEA_Y / VOXEL);
/** The wooden frame round the map, in voxels. */
const FRAME = 9;
const MAX_Y = 44;
/** The cobbled square each territory's armies stand on (voxels). */
const SQUARE_R = 5.4;

/** World y of the flat land's surface. */
export const REALM_LAND_TOP = G * VOXEL;

const P = {
	snow: [hex('#f5f8fb'), hex('#eaf0f6'), hex('#ffffff'), hex('#e3ebf3')],
	snowShade: hex('#c9daea'),
	ice: [hex('#bfe3f2'), hex('#a8d6ea'), hex('#d4eef8')],
	taigaFloor: [hex('#2f5a2f'), hex('#386636'), hex('#2a522b'), hex('#41703a')],
	alpine: [hex('#7e9b52'), hex('#87a35a'), hex('#73904a')],
	hillGrass: [hex('#93c64a'), hex('#87bb42'), hex('#9fd052'), hex('#7fb33d')],
	jungleFloor: [hex('#3f9a34'), hex('#47a83a'), hex('#37892e'), hex('#52b443')],
	palmTrunk: [hex('#a87c4a'), hex('#97693a'), hex('#b88b55')],
	palm: [hex('#2f9e3a'), hex('#38b044'), hex('#27892f'), hex('#45c04f')],
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
	wall: [hex('#f2ead8'), hex('#e8dfca')],
	roof: [hex('#c24b2a'), hex('#b13f22'), hex('#cf5a36')],
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
	/** Per territory: the middle of its cobbled square, where its armies stand (world). */
	anchors: THREE.Vector3[];
	/** Per territory: its land columns' bounds and middle (world), for labels and the camera. */
	extents: { minX: number; maxX: number; minZ: number; maxZ: number; cx: number; cz: number }[];
	/** Per lane of the map (in order): where it leaves the two shores. */
	lanes: RealmLaneEnds[];
	/** The map's columns for the realm shader: r = territory + 1, g = voxels to the nearest edge. */
	mapTexture: THREE.DataTexture;
	/** (x0, z0, nx, nz): the map's first column in world voxels and its size, for `uRealmGrid`. */
	gridInfo: THREE.Vector4;
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

export function buildRealm(map: RealmMap): RealmBuild {
	const raster = realmRaster(map, VOXEL);
	const { nx: W, nz: D, ids } = raster;
	const seed = map.seed;
	/** World voxel of map column 0. */
	const bx = Math.round(raster.x0 / VOXEL);
	const bz = Math.round(raster.z0 / VOXEL);
	const GW = W + FRAME * 2;
	const GD = D + FRAME * 2;
	const grid = new VoxelGrid(GW, MAX_Y, GD, bx - FRAME, 0, bz - FRAME);
	const N = W * D;
	const T = map.territories.length;

	// ---- the map's columns: land, edges, and how far each lies from them
	const land = new Uint8Array(N);
	const water = new Uint8Array(N);
	for (let i = 0; i < N; i++) {
		land[i] = ids[i] >= 0 ? 1 : 0;
		water[i] = 1 - land[i];
	}
	/** 1: on a border between territories; 2: between regions too. */
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
			]) {
				const x = ix + dx;
				const z = iz + dz;
				if (x < 0 || z < 0 || x >= W || z >= D) continue;
				const u = ids[x + z * W];
				if (u < 0 || u === t) continue;
				edge[i] = Math.max(edge[i], map.territories[u].region === map.territories[t].region ? 1 : 2);
			}
		}
	const edgeSeeds = new Uint8Array(N);
	for (let i = 0; i < N; i++) edgeSeeds[i] = !land[i] || edge[i] ? 1 : 0;
	/** Land: voxels to the nearest border or shore. */
	const dEdge = distanceField(edgeSeeds, W, D);
	/** Water: voxels to the nearest land. */
	const dLand = distanceField(land, W, D);
	/** Land: voxels to the nearest water. */
	const dWater = distanceField(water, W, D);

	// ---- each territory's square: as far from its edges as it can be, near where it was drawn
	const anchorsV: { x: number; z: number }[] = [];
	const extentsV = map.territories.map(() => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, sx: 0, sz: 0, n: 0 }));
	{
		const best = new Float32Array(T).fill(-Infinity);
		for (let t = 0; t < T; t++) anchorsV.push({ x: 0, z: 0 });
		for (let iz = 0; iz < D; iz++)
			for (let ix = 0; ix < W; ix++) {
				const i = ix + iz * W;
				const t = ids[i];
				if (t < 0) continue;
				const e = extentsV[t];
				e.minX = Math.min(e.minX, ix);
				e.maxX = Math.max(e.maxX, ix);
				e.minZ = Math.min(e.minZ, iz);
				e.maxZ = Math.max(e.maxZ, iz);
				e.sx += ix;
				e.sz += iz;
				e.n++;
				const [sx, sz] = map.territories[t].blobs[0];
				const seat = Math.hypot(ix - (sx / VOXEL - bx), iz - (sz / VOXEL - bz));
				const score = Math.min(dEdge[i], 14) - seat * 0.06;
				if (score > best[t]) {
					best[t] = score;
					anchorsV[t] = { x: ix, z: iz };
				}
			}
	}
	/** Per column: voxels to its territory's square. */
	const squareDist = (ix: number, iz: number, t: number) => Math.hypot(ix - anchorsV[t].x, iz - anchorsV[t].z);

	// ---- ground
	const tops = new Int16Array(GW * GD).fill(-1);
	const gi = (x: number, z: number) => x - grid.ox + (z - grid.oz) * GW;
	const raise: Raise = (x, z, y) => {
		const gx = Math.floor(x) - grid.ox;
		const gz = Math.floor(z) - grid.oz;
		if (gx < 0 || gz < 0 || gx >= GW || gz >= GD) return;
		const i = gx + gz * GW;
		if (y > tops[i]) tops[i] = y;
	};
	const topAt = (x: number, z: number) => {
		const gx = Math.floor(x) - grid.ox;
		const gz = Math.floor(z) - grid.oz;
		if (gx < 0 || gz < 0 || gx >= GW || gz >= GD) return -1;
		return tops[gx + gz * GW];
	};

	const peaks = mountainPeaks(map, ids, W, D, dEdge, anchorsV, seed);

	for (let iz = 0; iz < D; iz++) {
		for (let ix = 0; ix < W; ix++) {
			const i = ix + iz * W;
			const x = ix + bx;
			const z = iz + bz;
			const r = hash3(x, 0, z, seed);
			const t = ids[i];
			if (t < 0) {
				tops[gi(x, z)] = seaColumn(grid, x, z, dLand[i], r, seed);
				continue;
			}
			if (edge[i]) {
				const c = pick(edge[i] === 2 ? P.regionBorder : P.border, r);
				const top = GT - 1;
				grid.box(x, 0, z, x, top, z, (_, y) => (y === top ? c : y > top - 3 ? shade(c, 0.86) : pick(C.dirt, r)));
				tops[gi(x, z)] = top;
				continue;
			}
			const sq = squareDist(ix, iz, t);
			if (sq < SQUARE_R) {
				// Cobbles, a ring of darker stones round them.
				const c = sq > SQUARE_R - 1.1 ? pick(P.stoneRim, r) : pick(P.stone, hash3(Math.floor(x / 2), 1, Math.floor(z / 2), seed + t));
				grid.box(x, 0, z, x, GT, z, (_, y) => (y === GT ? c : y > GT - 3 ? shade(c, 0.8) : pick(C.dirt, r)));
				tops[gi(x, z)] = GT;
				continue;
			}
			// Tall ground eases off towards the edges and the square, so neither is ever hidden.
			const fade = smooth(2.5, 9, dEdge[i]) * smooth(SQUARE_R + 1.5, SQUARE_R + 9, sq);
			const terrain = map.territories[t].terrain;
			tops[gi(x, z)] = column(grid, terrain, x, z, r, seed + t * 101, fade, dWater[i], peaks[t]);
		}
	}

	frame(grid, bx, bz, W, D, seed, tops, gi);

	const ground = tops.slice();

	// ---- features: trees, crops, rocks, cottages; never on the edges, the band or the square
	const STEP = 4;
	for (let gz = 0; gz < D; gz += STEP)
		for (let gx = 0; gx < W; gx += STEP) {
			const ix = gx + Math.floor(hash3(gx, 5, gz, seed) * STEP);
			const iz = gz + Math.floor(hash3(gx, 6, gz, seed) * STEP);
			if (ix >= W || iz >= D) continue;
			const i = ix + iz * W;
			const t = ids[i];
			if (t < 0 || dEdge[i] < 6) continue;
			if (squareDist(ix, iz, t) < SQUARE_R + 3.5) continue;
			const x = ix + bx;
			const z = iz + bz;
			const r = hash3(gx, 7, gz, seed);
			const s = seed + gx * 31 + gz * 17;
			const y = topAt(x, z) + 1;
			if (y <= GT) continue;
			const deep = dEdge[i];
			switch (map.territories[t].terrain) {
				case 'forest':
					if (r < 0.72) pine(grid, x, y, z, s, raise, false);
					else if (r < 0.9) roundTree(grid, x, y, z, s, raise, 1);
					else if (r < 0.96) bush(grid, x, y, z, s, raise, 1);
					break;
				case 'taiga':
					if (r < 0.62) pine(grid, x, y, z, s, raise, ground[gi(x, z)] >= 0 && hash3(x, 2, z, seed) < 0.55);
					else if (r < 0.7) pebble(grid, x, y, z, s, raise, 1);
					break;
				case 'snow':
					if (r < 0.1) pine(grid, x, y, z, s, raise, true);
					else if (r < 0.2) iceRock(grid, x, y, z, s, raise);
					break;
				case 'jungle':
					if (r < 0.42) palm(grid, x, y, z, s, raise);
					else if (r < 0.62) bush(grid, x, y, z, s, raise, 1);
					else if (r < 0.74) roundTree(grid, x, y, z, s, raise, 1);
					break;
				case 'meadow':
					if (r < 0.1) roundTree(grid, x, y, z, s, raise, 1);
					else if (r < 0.22) bush(grid, x, y, z, s, raise, 1);
					else if (r < 0.25 && deep > 9) cottage(grid, x, y, z, s, raise);
					break;
				case 'fields':
					if (r < 0.035 && deep > 9) cottage(grid, x, y, z, s, raise);
					else if (r < 0.07) hayBale(grid, x, GT + 1, z, raise, 1);
					else if (r < 0.1) roundTree(grid, x, y, z, s, raise, 1);
					break;
				case 'hills':
					if (r < 0.1) roundTree(grid, x, y, z, s, raise, 1);
					else if (r < 0.2) bush(grid, x, y, z, s, raise, 1);
					else if (r < 0.26) boulder(grid, x, y, z, s, raise);
					break;
				case 'mountains':
					if (r < 0.14 && y < GT + 5) pine(grid, x, y, z, s, raise, y > GT + 2);
					else if (r < 0.22) boulder(grid, x, y, z, s, raise);
					break;
				case 'desert':
					if (r < 0.08) cactus(grid, x, y, z, s, raise, 1);
					else if (r < 0.15) pebble(grid, x, y, z, s, raise, 1);
					else if (r < 0.18 && deep > 8) ruin(grid, x, y, z, s, raise);
					else if (r < 0.22) dryBush(grid, x, y, z, s, raise);
					break;
				case 'badlands':
					if (r < 0.06) cactus(grid, x, y, z, s, raise, 1);
					else if (r < 0.14) boulder(grid, x, y, z, s, raise, true);
					else if (r < 0.22 && y === GT + 1) hoodoo(grid, x, y, z, s, raise);
					else if (r < 0.26) dryBush(grid, x, y, z, s, raise);
					break;
			}
		}

	// ---- meshes
	const geos = meshGrid(grid, { jitter: 0.06, skipFloor: true });
	const group = meshesFor(geos, VOXEL, {
		[Mat.Solid]: { realm: true, lamps: true },
		[Mat.Sway]: { swayBase: G, swayScale: 1, roughness: 0.7, realm: true, lamps: true },
		[Mat.Water]: { roughness: 0.22, bevel: 0.35, lamps: true }
	});
	group.name = 'realm';

	// ---- the realm shader's map of columns
	const tex = new Uint8Array(N * 4);
	for (let i = 0; i < N; i++) {
		if (ids[i] < 0) continue;
		tex[i * 4] = ids[i] + 1;
		tex[i * 4 + 1] = edge[i] ? 0 : Math.max(1, Math.min(255, Math.round(dEdge[i])));
		tex[i * 4 + 3] = 255;
	}
	const mapTexture = new THREE.DataTexture(tex, W, D, THREE.RGBAFormat, THREE.UnsignedByteType);
	mapTexture.magFilter = THREE.NearestFilter;
	mapTexture.minFilter = THREE.NearestFilter;
	mapTexture.generateMipmaps = false;
	mapTexture.needsUpdate = true;

	// ---- what the board knows about places
	const groundAt = (ix: number, iz: number) => {
		const v = ground[gi(ix + bx, iz + bz)];
		return v >= 0 ? (v + 1) * VOXEL : 0;
	};
	const anchors = anchorsV.map(({ x, z }) => new THREE.Vector3((x + bx + 0.5) * VOXEL, (GT + 1) * VOXEL, (z + bz + 0.5) * VOXEL));
	const extents = extentsV.map((e) => ({
		minX: (e.minX + bx) * VOXEL,
		maxX: (e.maxX + bx + 1) * VOXEL,
		minZ: (e.minZ + bz) * VOXEL,
		maxZ: (e.maxZ + bz + 1) * VOXEL,
		cx: (e.sx / Math.max(1, e.n) + bx + 0.5) * VOXEL,
		cz: (e.sz / Math.max(1, e.n) + bz + 0.5) * VOXEL
	}));
	const index = new Map(map.territories.map((t, k) => [t.id, k]));
	const idAt = (wx: number, wz: number) => {
		const ix = Math.floor(wx / VOXEL) - bx;
		const iz = Math.floor(wz / VOXEL) - bz;
		if (ix < 0 || iz < 0 || ix >= W || iz >= D) return -1;
		return ids[ix + iz * W];
	};
	const lanes = map.lanes.map(([a, b]) => laneEnds(index.get(a)!, index.get(b)!, anchors, idAt));

	let peak = 0;
	for (const t of tops) peak = Math.max(peak, t + 1);
	const raycast = (ray: THREE.Ray) => columnRaycast(ray, tops, GW, GD, grid.ox, grid.oz, peak);

	return {
		group,
		anchors,
		extents,
		lanes,
		mapTexture,
		gridInfo: new THREE.Vector4(bx, bz, W, D),
		halfX: (GW / 2) * VOXEL,
		halfZ: (GD / 2) * VOXEL,
		territoryAt: idAt,
		surfaceY: (x, z) => {
			const t = topAt(x / VOXEL, z / VOXEL);
			return t >= 0 ? (t + 1) * VOXEL : 0;
		},
		groundY: (x, z) => {
			const ix = Math.floor(x / VOXEL) - bx;
			const iz = Math.floor(z / VOXEL) - bz;
			return ix >= 0 && iz >= 0 && ix < W && iz < D ? groundAt(ix, iz) : 0;
		},
		raycast,
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

/** The sea: sand where it meets the land, turquoise shallows with foam, deepening blue out to the frame. */
function seaColumn(grid: VoxelGrid, x: number, z: number, d: number, r: number, seed: number): number {
	const beach = 1.5 + (noise2(x * 0.11, z * 0.11, seed + 5) - 0.5) * 1.4;
	if (d < beach) {
		const top = d < beach - 0.9 ? G - 2 : G - 3;
		const c = top === G - 2 ? pick(C.sand, r) : pick(C.wetSand, r);
		grid.box(x, 0, z, x, top - 1, z, (_, y) => (y >= top - 2 ? c : pick(C.dirt, r)));
		return top - 1;
	}
	const wx = x * VOXEL;
	const wz = z * VOXEL;
	const dw = d * VOXEL + (noise2(wx * 0.3, wz * 0.3, seed) - 0.5) * 2.2;
	let c: number;
	if (dw < 2.8) c = mix(P.waterShallow, P.foam, r > 0.82 && dw < 2.4 ? 0.7 : 0.05);
	else if (dw < 6) c = mix(P.waterShallow, P.waterMid, (dw - 2.8) / 3.2);
	else if (dw < 12) c = mix(P.waterMid, P.waterDeep, (dw - 6) / 6);
	else c = mix(P.waterDeep, P.waterDeeper, Math.min(1, (dw - 12) / 10));
	const top = SEA_TOP - 1;
	const surface = shade(c, 0.97 + r * 0.06);
	const side = shade(c, 0.75);
	grid.box(x, 0, z, x, top, z, (_, y) => (y === top ? surface : side), Mat.Water);
	return top;
}

/** A walnut frame round the sea, a cream inlay along its inner edge and brass caps on the corners. */
function frame(grid: VoxelGrid, bx: number, bz: number, W: number, D: number, seed: number, tops: Int16Array, gi: (x: number, z: number) => number) {
	const x0 = bx - FRAME;
	const z0 = bz - FRAME;
	const x1 = bx + W + FRAME - 1;
	const z1 = bz + D + FRAME - 1;
	const top = G;
	for (let z = z0; z <= z1; z++)
		for (let x = x0; x <= x1; x++) {
			const ix = x - bx;
			const iz = z - bz;
			if (ix >= 0 && iz >= 0 && ix < W && iz < D) continue;
			// How far in from the outside, and whether this is a corner.
			const fromOut = Math.min(x - x0, z - z0, x1 - x, z1 - z);
			const cx = Math.min(x - x0, x1 - x);
			const cz = Math.min(z - z0, z1 - z);
			const corner = cx < FRAME + 3 && cz < FRAME + 3;
			const r = hash3(x, 9, z, seed);
			// Planks run along each side, mitred at the corners.
			const along = cx < cz ? z : x;
			const plank = Math.floor((cx < cz ? cx : cz) / 3);
			const grain = pick(P.wood, hash3(plank, Math.floor(along / 23), cx < cz ? 1 : 2, seed));
			let c = shade(grain, 0.96 + r * 0.08);
			let h = top;
			if (fromOut === 0) c = pick(P.woodDark, r);
			else if (fromOut === FRAME - 1) {
				c = pick(P.inlay, r);
				h = top - 1;
			}
			if (corner && fromOut > 0) {
				// A brass cap with a rivet in each corner.
				const ex = cx - 1;
				const ez = cz - 1;
				const rim = ex === 0 || ez === 0 || ex === FRAME + 1 || ez === FRAME + 1;
				const rivet = (ex === 2 || ex === FRAME - 1) && (ez === 2 || ez === FRAME - 1);
				c = rim ? P.brassDark : rivet ? hex('#fff1c2') : pick(P.brass, r);
				h = top + 1;
			}
			grid.box(x, 0, z, x, h, z, (_, y) => (y === h ? c : shade(c, 0.78)));
			tops[gi(x, z)] = h;
		}
}

// ---------------------------------------------------------------- terrain columns

type Peak = { x: number; z: number; h: number; r: number };

/** Two to four peaks per mountain territory, deep inside it, none on its square. */
function mountainPeaks(map: RealmMap, ids: Int16Array, W: number, D: number, dEdge: Float32Array, anchors: { x: number; z: number }[], seed: number): Peak[][] {
	const out: Peak[][] = map.territories.map(() => []);
	const spots: { x: number; z: number; d: number; r: number }[][] = map.territories.map(() => []);
	for (let iz = 0; iz < D; iz += 2)
		for (let ix = 0; ix < W; ix += 2) {
			const t = ids[ix + iz * W];
			if (t < 0 || map.territories[t].terrain !== 'mountains') continue;
			const d = dEdge[ix + iz * W];
			const sq = Math.hypot(ix - anchors[t].x, iz - anchors[t].z);
			if (d < 9 || sq < 15) continue;
			spots[t].push({ x: ix, z: iz, d, r: hash3(ix, 3, iz, seed) });
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
 * One column of a territory: returns the y of its top voxel. `fade` (0..1) is how much of the
 * terrain's height it may have; `shore` how far it is from the water.
 */
function column(grid: VoxelGrid, terrain: RealmTerrain, x: number, z: number, r: number, hs: number, fade: number, shore: number, peaks: Peak[]): number {
	const fill = (top: number, topColor: number, side?: (y: number) => number, mat: Mat = Mat.Solid) => {
		const under = shade(topColor, 0.74);
		const dirt = pick(C.dirt, r);
		grid.box(x, 0, z, x, top, z, (_, y) => (y === top ? topColor : side ? side(y) : y > top - 3 ? under : dirt), mat);
		return top;
	};
	// Land within a voxel or two of the water reads as a sandy or rocky shore.
	const shoreline = shore < 1.6 + (hash3(x, 4, z, hs) - 0.5) * 0.8;
	switch (terrain) {
		case 'snow': {
			const n = fbm(x * 0.05, z * 0.05, hs);
			const h = Math.round(Math.max(0, n - 0.5) * 7 * fade);
			const rock = fbm(x * 0.13, z * 0.13, hs + 4) > 0.72 && fade > 0.5;
			const c = rock ? pick(C.rock, r) : mix(pick(P.snow, r), P.snowShade, Math.max(0, 0.55 - n) * 0.9);
			return fill(GT + h, c, (y) => (y > GT - 2 ? shade(c, 0.86) : pick(C.dirt, r)));
		}
		case 'taiga': {
			const n = fbm(x * 0.07, z * 0.07, hs);
			const snowy = n > 0.56 || shoreline;
			const c = snowy ? mix(pick(P.snow, r), P.snowShade, 0.25) : pick(P.taigaFloor, r);
			return fill(GT + (n > 0.64 && fade > 0.6 ? 1 : 0), c);
		}
		case 'forest': {
			const n = fbm(x * 0.09, z * 0.09, hs);
			const c = shoreline ? pick(C.sand, r) : r > 0.9 ? pick(C.bush, hash3(x, 9, z, hs)) : pick(C.forestFloor, r);
			return fill(GT + (n > 0.6 && fade > 0.5 ? 1 : 0), c);
		}
		case 'jungle': {
			const n = fbm(x * 0.08, z * 0.08, hs);
			const c = shoreline ? pick(C.sand, r) : mix(pick(P.jungleFloor, r), C.grassHi[0], Math.max(0, n - 0.55));
			return fill(GT + (n > 0.62 && fade > 0.6 ? 1 : 0), c);
		}
		case 'meadow': {
			const n = fbm(x * 0.07, z * 0.07, hs);
			const c = shoreline ? pick(C.sand, r) : mix(pick(C.grass, r), C.grassHi[0], Math.max(0, n - 0.45) * 0.9);
			const top = fill(GT + (n > 0.64 && fade > 0.6 ? 1 : 0), c);
			if (!shoreline && fade > 0.3) {
				const blade = pick(C.grassHi, hash3(x, 6, z, hs));
				if (r > 0.975) {
					grid.set(x, top + 1, z, pick(C.flower, hash3(x, 5, z, hs)));
					return top + 1;
				}
				if (r > 0.95) {
					grid.set(x, top + 1, z, blade, Mat.Sway);
					return top + 1;
				}
			}
			return top;
		}
		case 'hills': {
			const n = fbm(x * 0.055, z * 0.055, hs, 3);
			const m = fbm(x * 0.2, z * 0.2, hs + 9, 2);
			const h = Math.max(0, Math.round(((n - 0.36) * 12 + (m - 0.5) * 1.5) * fade));
			const c = shoreline ? pick(C.sand, r) : h >= 3 && r > 0.6 ? pick(C.grassHi, r) : pick(P.hillGrass, r);
			return fill(GT + h, c, (y) => (y > GT - 1 ? shade(pick(P.hillGrass, hash3(x, y, z, hs)), 0.72) : pick(C.dirt, r)));
		}
		case 'mountains': {
			let h = 0;
			for (const p of peaks) {
				const d = Math.hypot(x - (p.x + grid.ox + FRAME), z - (p.z + grid.oz + FRAME));
				h = Math.max(h, p.h * Math.pow(Math.max(0, 1 - d / p.r), 1.05));
			}
			h += (fbm(x * 0.12, z * 0.12, hs) - 0.35) * 3;
			h = Math.max(0, Math.floor(h * fade));
			if (h > 3 && h < 12) h -= h % 2;
			const top = GT + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				const rh = hash3(x, y, z, hs);
				const rel = y - GT;
				if (rel >= 10 + (rh > 0.5 ? 1 : 0)) return pick(C.snow, rh);
				if (y === top && rel >= 7 && rh > 0.4) return pick(C.snow, rh);
				if (y === top) return rel > 1 ? pick(C.rockHi.concat(C.rock), rh) : shoreline ? pick(C.rock, rh) : pick(P.alpine, rh);
				if (rh > 0.78) return pick(C.rockDark, rh);
				return y < GT - 2 ? pick(C.dirt, r) : pick(C.rock, rh);
			});
			return top;
		}
		case 'fields': {
			// A patchwork of plots on a slanted grid: wheat, green crops, cabbages, bare furrows.
			const u = x * 0.8 + z * 0.6;
			const v = -x * 0.6 + z * 0.8;
			const pu = Math.floor(u / 11);
			const pv = Math.floor(v / 8);
			const lane = u - pu * 11 < 1 || v - pv * 8 < 1;
			if (shoreline || lane || fade < 0.35) {
				const c = shoreline ? pick(C.sand, r) : lane ? pick(C.grass, r) : pick(C.grass, r);
				return fill(GT, c);
			}
			const kind = hash3(pu, 11, pv, hs);
			if (kind < 0.45) {
				fill(GT - 1, pick(C.soil, r));
				const row = Math.floor(v) % 2 === 0;
				if (!row) {
					grid.set(x, GT, z, pick(C.soil, hash3(x, 1, z, hs)));
					return GT;
				}
				const h = 1 + Math.round(fade * (1 + (hash3(x, 2, z, hs) > 0.5 ? 1 : 0)));
				for (let k = 0; k < h; k++) grid.set(x, GT + k, z, k === h - 1 ? pick(C.wheatTip, hash3(x, k, z, hs)) : C.wheat[Math.min(4, k + 2)], Mat.Sway);
				return GT + h - 1;
			}
			if (kind < 0.7) {
				fill(GT - 1, pick(C.soil, r));
				const row = Math.floor(u * 0.9) % 2 === 0;
				grid.set(x, GT, z, row ? pick(P.crops, r) : pick(C.soil, r), row ? Mat.Sway : Mat.Solid);
				if (row && r > 0.5) {
					grid.set(x, GT + 1, z, pick(P.crops, hash3(x, 3, z, hs)), Mat.Sway);
					return GT + 1;
				}
				return GT;
			}
			if (kind < 0.85) {
				const c = mix(pick(C.grass, r), C.grassHi[0], 0.4);
				return fill(GT, c);
			}
			fill(GT - 1, pick(C.soil, r));
			const furrow = Math.floor(u * 0.7) % 2 === 0;
			grid.set(x, GT, z, furrow ? shade(pick(C.soil, r), 0.82) : pick(C.soil, r));
			return GT;
		}
		case 'desert': {
			const f = fbm(x * 0.06, z * 0.06, hs);
			const ripple = Math.sin((x * 0.5 + z * 0.3) * 0.9 + f * 6) > 0.6;
			const dune = Math.min(4, Math.round(Math.max(0, f - 0.46) * 11 * fade));
			const c = pick(C.sand, r);
			return fill(GT + dune, ripple ? shade(c, 0.92) : c);
		}
		case 'badlands': {
			// Red clay with flat-topped mesas, their sides striped like rock strata.
			const f = fbm(x * 0.045, z * 0.045, hs);
			const m = f > 0.58 ? 6 : f > 0.53 ? 3 : 0;
			const h = Math.round(m * fade);
			const top = GT + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				if (y === top) return h > 0 ? pick(C.clayHi, r) : shoreline ? pick(C.sand, r) : pick(C.clay, r);
				const band = (y + Math.floor(hash3(x, 8, z, hs) * 1.3)) % 3;
				return band === 0 ? pick(C.clayDark, r) : band === 1 ? pick(C.clay, hash3(x, y, z, hs)) : hex('#e08a5a');
			});
			return top;
		}
	}
}

// ---------------------------------------------------------------- features

/** A pine, as on Settlement's forests; snowy ones have white on every tier. */
function pine(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, snowy: boolean) {
	const tall = hash3(s, 1, 1);
	const trunkH = 1 + (tall > 0.5 ? 1 : 0);
	for (let k = 0; k < trunkH; k++) put(g, raise, x, y + k, z, pick(C.trunk, hash3(x, y + k, z, s)));
	const height = 6 + Math.floor(tall * 4);
	const base = 1.45 + hash3(s, 2, 1) * 0.45;
	let yy = y + trunkH;
	for (let l = 0; l < height; l++) {
		const t = l / height;
		const tier = 2 - (l % 3);
		const rad = base * (1 - t * 0.85) + tier * 0.3;
		for (let dz = -3; dz <= 3; dz++)
			for (let dx = -3; dx <= 3; dx++) {
				const d = Math.hypot(dx, dz);
				if (d > rad) continue;
				const rr = hash3(x + dx, yy, z + dz, s);
				const lit = dx - dz < -0.5 && d > rad - 1.1;
				let c = lit && rr > 0.35 ? pick(C.pineHi, rr) : pick(C.pine, rr);
				if (snowy && tier === 2 && d > rad - 1.2 && rr > 0.25) c = pick(P.snow, rr);
				put(g, raise, x + dx, yy, z + dz, c);
			}
		yy++;
	}
	put(g, raise, x, yy, z, snowy ? P.snow[2] : pick(C.pineHi, hash3(s, 3, 3)));
}

/** A palm: a leaning ringed trunk and drooping fronds. */
function palm(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const h = 6 + Math.floor(hash3(s, 1, 2) * 3);
	const lean = hash3(s, 2, 2) * Math.PI * 2;
	const lx = Math.cos(lean);
	const lz = Math.sin(lean);
	let tx = x;
	let tz = z;
	for (let k = 0; k < h; k++) {
		const off = (k * k) / (h * h) * 2;
		tx = Math.round(x + lx * off);
		tz = Math.round(z + lz * off);
		put(g, raise, tx, y + k, tz, k % 2 ? P.palmTrunk[0] : P.palmTrunk[1]);
	}
	const top = y + h;
	put(g, raise, tx, top, tz, P.palm[3]);
	const fronds = 6;
	for (let f = 0; f < fronds; f++) {
		const a = (f / fronds) * Math.PI * 2 + hash3(s, f, 3);
		const cx = Math.cos(a);
		const cz = Math.sin(a);
		for (let k = 1; k <= 4; k++) {
			const fx = Math.round(tx + cx * k);
			const fz = Math.round(tz + cz * k);
			const fy = top - (k >= 3 ? k - 2 : 0);
			put(g, raise, fx, fy, fz, pick(P.palm, hash3(fx, fy, fz, s)));
		}
	}
	// Coconuts.
	if (hash3(s, 4, 4) > 0.4) put(g, raise, tx + 1, top - 1, tz, hex('#6b4a22'));
}

function iceRock(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const n = 2 + Math.floor(hash3(s, 1, 1) * 3);
	for (let k = 0; k < n; k++) {
		const dx = Math.floor(hash3(s, k, 2) * 3) - 1;
		const dz = Math.floor(hash3(s, k, 3) * 3) - 1;
		const h = 1 + Math.floor(hash3(s, k, 4) * 3);
		for (let j = 0; j < h; j++) put(g, raise, x + dx, y + j, z + dz, pick(P.ice, hash3(x + dx, y + j, z + dz, s)));
	}
}

function boulder(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, red = false) {
	const pal = red ? C.clayDark.concat(C.clay) : C.rock.concat(C.rockHi);
	const big = hash3(s, 5, 5) > 0.5;
	for (let dz = 0; dz <= (big ? 1 : 0); dz++)
		for (let dx = 0; dx <= 1; dx++) {
			put(g, raise, x + dx, y, z + dz, pick(pal, hash3(x + dx, y, z + dz, s)));
			if (big && dx === 0 && dz === 0) put(g, raise, x, y + 1, z, pick(pal, hash3(x, y + 1, z, s)));
		}
}

/** Sandstone columns of a ruin, some broken, one fallen. */
function ruin(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const sand = [hex('#e8cf98'), hex('#dcc088'), hex('#f0daa8')];
	for (let k = 0; k < 3; k++) {
		const px = x + k * 2;
		const h = 2 + Math.floor(hash3(s, k, 6) * 3);
		for (let j = 0; j < h; j++) put(g, raise, px, y + j, z, pick(sand, hash3(px, y + j, z, s)));
		if (h >= 4) put(g, raise, px, y + h, z, shade(sand[0], 1.05));
	}
	put(g, raise, x, y, z + 2, pick(sand, hash3(s, 9, 9)));
	put(g, raise, x + 1, y, z + 2, pick(sand, hash3(s, 9, 8)));
}

/** A red rock spire. */
function hoodoo(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const h = 3 + Math.floor(hash3(s, 3, 7) * 3);
	for (let j = 0; j < h; j++) {
		const c = j % 2 ? pick(C.clay, hash3(x, y + j, z, s)) : pick(C.clayDark, hash3(x, y + j, z, s));
		put(g, raise, x, y + j, z, c);
		if (j < 2) put(g, raise, x + 1, y + j, z, c);
	}
	put(g, raise, x, y + h, z, pick(C.clayHi, s));
}

/** A dry, twiggy bush. */
function dryBush(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const c = [hex('#a08a4a'), hex('#8f7a3e'), hex('#b39b56')];
	put(g, raise, x, y, z, pick(c, hash3(s, 1, 1)));
	if (hash3(s, 2, 1) > 0.4) put(g, raise, x + 1, y, z, pick(c, hash3(s, 2, 2)));
	if (hash3(s, 3, 1) > 0.5) put(g, raise, x, y + 1, z, pick(c, hash3(s, 3, 3)));
}

/** A white cottage with a red gabled roof and a chimney. */
function cottage(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const turn = hash3(s, 7, 1) > 0.5;
	const L = 4;
	const Wd = 3;
	const at = (a: number, b: number, h: number, c: number) => (turn ? put(g, raise, x + b, y + h, z + a, c) : put(g, raise, x + a, y + h, z + b, c));
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

function columnRaycast(ray: THREE.Ray, tops: Int16Array, W: number, D: number, ox: number, oz: number, peak: number) {
	const o = ray.origin;
	const d = ray.direction;
	const gx = o.x / VOXEL - ox;
	const gy = o.y / VOXEL;
	const gz = o.z / VOXEL - oz;
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
		if (top > 0 && Math.min(y0, gy + d.y * out) <= top) return ray.at((y0 <= top ? s : (top - gy) / d.y) * VOXEL, new THREE.Vector3());
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
