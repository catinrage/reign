import * as THREE from 'three';

/** A box around the origin the camera has to stay in (world units): the room, less a margin. */
export interface CameraBounds {
	/** Half the box's width, on x and on z. */
	half: number;
	/** The highest the camera goes. */
	top: number;
}

export interface CameraPose {
	target: THREE.Vector3;
	azimuth: number;
	polar: number;
	radius: number;
}

/** Unit vector from the target towards the camera. */
export function orbitDirection(azimuth: number, polar: number, out = new THREE.Vector3()) {
	const s = Math.sin(polar);
	return out.set(s * Math.sin(azimuth), Math.cos(polar), s * Math.cos(azimuth));
}

/** How far the camera can back away from `target` along `dir` before it leaves the box. */
export function roomToBack(target: THREE.Vector3, dir: THREE.Vector3, box: CameraBounds) {
	let r = Infinity;
	if (dir.x > 1e-6) r = Math.min(r, (box.half - target.x) / dir.x);
	if (dir.x < -1e-6) r = Math.min(r, (-box.half - target.x) / dir.x);
	if (dir.z > 1e-6) r = Math.min(r, (box.half - target.z) / dir.z);
	if (dir.z < -1e-6) r = Math.min(r, (-box.half - target.z) / dir.z);
	if (dir.y > 1e-6) r = Math.min(r, (box.top - target.y) / dir.y);
	return Math.max(0, r);
}

/**
 * Orbit-style camera with damping, tuned for a tabletop: drag to turn, right-drag or
 * two fingers to pan, wheel or pinch to zoom. `flyTo` animates to a new framing.
 * With `bounds` set the camera never leaves the room: where the orbit would take it
 * through a wall or the ceiling, it comes in closer along its line of sight instead.
 */
export class CameraRig {
	target = new THREE.Vector3(0, 0, 8);
	azimuth = -0.62;
	polar = 0.86;
	radius = 330;

	private goal = { target: new THREE.Vector3(0, 0, 8), azimuth: -0.62, polar: 0.86, radius: 330 };
	limits = { minPolar: 0.25, maxPolar: 1.18, minRadius: 46, maxRadius: 480, pan: 150 };
	/** The room the camera stays inside, if any. */
	bounds: CameraBounds | null = null;
	autoRotate = 0;
	enabled = true;
	/** True if the last pointer gesture moved enough to count as a drag, not a click. */
	dragged = false;
	private dir = new THREE.Vector3();

	private pointers = new Map<number, { x: number; y: number }>();
	private downAt = { x: 0, y: 0 };
	private mode: 'rotate' | 'pan' | null = null;
	private pinchDist = 0;

	constructor(
		readonly camera: THREE.PerspectiveCamera,
		readonly el: HTMLElement
	) {
		el.addEventListener('pointerdown', this.onDown);
		window.addEventListener('pointermove', this.onMove);
		window.addEventListener('pointerup', this.onUp);
		window.addEventListener('pointercancel', this.onUp);
		el.addEventListener('wheel', this.onWheel, { passive: false });
		el.addEventListener('contextmenu', (e) => e.preventDefault());
		this.apply();
	}

	set(opts: Partial<{ target: THREE.Vector3; azimuth: number; polar: number; radius: number }>, instant = false) {
		if (opts.target) this.goal.target.copy(opts.target);
		if (opts.azimuth !== undefined) this.goal.azimuth = opts.azimuth;
		if (opts.polar !== undefined) this.goal.polar = opts.polar;
		if (opts.radius !== undefined) this.goal.radius = opts.radius;
		if (instant) {
			this.target.copy(this.goal.target);
			this.azimuth = this.goal.azimuth;
			this.polar = this.goal.polar;
			this.radius = this.goal.radius;
			this.apply();
		}
	}

	private onDown = (e: PointerEvent) => {
		if (!this.enabled) return;
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		this.downAt = { x: e.clientX, y: e.clientY };
		this.dragged = false;
		if (this.pointers.size === 1) this.mode = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
		if (this.pointers.size === 2) {
			this.mode = 'pan';
			this.pinchDist = this.pinchDistance();
		}
	};

	private onMove = (e: PointerEvent) => {
		const prev = this.pointers.get(e.pointerId);
		if (!prev || !this.enabled) return;
		const dx = e.clientX - prev.x;
		const dy = e.clientY - prev.y;
		prev.x = e.clientX;
		prev.y = e.clientY;
		if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) this.dragged = true;
		if (!this.dragged) return;
		const h = this.el.clientHeight || 800;
		if (this.pointers.size === 2) {
			const d = this.pinchDistance();
			if (this.pinchDist > 0) this.zoom(this.pinchDist / d);
			this.pinchDist = d;
			this.pan(dx / 2, dy / 2, h);
			return;
		}
		if (this.mode === 'rotate') {
			this.goal.azimuth -= (dx / h) * 2.6;
			this.goal.polar = THREE.MathUtils.clamp(this.goal.polar - (dy / h) * 2.2, this.limits.minPolar, this.limits.maxPolar);
		} else if (this.mode === 'pan') {
			this.pan(dx, dy, h);
		}
	};

	private onUp = (e: PointerEvent) => {
		this.pointers.delete(e.pointerId);
		if (this.pointers.size === 0) this.mode = null;
		if (this.pointers.size < 2) this.pinchDist = 0;
	};

	private onWheel = (e: WheelEvent) => {
		if (!this.enabled) return;
		e.preventDefault();
		this.zoom(Math.exp(e.deltaY * 0.0012));
	};

	private pinchDistance() {
		const [a, b] = [...this.pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	private zoom(f: number) {
		// Zooming out stops at the wall, and zooming in starts from where the camera really is.
		const room = this.roomFor(this.goal);
		const max = Math.max(this.limits.minRadius, Math.min(this.limits.maxRadius, room));
		const radius = Math.min(this.goal.radius, room) * f;
		this.goal.radius = THREE.MathUtils.clamp(radius, this.limits.minRadius, max);
	}

	/** How far the camera can be from the target in this pose without leaving the room. */
	private roomFor(p: CameraPose) {
		if (!this.bounds) return Infinity;
		return roomToBack(p.target, orbitDirection(p.azimuth, p.polar, this.dir), this.bounds);
	}

	/** Where the camera ends up for a pose: as asked, or closer in if the room is in the way. */
	positionFor(p: CameraPose, out = new THREE.Vector3()) {
		const r = Math.min(p.radius, this.roomFor(p));
		return out.copy(p.target).addScaledVector(orbitDirection(p.azimuth, p.polar, this.dir), r);
	}

	private pan(dx: number, dy: number, h: number) {
		// About one and a half times the pointer's speed over the table, whatever the lens.
		const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		const scale = ((this.radius * tan) / h) * 3.1;
		const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
		const fwd = new THREE.Vector3(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));
		this.goal.target.addScaledVector(right, -dx * scale).addScaledVector(fwd, -dy * scale);
		const max = this.bounds ? Math.min(this.limits.pan, this.bounds.half - 30) : this.limits.pan;
		const len = Math.hypot(this.goal.target.x, this.goal.target.z);
		if (len > max) this.goal.target.multiplyScalar(max / len);
	}

	update(dt: number) {
		if (this.autoRotate) this.goal.azimuth += this.autoRotate * dt;
		const k = 1 - Math.pow(0.0025, dt);
		this.target.lerp(this.goal.target, k);
		this.azimuth += (this.goal.azimuth - this.azimuth) * k;
		this.polar += (this.goal.polar - this.polar) * k;
		this.radius += (this.goal.radius - this.radius) * k;
		this.apply();
	}

	private apply() {
		// Pressed against a wall the camera comes in, and eases back out once there is room.
		this.radius = Math.min(this.radius, this.roomFor(this));
		this.positionFor(this, this.camera.position);
		this.camera.lookAt(this.target);
	}

	dispose() {
		window.removeEventListener('pointermove', this.onMove);
		window.removeEventListener('pointerup', this.onUp);
		window.removeEventListener('pointercancel', this.onUp);
	}
}
