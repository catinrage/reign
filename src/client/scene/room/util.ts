import * as THREE from 'three';
import { Mat, VoxelGrid, hash3, mix, shade } from '../voxel/grid';
import { type VoxelMaterialOptions, meshesFor } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';

/** Floor surface height (the table stands on it, its top at y = 0). */
export const FLOOR_Y = -111;
/** Half the room's width: walls stand at x, z = ±ROOM_HALF. */
export const ROOM_HALF = 342;

/**
 * Shared material options. Sway must match the board's options: the voxel shader bakes
 * `swayBase` into a program that is cached per material kind, so every sway mesh uses the
 * same value. Room foliage is built at grid y >= 20 so it always sways fully.
 */
export const ROOM_MATS: Partial<Record<Mat, VoxelMaterialOptions>> = {
	[Mat.Sway]: { swayBase: 5, roughness: 0.75 },
	[Mat.Glow]: { emissive: 1.6 },
	[Mat.Fire]: { emissive: 2.6 }
};

/** Grid y where foliage starts so the sway shader moves it fully. */
export const SWAY_Y = 20;

export interface VoxOptions {
	jitter?: number;
	/** Drop faces whose normal matches, e.g. undersides nobody ever sees. */
	drop?: (nx: number, ny: number, nz: number) => boolean;
	/** Voxel coordinate placed at the group's origin. */
	center?: [number, number, number];
	shadows?: boolean;
	mats?: Partial<Record<Mat, VoxelMaterialOptions>>;
}

/** Mesh a grid into a group of voxel meshes (one per material). */
export function voxels(grid: VoxelGrid, scale: number, opts: VoxOptions = {}): THREE.Group {
	const geos = meshGrid(grid, { jitter: opts.jitter ?? 0.05 });
	if (opts.drop) for (const geo of geos.values()) dropFaces(geo, opts.drop);
	const group = meshesFor(geos, scale, { ...ROOM_MATS, ...opts.mats }, opts.center ?? [0, 0, 0]);
	if (opts.shadows === false)
		group.traverse((o) => {
			o.castShadow = false;
		});
	return group;
}

/** Remove triangles whose (axis-aligned) normal matches the predicate. */
export function dropFaces(geo: THREE.BufferGeometry, drop: (nx: number, ny: number, nz: number) => boolean) {
	const idx = geo.index;
	if (!idx) return;
	const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
	const arr = nrm.array as Int8Array;
	const src = idx.array;
	const keep: number[] = [];
	for (let i = 0; i < src.length; i += 3) {
		const v = src[i] * 3;
		if (drop(Math.sign(arr[v]), Math.sign(arr[v + 1]), Math.sign(arr[v + 2]))) continue;
		keep.push(src[i], src[i + 1], src[i + 2]);
	}
	if (keep.length === src.length) return;
	const big = geo.getAttribute('position').count > 65535;
	geo.setIndex(big ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
}

export const dropDown = (_x: number, y: number) => y < 0;

/** Wrap an object so it can be placed and turned around Y. */
export function place(obj: THREE.Object3D, x: number, y: number, z: number, rotY = 0): THREE.Group {
	const g = new THREE.Group();
	g.add(obj);
	g.position.set(x, y, z);
	g.rotation.y = rotY;
	return g;
}

export function rand(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Wood with a soft grain along one axis. */
export function grain(base: number, along: number, across: number, seed = 0, depth = 0.14) {
	const n = Math.sin(along * 0.37 + hash3(Math.floor(across), 0, 0, seed) * 6.28) * 0.5 + 0.5;
	const k = 1 - depth * 0.5 + depth * n * 0.7 + (hash3(Math.floor(along), Math.floor(across), seed, 9) - 0.5) * depth * 0.6;
	return shade(base, k);
}

export interface Plaid {
	base: number;
	dark: number;
	light: number;
	accent: number;
}

export const RED_PLAID: Plaid = { base: 0xa62a24, dark: 0x4e1414, light: 0xe0c08c, accent: 0x2a2234 };
export const GREEN_PLAID: Plaid = { base: 0x3f6b35, dark: 0x1e3a1e, light: 0xc9b47a, accent: 0x8a2a22 };
export const RUG_PLAID: Plaid = { base: 0x8e2a22, dark: 0x3f1512, light: 0xcfae7c, accent: 0x23263a };

/** Tartan colour for a woven cell (i, j). */
export function tartan(i: number, j: number, p: Plaid, period = 12) {
	const band = (k: number) => {
		const m = ((k % period) + period) % period;
		if (m < Math.max(2, Math.round(period * 0.25))) return p.dark;
		if (m === Math.round(period * 0.55)) return p.light;
		if (m === Math.round(period * 0.8)) return p.accent;
		return p.base;
	};
	const a = band(i);
	const b = band(j);
	const c = mix(a, b, 0.5);
	return (i + j) & 1 ? shade(c, 0.95) : c;
}

/**
 * Invisible box that only casts a shadow. Lets big meshes drop their (never seen)
 * undersides, which the shadow pass would otherwise need.
 */
export function shadowProxy(w: number, h: number, d: number): THREE.Mesh {
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
	m.castShadow = true;
	m.receiveShadow = false;
	return m;
}
