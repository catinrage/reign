import * as THREE from 'three';
import { type Axial, hexKey, worldToHex } from '../../../shared/board/hex';
import { type Board, getTopology } from '../../../shared/board/topology';
import type { Terrain } from '../../../shared/rules/config';
import { HEX_R, LAND_Y, SEA_Y } from '../layout';
import { Mat, VoxelGrid, fbm, hash3, hex, mix, noise2, pick, shade } from '../voxel/grid';
import { meshesFor } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';

/**
 * Builds the whole island as one voxel grid: terrain for every hex with its own features
 * (forests, wheat, clay hills, peaks, dunes), beige borders between tiles, beaches,
 * a shaded sea plate with an irregular outline, and wooden piers for the harbors.
 */

const C = {
	border: [hex('#e9cf98'), hex('#e2c48a'), hex('#f0d9a8')],
	sand: [hex('#f2d08c'), hex('#ebc47c'), hex('#f6daa0'), hex('#e3b96e')],
	dirt: [hex('#7a5234'), hex('#6c472d'), hex('#835a39')],
	forestFloor: [hex('#2f6a22'), hex('#387a28'), hex('#2a5e1e'), hex('#417f2e')],
	pine: [hex('#17501f'), hex('#1f6226'), hex('#12421a'), hex('#2a7030')],
	leaf: [hex('#2f7a2a'), hex('#3a8a30'), hex('#296b25'), hex('#46963a')],
	trunk: [hex('#6b4426'), hex('#5c3920')],
	grass: [hex('#86c23a'), hex('#79b534'), hex('#93cc44'), hex('#a2d455')],
	flower: [hex('#ffffff'), hex('#ffe066'), hex('#ff9ebb'), hex('#c9a8ff')],
	bush: [hex('#4b8f32'), hex('#3f7f2b')],
	soil: [hex('#8c6a3c'), hex('#7d5c33')],
	wheat: [hex('#d0800f'), hex('#e69516'), hex('#f2aa1f'), hex('#fbc232'), hex('#ffd455')],
	clay: [hex('#c4482a'), hex('#d6552f'), hex('#b23c25'), hex('#e0663a')],
	clayDark: [hex('#9e3b24'), hex('#8c3420')],
	brick: [hex('#a83d27'), hex('#b8472c')],
	mortar: hex('#d9a27a'),
	rock: [hex('#80838b'), hex('#90939a'), hex('#6f7279'), hex('#a0a3aa')],
	rockDark: [hex('#5d6067'), hex('#52555c')],
	snow: [hex('#f3f5f8'), hex('#e6eaf0'), hex('#ffffff')],
	ore: [hex('#b9c7da'), hex('#8fa3bf')],
	cactus: [hex('#4f8a3a'), hex('#5f9c45')],
	waterShallow: hex('#2f9fda'),
	waterMid: hex('#1c6cc6'),
	waterDeep: hex('#1a4fa6'),
	waterEdge: hex('#123f86'),
	foam: hex('#dff3fb'),
	plank: [hex('#9a6436'), hex('#8a5730'), hex('#a8703e')],
	post: hex('#5e3b20')
};

export const MIN_X = -84;
export const MAX_X = 84;
export const MIN_Z = -80;
export const MAX_Z = 80;
const MAX_Y = 34;

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
	/** y of the surface at the hex center, where its number token sits. */
	tokenY: number[];
	sheepSpots: { hex: number; x: number; z: number }[];
	ports: PortSpot[];
	surfaceY: (x: number, z: number) => number;
	dispose: () => void;
}

interface Col {
	hex: number;
	lx: number;
	lz: number;
	edge: number;
}

function hexEdgeDistance(lx: number, lz: number): number {
	const inR = (Math.sqrt(3) / 2) * HEX_R;
	const a = Math.abs(lx);
	const b = Math.abs(0.5 * lx + (Math.sqrt(3) / 2) * lz);
	const c = Math.abs(-0.5 * lx + (Math.sqrt(3) / 2) * lz);
	return inR - Math.max(a, b, c);
}

export function buildBoard(board: Board, seed: number): BoardBuild {
	const topo = getTopology(board);
	const grid = new VoxelGrid(MAX_X - MIN_X, MAX_Y, MAX_Z - MIN_Z, MIN_X, 0, MIN_Z);
	const W = grid.nx;
	const D = grid.nz;
	const hexIndex = new Map<string, number>();
	board.hexes.forEach((h, i) => hexIndex.set(hexKey(h), i));

	// ---- classify columns
	const cols: (Col | null)[] = new Array(W * D).fill(null);
	const land = new Uint8Array(W * D);
	for (let iz = 0; iz < D; iz++) {
		for (let ix = 0; ix < W; ix++) {
			const x = ix + MIN_X + 0.5;
			const z = iz + MIN_Z + 0.5;
			const ax: Axial = worldToHex(x / HEX_R, z / HEX_R);
			const h = hexIndex.get(hexKey(ax));
			if (h === undefined) continue;
			const th = topo.hexes[h];
			const lx = x - th.x * HEX_R;
			const lz = z - th.z * HEX_R;
			cols[ix + iz * W] = { hex: h, lx, lz, edge: hexEdgeDistance(lx, lz) };
			land[ix + iz * W] = 1;
		}
	}

	// ---- distance from land (chamfer transform), for beaches and sea shading
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

	const tops = new Int16Array(W * D).fill(-1);
	const setTop = (ix: number, iz: number, y: number) => {
		const i = ix + iz * W;
		if (y > tops[i]) tops[i] = y;
	};

	// ---- per-column terrain and sea
	for (let iz = 0; iz < D; iz++) {
		for (let ix = 0; ix < W; ix++) {
			const x = ix + MIN_X;
			const z = iz + MIN_Z;
			const i = ix + iz * W;
			const r = hash3(x, 0, z, seed);
			const col = cols[i];
			if (!col) {
				const d = dist[i];
				const outline = 15 + fbm(x * 0.045, z * 0.045, seed + 3) * 9;
				if (d > outline) continue;
				if (d < 1.6) {
					// beach
					grid.box(x, 0, z, x, SEA_Y, z, (_, y) => (y === SEA_Y ? pick(C.sand, r) : pick(C.dirt, r)));
					setTop(ix, iz, SEA_Y);
					continue;
				}
				const n = (noise2(x * 0.3, z * 0.3, seed) - 0.5) * 2.2;
				const dd = d + n;
				let c: number;
				if (dd < 2.8) c = mix(C.waterShallow, C.foam, r > 0.82 && d < 2.6 ? 0.7 : 0.05);
				else if (dd < 5.5) c = mix(C.waterShallow, C.waterMid, (dd - 2.8) / 2.7);
				else if (dd < 10) c = mix(C.waterMid, C.waterDeep, (dd - 5.5) / 4.5);
				else c = C.waterDeep;
				const rim = d > outline - 1.5;
				if (rim) c = C.waterEdge;
				const topY = rim ? SEA_Y - 2 : SEA_Y - 1;
				grid.box(x, 0, z, x, topY, z, (_, y) => (y === topY ? shade(c, 0.97 + r * 0.06) : shade(c, 0.75)), Mat.Water);
				setTop(ix, iz, topY);
				continue;
			}

			const hx = board.hexes[col.hex];
			const hs = seed + col.hex * 101;
			if (col.edge < 1.15) {
				// tile border
				const y = LAND_Y - 1;
				grid.box(x, 0, z, x, y, z, (_, yy) => (yy === y ? pick(C.border, r) : pick(C.dirt, r)));
				setTop(ix, iz, y);
				continue;
			}
			const y = terrainColumn(grid, hx.terrain, x, z, col, hs, r);
			setTop(ix, iz, y);
		}
	}

	// ---- features
	const sheepSpots: BoardBuild['sheepSpots'] = [];
	const tokenY: number[] = [];
	const rng = (k: number) => hash3(k, 7, 13, seed);
	board.hexes.forEach((hx, h) => {
		const th = topo.hexes[h];
		const cx = th.x * HEX_R;
		const cz = th.z * HEX_R;
		const hs = seed + h * 101;
		const spots = scatter(hs, 28, hx.terrain === 'forest' ? 3.4 : 4.3, (lx, lz) => hexEdgeDistance(lx, lz) > 2.6 && Math.hypot(lx, lz) > 5.2);
		const topAt = (x: number, z: number) => {
			const ix = Math.floor(x) - MIN_X;
			const iz = Math.floor(z) - MIN_Z;
			return tops[ix + iz * W];
		};
		switch (hx.terrain) {
			case 'forest':
				spots.slice(0, 22).forEach(([lx, lz], k) => {
					const x = Math.floor(cx + lx);
					const z = Math.floor(cz + lz);
					const base = topAt(x, z) + 1;
					if (hash3(k, 1, h, seed) < 0.72) pineTree(grid, x, base, z, hs + k);
					else roundTree(grid, x, base, z, hs + k);
				});
				break;
			case 'pasture': {
				spots.slice(0, 4).forEach(([lx, lz], k) => {
					const x = Math.floor(cx + lx);
					const z = Math.floor(cz + lz);
					bush(grid, x, topAt(x, z) + 1, z, hs + k);
				});
				for (const [lx, lz] of spots.slice(4, 8)) sheepSpots.push({ hex: h, x: cx + lx, z: cz + lz });
				break;
			}
			case 'fields': {
				const [lx, lz] = spots[0] ?? [5, 5];
				hayBale(grid, Math.floor(cx + lx), topAt(cx + lx, cz + lz) + 1, Math.floor(cz + lz));
				break;
			}
			case 'hills':
				spots.slice(0, 3).forEach(([lx, lz], k) => {
					const x = Math.floor(cx + lx);
					const z = Math.floor(cz + lz);
					brickStack(grid, x, topAt(x, z) + 1, z, hs + k);
				});
				break;
			case 'desert':
				spots.slice(0, 2).forEach(([lx, lz], k) => {
					const x = Math.floor(cx + lx);
					const z = Math.floor(cz + lz);
					cactus(grid, x, topAt(x, z) + 1, z, hs + k);
				});
				spots.slice(2, 5).forEach(([lx, lz]) => {
					const x = Math.floor(cx + lx);
					const z = Math.floor(cz + lz);
					grid.set(x, topAt(x, z) + 1, z, pick(C.rock, rng(x * 7 + z)));
				});
				break;
		}
		// Number tokens sit on the highest ground near the center.
		let ty = 0;
		for (let dz = -3; dz <= 3; dz++)
			for (let dx = -3; dx <= 3; dx++) ty = Math.max(ty, topAt(cx + dx, cz + dz) + 1);
		tokenY.push(ty);
	});

	// ---- harbors: two piers from the tile corners out to a round landing
	const ports: PortSpot[] = topo.portEdges.map((p) => {
		const e = topo.edges[p.edge];
		const a = topo.vertices[e.a];
		const b = topo.vertices[e.b];
		const out = e.outward!;
		const mx = ((a.x + b.x) / 2) * HEX_R;
		const mz = ((a.z + b.z) / 2) * HEX_R;
		const px = mx + out.x * 8.5;
		const pz = mz + out.z * 8.5;
		for (const v of [a, b]) {
			const sx = v.x * HEX_R + out.x * 1.5;
			const sz = v.z * HEX_R + out.z * 1.5;
			pier(grid, sx, sz, px, pz, seed);
		}
		for (let dz = -3; dz <= 3; dz++)
			for (let dx = -3; dx <= 3; dx++) {
				if (dx * dx + dz * dz > 7.5) continue;
				const x = Math.floor(px + dx);
				const z = Math.floor(pz + dz);
				grid.set(x, SEA_Y, z, pick(C.plank, hash3(x, 3, z, seed)));
			}
		for (const [dx, dz] of [
			[-2.6, -2.6],
			[2.6, -2.6],
			[-2.6, 2.6],
			[2.6, 2.6]
		]) {
			const x = Math.floor(px + dx);
			const z = Math.floor(pz + dz);
			grid.box(x, SEA_Y, z, x, SEA_Y + 1, z, C.post);
		}
		return {
			x: px,
			z: pz,
			angle: Math.atan2(out.x, out.z),
			kind: p.kind,
			ratio: p.kind === 'any' ? 3 : 2
		};
	});

	const geos = meshGrid(grid, { jitter: 0.07 });
	const group = meshesFor(geos, 1, {
		[Mat.Sway]: { swayBase: LAND_Y + 1, roughness: 0.75 },
		[Mat.Water]: { roughness: 0.22, bevel: 0.35 }
	});
	group.name = 'board';

	const surfaceY = (x: number, z: number) => {
		const ix = Math.floor(x) - MIN_X;
		const iz = Math.floor(z) - MIN_Z;
		if (ix < 0 || iz < 0 || ix >= W || iz >= D) return 0;
		return Math.max(0, tops[ix + iz * W] + 1);
	};

	return {
		group,
		tokenY,
		sheepSpots,
		ports,
		surfaceY,
		dispose: () => group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
	};
}

// ---------------------------------------------------------------- terrain columns

function terrainColumn(
	grid: VoxelGrid,
	terrain: Terrain,
	x: number,
	z: number,
	col: Col,
	hs: number,
	r: number
): number {
	const fill = (top: number, topColor: number, mat: Mat = Mat.Solid) => {
		grid.box(x, 0, z, x, top - 1, z, (_, y) => (y >= top - 2 ? pick(C.dirt, hash3(x, y, z)) : pick(C.dirt, r)));
		grid.set(x, top, z, topColor, mat);
		return top;
	};
	const center = Math.hypot(col.lx, col.lz);
	const edgeFade = Math.min(1, Math.max(0, (col.edge - 1.2) / 3));
	const g = LAND_Y;
	switch (terrain) {
		case 'forest': {
			const bump = fbm(x * 0.15, z * 0.15, hs) > 0.62 ? 1 : 0;
			return fill(g + bump, pick(C.forestFloor, r));
		}
		case 'pasture': {
			const bump = fbm(x * 0.12, z * 0.12, hs) > 0.66 ? 1 : 0;
			const top = fill(g + bump, pick(C.grass, r));
			if (r > 0.975 && center > 4.5 && col.edge > 2) {
				grid.set(x, top + 1, z, pick(C.flower, hash3(x, 5, z, hs)));
				return top + 1;
			}
			return top;
		}
		case 'fields': {
			fill(g - 1, pick(C.soil, r));
			const furrow = (Math.floor(x + z * 0.5) % 6 + 6) % 6 === 0;
			if (center < 4.2 || col.edge < 2 || furrow) {
				grid.set(x, g, z, pick(C.soil, hash3(x, 1, z, hs)));
				return g;
			}
			let h = 3 + (r > 0.3 ? 1 : 0) + (r > 0.75 ? 1 : 0);
			h = Math.max(1, Math.round(h * Math.min(1, edgeFade + 0.35)));
			for (let k = 0; k < h; k++) {
				const t = (k + 1) / h;
				const c = k === h - 1 ? pick(C.wheat.slice(3), hash3(x, k, z, hs)) : C.wheat[Math.min(4, Math.floor(t * 3))];
				grid.set(x, g + k, z, c, Mat.Sway);
			}
			return g + h - 1;
		}
		case 'hills': {
			const n = fbm(x * 0.13, z * 0.13, hs, 3);
			let h = Math.max(0, Math.round((n - 0.38) * 11 * edgeFade));
			if (center < 4.5) h = Math.min(h, 1);
			const top = g + h;
			grid.box(x, 0, z, x, top, z, (_, y) => {
				if (y === top) return pick(C.clay, r);
				if (y > g - 2) return pick(C.clayDark.concat(C.clay), hash3(x, y, z, hs));
				return pick(C.dirt, r);
			});
			return top;
		}
		case 'mountains': {
			let h = 0;
			for (let k = 0; k < 3; k++) {
				const ang = hash3(k, 3, 9, hs) * Math.PI * 2;
				const pr = 5.5 + hash3(k, 4, 9, hs) * 2;
				const px = Math.cos(ang) * pr;
				const pz = Math.sin(ang) * pr;
				const ph = (k === 0 ? 15 : 9) + hash3(k, 5, 9, hs) * 4;
				const d = Math.hypot(col.lx - px, col.lz - pz);
				h = Math.max(h, ph * Math.pow(Math.max(0, 1 - d / 9.5), 1.15));
			}
			h += (fbm(x * 0.25, z * 0.25, hs) - 0.5) * 3;
			h *= Math.min(1, Math.max(0, (col.edge - 1) / 3.5));
			if (center < 3.6) h = Math.min(h, 2);
			const top = g + Math.max(0, Math.floor(h));
			grid.box(x, 0, z, x, top, z, (_, y) => {
				const rh = hash3(x, y, z, hs);
				if (y >= g + 11 + (rh > 0.5 ? 1 : 0)) return pick(C.snow, rh);
				if (y === top && y >= g + 9 && rh > 0.4) return pick(C.snow, rh);
				if (rh > 0.965 && y > g) return pick(C.ore, rh);
				if (rh > 0.8) return pick(C.rockDark, rh);
				return y < g - 1 ? pick(C.dirt, r) : pick(C.rock, rh);
			});
			return top;
		}
		case 'desert': {
			const ring = Math.floor(center / 2.3) % 2 === 0;
			const dune = fbm(x * 0.1, z * 0.1, hs) > 0.6 && center > 6 ? 1 : 0;
			const c = pick(C.sand, r);
			return fill(g + dune, ring ? shade(c, 0.93) : c);
		}
	}
}

// ---------------------------------------------------------------- features

function scatter(seed: number, count: number, minDist: number, ok: (x: number, z: number) => boolean) {
	const out: [number, number][] = [];
	for (let i = 0; i < 400 && out.length < count; i++) {
		const x = (hash3(i, 1, 2, seed) - 0.5) * HEX_R * 2;
		const z = (hash3(i, 3, 4, seed) - 0.5) * HEX_R * 2;
		if (!ok(x, z)) continue;
		if (out.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < minDist)) continue;
		out.push([x, z]);
	}
	return out;
}

function pineTree(g: VoxelGrid, x: number, y: number, z: number, s: number) {
	const trunkH = 2;
	g.box(x, y, z, x, y + trunkH - 1, z, pick(C.trunk, hash3(x, y, z, s)));
	const layers = 3 + (hash3(s, 1, 1) > 0.5 ? 1 : 0);
	let yy = y + trunkH;
	for (let l = 0; l < layers; l++) {
		const rad = layers - l;
		for (let k = 0; k < 2; k++) {
			const rr = rad - k * 0.5;
			for (let dz = -rad; dz <= rad; dz++)
				for (let dx = -rad; dx <= rad; dx++) {
					if (Math.abs(dx) + Math.abs(dz) > rr * 1.35 + 0.2) continue;
					const shadeK = k === 1 ? 1.12 : 1;
					g.set(x + dx, yy, z + dz, shade(pick(C.pine, hash3(x + dx, yy, z + dz, s)), shadeK));
				}
			yy++;
		}
	}
	g.set(x, yy, z, shade(C.pine[3], 1.15));
}

function roundTree(g: VoxelGrid, x: number, y: number, z: number, s: number) {
	const trunkH = 3;
	g.box(x, y, z, x, y + trunkH - 1, z, pick(C.trunk, hash3(x, y, z, s)));
	const cy = y + trunkH + 1.5;
	const rad = 2.6 + hash3(s, 2, 2) * 0.6;
	for (let dy = -3; dy <= 3; dy++)
		for (let dz = -3; dz <= 3; dz++)
			for (let dx = -3; dx <= 3; dx++) {
				const d = Math.hypot(dx, dy * 1.15, dz);
				if (d > rad) continue;
				const yy = Math.round(cy + dy);
				const top = dy >= 1 ? 1.12 : dy <= -1 ? 0.85 : 1;
				g.set(x + dx, yy, z + dz, shade(pick(C.leaf, hash3(x + dx, yy, z + dz, s)), top));
			}
}

function bush(g: VoxelGrid, x: number, y: number, z: number, s: number) {
	for (let dz = 0; dz <= 1; dz++)
		for (let dx = 0; dx <= 1; dx++) {
			g.set(x + dx, y, z + dz, pick(C.bush, hash3(x + dx, y, z + dz, s)));
			if (hash3(dx, dz, 1, s) > 0.4) g.set(x + dx, y + 1, z + dz, shade(C.bush[0], 1.15));
		}
}

function hayBale(g: VoxelGrid, x: number, y: number, z: number) {
	g.box(x, y, z, x + 2, y + 1, z + 1, (xx, yy) => (xx === x + 1 ? hex('#c99a3a') : yy === y + 1 ? hex('#f0cf6a') : hex('#e2b850')));
}

function brickStack(g: VoxelGrid, x: number, y: number, z: number, s: number) {
	const h = 1 + Math.floor(hash3(s, 9, 9) * 2);
	g.box(x, y, z, x + 2, y + h - 1, z + 1, (xx, yy, zz) =>
		(xx + yy + zz) % 3 === 0 ? C.mortar : pick(C.brick, hash3(xx, yy, zz, s))
	);
}

function cactus(g: VoxelGrid, x: number, y: number, z: number, s: number) {
	const h = 4 + Math.floor(hash3(s, 1, 5) * 2);
	g.box(x, y, z, x, y + h - 1, z, (xx, yy) => pick(C.cactus, hash3(xx, yy, z, s)));
	g.box(x + 1, y + 2, z, x + 1, y + 2, z, C.cactus[0]);
	g.box(x + 2, y + 2, z, x + 2, y + 3, z, C.cactus[1]);
	g.box(x - 1, y + 1, z, x - 1, y + 1, z, C.cactus[0]);
	g.box(x - 2, y + 1, z, x - 2, y + 2, z, C.cactus[1]);
}

function pier(g: VoxelGrid, x0: number, z0: number, x1: number, z1: number, seed: number) {
	const len = Math.hypot(x1 - x0, z1 - z0);
	const nx = -(z1 - z0) / len;
	const nz = (x1 - x0) / len;
	for (let t = 0; t <= len; t += 0.4) {
		const x = x0 + ((x1 - x0) * t) / len;
		const z = z0 + ((z1 - z0) * t) / len;
		for (const w of [-0.5, 0.5]) {
			const px = Math.floor(x + nx * w);
			const pz = Math.floor(z + nz * w);
			const plankIdx = Math.floor(t / 1.2);
			g.set(px, SEA_Y, pz, pick(C.plank, hash3(plankIdx, 0, 0, seed + Math.floor(x0))));
		}
	}
}
