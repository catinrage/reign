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
import { ShadowCache } from './shadowCache';
import { sharedUniforms } from './voxel/materials';

/** Low is for old devices: no shadows, reflections or post-processing, and fewer pixels. */
export type Quality = 'high' | 'medium' | 'low';

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
/** Low draws the 3D view with at most this many pixels, about a 1366x768 screen's worth. */
const LOW_PIXELS = 1366 * 768;

/** The room beyond the light, by day and at night. */
const DAY_BACK = new THREE.Color('#140b07');
const DAY_FOG = new THREE.Color('#1a0e08');
const NIGHT_BACK = new THREE.Color('#07070e');
const NIGHT_FOG = new THREE.Color('#0b0a14');

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
	/** Low has no shadows. */
	readonly shadows: ShadowCache | null = null;
	/** Low has none: the scene is drawn straight to the screen. */
	private composer: EffectComposer | null = null;
	private dof: DepthOfFieldEffect | null = null;
	private bloom: BloomEffect | null = null;
	private vignette: VignetteEffect | null = null;
	/** The night the room was last drawn at (see `applyNight`). */
	private nightShown = -1;
	private clock = new THREE.Clock();
	private updaters = new Set<(dt: number, t: number) => void>();
	private running = false;
	private quality: Quality;
	/**
	 * Where the canvas is on the page, in CSS pixels, as of the last resize: pointer events and
	 * tooltips read this rather than asking the page to lay itself out again.
	 */
	readonly box = { left: 0, top: 0, width: 1, height: 1 };

	constructor(readonly canvas: HTMLCanvasElement, quality: Quality = 'high') {
		this.quality = quality;
		const plain = quality === 'low';
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

		this.scene.background = DAY_BACK.clone();
		this.scene.fog = new THREE.Fog(DAY_FOG.clone(), FOG_NEAR, FOG_FAR);
		// The room's reflections (low quality makes up for their light, see `Lighting`).
		if (!plain) {
			const pmrem = new THREE.PMREMGenerator(this.renderer);
			this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
			this.scene.environmentIntensity = 0.38;
		}

		this.camera = new THREE.PerspectiveCamera(FOV, 1, 4, 2400);
		this.rig = new CameraRig(this.camera, canvas);
		this.lighting = new Lighting(this.scene, quality);
		if (!plain) this.shadows = new ShadowCache(this.renderer, this.scene, this.lighting.key);

		if (!plain) this.composer = this.postProcessing(quality === 'high');

		window.addEventListener('resize', this.resize);
		this.resize();
	}

	/**
	 * Build the shaders for `object` (the whole scene by default) ahead of its first frame, in
	 * the background where the browser can, so nothing stalls a frame to build them later.
	 */
	async compile(object: THREE.Object3D = this.scene) {
		const r = this.renderer;
		const back = r.getRenderTarget();
		// Shaders are built for where they draw: post-processing draws the scene into a buffer of
		// its own (linear colors), not straight to the screen (sRGB), so build them for that.
		if (this.composer) r.setRenderTarget(this.composer.inputBuffer);
		let ready: Promise<unknown>;
		try {
			ready = r.compileAsync(object, this.camera, this.scene);
		} finally {
			r.setRenderTarget(back);
		}
		await ready.catch(() => {});
	}

	/** Depth of field, bloom and a color grade (high and medium). */
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
		const bloom = (this.bloom = new BloomEffect({
			intensity: 0.85,
			luminanceThreshold: 0.92,
			luminanceSmoothing: 0.22,
			mipmapBlur: true,
			radius: 0.72
		}));
		const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
		const grade = new HueSaturationEffect({ saturation: 0.04, hue: 0 });
		const contrast = new BrightnessContrastEffect({ brightness: 0, contrast: 0.06 });
		const vignette = (this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.62 }));
		composer.addPass(new EffectPass(this.camera, this.dof));
		composer.addPass(new EffectPass(this.camera, bloom, tone, grade, contrast, vignette));
		if (!high) composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
		return composer;
	}

	/**
	 * Canvas pixels per CSS pixel: high and medium cap it on sharp screens, and low also keeps
	 * the whole view within LOW_PIXELS.
	 */
	private pixelRatio(w: number, h: number) {
		const dpr = window.devicePixelRatio || 1;
		if (this.quality === 'high') return Math.min(dpr, 2);
		if (this.quality === 'medium') return Math.min(dpr, 1.25);
		return Math.min(dpr, 1, Math.sqrt(LOW_PIXELS / Math.max(1, w * h)));
	}

	/** Night mode on or off: the room fades to night (or back), or changes at once if `instant`. */
	setNight(on: boolean, instant = false) {
		this.lighting.nightGoal = on ? 1 : 0;
		if (instant) this.lighting.night = this.lighting.nightGoal;
	}

	get night() {
		return this.lighting.nightGoal === 1;
	}

	/**
	 * The parts of night that aren't lights: a darker, bluer room beyond the light, dimmer
	 * reflections, and windows and flames that glow out into the dark.
	 */
	private applyNight() {
		const n = sharedUniforms.uNight.value;
		if (n === this.nightShown) return;
		this.nightShown = n;
		(this.scene.background as THREE.Color).lerpColors(DAY_BACK, NIGHT_BACK, n);
		(this.scene.fog as THREE.Fog).color.lerpColors(DAY_FOG, NIGHT_FOG, n);
		if (this.scene.environment) this.scene.environmentIntensity = THREE.MathUtils.lerp(0.38, 0.1, n);
		if (this.bloom) {
			this.bloom.intensity = THREE.MathUtils.lerp(0.85, 1.25, n);
			this.bloom.luminanceMaterial.threshold = THREE.MathUtils.lerp(0.92, 0.7, n);
		}
		if (this.vignette) this.vignette.darkness = THREE.MathUtils.lerp(0.62, 0.8, n);
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
		this.applyNight();
		for (const fn of this.updaters) fn(dt, t);
		if (this.composer) this.composer.render(dt);
		else this.renderer.render(this.scene, this.camera);
	}

	resize = () => {
		const w = this.canvas.clientWidth || window.innerWidth;
		const h = this.canvas.clientHeight || window.innerHeight;
		const r = this.canvas.getBoundingClientRect();
		Object.assign(this.box, { left: r.left, top: r.top, width: r.width || w, height: r.height || h });
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
		this.shadows?.dispose();
		this.renderer.dispose();
	}
}
