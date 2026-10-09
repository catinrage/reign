import * as THREE from 'three';
import { getTopology } from '../../../shared/board/topology';
import type { CityPath } from '../../../shared/rules/buildings';
import type { Terrain } from '../../../shared/rules/config';
import { hash3 } from '../voxel/grid';
import type { BoardView } from './boardView';

/**
 * Reign Extended annexes: a storehouse or a tavern, added onto one of its owner's settlements or
 * cities and set against one of the building's walls. A building can have one of each, on walls
 * of their own.
 */

/** A building an annex can lean on: a settlement, a city or a city's path. */
export type AnnexHost = 'settlement' | 'city' | CityPath;

/** A wall an annex can stand against, in its building's voxels: where the middle of its back goes, and which way it faces. */
interface Wall {
	x: number;
	z: number;
	nx: number;
	nz: number;
	/** Extra cost: it would hide the building's front door. */
	cost?: number;
}

const WALLS: Record<AnnexHost, Wall[]> = {
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
	],
	// A city's path (see cityPaths.ts): behind the keep, or against a side wall.
	castle: [
		{ x: 0, z: -4, nx: 0, nz: -1 },
		{ x: -5, z: -1.75, nx: -1, nz: 0 },
		{ x: 5, z: -1.75, nx: 1, nz: 0 }
	],
	// Behind the hall, or along a side (on the left, clear of the sign).
	guildHall: [
		{ x: 0.25, z: -3, nx: 0, nz: -1 },
		{ x: 5, z: -1, nx: 1, nz: 0 },
		{ x: -4, z: -2, nx: -1, nz: 0, cost: 0.3 }
	],
	// Behind the tower or the barracks, or against the tower's side or the yard's wall.
	fortress: [
		{ x: -3.25, z: -4, nx: 0, nz: -1 },
		{ x: 2, z: -4, nx: 0, nz: -1 },
		{ x: -5, z: -2.25, nx: -1, nz: 0 },
		{ x: 5, z: -0.5, nx: 1, nz: 0 }
	]
};

/** How much ground an annex takes, in piece voxels: how far it reaches out from its back, and half its width. */
export interface Footprint {
	depth: number;
	half: number;
}

/**
 * How much an annex would rather not look out over each kind of tile: pasture and desert stay
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

/** Where an annex stands: the middle of its back, which way it faces, and which of its building's walls it took. */
export interface AnnexSpot {
	pos: THREE.Vector3;
	yaw: number;
	wall: number;
}

/**
 * Where an annex of `size` stands against the building on vertex `v`, and which way it faces. The
 * building (a settlement, a city or a city's path, turned by `yaw`, its voxels `scale` world units)
 * has a few walls; of those that look out over a tile rather than along a road, the annex takes
 * the one with the clearest ground in front of it, leaving out the wall `taken` (by the building's
 * other annex).
 */
export function annexSpot(bv: BoardView, v: number, kind: AnnexHost, yaw: number, scale: number, size: Footprint, taken = -1): AnnexSpot {
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
	const walls = WALLS[kind];
	let best = taken === 0 ? 1 : 0;
	let bestCost = Infinity;
	walls.forEach((w, i) => {
		if (i === taken) return;
		// Which way the wall looks out on the board.
		const a = Math.atan2(-w.nx * sin + w.nz * cos, w.nx * cos + w.nz * sin);
		const facing = tiles.reduce((m, t) => (Math.abs(turn(t.a, a)) < Math.abs(turn(m.a, a)) ? t : m));
		const road = Math.min(Math.PI, ...roads.map((r) => Math.abs(turn(r, a))));
		// The further out its far corners reach, the likelier it runs into trees and rocks.
		const reach = Math.max(
			...[-size.half, size.half].map((s) => Math.hypot(w.x + w.nz * s + w.nx * size.depth, w.z - w.nx * s + w.nz * size.depth))
		);
		const cost =
			facing.cost + (w.cost ?? 0) + (road < 0.6 ? 4 : 0) + Math.max(0, reach - 5.6) * 0.8 + hash3(v, w.nx + 2, w.nz + 2) * 0.05;
		if (cost < bestCost) {
			bestCost = cost;
			best = i;
		}
	});
	const w = walls[best];
	const pos = bv.vertexPos(v);
	pos.x += (w.x * cos + w.z * sin) * scale;
	pos.z += (-w.x * sin + w.z * cos) * scale;
	return { pos, yaw: yaw + Math.atan2(w.nx, w.nz), wall: best };
}

/**
 * The yard trodden flat in front of an annex of `size` whose back stands at `pos` and which faces
 * `yaw` (its voxels `scale` world units), so the wheat of a field doesn't bury it: written into
 * `out` as (center x, center z, radius, ground height) for the crops' shader (`sharedUniforms.uYards`).
 */
export function annexYard(pos: THREE.Vector3, yaw: number, scale: number, size: Footprint, out: THREE.Vector4) {
	const ahead = (size.depth / 2) * scale;
	return out.set(pos.x + Math.sin(yaw) * ahead, pos.z + Math.cos(yaw) * ahead, (size.half + 1) * scale, pos.y + 0.15);
}

/** The signed turn from angle a to angle b, in (-π, π]. */
function turn(a: number, b: number) {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d <= -Math.PI) d += Math.PI * 2;
	return d;
}
