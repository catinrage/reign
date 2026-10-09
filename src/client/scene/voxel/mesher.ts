import * as THREE from 'three';
import { Mat, type VoxelGrid } from './grid';

/** Voxel colors are authored in sRGB; the renderer works in linear light (16-bit to avoid banding). */
const SRGB_TO_LINEAR = new Float32Array(256).map((_, i) => {
	const c = i / 255;
	return (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * 65535;
});

/**
 * Turns a voxel grid into one BufferGeometry per material. Hidden faces are culled and
 * every vertex gets baked ambient occlusion from its neighbours, which gives voxel scenes
 * their soft contact shadows. Geometry is in voxel units; scale the mesh to taste.
 */

const AO_CURVE = [0.5, 0.68, 0.84, 1];

interface Face {
	n: [number, number, number];
	axis: number;
	sign: number;
	u: number;
	v: number;
}

const FACES: Face[] = [];
for (const [axis, u, v] of [
	[0, 1, 2],
	[1, 2, 0],
	[2, 0, 1]
] as const) {
	for (const sign of [1, -1]) {
		const n: [number, number, number] = [0, 0, 0];
		n[axis] = sign;
		FACES.push({ n, axis, sign, u, v });
	}
}

/** One material's quads, in typed arrays that double in size as they fill up. */
class Buffers {
	pos = new Float32Array(12 * 1024);
	nrm = new Int8Array(12 * 1024);
	col = new Uint16Array(12 * 1024);
	idx = new Uint32Array(6 * 1024);
	/** Vertices written. */
	count = 0;
	/** Indices written. */
	indices = 0;

	/** Make room for one more quad. */
	reserve() {
		if ((this.count + 4) * 3 <= this.pos.length) return;
		this.pos = grow(this.pos);
		this.nrm = grow(this.nrm);
		this.col = grow(this.col);
		this.idx = grow(this.idx);
	}
}

function grow<T extends Float32Array | Int8Array | Uint16Array | Uint32Array>(a: T): T {
	const b = new (a.constructor as new (n: number) => T)(a.length * 2);
	b.set(a);
	return b;
}

const CORNERS: [number, number][] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1]
];
const ORDER_POS = [0, 1, 2, 3];
const ORDER_NEG = [0, 3, 2, 1];

export interface MeshOptions {
	/** Per-voxel brightness jitter, 0..1. */
	jitter?: number;
	/** Leave out the downward faces on the grid's floor, for things that lie on a surface. */
	skipFloor?: boolean;
}

export function meshGrid(grid: VoxelGrid, opts: MeshOptions = {}): Map<Mat, THREE.BufferGeometry> {
	const { nx, ny, nz, data } = grid;
	const buffers = new Map<Mat, Buffers>();
	const jitter = opts.jitter ?? 0.06;
	// Output is in world-voxel coordinates (grid origin applied). Vertices stay on integer
	// coordinates because the voxel shader derives each block's bevel from them.
	const cx = -grid.ox;
	const cy = -grid.oy;
	const cz = -grid.oz;
	const strideY = nx * nz;

	const solidAt = (x: number, y: number, z: number) =>
		x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && data[x + nx * (z + nz * y)] !== 0;

	const p = [0, 0, 0];
	const q = [0, 0, 0];
	const pos = [0, 0, 0];
	const ao = [0, 0, 0, 0];
	const skipFloor = !!opts.skipFloor;

	for (let y = 0; y < ny; y++) {
		for (let z = 0; z < nz; z++) {
			for (let x = 0; x < nx; x++) {
				const val = data[x + nx * z + strideY * y];
				if (val === 0) continue;
				const mat = ((val >>> 24) - 1) as Mat;
				let buf = buffers.get(mat);
				if (!buf) buffers.set(mat, (buf = new Buffers()));
				const r0 = (val >> 16) & 255;
				const g0 = (val >> 8) & 255;
				const b0 = val & 255;
				// Stable per-voxel tint so flat areas read as individual blocks.
				const h = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
				const jit = 1 + ((h % 1000) / 1000 - 0.5) * 2 * jitter;

				p[0] = x;
				p[1] = y;
				p[2] = z;
				for (const f of FACES) {
					const nxp = x + f.n[0];
					const nyp = y + f.n[1];
					const nzp = z + f.n[2];
					if (solidAt(nxp, nyp, nzp)) continue;
					if (skipFloor && nyp < 0) continue;
					for (let c = 0; c < 4; c++) {
						const su = CORNERS[c][0] ? 1 : -1;
						const sv = CORNERS[c][1] ? 1 : -1;
						q[0] = nxp;
						q[1] = nyp;
						q[2] = nzp;
						q[f.u] += su;
						const s1 = solidAt(q[0], q[1], q[2]) ? 1 : 0;
						q[f.v] += sv;
						const cc = solidAt(q[0], q[1], q[2]) ? 1 : 0;
						q[f.u] -= su;
						const s2 = solidAt(q[0], q[1], q[2]) ? 1 : 0;
						ao[c] = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
					}
					buf.reserve();
					const base = buf.count;
					const order = f.sign > 0 ? ORDER_POS : ORDER_NEG;
					for (const c of order) {
						pos[0] = p[0];
						pos[1] = p[1];
						pos[2] = p[2];
						if (f.sign > 0) pos[f.axis] += 1;
						pos[f.u] += CORNERS[c][0];
						pos[f.v] += CORNERS[c][1];
						const o = buf.count * 3;
						buf.pos[o] = pos[0] - cx;
						buf.pos[o + 1] = pos[1] - cy;
						buf.pos[o + 2] = pos[2] - cz;
						buf.nrm[o] = f.n[0] * 127;
						buf.nrm[o + 1] = f.n[1] * 127;
						buf.nrm[o + 2] = f.n[2] * 127;
						const k = AO_CURVE[ao[c]] * jit;
						const kl = Math.pow(k, 1.6);
						buf.col[o] = Math.min(65535, SRGB_TO_LINEAR[r0] * kl);
						buf.col[o + 1] = Math.min(65535, SRGB_TO_LINEAR[g0] * kl);
						buf.col[o + 2] = Math.min(65535, SRGB_TO_LINEAR[b0] * kl);
						buf.count++;
					}
					// Flip the quad diagonal so AO gradients don't show a seam.
					const ix = buf.idx;
					const i = buf.indices;
					const d = ao[order[0]] + ao[order[2]] > ao[order[1]] + ao[order[3]] ? 0 : 1;
					ix[i] = base + d;
					ix[i + 1] = base + d + 1;
					ix[i + 2] = base + d + 2;
					ix[i + 3] = base + d;
					ix[i + 4] = base + d + 2;
					ix[i + 5] = base + ((d + 3) & 3);
					buf.indices += 6;
				}
			}
		}
	}

	const out = new Map<Mat, THREE.BufferGeometry>();
	for (const [mat, b] of buffers) {
		const g = new THREE.BufferGeometry();
		const n = b.count * 3;
		g.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, n), 3));
		g.setAttribute('normal', new THREE.BufferAttribute(b.nrm.slice(0, n), 3, true));
		g.setAttribute('color', new THREE.BufferAttribute(b.col.slice(0, n), 3, true));
		const idx = b.idx.slice(0, b.indices);
		g.setIndex(new THREE.BufferAttribute(b.count > 65535 ? idx : Uint16Array.from(idx), 1));
		g.computeBoundingSphere();
		g.computeBoundingBox();
		out.set(mat, g);
	}
	return out;
}
