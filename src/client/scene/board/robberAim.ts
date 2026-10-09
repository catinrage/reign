import * as THREE from 'three';
import { Mat } from '../voxel/grid';
import { sharedUniforms } from '../voxel/materials';
import { ease } from '../anim';
import type { Particles } from '../effects';
import { HEX_R, VOXEL } from '../layout';
import type { BoardView } from './boardView';
import { cloneModel, robberModel } from './models';
import { LAND_TOP } from './terrain';

/** Height of the curtain of light round the tile. */
const CURTAIN_H = 11;
const GHOST = new THREE.Color('#2a2633');
/** Seconds the light takes to come up on a tile, and to go out. */
const FADE_IN = 0.12;
const FADE_OUT = 0.18;

/**
 * Lights up the tile the robber is about to be moved to, in the color of the player moving it,
 * on every player's board: the tile glows from the middle out with a spark chasing round its
 * border (the island's shader, `sharedUniforms.uAim`), a curtain of light rises from the
 * border, a ghost of the robber floats where it would stand, the number token bobs and sparks
 * drift up.
 */
export class RobberAim {
	private hex = -1;
	private on = false;
	private amount = 0;
	/** Seconds since the light moved to this tile. */
	private since = 0;
	private sparkClock = 0;
	private readonly color = new THREE.Color();
	/** The player's color at full brightness, for light. */
	private readonly hue = new THREE.Color();
	private readonly group = new THREE.Group();
	private readonly curtain: THREE.Mesh;
	private readonly curtainMat: THREE.ShaderMaterial;
	private readonly ghost: THREE.Group;
	private readonly ghostMat: THREE.MeshStandardMaterial;
	private readonly eyesMat: THREE.MeshBasicMaterial;
	private readonly spot = new THREE.Vector3();

	constructor(
		scene: THREE.Scene,
		private particles: Particles
	) {
		this.curtainMat = new THREE.ShaderMaterial({
			uniforms: {
				uColor: { value: this.hue },
				uAmount: { value: 0 },
				/** 0..1, where the rising bands are. */
				uPhase: { value: 0 }
			},
			vertexShader: /* glsl */ `
				varying float vY;
				void main() {
					vY = uv.y;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}`,
			// In steps like the pixel art of the interface: brightest at the foot, fading out
			// upward, with bands of light rising through it. Only the far walls are drawn (their
			// inside faces), so the light stands behind the tile and never fogs it over. No pow and
			// no clock in here (see `sharedUniforms.uAimWave`).
			fragmentShader: /* glsl */ `
				uniform vec3 uColor;
				uniform float uAmount;
				uniform float uPhase;
				varying float vY;
				void main() {
					float y = floor(vY * 11.0) / 11.0;
					float band = step(0.55, fract(y * 2.75 - uPhase));
					float f = clamp(1.0 - y, 0.0, 1.0);
					float a = f * sqrt(f) * (0.6 + 0.4 * band) * uAmount;
					gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.15) * a, 1.0);
				}`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.BackSide
		});
		// Six open walls standing on the beige line round a tile (corners point along z, as the
		// tiles' do).
		const walls = new THREE.CylinderGeometry(HEX_R, HEX_R, CURTAIN_H, 6, 1, true).translate(0, CURTAIN_H / 2, 0);
		this.curtain = new THREE.Mesh(walls, this.curtainMat);
		this.curtain.renderOrder = 2;
		this.group.add(this.curtain);

		this.ghostMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.6 });
		this.eyesMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a5c').multiplyScalar(2.2), transparent: true });
		this.ghost = cloneModel(robberModel());
		this.ghost.traverse((o) => {
			const m = o as THREE.Mesh;
			if (!m.isMesh) return;
			m.material = m.userData.voxMat === Mat.Glow ? this.eyesMat : this.ghostMat;
			m.castShadow = false;
			m.receiveShadow = false;
		});
		this.ghost.scale.setScalar(0.86);
		this.group.add(this.ghost);
		this.group.visible = false;
		scene.add(this.group);
	}

	/** Light up `hex` (null: none) in `color` (0xrrggbb). */
	set(board: BoardView | null, hex: number | null, color: number, ghost = true) {
		if (hex === null || !board) {
			this.on = false;
			return;
		}
		this.on = true;
		// A power that picks a tile lights it the same way, with no robber floating over it.
		this.ghost.visible = ghost;
		this.color.set(color);
		this.hue.copy(this.color).multiplyScalar(1 / Math.max(this.color.r, this.color.g, this.color.b, 1e-3));
		sharedUniforms.uAimColor.value.copy(this.color);
		// The ghost is the robber's dark cloak, tinted and lit in the player's color.
		this.ghostMat.color.copy(GHOST).lerp(this.color, 0.4);
		this.ghostMat.emissive.copy(this.hue);
		if (hex === this.hex && this.amount > 0) return;
		const was = this.hex;
		this.hex = hex;
		this.since = 0;
		const c = board.hexCenter(hex);
		this.curtain.position.set(c.x, LAND_TOP - VOXEL, c.z);
		this.spot.copy(board.robberSpot(hex));
		board.setAimed(hex);
		// Moving from tile to tile it stays lit; coming up from nothing it fades in.
		if (was < 0) this.amount = 0;
	}

	/** Put the light out at once (a new island, the end of a game). */
	clear(board: BoardView | null) {
		this.on = false;
		this.amount = 0;
		this.hex = -1;
		board?.setAimed(-1);
		this.apply();
	}

	update(dt: number, t: number, board: BoardView | null, cameraAzimuth: number) {
		if (!board || this.hex < 0) return;
		if (this.on) this.amount = Math.min(1, this.amount + dt / FADE_IN);
		else this.amount = Math.max(0, this.amount - dt / FADE_OUT);
		this.since += dt;
		// How the light moves, worked out here rather than in the shaders (see
		// `sharedUniforms.uAimWave`): the sparks' heading, a pulse, the phase of the rings and bands.
		const spin = t * 2.6;
		const phase = (t * 0.9) % 1;
		sharedUniforms.uAimWave.value.set(Math.cos(spin), Math.sin(spin), 0.5 + 0.5 * Math.sin(t * 5), phase);
		this.curtainMat.uniforms.uPhase.value = phase;
		if (!this.on && this.amount === 0) {
			this.hex = -1;
			board.setAimed(-1);
			this.apply();
			return;
		}
		this.apply();

		// The curtain shoots up from the border, overshooting a little.
		const grow = ease.outBack(Math.min(1, this.since / 0.32));
		this.curtain.scale.set(1, Math.max(0.001, grow), 1);
		this.curtainMat.uniforms.uAmount.value = this.amount * (0.85 + Math.sin(t * 5) * 0.15);

		// The ghost drops in from above and hovers where the robber would stand, facing the camera.
		const drop = 1 - ease.outCubic(Math.min(1, this.since / 0.28));
		this.ghost.position.set(this.spot.x, this.spot.y + 1.8 + Math.sin(t * 3.2) * 0.6 + drop * 9, this.spot.z);
		this.ghost.rotation.y = cameraAzimuth + Math.sin(t * 1.7) * 0.25;
		this.ghostMat.opacity = 0.8 * this.amount;
		this.eyesMat.opacity = this.amount;
		this.ghostMat.emissiveIntensity = 0.4 + Math.sin(t * 5) * 0.15;

		// Sparks drift up off the border.
		this.sparkClock += dt;
		if (this.on && this.sparkClock > 0.05) {
			this.sparkClock = 0;
			const c = board.hexCenter(this.hex);
			const side = Math.floor(Math.random() * 6);
			const a0 = (Math.PI / 3) * side - Math.PI / 2;
			const a1 = a0 + Math.PI / 3;
			const k = Math.random();
			const at = new THREE.Vector3(
				c.x + (Math.cos(a0) * (1 - k) + Math.cos(a1) * k) * HEX_R,
				LAND_TOP,
				c.z + (Math.sin(a0) * (1 - k) + Math.sin(a1) * k) * HEX_R
			);
			this.particles.emit({ at, count: 1, colors: [this.color.getHex(), '#ffffff'], speed: 0.8, up: 5, spread: 0.4, life: 1.3, size: 0.55, gravity: -2, drag: 1.2 });
		}
	}

	private apply() {
		const lit = this.hex >= 0 && this.amount > 0;
		this.group.visible = lit;
		const u = sharedUniforms.uAim.value;
		if (!lit) {
			u.set(0, 0, 0, 0);
			return;
		}
		u.set(this.curtain.position.x, this.curtain.position.z, this.amount, this.since);
	}
}
