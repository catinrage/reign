import * as THREE from 'three';

/**
 * Voxel particles: one instanced mesh of little cubes used for dust puffs when pieces land,
 * sparkles on production, and confetti for the winner.
 */
interface Particle {
	pos: THREE.Vector3;
	vel: THREE.Vector3;
	rot: THREE.Euler;
	spin: THREE.Vector3;
	life: number;
	maxLife: number;
	size: number;
	gravity: number;
	drag: number;
	color: THREE.Color;
	/** Grows in and shrinks away again (a firefly), rather than starting at full size. */
	swell: boolean;
}

const MAX = 1500;

export class Particles {
	readonly mesh: THREE.InstancedMesh;
	private list: Particle[] = [];
	private dummy = new THREE.Object3D();
	private max: number;

	/** `glow` particles give light rather than catch it (sparks, fireflies), and cast no shadows. */
	constructor(scene: THREE.Scene, glow = false) {
		const geo = new THREE.BoxGeometry(1, 1, 1);
		const mat = glow ? new THREE.MeshBasicMaterial() : new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: '#000000' });
		this.max = glow ? 300 : MAX;
		this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.count = 0;
		this.mesh.castShadow = !glow;
		this.mesh.frustumCulled = false;
		this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
		scene.add(this.mesh);
	}

	emit(opts: {
		at: THREE.Vector3;
		count: number;
		colors: (string | number | THREE.Color)[];
		speed?: number;
		up?: number;
		spread?: number;
		life?: number;
		size?: number;
		gravity?: number;
		drag?: number;
		swell?: boolean;
	}) {
		for (let i = 0; i < opts.count && this.list.length < this.max; i++) {
			const ang = Math.random() * Math.PI * 2;
			const sp = (opts.speed ?? 10) * (0.4 + Math.random() * 0.6);
			const spread = opts.spread ?? 1;
			this.list.push({
				pos: opts.at.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * 0.5, (Math.random() - 0.5) * spread)),
				vel: new THREE.Vector3(Math.cos(ang) * sp, (opts.up ?? 8) * (0.5 + Math.random() * 0.8), Math.sin(ang) * sp),
				rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
				spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
				life: 0,
				maxLife: (opts.life ?? 0.9) * (0.7 + Math.random() * 0.6),
				size: (opts.size ?? 0.8) * (0.6 + Math.random() * 0.6),
				gravity: opts.gravity ?? 30,
				drag: opts.drag ?? 2.5,
				color: new THREE.Color(opts.colors[Math.floor(Math.random() * opts.colors.length)]),
				swell: !!opts.swell
			});
		}
	}

	dust(at: THREE.Vector3, amount = 18) {
		this.emit({ at, count: amount, colors: ['#e8d4a8', '#d9c08e', '#f2e2c0', '#c7ab7c'], speed: 14, up: 5, spread: 3, life: 0.7, size: 0.9, gravity: 12, drag: 4 });
	}

	sparkle(at: THREE.Vector3, color: string | number, amount = 14) {
		this.emit({ at, count: amount, colors: [color, '#fff6c8', '#ffffff'], speed: 6, up: 16, spread: 4, life: 1.1, size: 0.6, gravity: 10, drag: 1.5 });
	}

	confetti(at: THREE.Vector3, colors: (string | number)[], amount = 400) {
		this.emit({ at, count: amount, colors, speed: 45, up: 60, spread: 30, life: 4, size: 1.4, gravity: 22, drag: 0.9 });
	}

	update(dt: number) {
		// Nothing alive and nothing drawn: no buffers to send (they hold MAX particles).
		if (!this.list.length && !this.mesh.count) return;
		let n = 0;
		let live = 0;
		for (const p of this.list) if ((p.life += dt) < p.maxLife) this.list[live++] = p;
		this.list.length = live;
		for (const p of this.list) {
			p.vel.y -= p.gravity * dt;
			p.vel.multiplyScalar(Math.exp(-p.drag * dt));
			p.pos.addScaledVector(p.vel, dt);
			if (p.pos.y < 0.5) {
				p.pos.y = 0.5;
				p.vel.y *= -0.3;
				p.vel.x *= 0.7;
				p.vel.z *= 0.7;
			}
			p.rot.x += p.spin.x * dt;
			p.rot.y += p.spin.y * dt;
			p.rot.z += p.spin.z * dt;
			const k = p.swell ? Math.sin((Math.PI * p.life) / p.maxLife) : 1 - Math.pow(p.life / p.maxLife, 3);
			this.dummy.position.copy(p.pos);
			this.dummy.rotation.copy(p.rot);
			this.dummy.scale.setScalar(p.size * k);
			this.dummy.updateMatrix();
			this.mesh.setMatrixAt(n, this.dummy.matrix);
			this.mesh.setColorAt(n, p.color);
			n++;
		}
		this.mesh.count = n;
		if (!n) return;
		// Only the live particles' part of the buffers goes to the graphics card.
		const matrices = this.mesh.instanceMatrix;
		matrices.clearUpdateRanges();
		matrices.addUpdateRange(0, n * 16);
		matrices.needsUpdate = true;
		const colors = this.mesh.instanceColor!;
		colors.clearUpdateRanges();
		colors.addUpdateRange(0, n * 3);
		colors.needsUpdate = true;
	}
}
