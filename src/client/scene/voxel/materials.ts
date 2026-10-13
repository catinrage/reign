import * as THREE from 'three';
import { Mat } from './grid';

/**
 * Voxel materials are MeshStandardMaterial with a small shader patch:
 * - every face gets a soft bevel (darkened rim + tilted normal), so each block reads like a
 *   little rounded cube catching the light, as in the reference render;
 * - water shimmers and sparkles, glow/fire voxels emit and flicker, foliage sways.
 * Geometry must be in voxel units (mesh.scale sets the world size).
 */

/** How many yards of trodden crops the land can have at once (see `sharedUniforms.uYards`). */
export const YARDS = 16;
/** How many buildings can light the ground round them at night (see `sharedUniforms.uLamps`). */
export const LAMPS = 48;

export const sharedUniforms = {
	uTime: { value: 0 },
	uFlicker: { value: 1 },
	/** 0 = day, 1 = night mode, set by `Lighting` as it fades between them. */
	uNight: { value: 0 },
	/**
	 * Warm light spilling from the windows and doors of buildings at night, onto the land and
	 * sea round them: each is (center x, center z, radius, strength) in world units, unused while
	 * its radius is 0.
	 */
	uLamps: { value: Array.from({ length: LAMPS }, () => new THREE.Vector4()) },
	/** How many of `uLamps` are in use, from the first. */
	uLampCount: { value: 0 },
	/**
	 * Board tiles drained to a dark gray, for the robber: each is (center x, center z, amount,
	 * 0) in world units. Two slots, so one tile can fade back while the next one grays.
	 */
	uGray: { value: [new THREE.Vector4(), new THREE.Vector4()] },
	/** World size of one board voxel, to find which tile a fragment's voxel belongs to. */
	uGrayVoxel: { value: 1 },
	/**
	 * The tile the robber is being aimed at, lit up in the color of the player aiming it:
	 * (center x, center z, strength 0..1, seconds since it was aimed at) in world units.
	 */
	uAim: { value: new THREE.Vector4() },
	uAimColor: { value: new THREE.Color() },
	/**
	 * How the aim light moves: (x, z) heading of the sparks round the border, pulse 0..1, phase
	 * 0..1 of the rings. Worked out on the CPU, so the shader needs no sin, cos or pow of the
	 * clock: some graphics cards turn those into NaN, and bloom spreads one NaN pixel over the
	 * whole screen.
	 */
	uAimWave: { value: new THREE.Vector4(1, 0, 0, 0) },
	/** Canvas size in CSS pixels, so outlines can be a fixed number of pixels wide. */
	uViewport: { value: new THREE.Vector2(1, 1) },
	/**
	 * Yards where wheat and grass are trodden flat (round a Reign Extended storehouse or tavern): each is
	 * (center x, center z, radius, ground height) in world units, unused while its radius is 0.
	 */
	uYards: { value: Array.from({ length: YARDS }, () => new THREE.Vector4()) }
};

/**
 * The last lines of a custom fragment shader: tone-map the color and encode it for the screen,
 * as the built-in materials do. Low quality draws straight to the screen, with no
 * post-processing to do it afterwards; drawn into post-processing's buffer, they change nothing.
 */
export const FRAG_OUTPUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

/**
 * Conquest's board (see scene/conquest): which territory each column of the map is and how far
 * it lies from a border, and per territory its owner's color and how it is lit up right now.
 * The land's shader reads them, so ownership and highlights change without rebuilding the map.
 */
export const realmUniforms = {
	/** RGBA8, one texel per map column: r = territory + 1 (0 for water), g = voxels to the nearest border (0 on it). */
	uRealmMap: { value: null as THREE.Texture | null },
	/**
	 * RGBA8, a column per territory. Row 0: the owner's color, a = 1 while held. Row 1: r = how
	 * much the whole territory lights up, g = how much its border band glows, b = hover, a = how
	 * much it fades back. Row 2: the color it lights up in, a = how much the light pulses.
	 */
	uRealmState: { value: null as THREE.Texture | null },
	/** The map's first column (world voxels) and its size in columns: (x0, z0, nx, nz). */
	uRealmGrid: { value: new THREE.Vector4(0, 0, 1, 1) },
	/** 0..1, worked out on the CPU (see uAimWave for why): how far the highlights' pulse is. */
	uRealmPulse: { value: 0 }
};

/**
 * Conquest's territories in their owners' colors: a band inside each border, so who holds what
 * reads at a glance, and highlights for the turn (territories to pick, the one picked, targets).
 * Each voxel takes one value, so the color keeps to the blocks.
 */
const FRAG_REALM = /* glsl */ `
vec3 realmLight = vec3(0.0);
{
	ivec2 ij = ivec2(floor(vVox - vVoxN * 0.5).xz - uRealmGrid.xy);
	if (ij.x >= 0 && ij.y >= 0 && ij.x < int(uRealmGrid.z) && ij.y < int(uRealmGrid.w)) {
		vec4 m = texelFetch(uRealmMap, ij, 0);
		int id = int(m.r * 255.0 + 0.5) - 1;
		if (id >= 0) {
			vec4 own = texelFetch(uRealmState, ivec2(id, 0), 0);
			vec4 st = texelFetch(uRealmState, ivec2(id, 1), 0);
			vec4 hl = texelFetch(uRealmState, ivec2(id, 2), 0);
			float bd = m.g * 255.0;
			// The band in the owner's color, inside the border line (which keeps its own color).
			float band = bd < 0.5 ? 0.0 : 1.0 - smoothstep(2.5, 4.5, bd);
			float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
			vec3 tint = own.rgb * (0.55 + 0.6 * l);
			diffuseColor.rgb = mix(diffuseColor.rgb, tint, band * own.a * 0.85);
			float pulse = mix(1.0, 0.55 + 0.45 * uRealmPulse, hl.a);
			// Lit up as a whole (picked, a target), and its band glowing.
			diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7 + hl.rgb * 0.45, st.r * 0.45);
			realmLight += hl.rgb * (st.r * 0.22 + band * st.g * 0.9) * pulse;
			diffuseColor.rgb *= 1.0 + st.b * 0.22;
			diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l * 0.62), st.a * 0.55);
		}
	}
}
`;

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
	/**
	 * Board tiles: can be grayed out per tile (see `sharedUniforms.uGray`) and lit up as the
	 * robber's target (`sharedUniforms.uAim`).
	 */
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
	/** Lit at night by the buildings round it (see `sharedUniforms.uLamps`): the island's land and sea. */
	lamps?: boolean;
	/**
	 * Only there at night: each voxel lights up on its own as night falls (a building's lantern,
	 * a fire in a brazier). Meshes of these should not cast shadows.
	 */
	night?: boolean;
	/** Conquest's land: owner colors and highlights by territory (see `realmUniforms`). */
	realm?: boolean;
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
		// Drained to a dark gray, so a field reads as shut down rather than snowed on. The range is
		// squeezed so a forest, dark already, stays light enough for the robber to show on it.
		float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
		diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035 + l * 0.42), g.z * step(0.63, edge));
	}
}
`;

/**
 * The robber's target tile: it lights up from the middle out, with rings of light rippling
 * outward, and the beige line round it burns bright with two sparks chasing round. Each voxel
 * takes one value, so the light keeps to the blocks. `aimLight` is added as emitted light.
 * Everything here stays finite on any card: no pow, no trig, and the motion comes in through
 * `uAimWave`.
 */
const FRAG_AIM = /* glsl */ `
vec3 aimLight = vec3(0.0);
if (uAim.z > 0.0) {
	vec2 p = (floor(vVox - vVoxN * 0.5).xz + 0.5) * uGrayVoxel - uAim.xy;
	vec2 a = abs(p);
	// 0 in the middle of the tile, 10.39 on the line between it and the next one.
	float d = max(a.x, 0.5 * a.x + 0.8660254 * a.y);
	float edge = 10.3923 - d;
	float k = uAim.z * smoothstep(d - 2.0, d, uAim.w * 45.0);
	if (edge > -0.7 && k > 0.0) {
		// The player's color at full brightness, so dark blue glows as well as yellow does.
		vec3 hue = uAimColor / max(max(uAimColor.r, uAimColor.g), max(uAimColor.b, 1e-3));
		float pulse = uAimWave.z;
		if (edge < 0.63) {
			// One spark where the border faces the sparks' heading and one opposite: the 14th power
			// of how squarely it faces each, multiplied out on a base held to 0..1.
			float s1 = clamp(0.5 + 0.5 * dot(p, uAimWave.xy) / max(length(p), 1.0), 0.0, 1.0);
			float s2 = 1.0 - s1;
			float q1 = s1 * s1 * s1 * s1;
			float q2 = s2 * s2 * s2 * s2;
			float spark = q1 * q1 * q1 * s1 * s1 + q2 * q2 * q2 * s2 * s2;
			vec3 c = mix(hue, vec3(1.0), spark * 0.7);
			diffuseColor.rgb = mix(diffuseColor.rgb, c, 0.9 * k);
			aimLight = c * (0.75 + 0.35 * pulse + spark * 1.8) * k;
		} else {
			float ring = fract(d / 3.6 - uAimWave.w);
			ring = smoothstep(0.62, 0.86, ring) * (1.0 - smoothstep(0.86, 1.0, ring));
			float rim = 1.0 - smoothstep(0.63, 3.2, edge);
			float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
			vec3 tinted = mix(diffuseColor.rgb, hue * l * 1.7, 0.3) * 1.12;
			diffuseColor.rgb = mix(diffuseColor.rgb, tinted, k);
			aimLight = hue * (0.05 + 0.05 * pulse + rim * 0.5 + ring * 0.32) * k;
		}
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

/**
 * Night: the warm light of nearby windows and doors pools on the ground round each building,
 * fading out to its radius. Each voxel takes one value, so the light keeps to the blocks.
 */
const FRAG_LAMPS = /* glsl */ `
if (uNight > 0.0 && uLampCount > 0.0) {
	// The land isn't turned, only scaled and moved, so the voxel's middle is this far off.
	vec2 cellW = vLampW.xy + (floor(vVox - vVoxN * 0.5).xz + 0.5 - vVox.xz) * vLampW.z;
	float glow = 0.0;
	for (int i = 0; i < ${LAMPS}; i++) {
		if (float(i) >= uLampCount) break;
		vec4 l = uLamps[i];
		float d = length(cellW - l.xy) / l.z;
		float k = clamp(1.0 - d, 0.0, 1.0);
		glow += k * (0.35 + 0.65 * k) * l.w;
	}
	totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.56, 0.24) * min(glow, 2.2) * uNight;
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
		if (opts.lamps) {
			shader.uniforms.uLamps = sharedUniforms.uLamps;
			shader.uniforms.uLampCount = sharedUniforms.uLampCount;
		}
		if (opts.tileGray) {
			shader.uniforms.uGray = sharedUniforms.uGray;
			shader.uniforms.uGrayVoxel = sharedUniforms.uGrayVoxel;
			shader.uniforms.uAim = sharedUniforms.uAim;
			shader.uniforms.uAimColor = sharedUniforms.uAimColor;
			shader.uniforms.uAimWave = sharedUniforms.uAimWave;
		}

		let vs = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_HEAD}`);
		vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
		if (kind === Mat.Sway) {
			shader.uniforms.uYards = sharedUniforms.uYards;
			vs = vs.replace('#include <common>', `#include <common>\nuniform vec4 uYards[${YARDS}];`);
			vs = vs.replace(
				'#include <begin_vertex>',
				/* glsl */ `#include <begin_vertex>
				{
					vec4 wp = modelMatrix * vec4(position, 1.0);
					// Trodden flat in a yard: nothing stands above its ground there, and the crop
					// rises back to its full height round the edge.
					float cap = 1e5;
					for (int i = 0; i < ${YARDS}; i++) {
						vec4 yard = uYards[i];
						if (yard.z > 0.0) cap = min(cap, yard.w + max(0.0, length(wp.xz - yard.xy) - yard.z) * 0.9);
					}
					float drop = max(0.0, wp.y - cap) / length(modelMatrix[1].xyz);
					transformed.y -= drop;
					float k = clamp((position.y - drop - uSwayBase) / (6.0 * uSwayScale), 0.0, 1.0);
					k *= k;
					float sway = sin(uTime * 1.6 + wp.x * 0.12 + wp.z * 0.08) * 0.5 + sin(uTime * 2.7 + wp.z * 0.2) * 0.25;
					transformed.x += sway * 0.5 * k * uSwayScale;
					transformed.z += sway * 0.3 * k * uSwayScale;
				}`
			);
		}
		if (opts.lamps) {
			vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vLampW;');
			vs = vs.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nvLampW = vec3((modelMatrix * vec4(position, 1.0)).xz, length(modelMatrix[0].xyz));'
			);
		}
		shader.vertexShader = vs;

		let fs = shader.fragmentShader.replace('#include <common>', `#include <common>\n${opts.antialias ? '#define VOXEL_AA\n' : ''}${FRAG_HEAD}`);
		fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_RIM}`);
		if (opts.tileGray) {
			fs = fs.replace(
				'#include <common>',
				'#include <common>\nuniform vec4 uGray[2];\nuniform float uGrayVoxel;\nuniform vec4 uAim;\nuniform vec3 uAimColor;\nuniform vec4 uAimWave;'
			);
			fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_GRAY}\n${FRAG_AIM}`);
			fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += aimLight;');
		}
		if (opts.realm) {
			Object.assign(shader.uniforms, realmUniforms);
			fs = fs.replace(
				'#include <common>',
				'#include <common>\nuniform sampler2D uRealmMap;\nuniform sampler2D uRealmState;\nuniform vec4 uRealmGrid;\nuniform float uRealmPulse;'
			);
			fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_REALM}`);
			fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += realmLight;');
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
		if (opts.lamps) {
			fs = fs.replace('#include <common>', `#include <common>\nuniform vec4 uLamps[${LAMPS}];\nuniform float uLampCount;\nvarying vec3 vLampW;`);
			fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_LAMPS}`);
		}
		if (kind === Mat.Glow || kind === Mat.Fire) {
			const flick = kind === Mat.Fire ? 'uFlicker' : '1.0';
			// Windows and flames burn brighter at night, with the room's lights down.
			const night = kind === Mat.Fire ? '0.45' : '0.9';
			fs = fs.replace(
				'#include <emissivemap_fragment>',
				/* glsl */ `#include <emissivemap_fragment>
				{
					float h = voxHash(floor(vVox + 1e-3));
					float f = ${flick} * (0.85 + 0.3 * sin(uTime * (6.0 + h * 5.0) + h * 30.0));
					totalEmissiveRadiance = diffuseColor.rgb * emissive * f * (1.0 + uNight * ${night});
				}`
			);
		}
		if (opts.night) {
			// Each voxel comes on at its own moment as night falls, and goes out again at dawn.
			fs = fs.replace(
				'#include <clipping_planes_fragment>',
				'#include <clipping_planes_fragment>\nif (voxHash(floor(vVox - vVoxN * 0.5) + 0.37) * 0.9 + 0.05 >= uNight) discard;'
			);
		}
		shader.fragmentShader = fs;
	};
	material.customProgramCacheKey = () =>
		`voxel-${kind}${opts.tileGray ? '-gray' : ''}${opts.antialias ? '-aa' : ''}${opts.lift ? '-lift' : ''}${opts.lamps ? '-lamps' : ''}${opts.night ? '-night' : ''}${opts.realm ? '-realm' : ''}`;
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
		mesh.castShadow = mat !== Mat.Water && !opts[mat]?.night;
		mesh.receiveShadow = true;
		mesh.scale.setScalar(scale);
		mesh.position.set(-center[0] * scale, -center[1] * scale, -center[2] * scale);
		mesh.userData.voxMat = mat;
		group.add(mesh);
	}
	return group;
}
