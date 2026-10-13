import * as THREE from 'three';
import type { DiceStyleId } from '../../shared/accounts';
import type { Animator } from './anim';
import { DIE_FACES, DIE_VOXELS, cloneModel, dieModel } from './board/models';
import type { Particles } from './effects';

const UP = new THREE.Vector3(0, 1, 0);
const DIE_SCALE = 0.68;
const HALF = (DIE_VOXELS / 2) * DIE_SCALE;

/** Half the width of a die, in world units: the dice need this much clear table round them. */
export const DIE_HALF = HALF;

/**
 * Two voxel dice that get tossed onto the table and tumble to the rolled faces, in the style of
 * whoever throws them.
 */
export class Dice {
	readonly dice: THREE.Group[] = [];
	private rolling = false;
	private style: DiceStyleId = 'classic';

	constructor(
		readonly scene: THREE.Scene,
		readonly anim: Animator,
		readonly particles: Particles
	) {
		for (let i = 0; i < 2; i++) {
			const d = new THREE.Group();
			d.add(cloneModel(dieModel()));
			d.scale.setScalar(DIE_SCALE);
			d.quaternion.copy(this.faceUp(i === 0 ? 5 : 2, i * 1.3));
			// Out of sight until the table is ready and they are put down (see `place`).
			d.visible = false;
			scene.add(d);
			this.dice.push(d);
		}
	}

	/** Throw dice of this style from now on (they change in the thrower's hand, out of sight). */
	setStyle(style: DiceStyleId) {
		if (style === this.style) return;
		this.style = style;
		for (const d of this.dice) {
			d.clear();
			d.add(cloneModel(dieModel(style)));
		}
	}

	/** Show the dice on the table or put them away (Conquest rolls its own in the interface). */
	setShown(on: boolean) {
		for (const d of this.dice) d.visible = on;
	}

	/** Put the dice down at rest, without a toss. */
	place(ends: [THREE.Vector3, THREE.Vector3]) {
		if (this.rolling) return;
		this.dice.forEach((d, i) => {
			d.position.copy(ends[i]).setY(HALF);
			d.visible = true;
		});
	}

	private faceUp(value: number, yaw: number) {
		const q = new THREE.Quaternion().setFromUnitVectors(DIE_FACES[value], UP);
		return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(q);
	}

	/**
	 * Toss from `from` (the thrower's side) so the dice land at `ends`, showing `values`. They come
	 * to rest about a second after the roll, when the interface shows the result. `yaw` is the turn
	 * about the vertical that squares a die's faces with the view (see `GameScene.diceSpots`).
	 */
	async roll(
		values: [number, number],
		from: THREE.Vector3,
		ends: [THREE.Vector3, THREE.Vector3],
		yaw = Math.random() * Math.PI * 2
	) {
		this.rolling = true;
		const duration = 0.95;
		const mid = ends[0].clone().add(ends[1]).multiplyScalar(0.5);
		await Promise.all(
			this.dice.map((d, i) => {
				d.visible = true;
				const end = ends[i].clone().setY(HALF);
				// Side by side all the way, so the two paths never cross.
				const start = from.clone().add(ends[i].clone().sub(mid).setY(0));
				// They come to rest square to the view, give or take a few degrees, so the spots on
				// top read at a glance. A 1 stands upright, as some styles draw a picture on it.
				const quarter = values[i] === 1 ? 0 : Math.floor(Math.random() * 4);
				const turn = (quarter * Math.PI) / 2 + (Math.random() - 0.5) * 0.14;
				const qEnd = this.faceUp(values[i], yaw + turn);
				const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
				// Fewer turns for the shorter toss, so they spin as fast as before.
				const spins = (2.2 + Math.random() * 1.4) * Math.PI * 2;
				let bounced = 0;
				return this.anim.tween(
					duration + i * 0.06,
					(t) => {
						// Horizontal glide with drag, vertical bounces.
						const h = 1 - Math.pow(1 - t, 2.4);
						d.position.lerpVectors(start, end, h);
						let y: number;
						if (t < 0.45) {
							const u = t / 0.45;
							y = THREE.MathUtils.lerp(start.y, HALF, u) + Math.sin(u * Math.PI) * 14;
						} else if (t < 0.72) {
							const u = (t - 0.45) / 0.27;
							y = HALF + Math.sin(u * Math.PI) * 6;
							if (bounced === 0) this.thud(d, (bounced = 1));
						} else if (t < 0.88) {
							const u = (t - 0.72) / 0.16;
							y = HALF + Math.sin(u * Math.PI) * 1.8;
							if (bounced === 1) this.thud(d, (bounced = 2));
						} else {
							y = HALF;
							if (bounced === 2) this.thud(d, (bounced = 3));
						}
						d.position.y = y;
						const r = 1 - Math.pow(1 - t, 3);
						const spin = new THREE.Quaternion().setFromAxisAngle(axis, (1 - r) * spins);
						d.quaternion.copy(qEnd).premultiply(spin);
					},
					(t) => t
				);
			})
		);
		this.rolling = false;
	}

	private thud(d: THREE.Object3D, n: number) {
		const p = d.position.clone();
		p.y = 0.5;
		this.particles.dust(p, n === 1 ? 10 : 5);
	}

	get busy() {
		return this.rolling;
	}
}
