import * as THREE from 'three';

/**
 * Frames a shadow caster must keep still before it goes back into the cached shadows. Things
 * that rest only now and then (a sheep between walks) stay drawn each frame meanwhile, rather
 * than redrawing the cache every time they stop and start.
 */
const SETTLE_FRAMES = 90;

/** What a caster's shadow depends on, as of the last frame it was checked. */
interface Caster {
	matrix: Float32Array;
	geometry: THREE.BufferGeometry;
	material: THREE.Material | THREE.Material[];
	/** Whether its material shows, and the side it casts from (see `materialKey`). */
	look: number;
	/** Sum of the versions of the geometry's attributes (and instance matrices), and its index. */
	version: number;
	count: number;
	/** The last frame it changed. */
	changed: number;
	/** Drawn each frame over the cached shadows, rather than in them. */
	moving: boolean;
	seen: number;
}

/**
 * The key light's shadow map, drawn again only where something moved.
 *
 * Three.js draws every shadow caster into the shadow map every frame, though almost all of
 * them (the island, the room, pieces at rest) never move. Here the casters that keep still are
 * drawn once into a cached copy of the map; each frame the copy is put back and only the
 * casters that moved lately (ships, sheep, smoke, a piece dropping into place) are drawn over
 * it. The map ends up exactly as before (the same casters drawn with the same depth test),
 * at a fraction of the work. The cache is drawn again whenever a still caster starts to move,
 * a moving one settles, or one comes or goes.
 */
export class ShadowCache {
	private casters = new Map<THREE.Object3D, Caster>();
	private frame = 0;
	private cache: THREE.WebGLRenderTarget | null = null;
	/** The map holds only the still casters (as the cache does), with no moving ones drawn over it. */
	private mapStill = false;
	/** What the light's shadow depended on when the cache was drawn. */
	private lightKey = new Float64Array(LIGHT_KEY);
	private map: THREE.WebGLRenderTarget | null = null;
	private off: THREE.Object3D[] = [];
	/** Where the moving casters were drawn over the still shadows (see `areas`). */
	private drawn: number[] = [];
	/** See SETTLE_FRAMES (dev checks shorten it). */
	settle = SETTLE_FRAMES;
	/** Off: three.js draws the whole map every frame, as it would without this (dev checks). */
	enabled = true;
	/** Draw a reference map, leaving the cache be (see `reference`). */
	private bypass = false;
	/** Cache redraws and frames drawn with moving casters, for dev measurements. */
	readonly stats = { redraws: 0, movingFrames: 0, stillFrames: 0 };

	constructor(
		private readonly renderer: THREE.WebGLRenderer,
		private readonly scene: THREE.Scene,
		private readonly light: THREE.DirectionalLight
	) {
		const shadowMap = renderer.shadowMap;
		const draw = shadowMap.render.bind(shadowMap);
		shadowMap.render = (lights, scene, camera) => {
			if (this.bypass) return draw(lights, scene, camera);
			if (
				!this.enabled ||
				scene !== this.scene ||
				!shadowMap.enabled ||
				lights.length !== 1 ||
				lights[0] !== this.light
			) {
				// Whatever this draws, the map no longer matches the cache.
				if (scene === this.scene) this.map = null;
				return draw(lights, scene, camera);
			}
			this.render(draw, lights, scene, camera);
		};
	}

	private render(
		draw: THREE.WebGLShadowMap['render'],
		lights: THREE.Light[],
		scene: THREE.Scene,
		camera: THREE.Camera
	) {
		const frame = ++this.frame;
		let redraw = this.check(camera, frame);
		for (const [o, c] of this.casters) {
			if (c.seen === frame) continue;
			// Gone, or hidden: the cache needs drawing again only if it held its shadow.
			this.casters.delete(o);
			if (!c.moving) redraw = true;
		}
		const shadow = this.light.shadow;
		if (updateLightKey(this.light, this.lightKey) || !this.cache || shadow.map !== this.map)
			redraw = true;

		let moving = false;
		for (const c of this.casters.values()) moving ||= c.moving;

		if (redraw) {
			// The still casters, into the map (three.js clears it first), then into the cache.
			this.only(false, () => draw(lights, scene, camera));
			this.map = shadow.map;
			if (!this.map) return;
			this.fitCache(this.map);
			this.blit(this.map, this.cache!, null);
			this.mapStill = true;
			this.drawn.length = 0;
			this.stats.redraws++;
		}
		const map = this.map!;
		if (moving) {
			// Where the moving casters are now; their shadows from the last frame are wiped first.
			const now = this.areas();
			if (!this.mapStill) this.restore(this.drawn.concat(now), map);
			const clear = this.renderer.clear;
			this.renderer.clear = () => {};
			try {
				this.only(true, () => draw(lights, scene, camera));
			} finally {
				this.renderer.clear = clear;
			}
			this.drawn = now;
			this.mapStill = false;
			this.stats.movingFrames++;
		} else {
			if (!this.mapStill) this.restore(this.drawn, map);
			this.drawn.length = 0;
			this.mapStill = true;
			this.stats.stillFrames++;
		}
	}

	/**
	 * The shadow map's pixels each moving caster can cover: its bounding box seen from the light,
	 * as [x0, y0, x1, y1] runs (or the whole map when one can't be bounded).
	 */
	private areas(): number[] {
		const out: number[] = [];
		const map = this.map!;
		const cam = this.light.shadow.camera;
		_viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
		for (const [o, c] of this.casters) {
			if (!c.moving) continue;
			const inst = o as THREE.InstancedMesh;
			let box: THREE.Box3 | null;
			if (inst.isInstancedMesh) {
				if (!inst.count) continue;
				inst.computeBoundingBox();
				box = inst.boundingBox;
			} else {
				const g = (o as THREE.Mesh).geometry;
				if (!g.boundingBox) g.computeBoundingBox();
				box = g.boundingBox;
			}
			if (!box || box.isEmpty()) {
				if (box?.isEmpty()) continue;
				out.push(0, 0, map.width, map.height);
				continue;
			}
			let x0 = Infinity,
				y0 = Infinity,
				x1 = -Infinity,
				y1 = -Infinity;
			for (let i = 0; i < 8; i++) {
				_corner.set(
					i & 1 ? box.max.x : box.min.x,
					i & 2 ? box.max.y : box.min.y,
					i & 4 ? box.max.z : box.min.z
				);
				// An instanced mesh's box is in its own space too.
				_corner.applyMatrix4(o.matrixWorld).applyMatrix4(_viewProj);
				x0 = Math.min(x0, _corner.x);
				x1 = Math.max(x1, _corner.x);
				y0 = Math.min(y0, _corner.y);
				y1 = Math.max(y1, _corner.y);
			}
			// From -1..1 to pixels, with a margin for how the edges round.
			const px = (v: number, size: number) => ((v + 1) / 2) * size;
			const ax = Math.max(0, Math.floor(px(x0, map.width)) - 2);
			const ay = Math.max(0, Math.floor(px(y0, map.height)) - 2);
			const bx = Math.min(map.width, Math.ceil(px(x1, map.width)) + 2);
			const by = Math.min(map.height, Math.ceil(px(y1, map.height)) + 2);
			if (bx > ax && by > ay) out.push(ax, ay, bx, by);
		}
		return out;
	}

	/** Put the cached still shadows back over these runs of the map. */
	private restore(runs: number[], map: THREE.WebGLRenderTarget) {
		let area = 0;
		for (let i = 0; i < runs.length; i += 4)
			area += (runs[i + 2] - runs[i]) * (runs[i + 3] - runs[i + 1]);
		// Past half the map, one copy of all of it is quicker than many pieces.
		if (area > (map.width * map.height) / 2) return this.blit(this.cache!, map, null);
		if (runs.length) this.blit(this.cache!, map, runs);
	}

	/**
	 * Look over the casters as three.js finds them (shown, on the camera's layers, casting a
	 * shadow) for what moved or changed. Returns whether the cache must be drawn again.
	 */
	private check(camera: THREE.Camera, frame: number): boolean {
		let redraw = false;
		const visit = (o: THREE.Object3D) => {
			if (!o.visible) return;
			const m = o as THREE.Mesh;
			if (
				o.castShadow &&
				o.layers.test(camera.layers) &&
				(m.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints)
			) {
				const version = versionOf(m);
				const count = (m as THREE.InstancedMesh).count ?? -1;
				const look = materialKey(m.material);
				let c = this.casters.get(o);
				if (!c) {
					// New casters start out moving (most drop or fade in), so they cost no redraw yet.
					c = {
						matrix: new Float32Array(16),
						geometry: m.geometry,
						material: m.material,
						look,
						version,
						count,
						changed: frame,
						moving: true,
						seen: frame
					};
					c.matrix.set(o.matrixWorld.elements);
					this.casters.set(o, c);
				} else if (
					c.geometry !== m.geometry ||
					c.material !== m.material ||
					c.look !== look ||
					c.version !== version ||
					c.count !== count ||
					!same(c.matrix, o.matrixWorld.elements)
				) {
					c.matrix.set(o.matrixWorld.elements);
					// Edited in place: its bounds may have changed too (see `areas`).
					if (
						c.version !== version &&
						c.geometry === m.geometry &&
						!(m as THREE.InstancedMesh).isInstancedMesh
					)
						m.geometry.computeBoundingBox();
					c.geometry = m.geometry;
					c.material = m.material;
					c.look = look;
					c.version = version;
					c.count = count;
					c.changed = frame;
					if (!c.moving) {
						c.moving = true;
						redraw = true;
					}
				} else if (c.moving && frame - c.changed > this.settle) {
					c.moving = false;
					redraw = true;
				}
				c.seen = frame;
			}
			const kids = o.children;
			for (let i = 0; i < kids.length; i++) visit(kids[i]);
		};
		visit(this.scene);
		return redraw;
	}

	/** Draw with only the moving casters casting shadows, or only the still ones. */
	private only(moving: boolean, draw: () => void) {
		const off = this.off;
		for (const [o, c] of this.casters)
			if (c.moving !== moving && o.castShadow) {
				o.castShadow = false;
				off.push(o);
			}
		try {
			draw();
		} finally {
			for (const o of off) o.castShadow = true;
			off.length = 0;
		}
	}

	private fitCache(map: THREE.WebGLRenderTarget) {
		if (this.cache && this.cache.width === map.width && this.cache.height === map.height) return;
		this.cache?.dispose();
		this.cache = new THREE.WebGLRenderTarget(map.width, map.height, {
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter
		});
		// Allocate it on the graphics card now, so it can be copied into.
		const current = this.renderer.getRenderTarget();
		this.renderer.setRenderTarget(this.cache);
		this.renderer.setRenderTarget(current);
	}

	/**
	 * Copy a shadow map's depths, both its packed colors and its depth buffer, to another: all of
	 * it, or these [x0, y0, x1, y1] runs.
	 */
	private blit(from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget, runs: number[] | null) {
		const r = this.renderer;
		const gl = r.getContext() as WebGL2RenderingContext;
		const props = r.properties;
		const src = (props.get(from) as { __webglFramebuffer: WebGLFramebuffer }).__webglFramebuffer;
		const dst = (props.get(to) as { __webglFramebuffer: WebGLFramebuffer }).__webglFramebuffer;
		const current = r.getRenderTarget();
		const state = r.state;
		state.setScissorTest(false);
		state.buffers.color.setMask(true);
		state.buffers.depth.setMask(true);
		state.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
		state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
		const bits = gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT;
		if (!runs)
			gl.blitFramebuffer(
				0,
				0,
				from.width,
				from.height,
				0,
				0,
				to.width,
				to.height,
				bits,
				gl.NEAREST
			);
		else
			for (let i = 0; i < runs.length; i += 4) {
				const x0 = runs[i],
					y0 = runs[i + 1],
					x1 = runs[i + 2],
					y1 = runs[i + 3];
				gl.blitFramebuffer(x0, y0, x1, y1, x0, y0, x1, y1, bits, gl.NEAREST);
			}
		// Leave the bindings as three.js expects them (it does the same after its own copies).
		state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
		const back = current
			? (props.get(current) as { __webglFramebuffer: WebGLFramebuffer }).__webglFramebuffer
			: null;
		state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, back);
	}

	/**
	 * Dev checks: every caster drawn into a fresh map, as three.js alone draws it, to compare
	 * with the map this keeps. The caller disposes of it.
	 */
	reference(camera: THREE.Camera): THREE.WebGLRenderTarget | null {
		const shadow = this.light.shadow;
		const keep = shadow.map;
		const r = this.renderer;
		const back = r.getRenderTarget();
		const scratch = new THREE.WebGLRenderTarget(4, 4);
		shadow.map = null;
		this.bypass = true;
		try {
			// The shadow pass runs inside a render; the picture drawn here is thrown away.
			r.setRenderTarget(scratch);
			r.render(this.scene, camera);
			return shadow.map;
		} finally {
			shadow.map = keep;
			this.bypass = false;
			r.setRenderTarget(back);
			scratch.dispose();
		}
	}

	dispose() {
		this.cache?.dispose();
		this.cache = null;
		this.casters.clear();
	}
}

const _viewProj = new THREE.Matrix4();
const _corner = new THREE.Vector3();

function same(a: Float32Array, b: number[]) {
	for (let i = 0; i < 16; i++) if (a[i] !== Math.fround(b[i])) return false;
	return true;
}

/** Changes whenever a geometry's vertices, index or instance matrices are edited in place. */
function versionOf(m: THREE.Mesh): number {
	const g = m.geometry;
	let v = g.index?.version ?? 0;
	for (const name in g.attributes) v += (g.attributes[name] as THREE.BufferAttribute).version ?? 0;
	const inst = (m as THREE.InstancedMesh).instanceMatrix;
	if (inst) v += inst.version;
	return v;
}

/** What of a material the shadow pass uses: whether it shows, and the side it casts from. */
function materialKey(mat: THREE.Material | THREE.Material[]): number {
	if (!Array.isArray(mat)) return (mat.visible ? 1 : 0) + mat.side * 2 + (mat.shadowSide ?? 3) * 8;
	let k = 0;
	for (const m of mat) k = k * 32 + materialKey(m);
	return k;
}

const LIGHT_KEY = 16 * 3 + 2;

/** Note where the light shines from and onto, and its shadow box. Returns whether they changed. */
function updateLightKey(light: THREE.DirectionalLight, key: Float64Array): boolean {
	let changed = false;
	let i = 0;
	const put = (v: number) => {
		if (key[i] !== v) {
			key[i] = v;
			changed = true;
		}
		i++;
	};
	for (const v of light.matrixWorld.elements) put(v);
	for (const v of light.target.matrixWorld.elements) put(v);
	for (const v of light.shadow.camera.projectionMatrix.elements) put(v);
	put(light.shadow.mapSize.x);
	put(light.shadow.mapSize.y);
	return changed;
}
