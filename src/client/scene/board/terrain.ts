import * as THREE from 'three';
import { type Axial, hexKey, worldToHex } from '../../../shared/board/hex';
import { type Board, getTopology } from '../../../shared/board/topology';
import { TERRAIN_RESOURCE, type Terrain } from '../../../shared/rules/config';
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
 * Sizes, heights and distances below are in VOXEL units (0.6 world). With `detail` 2 each
 * of those is built from 2×2×2 voxels half the size: the same island with finer grain,
 * smoother slopes and rounder trees. Grid coordinates are voxels; world = voxel * VOXEL / detail.
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

/** Grid half-extent in voxels (land, beaches, piers and the sea) for the classic island; bigger maps get more. */
const HALF = 140;

/** World distance from the center to the island's furthest land. */
export function islandReach(board: Board): number {
	const topo = getTopology(board);
	return Math.max(...topo.hexes.map((t) => Math.hypot(t.x, t.z))) * HEX_R + HEX_R;
}
const MAX_Y = 36;

export interface PortSpot {
	x: number;
	z: number;
	/** Angle (radians, around Y) of the outward direction. */
	angle: number;
	kind: string;
	ratio: number;
	/** The coastal edge the harbor serves; a building on either end holds it. */
	edge: number;
}

/** A flat, clear patch inside a tile where a Reign Extended workshop can stand. */
export interface TilePlot {
	/** World position of its center. */
	x: number;
	z: number;
	/** Direction from the tile's center out to the plot (radians; x = cos, z = sin). */
	angle: number;
}

export interface BoardBuild {
	group: THREE.Group;
	/** World y of the surface at the hex center, where its number token sits. */
	tokenY: number[];
	sheepSpots: { hex: number; x: number; z: number }[];
	ports: PortSpot[];
	/** Per hex: its workshop plot, when the island was built with them (null on the desert). */
	plots: (TilePlot | null)[];
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
	/** Distance to the center of the tile's workshop plot (Infinity without one). */
	plot: number;
}

/** How far out from a tile's center its workshop plot lies, and its radius (VOXEL units). */
const PLOT_OUT = 12;
const PLOT_R = 4.6;

/** 1 outside a workshop plot, falling to 0 across its rim: tall ground flattens there. */
function plotFade(d: number) {
	return Math.min(1, Math.max(0, (d - PLOT_R) / 2.5));
}

/**
 * Where a tile's workshop plot lies (VOXEL units from its center): out towards the middle of a
 * side, clear of the robber's usual spot to the left of the token and of the corners, where
 * settlements stand. On mountains it takes the side that looks into the widest valley.
 */
function plotSpot(terrain: Terrain, hs: number) {
	let angle: number;
	if (terrain === 'mountains') {
		const peaks = mountainPeaks(hs).map((p) => p.a);
		let best = -Infinity;
		angle = 0;
		for (let k = 0; k < 6; k++) {
			const a = (k * Math.PI) / 3;
			const room = Math.min(...peaks.map((p) => Math.abs(Math.atan2(Math.sin(a - p), Math.cos(a - p)))));
			if (room > best) {
				best = room;
				angle = a;
			}
		}
	} else {
		const sides = [0, 60, 240, 300];
		angle = (sides[Math.floor(hash3(hs, 21, 21) * sides.length)] * Math.PI) / 180;
	}
	return { lx: Math.cos(angle) * PLOT_OUT, lz: Math.sin(angle) * PLOT_OUT, angle };
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

export function buildBoard(board: Board, seed: number, detail = 1, withPlots = false): BoardBuild {
	const S = detail;
	const vox = VOXEL / S;
	const topo = getTopology(board);
	// Room for the beach, the piers and the widest sea (24 world units) round the furthest land.
	const half = Math.max(HALF, Math.ceil((islandReach(board) + 28) / VOXEL)) * S;
	const grid = new VoxelGrid(half * 2, MAX_Y * S, half * 2, -half, 0, -half);
	const W = grid.nx;
	const D = grid.nz;
	const hexIndex = new Map<string, number>();
	board.hexes.forEach((h, i) => hexIndex.set(hexKey(h), i));
	const centers = topo.hexes.map((t) => ({ x: (t.x * HEX_R) / VOXEL, z: (t.z * HEX_R) / VOXEL }));
	// Reign Extended workshops stand on a plot inside their tile, kept flat and clear of trees,
	// crops and sheep. Without workshops the island is built exactly as before.
	const plots = board.hexes.map((hx, h) => (withPlots && TERRAIN_RESOURCE[hx.terrain] ? plotSpot(hx.terrain, seed + h * 101) : null));
	/** Whether a feature at (lx, lz) on tile h keeps `margin` away from the tile's plot. */
	const offPlot = (h: number, lx: number, lz: number, margin: number) => {
		const p = plots[h];
		return !p || Math.hypot(lx - p.lx, lz - p.lz) > PLOT_R + margin;
	};

	// ---- classify columns
	const cols: (Col | null)[] = new Array(W * D).fill(null);
	const land = new Uint8Array(W * D);
	for (let iz = 0; iz < D; iz++) {
		for (let ix = 0; ix < W; ix++) {
			const x = ix - half + 0.5;
			const z = iz - half + 0.5;
			const ax: Axial = worldToHex((x * vox) / HEX_R, (z * vox) / HEX_R);
			const h = hexIndex.get(hexKey(ax));
			if (h === undefined) continue;
			const lx = x / S - centers[h].x;
			const lz = z / S - centers[h].z;
			const p = plots[h];
			const plot = p ? Math.hypot(lx - p.lx, lz - p.lz) : Infinity;
			cols[ix + iz * W] = { hex: h, lx, lz, edge: hexEdgeDistance(lx, lz), corner: cornerDistance(lx, lz), plot };
			land[ix + iz * W] = 1;
		}
	}

	const dist = distanceField(land, W, D);
	const tops = new Int16Array(W * D).fill(-1);
	const topAt = (x: number, z: number) => {
		const ix = Math.floor(x) + half;
		const iz = Math.floor(z) + half;
		if (ix < 0 || iz < 0 || ix >= W || iz >= D) return -1;
		return tops[ix + iz * W];
	};
	const raise = (x: number, z: number, y: number) => {
		const ix = Math.floor(x) + half;
		const iz = Math.floor(z) + half;
		if (ix < 0 || iz < 0 || ix >= W || iz >= D) return;
		const i = ix + iz * W;
		if (y > tops[i]) tops[i] = y;
	};

	// ---- per-column ground: tiles, borders, beaches
	for (let iz = 0; iz < D; iz++) {
		for (let ix = 0; ix < W; ix++) {
			const x = ix - half;
			const z = iz - half;
			const i = ix + iz * W;
			const r = hash3(x, 0, z, seed);
			const col = cols[i];
			if (!col) {
				const d = dist[i] / S;
				// Sand rim around the coast, a step lower where it meets the water.
				const beach = 1.6 + (noise2((x / S) * 0.18, (z / S) * 0.18, seed + 5) - 0.5) * 1.2;
				if (d < beach) {
					const top = d < beach - 0.9 ? G - 2 : G - 3;
					const c = top === G - 2 ? pick(C.sand, r) : pick(C.wetSand, r);
					grid.box(x, 0, z, x, top * S - 1, z, (_, y) => (y >= (top - 1) * S ? c : pick(C.dirt, r)));
					tops[i] = top * S - 1;
					continue;
				}
				// The sea, in world units: an irregular outline, turquoise shallows with a little
				// foam, deepening blue, and a darker rim a step lower at the edge.
				const wx = x * vox;
				const wz = z * vox;
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
				const top = (rim ? SEA_TOP - 1 : SEA_TOP) * S - 1;
				const surface = shade(c, 0.97 + r * 0.06);
				const side = shade(c, 0.75);
				grid.box(x, 0, z, x, top, z, (_, y) => (y > top - S ? surface : side), Mat.Water);
				tops[i] = top;
				continue;
			}
			const hx = board.hexes[col.hex];
			const hs = seed + col.hex * 101;
			if (col.edge < 1.05) {
				const c = pick(C.border, r);
				const top = BORDER_TOP * S - 1;
				grid.box(x, 0, z, x, top, z, (_, y) => (y > top - S ? c : y > top - 3 * S ? shade(c, 0.86) : pick(C.dirt, r)));
				tops[i] = top;
				continue;
			}
			tops[i] = terrainColumn(grid, hx.terrain, x, z, col, hs, r, S);
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
		const at = (lx: number, lz: number) => [Math.floor((cx + lx) * S), Math.floor((cz + lz) * S)] as const;
		switch (hx.terrain) {
			case 'forest': {
				const spots = scatter(hs, 64, 3.3, (lx, lz) => clear(lx, lz, 3.1) && Math.hypot(lx, lz) > 8.2 && offPlot(h, lx, lz, 2.5));
				spots.forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					const base = topAt(x, z) + 1;
					const r = hash3(k, 1, h, seed);
					if (r < 0.78) pineTree(grid, x, base, z, hs + k, raise, S);
					else roundTree(grid, x, base, z, hs + k, raise, S);
				});
				break;
			}
			case 'pasture': {
				const spots = scatter(hs, 14, 5, (lx, lz) => clear(lx, lz, 3) && Math.hypot(lx, lz) > 6.5 && offPlot(h, lx, lz, 2));
				spots.slice(0, 5).forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					bush(grid, x, topAt(x, z) + 1, z, hs + k, raise, S);
				});
				// Sheep wander a little way from home, so theirs keep further off a plot.
				for (const [lx, lz] of spots.slice(5, 10)) {
					if (offPlot(h, lx, lz, 6)) sheepSpots.push({ hex: h, x: (cx + lx) * VOXEL, z: (cz + lz) * VOXEL });
				}
				break;
			}
			case 'fields': {
				const spots = scatter(hs, 3, 8, (lx, lz) => clear(lx, lz, 4) && Math.hypot(lx, lz) > 8 && offPlot(h, lx, lz, 3));
				spots.slice(0, 1).forEach(([lx, lz]) => {
					const [x, z] = at(lx, lz);
					hayBale(grid, x, G * S, z, raise, S);
				});
				break;
			}
			case 'hills': {
				const spots = scatter(hs, 6, 5, (lx, lz) => clear(lx, lz, 3) && Math.hypot(lx, lz) > 6 && offPlot(h, lx, lz, 2));
				spots.slice(0, 3).forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					brickStack(grid, x, topAt(x, z) + 1, z, hs + k, raise, S);
				});
				break;
			}
			case 'desert': {
				const spots = scatter(hs, 10, 4, (lx, lz) => clear(lx, lz, 3) && Math.hypot(lx, lz) > 7.5);
				spots.slice(0, 3).forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					cactus(grid, x, topAt(x, z) + 1, z, hs + k, raise, S);
				});
				spots.slice(3, 8).forEach(([lx, lz], k) => {
					const [x, z] = at(lx, lz);
					pebble(grid, x, topAt(x, z) + 1, z, hs + k * 7, raise, S);
				});
				break;
			}
		}
		// Number tokens sit on the highest ground near the center.
		let ty = 0;
		for (let dz = -3 * S; dz <= 3 * S; dz++) for (let dx = -3 * S; dx <= 3 * S; dx++) ty = Math.max(ty, topAt(cx * S + dx, cz * S + dz) + 1);
		tokenY.push(ty * vox + (hx.terrain === 'forest' ? 1.4 : 0.5));
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
		for (const v of [a, b]) pier(grid, v.x * k + out.x * 1.5, v.z * k + out.z * 1.5, px, pz, seed, S);
		const deck = (WATER_DECK + 1) * S - 1;
		for (let dz = -5 * S; dz <= 5 * S; dz++)
			for (let dx = -5 * S; dx <= 5 * S; dx++) {
				const d2 = (dx * dx + dz * dz) / (S * S);
				if (d2 > 22) continue;
				const x = Math.floor(px * S + dx);
				const z = Math.floor(pz * S + dz);
				const ring = d2 > 14;
				grid.set(x, deck, z, ring ? shade(pick(C.plank, hash3(x, 3, z, seed)), 0.82) : pick(C.plank, hash3(x, 3, z, seed)));
			}
		for (const [dx, dz] of [
			[-4, -4],
			[3, -4],
			[-4, 3],
			[3, 3]
		]) {
			const x = Math.floor((px + dx) * S);
			const z = Math.floor((pz + dz) * S);
			grid.box(x, 0, z, x + S - 1, (WATER_DECK + 2) * S - 1, z + S - 1, C.post);
		}
		return { x: px * VOXEL, z: pz * VOXEL, angle: Math.atan2(out.x, out.z), kind: p.kind, ratio: p.kind === 'any' ? 3 : 2, edge: p.edge };
	});

	// The board lies on the table, so the faces underneath it are never seen.
	const geos = meshGrid(grid, { jitter: 0.06, skipFloor: true });
	const aa = S > 1;
	const group = meshesFor(geos, vox, {
		[Mat.Solid]: { tileGray: true, antialias: aa },
		[Mat.Sway]: { swayBase: G * S, swayScale: S, roughness: 0.7, tileGray: true, antialias: aa },
		[Mat.Water]: { roughness: 0.22, bevel: 0.35, antialias: aa }
	});
	sharedUniforms.uGrayVoxel.value = vox;
	group.name = 'board';

	const surfaceY = (x: number, z: number) => {
		const t = topAt(x / vox, z / vox);
		return t >= 0 ? (t + 1) * vox : 0;
	};

	const groundY = (x: number, z: number) => {
		const ix = Math.floor(x / vox) + half;
		const iz = Math.floor(z / vox) + half;
		if (ix >= 0 && iz >= 0 && ix < W && iz < D && ground[ix + iz * W] >= 0) return (ground[ix + iz * W] + 1) * vox;
		return surfaceY(x, z);
	};

	return {
		group,
		tokenY,
		sheepSpots,
		ports,
		plots: plots.map((p, h) => (p ? { x: (centers[h].x + p.lx) * VOXEL, z: (centers[h].z + p.lz) * VOXEL, angle: p.angle } : null)),
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

/** A mountain tile's three peaks: direction and distance from its center, and their size. */
function mountainPeaks(hs: number) {
	const spin = hash3(hs, 7, 7) * Math.PI * 2;
	return [0, 1, 2].map((k) => ({
		a: spin + (k * Math.PI * 2) / 3 + (hash3(hs, k, 11) - 0.5) * 0.6,
		d: 11.5 + hash3(hs, k, 12),
		peak: MOUNTAIN_PEAKS[(k + Math.floor(hash3(hs, 13, 13) * 3)) % 3]
	}));
}

/**
 * Fills one column and returns the y of its top voxel. `x`, `z` and heights are in grid voxels;
 * noise, distances and layer depths are in VOXEL units, so every detail gives the same island.
 */
function terrainColumn(grid: VoxelGrid, terrain: Terrain, x: number, z: number, col: Col, hs: number, r: number, S: number): number {
	/** The top voxel of a VOXEL-sized layer. */
	const layerTop = (y: number) => (y + 1) * S - 1;
	const fill = (top: number, topColor: number, mat: Mat = Mat.Solid) => {
		grid.box(x, 0, z, x, top - S, z, (_, y) => (y > top - 3 * S ? shade(topColor, 0.72) : pick(C.dirt, r)));
		for (let y = top - S + 1; y <= top; y++) grid.set(x, y, z, topColor, mat);
		return top;
	};
	const X = x / S;
	const Z = z / S;
	const center = Math.hypot(col.lx, col.lz);
	const edgeFade = Math.min(1, Math.max(0, (col.edge - 1.1) / 4));
	/** Tall ground fades out near the corners, so settlements and cities stand on the flat. */
	const cornerFade = Math.min(1, Math.max(0, (col.corner - 4) / 3));
	const g = G - 1;
	/** Top voxel of the flat land. */
	const gt = layerTop(g);
	switch (terrain) {
		case 'forest': {
			const bump = fbm(X * 0.09, Z * 0.09, hs) > 0.6 && col.plot > PLOT_R + 1 ? 1 : 0;
			const c = r > 0.9 ? pick(C.bush, hash3(x, 9, z, hs)) : pick(C.forestFloor, r);
			return fill(layerTop(g + bump * (edgeFade > 0.5 ? 1 : 0)), c);
		}
		case 'pasture': {
			const n = fbm(X * 0.07, Z * 0.07, hs);
			const bump = n > 0.62 && edgeFade > 0.6 && col.plot > PLOT_R + 1 ? 1 : 0;
			const c = mix(pick(C.grass, r), C.grassHi[0], Math.max(0, n - 0.45) * 0.9);
			const top = fill(layerTop(g + bump), c);
			if (center > 5.5 && col.edge > 2 && col.corner > 4.5 && col.plot > PLOT_R + 0.5) {
				const blade = pick(C.grassHi, hash3(x, 6, z, hs));
				if (r > 0.982) {
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
				if (r > 0.94) {
					// Grass tufts, up to a VOXEL tall where the voxels are small.
					const h = 1 + Math.floor(hash3(x, 7, z, hs) * S);
					for (let k = 1; k <= h; k++) grid.set(x, top + k, z, blade, Mat.Sway);
					return top + h;
				}
			}
			return top;
		}
		case 'fields': {
			fill(layerTop(g - 1), pick(C.soil, r));
			// Rows of stalks run diagonally; every fourth row is a furrow.
			const row = Math.floor((X * 0.6 + Z * 0.8) / 1.25);
			const furrow = ((row % 4) + 4) % 4 === 0;
			if (center < 4.6 || col.edge < 1.9 || col.corner < 3.5 || furrow || col.plot < PLOT_R + r * 0.8) {
				const c = pick(C.soil, hash3(x, 1, z, hs));
				for (let y = g * S; y <= gt; y++) grid.set(x, y, z, c);
				return gt;
			}
			const n = fbm(X * 0.15, Z * 0.15, hs + 3);
			let h = 2 * S + Math.round((n * 2.4 + r * 1.2) * S);
			h = Math.max(1, Math.round(h * Math.min(1, edgeFade + 0.4, (col.corner - 3) / 3)));
			for (let k = 0; k < h; k++) {
				const top = k >= h - S;
				const c = top ? pick(C.wheatTip, hash3(x, k, z, hs)) : C.wheat[Math.min(4, Math.floor(((k + 1) / h) * 4))];
				grid.set(x, g * S + k, z, c, Mat.Sway);
			}
			return g * S + h - 1;
		}
		case 'hills': {
			const n = fbm(X * 0.075, Z * 0.075, hs, 3);
			const m = fbm(X * 0.2, Z * 0.2, hs + 9, 2);
			let h = Math.max(0, Math.round(((n - 0.36) * 13 + (m - 0.5) * 2) * edgeFade * cornerFade * plotFade(col.plot) * S));
			if (center < 4.8) h = Math.min(h, S);
			const top = gt + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				if (y > top - S) return h > 2 * S && hash3(x, y, z, hs) > 0.6 ? pick(C.clayHi, r) : pick(C.clay, r);
				if (y >= (g - 1) * S) return pick(C.clayDark.concat(C.clay), hash3(x, y, z, hs));
				return pick(C.dirt, r);
			});
			return top;
		}
		case 'mountains': {
			// A rocky massif with a flat ledge in the middle for the number token and a ring of
			// stepped peaks around it. The peaks stand back far enough, and low enough, that the
			// token stays in sight from every side down to a fairly low camera.
			const ledge = 8;
			let h = ledge * Math.min(1, Math.max(0, 1 - (center - 5) / 9));
			for (const { a, d, peak } of mountainPeaks(hs)) {
				const dist = Math.hypot(col.lx - Math.cos(a) * d, col.lz - Math.sin(a) * d);
				h = Math.max(h, peak.h * Math.pow(Math.max(0, 1 - dist / peak.r), 1.05));
			}
			h += (fbm(X * 0.22, Z * 0.22, hs) - 0.5) * 2;
			h *= Math.min(1, Math.max(0, (col.edge - 1) / 3)) * cornerFade * plotFade(col.plot);
			if (center < 5) h = ledge;
			h = Math.max(0, Math.floor(h * S));
			// Terraces: snap the slopes to two-voxel steps away from the summits.
			if (h > 3 * S && h < 14 * S) h = h - (h % 2);
			const top = gt + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				const rh = hash3(x, y, z, hs);
				const rel = (y - gt) / S;
				if (rel >= 15 + (rh > 0.5 ? 1 : 0)) return pick(C.snow, rh);
				if (y === top && rel >= 12 && rh > 0.35) return pick(C.snow, rh);
				if (rh > 0.975 && rel > 1) return pick(C.ore, rh);
				if (y === top) return rel > 1 ? pick(C.rockHi.concat(C.rock), rh) : pick(C.rock, rh);
				if (rh > 0.78) return pick(C.rockDark, rh);
				return y < (g - 1) * S ? pick(C.dirt, r) : pick(C.rock, rh);
			});
			return top;
		}
		case 'desert': {
			const ring = Math.floor(center / 2.2) % 2 === 0;
			const f = fbm(X * 0.08, Z * 0.08, hs);
			// Dunes, with a half step round their edge where the voxels are small enough.
			const dune = center > 8 && edgeFade > 0.5 ? (f > 0.62 ? S : f > 0.6 ? Math.floor(S / 2) : 0) : 0;
			const c = pick(C.sand, r);
			return fill(gt + dune, ring && center < 15 ? shade(c, 0.9) : c);
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

/**
 * The features are drawn at any detail S: `x`, `y`, `z` are grid voxels, while sizes and
 * distances are in VOXEL units (divide grid offsets by S), so finer grids round them off.
 */
function pineTree(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const tall = hash3(s, 1, 1);
	const trunkH = (1 + (tall > 0.5 ? 1 : 0)) * S;
	for (let k = 0; k < trunkH; k++) put(g, raise, x, y + k, z, pick(C.trunk, hash3(x, y + k, z, s)));
	const height = (6 + Math.floor(tall * 4)) * S;
	const base = 1.45 + hash3(s, 2, 1) * 0.45;
	const reach = 3 * S;
	let yy = y + trunkH;
	for (let l = 0; l < height; l++) {
		const t = l / height;
		// Tiered cone: each tier of three layers starts wide and tapers.
		const rad = base * (1 - t * 0.85) + (2 - ((l / S) % 3)) * 0.3;
		for (let dz = -reach; dz <= reach; dz++)
			for (let dx = -reach; dx <= reach; dx++) {
				const d = Math.hypot(dx, dz) / S;
				if (d > rad) continue;
				const rr = hash3(x + dx, yy, z + dz, s);
				const lit = (dx - dz) / S < -0.5 && d > rad - 1.1;
				const c = lit && rr > 0.35 ? pick(C.pineHi, rr) : pick(C.pine, rr);
				put(g, raise, x + dx, yy, z + dz, c);
			}
		yy++;
	}
	put(g, raise, x, yy, z, pick(C.pineHi, hash3(s, 3, 3)));
}

function roundTree(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const trunkH = 2 * S;
	for (let k = 0; k < trunkH; k++) put(g, raise, x, y + k, z, pick(C.trunk, hash3(x, y + k, z, s)));
	const rad = 2.1 + hash3(s, 2, 2) * 0.6;
	const cy = y + trunkH + rad * S - 0.4 * S;
	const reach = 3 * S;
	for (let dy = -reach; dy <= reach; dy++)
		for (let dz = -reach; dz <= reach; dz++)
			for (let dx = -reach; dx <= reach; dx++) {
				const d = Math.hypot(dx, dy * 1.1, dz) / S;
				if (d > rad) continue;
				const yy = Math.round(cy + dy);
				const rr = hash3(x + dx, yy, z + dz, s);
				const up = dy / S;
				const c = up >= 1 && rr > 0.3 ? pick(C.leafHi, rr) : up <= -1 ? shade(pick(C.leaf, rr), 0.82) : pick(C.leaf, rr);
				put(g, raise, x + dx, yy, z + dz, c);
			}
}

function bush(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	if (S > 1) {
		// Small voxels round the bush off into a lumpy mound, lighter on top.
		const lump = (dx: number, dz: number) => 0.25 * (hash3(Math.round((dx * 2) / S), Math.round((dz * 2) / S), 4, s) - 0.5);
		for (let dy = 0; dy < 2 * S; dy++)
			for (let dz = -2 * S; dz <= 2 * S; dz++)
				for (let dx = -2 * S; dx <= 2 * S; dx++) {
					const d = Math.hypot(dx / S / 1.55, dz / S / 1.55, (dy + 0.5) / S / 2) + lump(dx, dz);
					if (d > 1) continue;
					const above = Math.hypot(dx / S / 1.55, dz / S / 1.55, (dy + 1.5) / S / 2) + lump(dx, dz) > 1;
					const c = pick(C.bush, hash3(x + dx, y + dy, z + dz, s));
					put(g, raise, x + dx, y + dy, z + dz, above ? shade(c, 1.18) : c);
				}
		return;
	}
	for (let dz = -1; dz <= 1; dz++)
		for (let dx = -1; dx <= 1; dx++) {
			if (Math.abs(dx) + Math.abs(dz) > 1 && hash3(dx, dz, 2, s) > 0.5) continue;
			put(g, raise, x + dx, y, z + dz, pick(C.bush, hash3(x + dx, y, z + dz, s)));
			if (Math.abs(dx) + Math.abs(dz) <= 1 && hash3(dx, dz, 1, s) > 0.3) put(g, raise, x + dx, y + 1, z + dz, shade(pick(C.bush, hash3(dx, 1, dz, s)), 1.18));
		}
}

/**
 * Draws a VOXEL-sized block of a feature at (dx, dy, dz) VOXEL units from (x, y, z): one voxel
 * at detail 1, S×S×S smaller ones above that, each colored on its own for a finer grain.
 */
function block(g: VoxelGrid, raise: Raise, S: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, color: (x: number, y: number, z: number) => number) {
	for (let j = 0; j < S; j++)
		for (let k = 0; k < S; k++)
			for (let i = 0; i < S; i++) {
				const vx = x + dx * S + i;
				const vy = y + dy * S + j;
				const vz = z + dz * S + k;
				put(g, raise, vx, vy, vz, color(vx, vy, vz));
			}
}

function hayBale(g: VoxelGrid, x: number, y: number, z: number, raise: Raise, S: number) {
	for (let dz = 0; dz <= 2; dz++)
		for (let dx = 0; dx <= 3; dx++)
			for (let dy = 0; dy <= 2; dy++) {
				if ((dz === 0 || dz === 2) && dy === 2) continue;
				const band = dx === 1 || dx === 2;
				const c = band && dy === 2 ? hex('#c9952f') : dy === 2 || dz === 1 ? hex('#f6d465') : hex('#e6bb4a');
				block(g, raise, S, x, y, z, dx, dy, dz, (vx, vy, vz) => (S > 1 ? shade(c, 0.94 + hash3(vx, vy, vz, 17) * 0.12) : c));
			}
}

function brickStack(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const h = 2 + Math.floor(hash3(s, 9, 9) * 2);
	for (let dy = 0; dy < h; dy++)
		for (let dz = 0; dz <= 1; dz++)
			for (let dx = 0; dx <= 3; dx++) {
				if (dy === h - 1 && dx === 3) continue;
				const joint = (dx + (dy % 2) * 2) % 4 === 0 && dz === 0;
				block(g, raise, S, x, y, z, dx, dy, dz, (vx, vy, vz) => (joint ? C.mortar : pick(C.brick, hash3(vx, vy, vz, s))));
			}
}

function cactus(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	const h = 4 + Math.floor(hash3(s, 1, 5) * 3);
	const at = (dx: number, dy: number, color: (x: number, y: number, z: number) => number) => block(g, raise, S, x, y, z, dx, dy, 0, color);
	for (let k = 0; k < h; k++) at(0, k, (vx, vy, vz) => pick(C.cactus, hash3(vx, vy, vz, s)));
	const dir = hash3(s, 2, 5) > 0.5 ? 1 : -1;
	const arm = (c: number) => (vx: number, vy: number, vz: number) => (S > 1 ? pick(C.cactus, hash3(vx, vy, vz, s)) : c);
	at(dir, 2, arm(C.cactus[0]));
	at(dir, 3, arm(C.cactus[1]));
	if (h > 4) {
		at(-dir, 1, arm(C.cactus[1]));
		at(-dir, 2, arm(C.cactus[0]));
	}
	at(0, h, () => hex('#ff8fb4'));
}

function pebble(g: VoxelGrid, x: number, y: number, z: number, s: number, raise: Raise, S: number) {
	block(g, raise, S, x, y, z, 0, 0, 0, () => pick(C.rock, hash3(s, 1, 1)));
	if (hash3(s, 2, 2) > 0.5) block(g, raise, S, x, y, z, 1, 0, 0, () => pick(C.rockDark, hash3(s, 3, 3)));
}

function pier(g: VoxelGrid, x0: number, z0: number, x1: number, z1: number, seed: number, S: number) {
	const len = Math.hypot(x1 - x0, z1 - z0);
	const nx = -(z1 - z0) / len;
	const nz = (x1 - x0) / len;
	const deck = (WATER_DECK + 1) * S - 1;
	for (let t = 0; t <= len; t += 0.35 / S) {
		const x = x0 + ((x1 - x0) * t) / len;
		const z = z0 + ((z1 - z0) * t) / len;
		const plankIdx = Math.floor(t / 1.6);
		for (let wi = -S; wi <= S; wi++) {
			const w = wi / S;
			const px = Math.floor((x + nx * w) * S);
			const pz = Math.floor((z + nz * w) * S);
			const c = pick(C.plank, hash3(plankIdx, 0, 0, seed + Math.floor(x0)));
			g.set(px, deck, pz, Math.abs(w) < 1 ? c : shade(c, 0.9));
		}
	}
}
