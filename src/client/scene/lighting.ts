import * as THREE from 'three';
import type { Quality } from './stage';
import { sharedUniforms } from './voxel/materials';

/**
 * Warm cozy-room lighting: a low golden key light that casts the soft shadows, a dim
 * hemisphere fill, and flickering point lights for the fireplace and lanterns.
 *
 * Night mode puts the room's lights out: the key light turns to cool moonlight from the
 * windows' side, the fill to the fire's orange glow from the hearth's side, and the flames burn
 * brighter. `night` fades towards `nightGoal` and is shared with the voxel shaders (`uNight`),
 * which light the windows and lanterns of the buildings.
 *
 * Low quality has no shadows and no reflections of the room (see `Stage`). A brighter
 * hemisphere and an even ambient light give back the light the reflections added, and only
 * the fire lights the room: every point light costs each pixel some work.
 */
/** Seconds the room takes to go dark, or light again. */
const NIGHT_FADE = 1.6;

const DAY = {
	key: new THREE.Color('#ffd09a'),
	sky: new THREE.Color('#ffe0b8'),
	ground: new THREE.Color('#4a2a18'),
	fill: new THREE.Color('#9fb3ff'),
	ambient: new THREE.Color('#ffffff')
};

/**
 * The room at night. Moonlight comes in where the day's key light did, from the windows' side,
 * bright enough to read the island by; the fire lights it from the other side.
 */
const NIGHT = {
	key: new THREE.Color('#a4b8f2'),
	keyIntensity: 0.75,
	sky: new THREE.Color('#66729e'),
	ground: new THREE.Color('#2a1810'),
	hemi: 0.32,
	fill: new THREE.Color('#ff8a3d'),
	fillIntensity: 0.7,
	ambient: new THREE.Color('#7a80b8'),
	ambientIntensity: 0.3,
	/** How much brighter the fire and lanterns burn. */
	flames: 0.5
};

export class Lighting {
	readonly key: THREE.DirectionalLight;
	readonly hemi: THREE.HemisphereLight;
	readonly fill: THREE.DirectionalLight;
	private flames: { light: THREE.PointLight; base: number; seed: number }[] = [];
	private hemiBase: number;
	private plain: boolean;
	/** Low's even light, standing in for the room's reflections. */
	private ambient: THREE.AmbientLight | null = null;
	/** 0 by day, 1 at night: fades towards `nightGoal`. */
	night = 0;
	nightGoal = 0;

	constructor(
		readonly scene: THREE.Scene,
		quality: Quality
	) {
		this.plain = quality === 'low';
		this.hemiBase = this.plain ? 2.25 : 0.9;
		this.hemi = new THREE.HemisphereLight('#ffe0b8', '#4a2a18', this.hemiBase);
		scene.add(this.hemi);
		if (this.plain) scene.add((this.ambient = new THREE.AmbientLight('#ffffff', 1)));

		this.key = new THREE.DirectionalLight('#ffd09a', 2.4);
		this.key.target.position.set(0, 0, 0);
		this.key.castShadow = !this.plain;
		const size = quality === 'high' ? 4096 : 2048;
		this.key.shadow.mapSize.set(size, size);
		this.key.shadow.bias = -0.0003;
		this.key.shadow.radius = 3;
		this.fitShadows(1);
		scene.add(this.key, this.key.target);

		this.fill = new THREE.DirectionalLight('#9fb3ff', 0.22);
		this.fill.position.set(200, 140, -160);
		scene.add(this.fill);
	}

	/**
	 * Cast the key light's shadows over a table `scale` times the standard one: the light stands
	 * back that much further, on the same line, with its shadow box grown to match.
	 */
	fitShadows(scale: number) {
		this.key.position.set(-190, 300, 150).multiplyScalar(scale);
		const cam = this.key.shadow.camera;
		cam.left = -190 * scale;
		cam.right = 190 * scale;
		cam.top = 190 * scale;
		cam.bottom = -190 * scale;
		cam.near = 50 * scale;
		cam.far = 900 * scale;
		cam.updateProjectionMatrix();
		this.key.shadow.normalBias = 0.35 * scale;
	}

	/** A flickering light. A `minor` one is left out of the scene at low quality. */
	addFlame(
		position: THREE.Vector3,
		color: string,
		intensity: number,
		distance: number,
		minor = false
	) {
		const light = new THREE.PointLight(color, intensity, distance, 1.15);
		light.position.copy(position);
		if (minor && this.plain) return light;
		this.scene.add(light);
		this.flames.push({ light, base: intensity, seed: Math.random() * 100 });
		return light;
	}

	update(dt: number, t: number) {
		if (this.night !== this.nightGoal) {
			const step = dt / NIGHT_FADE;
			this.night = this.night < this.nightGoal ? Math.min(this.nightGoal, this.night + step) : Math.max(this.nightGoal, this.night - step);
		}
		const n = THREE.MathUtils.smoothstep(this.night, 0, 1);
		let flick = 0;
		for (const f of this.flames) {
			const w =
				Math.sin(t * 7.3 + f.seed) * 0.08 +
				Math.sin(t * 13.1 + f.seed * 2) * 0.06 +
				Math.sin(t * 2.1 + f.seed * 3) * 0.05;
			f.light.intensity = f.base * (1 + w) * (1 + n * NIGHT.flames);
			flick = w;
		}
		sharedUniforms.uFlicker.value = 1 + flick * 2;
		sharedUniforms.uNight.value = n;
		this.key.color.lerpColors(DAY.key, NIGHT.key, n);
		this.key.intensity = THREE.MathUtils.lerp(2.4, NIGHT.keyIntensity, n);
		this.hemi.color.lerpColors(DAY.sky, NIGHT.sky, n);
		this.hemi.groundColor.lerpColors(DAY.ground, NIGHT.ground, n);
		this.hemi.intensity = this.hemiBase * THREE.MathUtils.lerp(1, NIGHT.hemi, n);
		// The fire's glow from the hearth's side flickers with the flames.
		this.fill.color.lerpColors(DAY.fill, NIGHT.fill, n);
		this.fill.intensity = THREE.MathUtils.lerp(0.22, NIGHT.fillIntensity * (1 + flick * 0.8), n);
		if (this.ambient) {
			this.ambient.color.lerpColors(DAY.ambient, NIGHT.ambient, n);
			this.ambient.intensity = THREE.MathUtils.lerp(1, NIGHT.ambientIntensity, n);
		}
	}
}
