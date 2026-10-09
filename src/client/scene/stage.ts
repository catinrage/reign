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

/** Very low is for old devices: no shadows, reflections or post-processing, and fewer pixels. */
export type Quality = 'high' | 'low' | 'veryLow';

/** The camera stands in the room, close to the table, so it has a wide lens (vertical, degrees). */
const FOV = 50;
/** Tall screens open the lens further, so the view is still this wide across (degrees). */
const MIN_ACROSS = 40;
/**
 * In the standard room, world units from the camera where the fog starts and where it is
 * thickest, and from the point in focus to where things are fully blurred.
 */
const FOG_NEAR = 520;
const FOG_FAR = 1250;
const FOCUS_RANGE = 250;
/** Very low draws the 3D view with at most this many pixels, about a 1366x768 screen's worth. */
const VERY_LOW_PIXELS = 1366 * 768;

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
	/** Very low has none: the scene is drawn straight to the screen. */
	private composer: EffectComposer | null = null;
	private dof: DepthOfFieldEffect | null = null;
	private clock = new THREE.Clock();
	private updaters = new Set<(dt: number, t: number) => void>();
	private running = false;
	private quality: Quality;

	constructor(readonly canvas: HTMLCanvasElement, quality: Quality = 'high') {
		this.quality = quality;
		const plain = quality === 'veryLow';
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: false,
			powerPreference: 'high-performance',
			stencil: false,
			depth: true
		});
		this.renderer.shadowMap.enabled = !plain;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		// Without post-processing, each material tone-maps its own colors as it draws them.
		this.renderer.toneMapping = plain ? THREE.NeutralToneMapping : THREE.NoToneMapping;

		this.scene.background = new THREE.Color('#140b07');
		this.scene.fog = new THREE.Fog('#1a0e08', FOG_NEAR, FOG_FAR);
		// The room's reflections (very low makes up for their light, see `Lighting`).
		if (!plain) {
			const pmrem = new THREE.PMREMGenerator(this.renderer);
			this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
			this.scene.environmentIntensity = 0.38;
		}

		this.camera = new THREE.PerspectiveCamera(FOV, 1, 4, 2400);
		this.rig = new CameraRig(this.camera, canvas);
		this.lighting = new Lighting(this.scene, quality);

		if (!plain) this.composer = this.postProcessing(quality === 'high');

		window.addEventListener('resize', this.resize);
		this.resize();
	}

	/** Depth of field, bloom and a color grade (high and low). */
	private postProcessing(high: boolean) {
		const composer = new EffectComposer(this.renderer, {
			frameBufferType: THREE.HalfFloatType,
			multisampling: high ? 4 : 0
		});
		composer.addPass(new RenderPass(this.scene, this.camera));
		this.dof = new DepthOfFieldEffect(this.camera, {
			focusDistance: 300,
			focusRange: FOCUS_RANGE,
			bokehScale: high ? 3.2 : 2,
			resolutionScale: 0.5
		});
		this.dof.target = new THREE.Vector3(0, 0, 0);
		const bloom = new BloomEffect({
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
		composer.addPass(new EffectPass(this.camera, this.dof));
		composer.addPass(new EffectPass(this.camera, bloom, tone, grade, contrast, vignette));
		if (!high) composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
		return composer;
	}

	/**
	 * Canvas pixels per CSS pixel: high and low cap it on sharp screens, and very low also keeps
	 * the whole view within VERY_LOW_PIXELS.
	 */
	private pixelRatio(w: number, h: number) {
		const dpr = window.devicePixelRatio || 1;
		if (this.quality === 'high') return Math.min(dpr, 2);
		if (this.quality === 'low') return Math.min(dpr, 1.25);
		return Math.min(dpr, 1, Math.sqrt(VERY_LOW_PIXELS / Math.max(1, w * h)));
	}

	setFocus(target: THREE.Vector3) {
		if (this.dof) this.dof.target = target;
	}

	/** How many times the standard room the room is, and the focus range there (null: no blur). */
	private roomScale = 1;
	private focusRange: number | null = FOCUS_RANGE;

	setDepthOfField(enabled: boolean, range = 190) {
		this.focusRange = enabled ? range : null;
		this.fitFocus();
	}

	/**
	 * Fit the fog, the depth of field and the key light's shadows to a room `scale` times the
	 * standard one, so they reach as far in it as in the standard room.
	 */
	fitRoom(scale: number) {
		this.roomScale = scale;
		const fog = this.scene.fog as THREE.Fog;
		fog.near = FOG_NEAR * scale;
		fog.far = FOG_FAR * scale;
		this.fitFocus();
		this.lighting.fitShadows(scale);
	}

	private fitFocus() {
		const range = this.focusRange;
		if (this.dof) this.dof.cocMaterial.focusRange = range === null ? 4000 : range * this.roomScale;
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
		if (this.composer) this.composer.render(dt);
		else this.renderer.render(this.scene, this.camera);
	}

	resize = () => {
		const w = this.canvas.clientWidth || window.innerWidth;
		const h = this.canvas.clientHeight || window.innerHeight;
		this.renderer.setPixelRatio(this.pixelRatio(w, h));
		this.renderer.setSize(w, h, false);
		this.composer?.setSize(w, h, false);
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
		this.composer?.dispose();
		this.renderer.dispose();
	}
}
