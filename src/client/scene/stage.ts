import {
	BloomEffect,
	BrightnessContrastEffect,
	DepthOfFieldEffect,
	EffectComposer,
	EffectPass,
	HueSaturationEffect,
	RenderPass,
	SMAAEffect,
	ToneMappingEffect,
	ToneMappingMode,
	VignetteEffect
} from 'postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CameraRig } from './camera';
import { Lighting } from './lighting';
import { sharedUniforms } from './voxel/materials';

export type Quality = 'high' | 'low';

/** The camera stands in the room, close to the table, so it has a wide lens (vertical, degrees). */
const FOV = 50;
/** Tall screens open the lens further, so the view is still this wide across (degrees). */
const MIN_ACROSS = 40;

/** Vertical field of view for a screen's aspect ratio. */
function fovFor(aspect: number) {
	const across = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(MIN_ACROSS / 2)) / aspect);
	return Math.max(FOV, THREE.MathUtils.radToDeg(across));
}

/** Owns the renderer, camera, lights and post-processing. Everything else adds to `scene`. */
export class Stage {
	readonly renderer: THREE.WebGLRenderer;
	readonly scene = new THREE.Scene();
	readonly camera: THREE.PerspectiveCamera;
	readonly rig: CameraRig;
	readonly lighting: Lighting;
	private composer: EffectComposer;
	private dof: DepthOfFieldEffect;
	private bloom: BloomEffect;
	private clock = new THREE.Clock();
	private updaters = new Set<(dt: number, t: number) => void>();
	private running = false;
	private quality: Quality;

	constructor(readonly canvas: HTMLCanvasElement, quality: Quality = 'high') {
		this.quality = quality;
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: false,
			powerPreference: 'high-performance',
			stencil: false,
			depth: true
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.25));
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.NoToneMapping;

		this.scene.background = new THREE.Color('#140b07');
		this.scene.fog = new THREE.Fog('#1a0e08', 520, 1250);
		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		this.scene.environmentIntensity = 0.38;

		this.camera = new THREE.PerspectiveCamera(FOV, 1, 4, 2400);
		this.rig = new CameraRig(this.camera, canvas);
		this.lighting = new Lighting(this.scene, quality);

		this.composer = new EffectComposer(this.renderer, {
			frameBufferType: THREE.HalfFloatType,
			multisampling: quality === 'high' ? 4 : 0
		});
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.dof = new DepthOfFieldEffect(this.camera, {
			focusDistance: 300,
			focusRange: 250,
			bokehScale: quality === 'high' ? 3.2 : 2,
			resolutionScale: 0.5
		});
		this.dof.target = new THREE.Vector3(0, 0, 0);
		this.bloom = new BloomEffect({
			intensity: 0.85,
			luminanceThreshold: 0.92,
			luminanceSmoothing: 0.22,
			mipmapBlur: true,
			radius: 0.72
		});
		const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
		const grade = new HueSaturationEffect({ saturation: 0.04, hue: 0 });
		const contrast = new BrightnessContrastEffect({ brightness: 0, contrast: 0.06 });
		const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.62 });
		this.composer.addPass(new EffectPass(this.camera, this.dof));
		this.composer.addPass(new EffectPass(this.camera, this.bloom, tone, grade, contrast, vignette));
		if (quality === 'low') this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));

		window.addEventListener('resize', this.resize);
		this.resize();
	}

	setFocus(target: THREE.Vector3) {
		this.dof.target = target;
	}

	setDepthOfField(enabled: boolean, range = 190) {
		this.dof.cocMaterial.focusRange = enabled ? range : 4000;
	}

	onFrame(fn: (dt: number, t: number) => void) {
		this.updaters.add(fn);
		return () => this.updaters.delete(fn);
	}

	start() {
		if (this.running) return;
		this.running = true;
		this.clock.start();
		const loop = () => {
			if (!this.running) return;
			requestAnimationFrame(loop);
			this.frame();
		};
		loop();
	}

	stop() {
		this.running = false;
	}

	private shift = 0;
	private shiftGoal = 0;

	/**
	 * Slide the rendered image sideways by a fraction of the screen width (a lens shift, so
	 * the orbit is unchanged). Menus use it to make room for a side panel.
	 */
	setLensShift(x: number) {
		this.shiftGoal = x;
	}

	private applyShift() {
		const w = this.canvas.clientWidth || window.innerWidth;
		const h = this.canvas.clientHeight || window.innerHeight;
		if (Math.abs(this.shift) < 1e-4) this.camera.clearViewOffset();
		else this.camera.setViewOffset(w, h, -this.shift * w, 0, w, h);
	}

	/** Render one frame (also used by tests and icon capture). */
	frame() {
		const dt = Math.min(0.05, this.clock.getDelta());
		const t = this.clock.elapsedTime;
		sharedUniforms.uTime.value = t;
		if (this.shift !== this.shiftGoal) {
			const d = this.shiftGoal - this.shift;
			this.shift = Math.abs(d) < 1e-4 ? this.shiftGoal : this.shift + d * Math.min(1, dt * 3.5);
			this.applyShift();
		}
		this.rig.update(dt);
		this.lighting.update(dt, t);
		for (const fn of this.updaters) fn(dt, t);
		this.composer.render(dt);
	}

	resize = () => {
		const w = this.canvas.clientWidth || window.innerWidth;
		const h = this.canvas.clientHeight || window.innerHeight;
		this.renderer.setSize(w, h, false);
		this.composer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.fov = fovFor(w / h);
		this.camera.updateProjectionMatrix();
		sharedUniforms.uViewport.value.set(w, h);
		this.applyShift();
	};

	get qualityLevel() {
		return this.quality;
	}

	dispose() {
		this.stop();
		window.removeEventListener('resize', this.resize);
		this.rig.dispose();
		this.composer.dispose();
		this.renderer.dispose();
	}
}
