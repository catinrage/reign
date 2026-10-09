import * as THREE from 'three';
import type { Quality } from './stage';
import { sharedUniforms } from './voxel/materials';

/**
 * Warm cozy-room lighting: a low golden key light that casts the soft shadows, a dim
 * hemisphere fill, and flickering point lights for the fireplace and lanterns.
 * `night` (0..1) is the hook for the later day/night cycle.
 */
export class Lighting {
	readonly key: THREE.DirectionalLight;
	readonly hemi: THREE.HemisphereLight;
	readonly fill: THREE.DirectionalLight;
	private flames: { light: THREE.PointLight; base: number; seed: number }[] = [];
	night = 0;

	constructor(
		readonly scene: THREE.Scene,
		quality: Quality
	) {
		this.hemi = new THREE.HemisphereLight('#ffe0b8', '#4a2a18', 0.9);
		scene.add(this.hemi);

		this.key = new THREE.DirectionalLight('#ffd09a', 2.4);
		this.key.target.position.set(0, 0, 0);
		this.key.castShadow = true;
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

	addFlame(position: THREE.Vector3, color: string, intensity: number, distance: number) {
		const light = new THREE.PointLight(color, intensity, distance, 1.15);
		light.position.copy(position);
		this.scene.add(light);
		this.flames.push({ light, base: intensity, seed: Math.random() * 100 });
		return light;
	}

	update(_dt: number, t: number) {
		let flick = 0;
		for (const f of this.flames) {
			const n =
				Math.sin(t * 7.3 + f.seed) * 0.08 +
				Math.sin(t * 13.1 + f.seed * 2) * 0.06 +
				Math.sin(t * 2.1 + f.seed * 3) * 0.05;
			f.light.intensity = f.base * (1 + n) * (1 + this.night * 0.6);
			flick = n;
		}
		sharedUniforms.uFlicker.value = 1 + flick * 2;
		sharedUniforms.uNight.value = this.night;
		this.key.intensity = 2.4 * (1 - this.night * 0.85);
		this.hemi.intensity = 0.9 * (1 - this.night * 0.6);
	}
}
