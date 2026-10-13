import * as THREE from 'three';
import { FRAG_OUTPUT } from '../voxel/materials';

/**
 * A bold arrow arching over the map from one territory to another: an attack in the attacker's
 * color, armies on the move in theirs. Chevrons run along it towards the target, so which way it
 * goes is never in doubt, and it is drawn over everything so no mountain hides it.
 */

const SEGMENTS = 40;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uLength;
uniform float uOpacity;
uniform float uDashed;
varying vec2 vUv;
void main() {
	// u runs along the arrow (world units), v across it (0..1).
	float u = vUv.x;
	float v = vUv.y;
	float across = abs(v - 0.5) * 2.0;
	// Chevrons pointing ahead, marching forward.
	float chev = fract((u - uTime * 6.0) / 3.2 - across * 0.35);
	float stripe = step(0.62, chev);
	vec3 cream = vec3(1.0, 0.95, 0.82);
	vec3 col = mix(uColor, mix(uColor, cream, 0.55), stripe);
	// A dark edge all round, so it reads on any ground.
	float edge = smoothstep(0.72, 0.8, across);
	col = mix(col, vec3(0.12, 0.07, 0.04), edge);
	// A dashed course (a move in preview) rather than a solid one.
	float gap = uDashed * step(0.6, fract(u / 2.4 - uTime * 0.8));
	// Fade in from the start.
	float a = uOpacity * smoothstep(0.0, 1.6, u) * (1.0 - gap);
	if (a < 0.01) discard;
	gl_FragColor = vec4(col, a);
	${FRAG_OUTPUT}
}
`;

export type ArrowStyle = 'attack' | 'move' | 'preview';

export class BoardArrow {
	readonly group = new THREE.Group();
	private readonly body: THREE.Mesh;
	private readonly head: THREE.Mesh;
	private readonly geo = new THREE.BufferGeometry();
	private readonly material: THREE.ShaderMaterial;
	private readonly headMaterial: THREE.ShaderMaterial;
	private from: THREE.Vector3 | null = null;
	private to: THREE.Vector3 | null = null;
	private shown = 0;
	private style: ArrowStyle = 'attack';
	private readonly positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
	private readonly uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
	private readonly headGeo = new THREE.BufferGeometry();
	private readonly headPos = new Float32Array(9);
	/** A strike: the arrow lunges forward and back (a battle being fought). */
	private lunge = 0;

	constructor() {
		const index: number[] = [];
		for (let i = 0; i < SEGMENTS; i++) {
			const a = i * 2;
			index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
		this.geo.setIndex(index);
		this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
		this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
		const uniforms = () => ({
			uColor: { value: new THREE.Color(0xffffff) },
			uTime: { value: 0 },
			uLength: { value: 1 },
			uOpacity: { value: 0 },
			uDashed: { value: 0 }
		});
		const make = () =>
			new THREE.ShaderMaterial({
				uniforms: uniforms(),
				vertexShader: VERT,
				fragmentShader: FRAG,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				side: THREE.DoubleSide
			});
		this.material = make();
		this.headMaterial = make();
		this.body = new THREE.Mesh(this.geo, this.material);
		this.body.frustumCulled = false;
		this.body.renderOrder = 6;
		this.headGeo.setAttribute('position', new THREE.BufferAttribute(this.headPos, 3));
		this.headGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([2, 0, 2, 1, 2, 0.5]), 2));
		this.head = new THREE.Mesh(this.headGeo, this.headMaterial);
		this.head.frustumCulled = false;
		this.head.renderOrder = 6;
		this.group.add(this.body, this.head);
		this.group.name = 'arrow';
	}

	/** Point from `from` to `to` (world, on the ground), or hide it (null). */
	set(from: THREE.Vector3 | null, to: THREE.Vector3 | null, color: number, style: ArrowStyle = 'attack') {
		if (from && to) {
			this.from = from.clone();
			this.to = to.clone();
		} else {
			// Keep the last course while it fades out.
			if (!this.from) return;
		}
		this.visibleGoal = from && to ? 1 : 0;
		this.style = style;
		for (const m of [this.material, this.headMaterial]) {
			m.uniforms.uColor.value.setHex(color);
			m.uniforms.uDashed.value = style === 'preview' ? 1 : 0;
		}
	}

	strike() {
		this.lunge = 1;
	}

	private visibleGoal = 0;

	/** `ppu`: pixels per world unit around the arrow, so it keeps a readable width from afar. */
	update(dt: number, t: number, camera: THREE.Camera, ppu: number) {
		this.shown += (this.visibleGoal - this.shown) * (1 - Math.exp(-dt * 14));
		this.lunge = Math.max(0, this.lunge - dt * 3);
		const visible = this.shown > 0.01 && !!this.from && !!this.to;
		this.group.visible = visible;
		if (!visible) return;
		const from = this.from!;
		const to = this.to!;
		const dist = from.distanceTo(to);
		const width = Math.max(1.5, 15 / Math.max(0.1, ppu)) * (this.style === 'preview' ? 0.8 : 1);
		const rise = 3.5 + dist * 0.28;
		const a = from.clone().add(new THREE.Vector3(0, 2.5, 0));
		const b = to.clone().add(new THREE.Vector3(0, 2, 0));
		const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, rise, 0));
		const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
		// Start clear of the medallion it leaves, end at the edge of the one it strikes.
		const t0 = Math.min(0.3, 3.2 / Math.max(1, dist));
		const reach = Math.max(t0 + 0.05, 1 - Math.min(0.35, (3.6 + this.lunge * -2.2) / Math.max(1, dist)));
		const eye = camera.position;
		const p = new THREE.Vector3();
		const tan = new THREE.Vector3();
		const side = new THREE.Vector3();
		const toEye = new THREE.Vector3();
		let u = 0;
		let prev: THREE.Vector3 | null = null;
		for (let i = 0; i <= SEGMENTS; i++) {
			const s = t0 + ((reach - t0) * i) / SEGMENTS;
			curve.getPoint(s, p);
			curve.getTangent(s, tan);
			toEye.subVectors(eye, p).normalize();
			side.crossVectors(tan, toEye).normalize();
			// Thinner at the tail, full width towards the head.
			const w = (width / 2) * (0.55 + 0.45 * Math.min(1, i / (SEGMENTS * 0.4)));
			if (prev) u += p.distanceTo(prev);
			prev = (prev ?? new THREE.Vector3()).copy(p);
			const o = i * 6;
			this.positions[o] = p.x + side.x * w;
			this.positions[o + 1] = p.y + side.y * w;
			this.positions[o + 2] = p.z + side.z * w;
			this.positions[o + 3] = p.x - side.x * w;
			this.positions[o + 4] = p.y - side.y * w;
			this.positions[o + 5] = p.z - side.z * w;
			const q = i * 4;
			this.uvs[q] = u;
			this.uvs[q + 1] = 0;
			this.uvs[q + 2] = u;
			this.uvs[q + 3] = 1;
		}
		this.geo.attributes.position.needsUpdate = true;
		this.geo.attributes.uv.needsUpdate = true;
		// The head: a broad triangle beyond the last segment.
		curve.getPoint(reach, p);
		curve.getTangent(reach, tan);
		toEye.subVectors(eye, p).normalize();
		side.crossVectors(tan, toEye).normalize();
		const hw = width * 1.25;
		const tip = p.clone().addScaledVector(tan, width * 1.5);
		this.headPos.set([p.x + side.x * hw, p.y + side.y * hw, p.z + side.z * hw, p.x - side.x * hw, p.y - side.y * hw, p.z - side.z * hw, tip.x, tip.y, tip.z]);
		this.headGeo.attributes.position.needsUpdate = true;
		const uvHead = this.headGeo.attributes.uv as THREE.BufferAttribute;
		(uvHead.array as Float32Array).set([u, 0, u, 1, u + width * 1.5, 0.5]);
		uvHead.needsUpdate = true;
		for (const m of [this.material, this.headMaterial]) {
			m.uniforms.uTime.value = t;
			m.uniforms.uLength.value = u;
			m.uniforms.uOpacity.value = this.shown * (this.style === 'preview' ? 0.85 : 0.97);
		}
	}

	dispose() {
		this.geo.dispose();
		this.headGeo.dispose();
		this.material.dispose();
		this.headMaterial.dispose();
	}
}
