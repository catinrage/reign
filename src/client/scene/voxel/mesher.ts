import * as THREE from 'three';
import { Mat, type VoxelGrid } from './grid';

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

class Buffers {
	pos: number[] = [];
	nrm: number[] = [];
	col: number[] = [];
	idx: number[] = [];
	count = 0;
}

export interface MeshOptions {
	/** Per-voxel brightness jitter, 0..1. */
	jitter?: number;
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
					const ao = [0, 0, 0, 0];
					const corners: [number, number][] = [
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 1]
					];
					for (let c = 0; c < 4; c++) {
						const su = corners[c][0] ? 1 : -1;
						const sv = corners[c][1] ? 1 : -1;
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
					const base = buf.count;
					const order = f.sign > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
					for (const c of order) {
						const pos = [p[0], p[1], p[2]];
						if (f.sign > 0) pos[f.axis] += 1;
						pos[f.u] += corners[c][0];
						pos[f.v] += corners[c][1];
						buf.pos.push(pos[0] - cx, pos[1] - cy, pos[2] - cz);
						buf.nrm.push(f.n[0] * 127, f.n[1] * 127, f.n[2] * 127);
						const k = AO_CURVE[ao[c]] * jit;
						buf.col.push(
							Math.min(255, r0 * k),
							Math.min(255, g0 * k),
							Math.min(255, b0 * k)
						);
					}
					// Flip the quad diagonal so AO gradients don't show a seam.
					const a = order.map((c) => ao[c]);
					if (a[0] + a[2] > a[1] + a[3]) {
						buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
					} else {
						buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
					}
					buf.count += 4;
				}
			}
		}
	}

	const out = new Map<Mat, THREE.BufferGeometry>();
	for (const [mat, b] of buffers) {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
		g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(b.nrm), 3, true));
		g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(b.col), 3, true));
		g.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
		g.computeBoundingSphere();
		g.computeBoundingBox();
		out.set(mat, g);
	}
	return out;
}
