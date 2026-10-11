import * as THREE from 'three';
import { BEACON_MS } from '../../../shared/protocol';
import { ease } from '../anim';
import type { Particles } from '../effects';
import { FRAG_OUTPUT } from '../voxel/materials';

/** Height of the column of light over a beacon. */
const PILLAR_H = 46;
/** Seconds a beacon takes to come up, and to go out at the end of its time. */
const RISE = 0.25;
const FADE = 0.4;
const LIFE = BEACON_MS / 1000;
/** Hex ripples running out over the ground at once, how wide they get, and how often a new one starts. */
const RIPPLES = 3;
const RIPPLE_R = 12;
const RIPPLE_EVERY = 0.75;
/** Beacons lit at once, at most; a new one past that takes the oldest's place. */
const MAX = 16;

const PILLAR = new THREE.CylinderGeometry(2, 2.6, PILLAR_H, 8, 1, true).translate(
	0,
	PILLAR_H / 2,
	0
);
// Hexagons with their corners along z, like the tiles, lying flat.
const RIPPLE = new THREE.RingGeometry(0.7, 1, 6, 1, Math.PI / 2).rotateX(-Math.PI / 2);
// A dark rim either side of each ripple, as the pixel art outlines things, so it reads on any ground.
const RIPPLE_EDGE = new THREE.RingGeometry(0.62, 1.08, 6, 1, Math.PI / 2).rotateX(-Math.PI / 2);
const EDGE = new THREE.Color('#2a1a10');
const WHITE = new THREE.Color(1, 1, 1);
const GLOW = new THREE.CircleGeometry(1, 6, Math.PI / 2).rotateX(-Math.PI / 2);
const PIN = new THREE.OctahedronGeometry(3, 0).scale(1, 1.5, 1);

/**
 * In steps like the pixel art of the interface: brightest at the foot and fading out upward, with
 * bands of light rushing up through it. No pow and no clock in here (see `sharedUniforms.uAimWave`).
 */
const PILLAR_MAT = new THREE.ShaderMaterial({
	uniforms: { uColor: { value: new THREE.Color() }, uAmount: { value: 0 }, uPhase: { value: 0 } },
	vertexShader: /* glsl */ `
		varying float vY;
		void main() {
			vY = uv.y;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}`,
	fragmentShader: /* glsl */ `
		uniform vec3 uColor;
		uniform float uAmount;
		uniform float uPhase;
		varying float vY;
		void main() {
			float y = floor(vY * 15.0) / 15.0;
			float band = step(0.6, fract(y * 3.0 - uPhase));
			float f = clamp(1.0 - y, 0.0, 1.0);
			float a = f * (0.6 + 0.4 * band) * uAmount;
			gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.3) * a * 1.4, 1.0);
			${FRAG_OUTPUT}
		}`,
	transparent: true,
	depthWrite: false,
	blending: THREE.AdditiveBlending,
	side: THREE.DoubleSide
});

interface Lit {
	group: THREE.Group;
	pillar: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
	glow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
	ripples: { group: THREE.Group; ring: THREE.MeshBasicMaterial; edge: THREE.MeshBasicMaterial }[];
	pin: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	color: THREE.Color;
	/** Seconds since it was lit; past LIFE it's out. */
	age: number;
	/** Where it stands: the ground or the water under the spot. */
	ground: number;
}

/**
 * Beacons players light on the map with Alt+click (a long press on touch): a column of light in
 * the player's color where they clicked, hexagonal ripples running out over the ground and a
 * marker that drops in and hovers there, for BEACON_MS.
 */
export class Beacons {
	private readonly lit: Lit[] = [];
	private readonly group = new THREE.Group();

	constructor(
		scene: THREE.Scene,
		private particles: Particles
	) {
		scene.add(this.group);
	}

	/** Light a beacon in `color` (0xrrggbb) at world (x, ground, z). */
	add(x: number, ground: number, z: number, color: number) {
		const b = this.lit.length >= MAX ? this.lit.shift()! : this.make();
		this.lit.push(b);
		b.color.set(color);
		// The light itself at full brightness, whatever the player's color.
		const hue = b.color.clone().multiplyScalar(1 / Math.max(b.color.r, b.color.g, b.color.b, 1e-3));
		b.pillar.material.uniforms.uColor.value.copy(hue);
		b.glow.material.color.copy(hue);
		for (const r of b.ripples) r.ring.color.copy(hue).lerp(WHITE, 0.25);
		b.pin.material.color.copy(b.color);
		b.pin.material.emissive.copy(hue);
		b.age = 0;
		b.ground = ground;
		b.group.position.set(x, ground, z);
		b.group.visible = true;
		this.particles.emit({
			at: new THREE.Vector3(x, ground + 0.5, z),
			count: 16,
			colors: [b.color.getHex(), '#ffffff'],
			speed: 9,
			up: 9,
			spread: 1,
			life: 0.9,
			size: 0.6,
			gravity: 18
		});
	}

	/** Put every beacon out at once (a new island, leaving the game). */
	clear() {
		for (const b of this.lit) b.group.visible = false;
	}

	update(dt: number, t: number) {
		for (const b of this.lit) {
			if (!b.group.visible) continue;
			b.age += dt;
			if (b.age >= LIFE) {
				b.group.visible = false;
				continue;
			}
			const amount = Math.min(1, b.age / RISE, (LIFE - b.age) / FADE);
			// The column shoots up out of the ground, overshooting a little.
			const grow = ease.outBack(Math.min(1, b.age / 0.3));
			b.pillar.scale.set(1, Math.max(0.001, grow), 1);
			b.pillar.material.uniforms.uAmount.value = amount * (0.85 + Math.sin(t * 7) * 0.15);
			b.pillar.material.uniforms.uPhase.value = (b.age * 1.6) % 1;
			b.glow.material.opacity = amount * 0.7;
			b.glow.scale.setScalar(5 + Math.sin(t * 6) * 0.5);
			for (let i = 0; i < b.ripples.length; i++) {
				const r = b.ripples[i];
				// Each ripple starts at the foot, runs out and fades; the first ones start together.
				const k = (b.age - i * (RIPPLE_EVERY / RIPPLES)) / RIPPLE_EVERY;
				const f = k < 0 ? 0 : k % 1;
				r.group.visible = k >= 0;
				r.group.scale.setScalar(1 + f * (RIPPLE_R - 1));
				r.ring.opacity = (1 - f * f) * amount;
				r.edge.opacity = (1 - f * f) * 0.6 * amount;
			}
			// The marker drops in from above, bounces to a stop over the spot and turns; it shrinks away at the end.
			const drop = 1 - ease.outBack(Math.min(1, b.age / 0.35));
			b.pin.position.y = 15 + drop * 30 + Math.sin(t * 4 + b.ground) * 0.8;
			b.pin.rotation.y = b.age * 2.4;
			b.pin.scale.setScalar(Math.max(0.001, Math.min(1, (LIFE - b.age) / FADE)));
		}
	}

	/** One beacon's meshes, for compiling their shaders before the first one is lit. */
	static prewarm(): THREE.Object3D {
		const b = new Beacons(new THREE.Scene(), null as unknown as Particles).make();
		b.group.visible = true;
		return b.group;
	}

	private make(): Lit {
		const group = new THREE.Group();
		const pillar = new THREE.Mesh(PILLAR, PILLAR_MAT.clone());
		pillar.renderOrder = 5;
		// The glow and ripples lie on the ground, which isn't flat: they show through bumps in it.
		const flat = () =>
			new THREE.MeshBasicMaterial({
				transparent: true,
				depthWrite: false,
				depthTest: false,
				blending: THREE.AdditiveBlending
			});
		const glow = new THREE.Mesh(GLOW, flat());
		glow.position.y = 0.3;
		glow.renderOrder = 3;
		const ripples = Array.from({ length: RIPPLES }, () => {
			// Plain paint rather than light, so they show on the pale wheat and sand too.
			const paint = () =>
				new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false });
			const ring = paint();
			const edge = paint();
			edge.color.copy(EDGE);
			const group = new THREE.Group();
			const under = new THREE.Mesh(RIPPLE_EDGE, edge);
			const over = new THREE.Mesh(RIPPLE, ring);
			under.renderOrder = 3;
			over.renderOrder = 4;
			group.add(under, over);
			group.position.y = 0.3;
			return { group, ring, edge };
		});
		const pin = new THREE.Mesh(
			PIN,
			new THREE.MeshStandardMaterial({ roughness: 0.5, flatShading: true, emissiveIntensity: 1 })
		);
		pin.castShadow = true;
		group.add(pillar, glow, ...ripples.map((r) => r.group), pin);
		group.visible = false;
		this.group.add(group);
		return { group, pillar, glow, ripples, pin, color: new THREE.Color(), age: 0, ground: 0 };
	}
}
