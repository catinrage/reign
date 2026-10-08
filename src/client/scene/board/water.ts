import * as THREE from 'three';
import { SEA_FRAME, VOXEL } from '../layout';
import { sharedUniforms } from '../voxel/materials';

/**
 * The sea: one column of water per micro-voxel inside a hexagonal frame. Every column
 * bobs on a sum of travelling waves plus a swell that rolls in toward the coast, so the
 * surface shimmers in little voxel steps. Each column is lit with the slope of the wave
 * at its center (faceted glints), colored from turquoise shallows to deep blue by its
 * distance from land, with foam lapping at the shore and the odd sparkle on a crest.
 *
 * All geometry is in voxel units; the mesh is scaled by VOXEL.
 */

/** Resting height of the water surface, in voxels. */
export const WATER_TOP = 4.5;

/** Flat-top hexagon distance (equal to the flat-edge distance on the boundary). */
export function frameDistance(x: number, z: number) {
	const a = Math.abs(z);
	const b = Math.abs(0.8660254 * x + 0.5 * z);
	const c = Math.abs(0.8660254 * x - 0.5 * z);
	return Math.max(a, b, c);
}

const KIND_TOP = 0;
const KIND_SKIRT_UP = 1;
const KIND_SKIRT_DOWN = 2;
const KIND_RIM_UP = 3;
const KIND_RIM_DOWN = 4;

export interface Water {
	mesh: THREE.Mesh;
}

export function buildWater(isLand: (x: number, z: number) => boolean, depthAt: (x: number, z: number) => number): Water {
	const F = SEA_FRAME / VOXEL;
	const R = Math.ceil(F / 0.8660254) + 1;
	const N = R * 2;
	const inside = new Uint8Array(N * N);
	const wet = new Uint8Array(N * N);
	const depth = new Float32Array(N * N);
	for (let iz = 0; iz < N; iz++)
		for (let ix = 0; ix < N; ix++) {
			const x = ix - R;
			const z = iz - R;
			const i = ix + iz * N;
			if (frameDistance(x + 0.5, z + 0.5) > F) continue;
			inside[i] = 1;
			if (isLand(x, z)) continue;
			wet[i] = 1;
			depth[i] = depthAt(x, z);
		}
	const isWet = (ix: number, iz: number) => ix >= 0 && iz >= 0 && ix < N && iz < N && wet[ix + iz * N] === 1;
	const isInside = (ix: number, iz: number) => ix >= 0 && iz >= 0 && ix < N && iz < N && inside[ix + iz * N] === 1;

	let quads = 0;
	for (let iz = 0; iz < N; iz++)
		for (let ix = 0; ix < N; ix++) {
			if (!wet[ix + iz * N]) continue;
			quads++;
			if (isWet(ix + 1, iz) || !isInside(ix + 1, iz)) quads++;
			if (isWet(ix, iz + 1) || !isInside(ix, iz + 1)) quads++;
			if (!isInside(ix - 1, iz)) quads++;
			if (!isInside(ix, iz - 1)) quads++;
		}

	const pos = new Float32Array(quads * 12);
	const nrm = new Int8Array(quads * 12);
	const cell = new Int16Array(quads * 12);
	const other = new Int16Array(quads * 12);
	const index = new Uint32Array(quads * 6);
	let v = 0;
	let q = 0;
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const n = new THREE.Vector3();

	const quad = (
		corners: [number, number, number][],
		normal: [number, number, number],
		kinds: number[],
		cx: number,
		cz: number,
		d: number,
		bx: number,
		bz: number
	) => {
		// Wind counter-clockwise around the normal.
		a.set(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1], corners[1][2] - corners[0][2]);
		b.set(corners[2][0] - corners[0][0], corners[2][1] - corners[0][1], corners[2][2] - corners[0][2]);
		n.crossVectors(a, b);
		const flip = n.x * normal[0] + n.y * normal[1] + n.z * normal[2] < 0;
		const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
		const base = v;
		for (const k of order) {
			const c = corners[k];
			pos.set(c, v * 3);
			nrm.set(normal, v * 3);
			cell.set([cx, cz, Math.min(32000, Math.round(d * 10))], v * 3);
			other.set([bx, bz, kinds[k]], v * 3);
			v++;
		}
		index.set([base, base + 1, base + 2, base, base + 2, base + 3], q * 6);
		q++;
	};

	const T = WATER_TOP;
	for (let iz = 0; iz < N; iz++)
		for (let ix = 0; ix < N; ix++) {
			const i = ix + iz * N;
			if (!wet[i]) continue;
			const x = ix - R;
			const z = iz - R;
			// Cell coordinates are stored as the cell's min corner; the shader adds 0.5.
			const d = Math.min(depth[i], 90);
			const up = KIND_TOP;
			quad([[x, T, z], [x, T, z + 1], [x + 1, T, z + 1], [x + 1, T, z]], [0, 1, 0], [up, up, up, up], x, z, d, 0, 0);
			// +x side
			if (isWet(ix + 1, iz)) {
				const U = KIND_SKIRT_UP;
				const L = KIND_SKIRT_DOWN;
				quad([[x + 1, T, z], [x + 1, T, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z]], [1, 0, 0], [U, U, L, L], x, z, d, x + 1, z);
			} else if (!isInside(ix + 1, iz)) {
				const U = KIND_RIM_UP;
				const L = KIND_RIM_DOWN;
				quad([[x + 1, T, z], [x + 1, T, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z]], [1, 0, 0], [U, U, L, L], x, z, d, 0, 0);
			}
			// +z side
			if (isWet(ix, iz + 1)) {
				const U = KIND_SKIRT_UP;
				const L = KIND_SKIRT_DOWN;
				quad([[x, T, z + 1], [x + 1, T, z + 1], [x + 1, 0, z + 1], [x, 0, z + 1]], [0, 0, 1], [U, U, L, L], x, z, d, x, z + 1);
			} else if (!isInside(ix, iz + 1)) {
				const U = KIND_RIM_UP;
				const L = KIND_RIM_DOWN;
				quad([[x, T, z + 1], [x + 1, T, z + 1], [x + 1, 0, z + 1], [x, 0, z + 1]], [0, 0, 1], [U, U, L, L], x, z, d, 0, 0);
			}
			// outer rim on the -x / -z sides
			if (!isInside(ix - 1, iz)) {
				const U = KIND_RIM_UP;
				const L = KIND_RIM_DOWN;
				quad([[x, T, z], [x, T, z + 1], [x, 0, z + 1], [x, 0, z]], [-1, 0, 0], [U, U, L, L], x, z, d, 0, 0);
			}
			if (!isInside(ix, iz - 1)) {
				const U = KIND_RIM_UP;
				const L = KIND_RIM_DOWN;
				quad([[x, T, z], [x + 1, T, z], [x + 1, 0, z], [x, 0, z]], [0, 0, -1], [U, U, L, L], x, z, d, 0, 0);
			}
		}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
	geo.setAttribute('aCell', new THREE.BufferAttribute(cell, 3));
	geo.setAttribute('aOther', new THREE.BufferAttribute(other, 3));
	geo.setIndex(new THREE.BufferAttribute(index, 1));
	geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R * 1.5);
	geo.boundingBox = new THREE.Box3(new THREE.Vector3(-R, -1, -R), new THREE.Vector3(R, 8, R));

	const mesh = new THREE.Mesh(geo, waterMaterial());
	mesh.scale.setScalar(VOXEL);
	mesh.receiveShadow = true;
	mesh.castShadow = false;
	mesh.name = 'water';
	return { mesh };
}

// ---------------------------------------------------------------- material

let material: THREE.MeshStandardMaterial | null = null;

export const waterColors = {
	shore: new THREE.Color('#5ccbe6'),
	shallow: new THREE.Color('#279fe0'),
	mid: new THREE.Color('#1a6fd2'),
	deep: new THREE.Color('#1548b8'),
	edge: new THREE.Color('#123c9c'),
	foam: new THREE.Color('#f2fbff')
};

const WAVES = /* glsl */ `
uniform float uTime;
float waveH(vec2 p, float depth) {
	float t = uTime;
	float h = 0.22 * sin(dot(p, vec2(0.12, 0.065)) + t * 1.05)
		+ 0.16 * sin(dot(p, vec2(-0.055, 0.16)) + t * 1.37 + 1.3)
		+ 0.10 * sin(dot(p, vec2(0.21, -0.14)) - t * 1.9 + 2.1)
		+ 0.06 * sin(dot(p, vec2(-0.34, -0.26)) + t * 2.7);
	// Swell rolling in toward the coast.
	h += 0.24 * exp(-depth * 0.085) * sin(depth * 0.62 - t * 1.75 + sin(p.x * 0.05 + p.y * 0.04) * 1.5);
	return h * (0.45 + 0.55 * smoothstep(0.5, 4.0, depth));
}
`;

function waterMaterial() {
	if (material) return material;
	const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.26, metalness: 0, envMapIntensity: 0.12, side: THREE.DoubleSide });
	const frame = { value: SEA_FRAME / VOXEL };
	m.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = sharedUniforms.uTime;
		shader.uniforms.uNight = sharedUniforms.uNight;
		shader.uniforms.uFrame = frame;
		for (const [k, c] of Object.entries(waterColors)) shader.uniforms[`uC_${k}`] = { value: c };

		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				/* glsl */ `#include <common>
				attribute vec3 aCell;
				attribute vec3 aOther;
				varying vec3 vCell;
				varying float vKind;
				varying float vH;
				varying vec3 vLocal;
				${WAVES}`
			)
			.replace(
				'#include <beginnormal_vertex>',
				/* glsl */ `
				vec2 cA = aCell.xy + 0.5;
				float dep = aCell.z * 0.1;
				float kind = aOther.z;
				float hA = waveH(cA, dep);
				float hB = (kind > 0.5 && kind < 2.5) ? waveH(aOther.xy + 0.5, dep) : 0.0;
				vec3 objectNormal = vec3(normal);
				if (kind < 0.5) {
					float gx = waveH(cA + vec2(1.0, 0.0), dep) - waveH(cA - vec2(1.0, 0.0), dep);
					float gz = waveH(cA + vec2(0.0, 1.0), dep) - waveH(cA - vec2(0.0, 1.0), dep);
					objectNormal = normalize(vec3(-gx * 1.6, 1.0, -gz * 1.6));
				}
				#ifdef USE_TANGENT
				vec3 objectTangent = vec3(tangent.xyz);
				#endif`
			)
			.replace(
				'#include <begin_vertex>',
				/* glsl */ `
				vec3 transformed = vec3(position);
				float topY = ${WATER_TOP.toFixed(2)};
				if (kind < 0.5) transformed.y = topY + hA;
				else if (kind < 1.5) transformed.y = topY + max(hA, hB);
				else if (kind < 2.5) transformed.y = topY + min(hA, hB);
				else if (kind < 3.5) transformed.y = topY + hA;
				vCell = vec3(cA, dep);
				vKind = kind;
				vH = hA;
				vLocal = transformed;
				#ifdef USE_ALPHAHASH
				vPosition = vec3(position);
				#endif`
			);

		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				/* glsl */ `#include <common>
				uniform float uTime;
				uniform float uNight;
				uniform float uFrame;
				uniform vec3 uC_shore;
				uniform vec3 uC_shallow;
				uniform vec3 uC_mid;
				uniform vec3 uC_deep;
				uniform vec3 uC_edge;
				uniform vec3 uC_foam;
				varying vec3 vCell;
				varying float vKind;
				varying float vH;
				varying vec3 vLocal;
				float wHash(vec2 p) {
					p = fract(p * vec2(0.3183099, 0.3678794) + vec2(0.71, 0.113));
					p *= 17.0;
					return fract(p.x * p.y * (p.x + p.y));
				}
				float frameDist(vec2 p) {
					return max(abs(p.y), max(abs(0.8660254 * p.x + 0.5 * p.y), abs(0.8660254 * p.x - 0.5 * p.y)));
				}`
			)
			.replace(
				'#include <color_fragment>',
				/* glsl */ `#include <color_fragment>
				{
					float d = vCell.z;
					vec2 cellId = floor(vCell.xy);
					float hsh = wHash(cellId);
					float rim = uFrame - frameDist(vCell.xy);
					vec3 c = mix(uC_shore, uC_shallow, smoothstep(1.5, 5.0, d));
					c = mix(c, uC_mid, smoothstep(4.0, 13.0, d));
					c = mix(c, uC_deep, smoothstep(11.0, 26.0, d));
					c = mix(c, uC_edge, smoothstep(9.0, 1.0, rim) * 0.85);
					// Per-voxel variation and brighter crests.
					c *= 0.94 + 0.12 * hsh;
					c = mix(c, uC_shallow * 1.25, smoothstep(0.18, 0.55, vH) * 0.3);
					c *= 0.93 + 0.12 * smoothstep(-0.5, 0.5, vH);
					// Foam lapping at the shore: bands that roll in with the swell.
					float swell = sin(d * 0.62 - uTime * 1.75 + sin(vCell.x * 0.05 + vCell.y * 0.04) * 1.5);
					float shoreFoam = step(d, 2.1 + 1.6 * max(0.0, swell)) * step(0.22, hsh);
					float crestFoam = step(0.86, hsh) * smoothstep(0.62, 0.72, swell) * step(d, 9.0);
					// Rare sparkles drifting over open water.
					float sp = step(0.9975, wHash(cellId + floor(uTime * 1.3 + hsh * 7.0) * 13.1)) * step(4.0, d) * step(0.15, vH);
					float foam = max(shoreFoam, max(crestFoam * 0.85, sp));
					c = mix(c, uC_foam, foam * step(vKind, 0.5));
					// Sides of the columns are a touch darker; the outer wall is deep blue.
					if (vKind > 0.5 && vKind < 2.5) c *= 0.82;
					if (vKind > 2.5) c = uC_edge * mix(0.55, 0.9, clamp(vLocal.y / 4.0, 0.0, 1.0));
					// Soft voxel rim on top faces.
					if (vKind < 0.5) {
						vec2 uv = fract(vLocal.xz + 1e-4);
						vec2 de = min(uv, 1.0 - uv);
						float e = 1.0 - smoothstep(0.0, 0.12, min(de.x, de.y));
						c *= 1.0 - e * 0.1;
					}
					diffuseColor.rgb = c;
				}`
			)
			.replace(
				'#include <roughnessmap_fragment>',
				/* glsl */ `#include <roughnessmap_fragment>
				roughnessFactor = vKind < 0.5 ? 0.2 : 0.45;`
			);
	};
	m.customProgramCacheKey = () => 'voxel-water-v2';
	material = m;
	return m;
}
