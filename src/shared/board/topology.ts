import type { PortKind, Terrain } from '../rules/config';
import { type Axial, hexCorner, hexKey, hexToWorld } from './hex';

export interface BoardHex extends Axial {
	terrain: Terrain;
	number: number | null;
}

/** A harbor sits on one side of a coastal land hex. Side i joins corners i and i+1. */
export interface BoardPort {
	hex: number;
	side: number;
	kind: PortKind;
}

/**
 * A map is plain data: which land hexes exist, what they produce, and where the harbors are.
 * Custom maps later are just different Board values; everything else is derived.
 */
export interface Board {
	hexes: BoardHex[];
	ports: BoardPort[];
}

export interface TopoHex {
	id: number;
	q: number;
	r: number;
	x: number;
	z: number;
	vertices: number[];
	edges: number[];
	neighbors: number[];
}

export interface TopoVertex {
	id: number;
	x: number;
	z: number;
	hexes: number[];
	edges: number[];
	neighbors: number[];
	port: PortKind | null;
}

export interface TopoEdge {
	id: number;
	a: number;
	b: number;
	hexes: number[];
	coastal: boolean;
	/** Unit vector pointing from land to sea, for coastal edges. */
	outward: { x: number; z: number } | null;
}

export interface Topology {
	hexes: TopoHex[];
	vertices: TopoVertex[];
	edges: TopoEdge[];
	edgeBetween: (a: number, b: number) => number;
	portEdges: { edge: number; kind: PortKind; hex: number; side: number }[];
}

const cache = new WeakMap<Board, Topology>();

export function getTopology(board: Board): Topology {
	let topo = cache.get(board);
	if (!topo) {
		topo = buildTopology(board);
		cache.set(board, topo);
	}
	return topo;
}

function pointKey(x: number, z: number): string {
	return `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
}

export function buildTopology(board: Board): Topology {
	const vertices: TopoVertex[] = [];
	const edges: TopoEdge[] = [];
	const vertexIds = new Map<string, number>();
	const edgeIds = new Map<string, number>();
	const hexIndex = new Map<string, number>();
	board.hexes.forEach((h, i) => hexIndex.set(hexKey(h), i));

	const hexes: TopoHex[] = board.hexes.map((h, id) => {
		const c = hexToWorld(h);
		return { id, q: h.q, r: h.r, x: c.x, z: c.z, vertices: [], edges: [], neighbors: [] };
	});

	for (const hex of hexes) {
		for (let i = 0; i < 6; i++) {
			const p = hexCorner(hex, i);
			const key = pointKey(p.x, p.z);
			let vid = vertexIds.get(key);
			if (vid === undefined) {
				vid = vertices.length;
				vertexIds.set(key, vid);
				vertices.push({ id: vid, x: p.x, z: p.z, hexes: [], edges: [], neighbors: [], port: null });
			}
			hex.vertices.push(vid);
			vertices[vid].hexes.push(hex.id);
		}
		for (let i = 0; i < 6; i++) {
			const a = hex.vertices[i];
			const b = hex.vertices[(i + 1) % 6];
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			let eid = edgeIds.get(key);
			if (eid === undefined) {
				eid = edges.length;
				edgeIds.set(key, eid);
				edges.push({ id: eid, a, b, hexes: [], coastal: false, outward: null });
				vertices[a].edges.push(eid);
				vertices[b].edges.push(eid);
				vertices[a].neighbors.push(b);
				vertices[b].neighbors.push(a);
			}
			hex.edges.push(eid);
			edges[eid].hexes.push(hex.id);
		}
	}

	for (const hex of hexes) {
		for (const n of [
			[1, 0],
			[1, -1],
			[0, -1],
			[-1, 0],
			[-1, 1],
			[0, 1]
		]) {
			const id = hexIndex.get(hexKey({ q: hex.q + n[0], r: hex.r + n[1] }));
			if (id !== undefined) hex.neighbors.push(id);
		}
	}

	for (const e of edges) {
		if (e.hexes.length !== 1) continue;
		e.coastal = true;
		const h = hexes[e.hexes[0]];
		const mx = (vertices[e.a].x + vertices[e.b].x) / 2 - h.x;
		const mz = (vertices[e.a].z + vertices[e.b].z) / 2 - h.z;
		const len = Math.hypot(mx, mz);
		e.outward = { x: mx / len, z: mz / len };
	}

	const portEdges = board.ports.map((p) => {
		const edge = hexes[p.hex].edges[p.side];
		vertices[edges[edge].a].port = p.kind;
		vertices[edges[edge].b].port = p.kind;
		return { edge, kind: p.kind, hex: p.hex, side: p.side };
	});

	const edgeBetween = (a: number, b: number) =>
		edgeIds.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? -1;

	return { hexes, vertices, edges, edgeBetween, portEdges };
}
