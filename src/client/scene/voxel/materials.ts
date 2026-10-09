import * as THREE from 'three';
import { Mat } from './grid';

/**
 * Voxel materials are MeshStandardMaterial with a small shader patch:
 * - every face gets a soft bevel (darkened rim + tilted normal), so each block reads like a
 *   little rounded cube catching the light, as in the reference render;
 * - water shimmers and sparkles, glow/fire voxels emit and flicker, foliage sways.
 * Geometry must be in voxel units (mesh.scale sets the world size).
 */

export const sharedUniforms = {
	uTime: { value: 0 },
	uFlicker: { value: 1 },
	/** 0 = day, 1 = night. Phase two's day/night cycle drives this. */
	uNight: { value: 0 },
	/**
	 * Board tiles drained of color, for the robber: each is (center x, center z, amount, 0)
	 * in world units. Two slots, so one tile can fade back while the next one grays.
	 */
	uGray: { value: [new THREE.Vector4(), new THREE.Vector4()] },
	/** World size of one board voxel, to find which tile a fragment's voxel belongs to. */
	uGrayVoxel: { value: 1 },
	/** Canvas size in CSS pixels, so outlines can be a fixed number of pixels wide. */
	uViewport: { value: new THREE.Vector2(1, 1) }
};

export interface VoxelMaterialOptions {
	roughness?: number;
	metalness?: number;
	bevel?: number;
	bevelWidth?: number;
	emissive?: number;
	transparent?: boolean;
	opacity?: number;
	envMapIntensity?: number;
	/** Voxel y where swaying starts (ground level). */
	swayBase?: number;
	/** Voxels per sway unit: finer grids pass 2 so their foliage sways just as far. */
	swayScale?: number;
	/** Board tiles: can be grayed out per tile (see `sharedUniforms.uGray`). */
	tileGray?: boolean;
	/**
	 * Fade each block's bevel and rim out as blocks shrink to a pixel or two on screen, where
	 * they would only shimmer into moiré (for small voxels seen from afar).
	 */
	antialias?: boolean;
	/**
	 * Adds this share of each voxel's own color as light, so player pieces stay bright in the
	 * shade of trees and peaks and stand out from the land round them.
	 */
	lift?: number;
}

const VERT_HEAD = /* glsl */ `
uniform float uSwayBase;
uniform float uSwayScale;
varying vec3 vVox;
varying vec3 vVoxN;
varying vec3 vTanU;
varying vec3 vTanV;
uniform float uTime;
`;

const VERT_BODY = /* glsl */ `
vVox = position;
vVoxN = normal;
vec3 tu = abs(normal.x) > 0.5 ? vec3(0.0, 1.0, 0.0) : (abs(normal.y) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
vec3 tv = abs(normal.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : (abs(normal.y) > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0));
mat3 voxNM = normalMatrix;
#ifdef USE_INSTANCING
voxNM = normalMatrix * mat3(instanceMatrix);
#endif
vTanU = normalize(voxNM * tu);
vTanV = normalize(voxNM * tv);
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vVox;
varying vec3 vVoxN;
varying vec3 vTanU;
varying vec3 vTanV;
uniform float uTime;
uniform float uFlicker;
uniform float uNight;
uniform float uBevel;
uniform float uBevelWidth;
float voxHash(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
vec2 voxUV() {
	vec3 f = fract(vVox + 1e-4);
	vec3 an = abs(vVoxN);
	return an.x > 0.5 ? f.yz : (an.y > 0.5 ? f.zx : f.xy);
}
#ifdef VOXEL_AA
/** 1 while a block covers a few pixels, falling to 0 as it shrinks to about one. */
float voxAA() {
	vec3 w = fwidth(vVox);
	return 1.0 - smoothstep(0.3, 0.7, max(w.x, max(w.y, w.z)));
}
#endif
`;

const FRAG_BEVEL = /* glsl */ `
{
	vec2 uv = voxUV();
	vec2 dEdge = min(uv, 1.0 - uv);
	vec2 w = 1.0 - smoothstep(0.0, uBevelWidth, dEdge);
	vec2 sgn = vec2(uv.x < 0.5 ? -1.0 : 1.0, uv.y < 0.5 ? -1.0 : 1.0);
#ifdef VOXEL_AA
	w *= voxAA();
#endif
	normal = normalize(normal + (vTanU * sgn.x * w.x + vTanV * sgn.y * w.y) * uBevel);
}
`;

/** Pointy-top hexes of circumradius 12 (HEX_R); voxels on the beige border keep their color. */
const FRAG_GRAY = /* glsl */ `
{
	vec2 cell = (floor(vVox - vVoxN * 0.5).xz + 0.5) * uGrayVoxel;
	for (int i = 0; i < 2; i++) {
		vec4 g = uGray[i];
		if (g.z <= 0.0) continue;
		vec2 a = abs(cell - g.xy);
		float edge = 10.3923 - max(a.x, 0.5 * a.x + 0.8660254 * a.y);
		float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
		diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l * 0.95), g.z * step(0.63, edge));
	}
}
`;

const FRAG_RIM = /* glsl */ `
{
	vec2 uv = voxUV();
	vec2 dEdge = min(uv, 1.0 - uv);
	float e = 1.0 - smoothstep(0.0, uBevelWidth * 0.9, min(dEdge.x, dEdge.y));
#ifdef VOXEL_AA
	// Faded out to the rim's average over a face, so far-off blocks keep their brightness.
	e = mix(0.23, e, voxAA());
#endif
	diffuseColor.rgb *= 1.0 - e * 0.16;
}
`;

function patch(material: THREE.MeshStandardMaterial, kind: Mat, opts: VoxelMaterialOptions) {
	const bevel = { value: opts.bevel ?? 0.55 };
	const bevelWidth = { value: opts.bevelWidth ?? 0.14 };
	const swayBase = { value: opts.swayBase ?? 0 };
	const swayScale = { value: opts.swayScale ?? 1 };
	const lift = { value: opts.lift ?? 0 };
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uSwayBase = swayBase;
		shader.uniforms.uSwayScale = swayScale;
		shader.uniforms.uTime = sharedUniforms.uTime;
		shader.uniforms.uFlicker = sharedUniforms.uFlicker;
		shader.uniforms.uNight = sharedUniforms.uNight;
		shader.uniforms.uBevel = bevel;
		shader.uniforms.uBevelWidth = bevelWidth;
		shader.uniforms.uLift = lift;
		if (opts.tileGray) {
			shader.uniforms.uGray = sharedUniforms.uGray;
			shader.uniforms.uGrayVoxel = sharedUniforms.uGrayVoxel;
		}

		let vs = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_HEAD}`);
		vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
		if (kind === Mat.Sway) {
			vs = vs.replace(
				'#include <begin_vertex>',
				/* glsl */ `#include <begin_vertex>
				{
					vec4 wp = modelMatrix * vec4(position, 1.0);
					float k = clamp((position.y - uSwayBase) / (6.0 * uSwayScale), 0.0, 1.0);
					k *= k;
					float sway = sin(uTime * 1.6 + wp.x * 0.12 + wp.z * 0.08) * 0.5 + sin(uTime * 2.7 + wp.z * 0.2) * 0.25;
					transformed.x += sway * 0.5 * k * uSwayScale;
					transformed.z += sway * 0.3 * k * uSwayScale;
				}`
			);
		}
		shader.vertexShader = vs;

		let fs = shader.fragmentShader.replace('#include <common>', `#include <common>\n${opts.antialias ? '#define VOXEL_AA\n' : ''}${FRAG_HEAD}`);
		fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_RIM}`);
		if (opts.tileGray) {
			fs = fs.replace('#include <common>', '#include <common>\nuniform vec4 uGray[2];\nuniform float uGrayVoxel;');
			fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_GRAY}`);
		}
		if (kind === Mat.Water) {
			fs = fs.replace(
				'#include <color_fragment>',
				/* glsl */ `#include <color_fragment>
				{
					vec3 cell = floor(vVox + 1e-3);
					float h = voxHash(cell);
					float wave = sin(uTime * 1.3 + h * 6.2831 + cell.x * 0.35 + cell.z * 0.21);
					diffuseColor.rgb *= 0.94 + wave * 0.07;
					float sparkle = step(0.997, voxHash(cell + floor(uTime * 1.5 + h * 3.0)));
					diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.95, 1.0), sparkle * step(0.5, vVoxN.y) * 0.75);
				}`
			);
		}
		fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_BEVEL}`);
		if (opts.lift) {
			fs = fs.replace('#include <common>', '#include <common>\nuniform float uLift;');
			fs = fs.replace(
				'#include <emissivemap_fragment>',
				'#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLift;'
			);
		}
		if (kind === Mat.Glow || kind === Mat.Fire) {
			const flick = kind === Mat.Fire ? 'uFlicker' : '1.0';
			fs = fs.replace(
				'#include <emissivemap_fragment>',
				/* glsl */ `#include <emissivemap_fragment>
				{
					float h = voxHash(floor(vVox + 1e-3));
					float f = ${flick} * (0.85 + 0.3 * sin(uTime * (6.0 + h * 5.0) + h * 30.0));
					totalEmissiveRadiance = diffuseColor.rgb * emissive * f;
				}`
			);
		}
		shader.fragmentShader = fs;
	};
	material.customProgramCacheKey = () =>
		`voxel-${kind}${opts.tileGray ? '-gray' : ''}${opts.antialias ? '-aa' : ''}${opts.lift ? '-lift' : ''}`;
	return material;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function voxelMaterial(kind: Mat, opts: VoxelMaterialOptions = {}): THREE.MeshStandardMaterial {
	const key = `${kind}:${JSON.stringify(opts)}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const m = new THREE.MeshStandardMaterial({
		vertexColors: true,
		roughness: opts.roughness ?? (kind === Mat.Water ? 0.28 : 0.82),
		metalness: opts.metalness ?? 0,
		transparent: opts.transparent ?? false,
		opacity: opts.opacity ?? 1,
		envMapIntensity: opts.envMapIntensity ?? (kind === Mat.Water ? 0.9 : 0.35)
	});
	if (kind === Mat.Glow || kind === Mat.Fire) m.emissive = new THREE.Color(opts.emissive ?? 2.2, opts.emissive ?? 2.2, opts.emissive ?? 2.2);
	patch(m, kind, opts);
	cache.set(key, m);
	return m;
}

/** Build meshes for each material group of a meshed grid. */
export function meshesFor(
	geos: Map<Mat, THREE.BufferGeometry>,
	scale: number,
	opts: Partial<Record<Mat, VoxelMaterialOptions>> = {},
	/** Voxel coordinate that should sit at the group's origin. */
	center: [number, number, number] = [0, 0, 0]
): THREE.Group {
	const group = new THREE.Group();
	for (const [mat, geo] of geos) {
		const mesh = new THREE.Mesh(geo, voxelMaterial(mat, opts[mat]));
		mesh.castShadow = mat !== Mat.Water;
		mesh.receiveShadow = true;
		mesh.scale.setScalar(scale);
		mesh.position.set(-center[0] * scale, -center[1] * scale, -center[2] * scale);
		mesh.userData.voxMat = mat;
		group.add(mesh);
	}
	return group;
}
