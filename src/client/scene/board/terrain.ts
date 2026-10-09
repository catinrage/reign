import * as THREE from 'three';
import { type Axial, hexKey, worldToHex } from '../../../shared/board/hex';
import { type Board, getTopology } from '../../../shared/board/topology';
import type { Terrain } from '../../../shared/rules/config';
import { HEX_R, SEA_Y, VOXEL } from '../layout';
import { Mat, VoxelGrid, fbm, hash3, hex, mix, noise2, pick, shade } from '../voxel/grid';
import { meshesFor, sharedUniforms } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';

/**
 * Builds the island as one fine voxel grid (20 voxels per hex radius) so every tile reads
 * like a hand-made miniature: dense little pines, a carpet of wheat stalks, terraced clay,
 * a stepped peak, rippled dunes. Beige borders separate the tiles, a sand rim runs round
 * the coast, and a shallow sea plate with an irregular outline shades from turquoise to
 * deep blue.
 *
 * Grid coordinates are voxels; world = voxel * VOXEL.
 */

/** Hex circumradius in voxels. */
const RV = HEX_R / VOXEL;
/** Land surface: columns fill y = 0..G-1, so the top face is at y = G. */
const G = 8;
/** World y of the flat land surface: roads and buildings stand at least this high. */
export const LAND_TOP = G * VOXEL;
const BORDER_TOP = G - 1;
/** Water columns fill y = 0..SEA_TOP-1, a step below the wet sand. */
const SEA_TOP = Math.round(SEA_Y / VOXEL);

const C = {
	border: [hex('#f3e2b8'), hex('#eedaa9'), hex('#f7e8c4'), hex('#e9d3a0')],
	sand: [hex('#f4d48e'), hex('#efca7c'), hex('#f8dc9e'), hex('#e9c071')],
	wetSand: [hex('#d9b26c'), hex('#cfa760'), hex('#dcb874')],
	dirt: [hex('#7c4f2c'), hex('#6d4426'), hex('#875833')],
	forestFloor: [hex('#2f6a1d'), hex('#367521'), hex('#2a6019'), hex('#3d7d25')],
	pine: [hex('#0f5a1c'), hex('#146a22'), hex('#0b4c17'), hex('#197528'), hex('#126224')],
	pineHi: [hex('#2f9a35'), hex('#3aa83c'), hex('#2a8c30')],
	leaf: [hex('#2f8f2a'), hex('#3aa232'), hex('#2a7f26'), hex('#47b03c')],
	leafHi: [hex('#6cc84a'), hex('#5dbd42')],
	trunk: [hex('#6b4224'), hex('#5a361d')],
	grass: [hex('#8fd246'), hex('#83c83e'), hex('#9bda4f'), hex('#7cbf39')],
	grassHi: [hex('#b4e65e'), hex('#a8df55')],
	flower: [hex('#ffffff'), hex('#ffe45c'), hex('#ff8fb4'), hex('#d4b0ff'), hex('#ff6a4a')],
	bush: [hex('#4c9a2e'), hex('#3f8a28'), hex('#58a736')],
	soil: [hex('#9a6b34'), hex('#8a5e2d'), hex('#a5743a')],
	wheat: [hex('#c98a12'), hex('#dda21c'), hex('#ebb424'), hex('#f5c42e'), hex('#ffd23a')],
	wheatTip: [hex('#ffdc48'), hex('#ffd43a'), hex('#ffe46a'), hex('#f9cc34')],
	clay: [hex('#c4552f'), hex('#d0603a'), hex('#b74c29'), hex('#d96b42')],
	clayHi: [hex('#e47c52'), hex('#e8865c')],
	clayDark: [hex('#9a3c22'), hex('#8a341e')],
	brick: [hex('#b13f22'), hex('#c24b2a'), hex('#a53a1f')],
	mortar: hex('#e7b893'),
	rock: [hex('#7f8189'), hex('#8c8e96'), hex('#72747c'), hex('#999ba3')],
	rockHi: [hex('#c2c5cc'), hex('#b6b9c1')],
	rockDark: [hex('#55575f'), hex('#4a4c54')],
	snow: [hex('#f5f7fa'), hex('#e9edf3'), hex('#ffffff')],
	ore: [hex('#cfe0f5'), hex('#9fb8d8')],
	cactus: [hex('#3f9a3a'), hex('#4fae45')],
	plank: [hex('#a76b38'), hex('#95602f'), hex('#b37742')],
	post: hex('#5e3a1e'),
	waterShallow: hex('#63abc4'),
	waterMid: hex('#4d90bd'),
	waterDeep: hex('#4b7eae'),
	waterEdge: hex('#3d719e'),
	foam: hex('#e6f3f8')
};

/** Grid half-extent in voxels (land, beaches, piers and the sea). */
const HALF = 140;
const MAX_Y = 36;

export interface PortSpot {
	x: number;
	z: number;
	/** Angle (radians, around Y) of the outward direction. */
	angle: number;
	kind: string;
	ratio: number;
}

export interface BoardBuild {
	group: THREE.Group;
	/** World y of the surface at the hex center, where its number token sits. */
	tokenY: number[];
	sheepSpots: { hex: number; x: number; z: number }[];
	ports: PortSpot[];
	/** World y of the top of everything (trees, wheat...) or the water at a world position. */
	surfaceY: (x: number, z: number) => number;
	/** World y of the bare ground (tiles and borders, no features): where pieces stand. */
	groundY: (x: number, z: number) => number;
	dispose: () => void;
}

interface Col {
	hex: number;
	lx: number;
	lz: number;
	edge: number;
	/** Distance to the nearest hex corner, where settlements stand. */
	corner: number;
}

const CORNERS = Array.from({ length: 6 }, (_, i) => {
	const a = ((60 * i - 90) * Math.PI) / 180;
	return [Math.cos(a) * RV, Math.sin(a) * RV] as const;
});

function cornerDistance(lx: number, lz: number) {
	let d = Infinity;
	for (const [cx, cz] of CORNERS) d = Math.min(d, Math.hypot(lx - cx, lz - cz));
	return d;
}

/** Distance (voxels) from a point in hex-local voxel coordinates to the hex's edge. */
function hexEdgeDistance(lx: number, lz: number): number {
	const inR = (Math.sqrt(3) / 2) * RV;
	const a = Math.abs(lx);
	const b = Math.abs(0.5 * lx + (Math.sqrt(3) / 2) * lz);
	const c = Math.abs(-0.5 * lx + (Math.sqrt(3) / 2) * lz);
	return inR - Math.max(a, b, c);
}

export function buildBoard(board: Board, seed: number): BoardBuild {
	const topo = getTopology(board);
	const grid = new VoxelGrid(HALF * 2, MAX_Y, HALF * 2, -HALF, 0, -HALF);
	const W = grid.nx;
	const D = grid.nz;
	const hexIndex = new Map<string, number>();
	board.hexes.forEach((h, i) => hexIndex.set(hexKey(h), i));
	const centers = topo.hexes.map((t) => ({ x: (t.x * HEX_R) / VOXEL, z: (t.z * HEX_R) / VOXEL }));

	// ---- classify columns
	const cols: (Col | null)[] = new Array(W * D).fill(null);
	const land = new Uint8Array(W * D);
	for (let iz = 0; iz < D; iz++) {
		for (let ix = 0; ix < W; ix++) {
			const x = ix - HALF + 0.5;
			const z = iz - HALF + 0.5;
			const ax: Axial = worldToHex((x * VOXEL) / HEX_R, (z * VOXEL) / HEX_R);
			const h = hexIndex.get(hexKey(ax));
			if (h === undefined) continue;
			const lx = x - centers[h].x;
			const lz = z - centers[h].z;
			cols[ix + iz * W] = { hex: h, lx, lz, edge: hexEdgeDistance(lx, lz), corner: cornerDistance(lx, lz) };
			land[ix + iz * W] = 1;
		}
	}

	const dist = distanceField(land, W, D);
	const tops = new Int16Array(W * D).fill(-1);
	const topAt = (x: number, z: number) => {
		const ix = Math.floor(x) + HALF;
		const iz = Math.floor(z) + HALF;
		if (ix < 0 || iz < 0 || ix >= W || iz >= D) return -1;
		return tops[ix + iz * W];
	};
	const raise = (x: number, z: number, y: number) => {
		const ix = Math.floor(x) + HALF;
		const iz = Math.floor(z) + HALF;
		if (ix < 0 || iz < 0 || ix >= W || iz >= D) return;
		const i = ix + iz * W;
		if (y > tops[i]) tops[i] = y;
	};

	// ---- per-column ground: tiles, borders, beaches
	for (let iz = 0; iz < D; iz++) {
		for (let ix = 0; ix < W; ix++) {
			const x = ix - HALF;
			const z = iz - HALF;
			const i = ix + iz * W;
			const r = hash3(x, 0, z, seed);
			const col = cols[i];
			if (!col) {
				const d = dist[i];
				// Sand rim around the coast, a step lower where it meets the water.
				const beach = 1.6 + (noise2(x * 0.18, z * 0.18, seed + 5) - 0.5) * 1.2;
				if (d < beach) {
					const top = d < beach - 0.9 ? G - 2 : G - 3;
					const c = top === G - 2 ? pick(C.sand, r) : pick(C.wetSand, r);
					grid.box(x, 0, z, x, top - 1, z, (_, y) => (y === top - 1 ? c : pick(C.dirt, r)));
					tops[i] = top - 1;
					continue;
				}
				// The sea, in world units: an irregular outline, turquoise shallows with a little
				// foam, deepening blue, and a darker rim a step lower at the edge.
				const wx = x * VOXEL;
				const wz = z * VOXEL;
				const dw = d * VOXEL;
				const outline = 15 + fbm(wx * 0.045, wz * 0.045, seed + 3) * 9;
				if (dw > outline) continue;
				const dd = dw + (noise2(wx * 0.3, wz * 0.3, seed) - 0.5) * 2.2;
				let c: number;
				if (dd < 2.8) c = mix(C.waterShallow, C.foam, r > 0.82 && dw < 2.6 ? 0.7 : 0.05);
				else if (dd < 5.5) c = mix(C.waterShallow, C.waterMid, (dd - 2.8) / 2.7);
				else if (dd < 10) c = mix(C.waterMid, C.waterDeep, (dd - 5.5) / 4.5);
				else c = C.waterDeep;
				const rim = dw > outline - 1.5;
				if (rim) c = C.waterEdge;
				const top = rim ? SEA_TOP - 2 : SEA_TOP - 1;
				const surface = shade(c, 0.97 + r * 0.06);
				const side = shade(c, 0.75);
				grid.box(x, 0, z, x, top, z, (_, y) => (y === top ? surface : side), Mat.Water);
				tops[i] = top;
				continue;
			}
			const hx = board.hexes[col.hex];
			const hs = seed + col.hex * 101;
			if (col.edge < 1.05) {
				const c = pick(C.border, r);
				grid.box(x, 0, z, x, BORDER_TOP - 1, z, (_, y) => (y === BORDER_TOP - 1 ? c : y > BORDER_TOP - 4 ? shade(c, 0.86) : pick(C.dirt, r)));
				tops[i] = BORDER_TOP - 1;
				continue;
			}
			tops[i] = terrainColumn(grid, hx.terrain, x, z, col, hs, r);
		}
	}

	const ground = tops.slice();
	/** Feature spots keep clear of tile edges and corners, so roads and settlements stay visible. */
	const clear = (lx: number, lz: number, edge: number) => hexEdgeDistance(lx, lz) > edge && cornerDistance(lx, lz) > 6;

	// ---- features
	const sheepSpots: BoardBuild['sheepSpots'] = [];
	const tokenY: number[] = [];
	board.hexes.forEach((hx, h) => {
		const cx = centers[h].x;
		const cz = centers[h].z;
		const hs = seed + h * 101;
		const at = (lx: number, lz: number) => [Math.floor(cx + lx), Math.floor(cz + lz)] as const;
		switch (hx.terrain) {
			case 'forest': {
				const spots = scatter(hs, 64, 3.3, (lx, lz) => clear(lx, lz, 3.1) && Math.hypot(lx, lz) > 8.2);
				spots.forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					const base = topAt(x, z) + 1;
					const r = hash3(k, 1, h, seed);
					if (r < 0.78) pineTree(grid, x, base, z, hs + k, raise);
					else roundTree(grid, x, base, z, hs + k, raise);
				});
				break;
			}
			case 'pasture': {
				const spots = scatter(hs, 14, 5, (lx, lz) => clear(lx, lz, 3) && Math.hypot(lx, lz) > 6.5);
				spots.slice(0, 5).forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					bush(grid, x, topAt(x, z) + 1, z, hs + k, raise);
				});
				for (const [lx, lz] of spots.slice(5, 10)) sheepSpots.push({ hex: h, x: (cx + lx) * VOXEL, z: (cz + lz) * VOXEL });
				break;
			}
			case 'fields': {
				const spots = scatter(hs, 3, 8, (lx, lz) => clear(lx, lz, 4) && Math.hypot(lx, lz) > 8);
				spots.slice(0, 1).forEach(([lx, lz]) => {
					const [x, z] = at(lx, lz);
					hayBale(grid, x, G, z, raise);
				});
				break;
			}
			case 'hills': {
				const spots = scatter(hs, 6, 5, (lx, lz) => clear(lx, lz, 3) && Math.hypot(lx, lz) > 6);
				spots.slice(0, 3).forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					brickStack(grid, x, topAt(x, z) + 1, z, hs + k, raise);
				});
				break;
			}
			case 'desert': {
				const spots = scatter(hs, 10, 4, (lx, lz) => clear(lx, lz, 3) && Math.hypot(lx, lz) > 7.5);
				spots.slice(0, 3).forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					cactus(grid, x, topAt(x, z) + 1, z, hs + k, raise);
				});
				spots.slice(3, 8).forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					pebble(grid, x, topAt(x, z) + 1, z, hs + k * 7, raise);
				});
				break;
			}
		}
		// Number tokens sit on the highest ground near the center.
		let ty = 0;
		for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) ty = Math.max(ty, topAt(cx + dx, cz + dz) + 1);
		tokenY.push(ty * VOXEL + (hx.terrain === 'forest' ? 1.4 : 0.5));
	});

	// ---- harbors: two piers from the tile corners out to a round landing
	const ports: PortSpot[] = topo.portEdges.map((p) => {
		const e = topo.edges[p.edge];
		const a = topo.vertices[e.a];
		const b = topo.vertices[e.b];
		const out = e.outward!;
		const k = HEX_R / VOXEL;
		const mx = ((a.x + b.x) / 2) * k;
		const mz = ((a.z + b.z) / 2) * k;
		const px = mx + out.x * 14;
		const pz = mz + out.z * 14;
		for (const v of [a, b]) pier(grid, v.x * k + out.x * 1.5, v.z * k + out.z * 1.5, px, pz, seed);
		for (let dz = -5; dz <= 5; dz++)
			for (let dx = -5; dx <= 5; dx++) {
				if (dx * dx + dz * dz > 22) continue;
				const x = Math.floor(px + dx);
				const z = Math.floor(pz + dz);
				const ring = dx * dx + dz * dz > 14;
				grid.set(x, WATER_DECK, z, ring ? shade(pick(C.plank, hash3(x, 3, z, seed)), 0.82) : pick(C.plank, hash3(x, 3, z, seed)));
			}
		for (const [dx, dz] of [
			[-4, -4],
			[3, -4],
			[-4, 3],
			[3, 3]
		]) {
			const x = Math.floor(px + dx);
			const z = Math.floor(pz + dz);
			grid.box(x, 0, z, x, WATER_DECK + 1, z, C.post);
		}
		return { x: px * VOXEL, z: pz * VOXEL, angle: Math.atan2(out.x, out.z), kind: p.kind, ratio: p.kind === 'any' ? 3 : 2 };
	});

	const geos = meshGrid(grid, { jitter: 0.06 });
	const group = meshesFor(geos, VOXEL, {
		[Mat.Solid]: { tileGray: true },
		[Mat.Sway]: { swayBase: G, roughness: 0.7, tileGray: true },
		[Mat.Water]: { roughness: 0.22, bevel: 0.35 }
	});
	sharedUniforms.uGrayVoxel.value = VOXEL;
	group.name = 'board';

	const surfaceY = (x: number, z: number) => {
		const t = topAt(x / VOXEL, z / VOXEL);
		return t >= 0 ? (t + 1) * VOXEL : 0;
	};

	const groundY = (x: number, z: number) => {
		const ix = Math.floor(x / VOXEL) + HALF;
		const iz = Math.floor(z / VOXEL) + HALF;
		if (ix >= 0 && iz >= 0 && ix < W && iz < D && ground[ix + iz * W] >= 0) return (ground[ix + iz * W] + 1) * VOXEL;
		return surfaceY(x, z);
	};

	return {
		group,
		tokenY,
		sheepSpots,
		ports,
		surfaceY,
		groundY,
		dispose: () => group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
	};
}

/** Plank deck voxel for piers, level with the dry sand and a step above the water. */
const WATER_DECK = G - 3;
/** World y of the top of a pier deck. */
export const DECK_TOP = (WATER_DECK + 1) * VOXEL;

function distanceField(land: Uint8Array, W: number, D: number) {
	const dist = new Float32Array(W * D).fill(1e9);
	for (let i = 0; i < W * D; i++) if (land[i]) dist[i] = 0;
	const relax = (i: number, j: number, w: number) => {
		if (dist[j] + w < dist[i]) dist[i] = dist[j] + w;
	};
	for (let iz = 0; iz < D; iz++)
		for (let ix = 0; ix < W; ix++) {
			const i = ix + iz * W;
			if (ix > 0) relax(i, i - 1, 1);
			if (iz > 0) relax(i, i - W, 1);
			if (ix > 0 && iz > 0) relax(i, i - W - 1, 1.414);
			if (ix < W - 1 && iz > 0) relax(i, i - W + 1, 1.414);
		}
	for (let iz = D - 1; iz >= 0; iz--)
		for (let ix = W - 1; ix >= 0; ix--) {
			const i = ix + iz * W;
			if (ix < W - 1) relax(i, i + 1, 1);
			if (iz < D - 1) relax(i, i + W, 1);
			if (ix < W - 1 && iz < D - 1) relax(i, i + W + 1, 1.414);
			if (ix > 0 && iz < D - 1) relax(i, i + W - 1, 1.414);
		}
	return dist;
}

// ---------------------------------------------------------------- terrain columns

/** Peak heights and radii (voxels) for the three summits round a mountain tile. */
const MOUNTAIN_PEAKS = [
	{ h: 19, r: 8 },
	{ h: 16, r: 7 },
	{ h: 13, r: 6 }
];

/** Fills one column and returns the y of its top voxel. */
function terrainColumn(grid: VoxelGrid, terrain: Terrain, x: number, z: number, col: Col, hs: number, r: number): number {
	const fill = (topY: number, topColor: number, mat: Mat = Mat.Solid) => {
		grid.box(x, 0, z, x, topY - 1, z, (_, y) => (y >= topY - 2 ? shade(topColor, 0.72) : pick(C.dirt, r)));
		grid.set(x, topY, z, topColor, mat);
		return topY;
	};
	const center = Math.hypot(col.lx, col.lz);
	const edgeFade = Math.min(1, Math.max(0, (col.edge - 1.1) / 4));
	/** Tall ground fades out near the corners, so settlements and cities stand on the flat. */
	const cornerFade = Math.min(1, Math.max(0, (col.corner - 4) / 3));
	const g = G - 1;
	switch (terrain) {
		case 'forest': {
			const bump = fbm(x * 0.09, z * 0.09, hs) > 0.6 ? 1 : 0;
			const c = r > 0.9 ? pick(C.bush, hash3(x, 9, z, hs)) : pick(C.forestFloor, r);
			return fill(g + bump * (edgeFade > 0.5 ? 1 : 0), c);
		}
		case 'pasture': {
			const n = fbm(x * 0.07, z * 0.07, hs);
			const bump = n > 0.62 && edgeFade > 0.6 ? 1 : 0;
			const c = mix(pick(C.grass, r), C.grassHi[0], Math.max(0, n - 0.45) * 0.9);
			const top = fill(g + bump, c);
			if (center > 5.5 && col.edge > 2 && col.corner > 4.5) {
				if (r > 0.982) {
					grid.set(x, top + 1, z, pick(C.flower, hash3(x, 5, z, hs)));
					return top + 1;
				}
				if (r > 0.94) {
					grid.set(x, top + 1, z, pick(C.grassHi, hash3(x, 6, z, hs)), Mat.Sway);
					return top + 1;
				}
			}
			return top;
		}
		case 'fields': {
			fill(g - 1, pick(C.soil, r));
			// Rows of stalks run diagonally; every fourth row is a furrow.
			const row = Math.floor((x * 0.6 + z * 0.8) / 1.25);
			const furrow = ((row % 4) + 4) % 4 === 0;
			if (center < 4.6 || col.edge < 1.9 || col.corner < 3.5 || furrow) {
				grid.set(x, g, z, pick(C.soil, hash3(x, 1, z, hs)));
				return g;
			}
			const n = fbm(x * 0.15, z * 0.15, hs + 3);
			let h = 2 + Math.round(n * 2.4 + r * 1.2);
			h = Math.max(1, Math.round(h * Math.min(1, edgeFade + 0.4, (col.corner - 3) / 3)));
			for (let k = 0; k < h; k++) {
				const top = k === h - 1;
				const c = top ? pick(C.wheatTip, hash3(x, k, z, hs)) : C.wheat[Math.min(4, Math.floor(((k + 1) / h) * 4))];
				grid.set(x, g + k, z, c, Mat.Sway);
			}
			return g + h - 1;
		}
		case 'hills': {
			const n = fbm(x * 0.075, z * 0.075, hs, 3);
			const m = fbm(x * 0.2, z * 0.2, hs + 9, 2);
			let h = Math.max(0, Math.round(((n - 0.36) * 13 + (m - 0.5) * 2) * edgeFade * cornerFade));
			if (center < 4.8) h = Math.min(h, 1);
			const top = g + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				if (y === top) return h > 2 && hash3(x, y, z, hs) > 0.6 ? pick(C.clayHi, r) : pick(C.clay, r);
				if (y > g - 2) return pick(C.clayDark.concat(C.clay), hash3(x, y, z, hs));
				return pick(C.dirt, r);
			});
			return top;
		}
		case 'mountains': {
			// A rocky massif with a flat ledge in the middle for the number token and a ring of
			// stepped peaks around it. The peaks stand back far enough, and low enough, that the
			// token stays in sight from every side down to a fairly low camera.
			const ledge = 8;
			const spin = hash3(hs, 7, 7) * Math.PI * 2;
			let h = ledge * Math.min(1, Math.max(0, 1 - (center - 5) / 9));
			for (let k = 0; k < 3; k++) {
				const a = spin + (k * Math.PI * 2) / 3 + (hash3(hs, k, 11) - 0.5) * 0.6;
				const d = 11.5 + hash3(hs, k, 12);
				const peak = MOUNTAIN_PEAKS[(k + Math.floor(hash3(hs, 13, 13) * 3)) % 3];
				const dist = Math.hypot(col.lx - Math.cos(a) * d, col.lz - Math.sin(a) * d);
				h = Math.max(h, peak.h * Math.pow(Math.max(0, 1 - dist / peak.r), 1.05));
			}
			h += (fbm(x * 0.22, z * 0.22, hs) - 0.5) * 2;
			h *= Math.min(1, Math.max(0, (col.edge - 1) / 3)) * cornerFade;
			if (center < 5) h = ledge;
			h = Math.max(0, Math.floor(h));
			// Terraces: snap the slopes to two-voxel steps away from the summits.
			if (h > 3 && h < 14) h = h - (h % 2);
			const top = g + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				const rh = hash3(x, y, z, hs);
				const rel = y - g;
				if (rel >= 15 + (rh > 0.5 ? 1 : 0)) return pick(C.snow, rh);
				if (y === top && rel >= 12 && rh > 0.35) return pick(C.snow, rh);
				if (rh > 0.975 && rel > 1) return pick(C.ore, rh);
				if (y === top) return rel > 1 ? pick(C.rockHi.concat(C.rock), rh) : pick(C.rock, rh);
				if (rh > 0.78) return pick(C.rockDark, rh);
				return y < g - 1 ? pick(C.dirt, r) : pick(C.rock, rh);
			});
			return top;
		}
		case 'desert': {
			const ring = Math.floor(center / 2.2) % 2 === 0;
			const dune = fbm(x * 0.08, z * 0.08, hs) > 0.62 && center > 8 && edgeFade > 0.5 ? 1 : 0;
			const c = pick(C.sand, r);
			return fill(g + dune, ring && center < 15 ? shade(c, 0.9) : c);
		}
	}
}

// ---------------------------------------------------------------- features

type Raise = (x: number, z: number, y: number) => void;

function scatter(seed: number, count: number, minDist: number, ok: (x: number, z: number) => boolean) {
	const out: [number, number][] = [];
	for (let i = 0; i < 900 && out.length < count; i++) {
		const x = (hash3(i, 1, 2, seed) - 0.5) * RV * 2;
		const z = (hash3(i, 3, 4, seed) - 0.5) * RV * 2;
		if (!ok(x, z)) continue;
		if (out.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < minDist)) continue;
		out.push([x, z]);
	}
	return out;
}

function put(g: VoxelGrid, raise: Raise, x: number, y: number, z: number, c: number, mat: Mat = Mat.Solid) {
	g.set(x, y, z, c, mat);
	raise(x, z, y);
}

function pineTree(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const tall = hash3(s, 1, 1);
	const trunkH = 1 + (tall > 0.5 ? 1 : 0);
	for (let k = 0; k < trunkH; k++) put(g, raise, x, y + k, z, pick(C.trunk, hash3(x, y + k, z, s)));
	const height = 6 + Math.floor(tall * 4);
	const base = 1.45 + hash3(s, 2, 1) * 0.45;
	let yy = y + trunkH;
	for (let l = 0; l < height; l++) {
		const t = l / height;
		// Tiered cone: each tier of three layers starts wide and tapers.
		const rad = base * (1 - t * 0.85) + (2 - (l % 3)) * 0.3;
		for (let dz = -3; dz <= 3; dz++)
			for (let dx = -3; dx <= 3; dx++) {
				const d = Math.hypot(dx, dz);
				if (d > rad) continue;
				const rr = hash3(x + dx, yy, z + dz, s);
				const lit = dx - dz < -0.5 && d > rad - 1.1;
				const c = lit && rr > 0.35 ? pick(C.pineHi, rr) : pick(C.pine, rr);
				put(g, raise, x + dx, yy, z + dz, c);
			}
		yy++;
	}
	put(g, raise, x, yy, z, pick(C.pineHi, hash3(s, 3, 3)));
}

function roundTree(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const trunkH = 2;
	for (let k = 0; k < trunkH; k++) put(g, raise, x, y + k, z, pick(C.trunk, hash3(x, y + k, z, s)));
	const rad = 2.1 + hash3(s, 2, 2) * 0.6;
	const cy = y + trunkH + rad - 0.4;
	for (let dy = -3; dy <= 3; dy++)
		for (let dz = -3; dz <= 3; dz++)
			for (let dx = -3; dx <= 3; dx++) {
				const d = Math.hypot(dx, dy * 1.1, dz);
				if (d > rad) continue;
				const yy = Math.round(cy + dy);
				const rr = hash3(x + dx, yy, z + dz, s);
				const c = dy >= 1 && rr > 0.3 ? pick(C.leafHi, rr) : dy <= -1 ? shade(pick(C.leaf, rr), 0.82) : pick(C.leaf, rr);
				put(g, raise, x + dx, yy, z + dz, c);
			}
}

function bush(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	for (let dz = -1; dz <= 1; dz++)
		for (let dx = -1; dx <= 1; dx++) {
			if (Math.abs(dx) + Math.abs(dz) > 1 && hash3(dx, dz, 2, s) > 0.5) continue;
			put(g, raise, x + dx, y, z + dz, pick(C.bush, hash3(x + dx, y, z + dz, s)));
			if (Math.abs(dx) + Math.abs(dz) <= 1 && hash3(dx, dz, 1, s) > 0.3) put(g, raise, x + dx, y + 1, z + dz, shade(pick(C.bush, hash3(dx, 1, dz, s)), 1.18));
		}
}

function hayBale(g: VoxelGrid, x: number, y: number, z: number, raise: Raise) {
	for (let dz = 0; dz <= 2; dz++)
		for (let dx = 0; dx <= 3; dx++)
			for (let dy = 0; dy <= 2; dy++) {
				if ((dz === 0 || dz === 2) && dy === 2) continue;
				const band = dx === 1 || dx === 2;
				put(g, raise, x + dx, y + dy, z + dz, band && dy === 2 ? hex('#c9952f') : dy === 2 || dz === 1 ? hex('#f6d465') : hex('#e6bb4a'));
			}
}

function brickStack(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const h = 2 + Math.floor(hash3(s, 9, 9) * 2);
	for (let dy = 0; dy < h; dy++)
		for (let dz = 0; dz <= 1; dz++)
			for (let dx = 0; dx <= 3; dx++) {
				if (dy === h - 1 && dx === 3) continue;
				const joint = (dx + (dy % 2) * 2) % 4 === 0 && dz === 0;
				put(g, raise, x + dx, y + dy, z + dz, joint ? C.mortar : pick(C.brick, hash3(x + dx, y + dy, z + dz, s)));
			}
}

function cactus(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	const h = 4 + Math.floor(hash3(s, 1, 5) * 3);
	for (let k = 0; k < h; k++) put(g, raise, x, y + k, z, pick(C.cactus, hash3(x, y + k, z, s)));
	const dir = hash3(s, 2, 5) > 0.5 ? 1 : -1;
	put(g, raise, x + dir, y + 2, z, C.cactus[0]);
	put(g, raise, x + dir, y + 3, z, C.cactus[1]);
	if (h > 4) {
		put(g, raise, x - dir, y + 1, z, C.cactus[1]);
		put(g, raise, x - dir, y + 2, z, C.cactus[0]);
	}
	put(g, raise, x, y + h, z, hex('#ff8fb4'));
}

function pebble(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise) {
	put(g, raise, x, y, z, pick(C.rock, hash3(s, 1, 1)));
	if (hash3(s, 2, 2) > 0.5) put(g, raise, x + 1, y, z, pick(C.rockDark, hash3(s, 3, 3)));
}

function pier(g: VoxelGrid, x0: number, z0: number, x1: number, z1: number, seed: number) {
	const len = Math.hypot(x1 - x0, z1 - z0);
	const nx = -(z1 - z0) / len;
	const nz = (x1 - x0) / len;
	for (let t = 0; t <= len; t += 0.35) {
		const x = x0 + ((x1 - x0) * t) / len;
		const z = z0 + ((z1 - z0) * t) / len;
		const plankIdx = Math.floor(t / 1.6);
		for (const w of [-1, 0, 1]) {
			const px = Math.floor(x + nx * w);
			const pz = Math.floor(z + nz * w);
			const c = pick(C.plank, hash3(plankIdx, 0, 0, seed + Math.floor(x0)));
			g.set(px, WATER_DECK, pz, w === 0 ? c : shade(c, 0.9));
		}
	}
}
