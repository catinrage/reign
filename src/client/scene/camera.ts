import * as THREE from 'three';

/**
 * Orbit-style camera with damping, tuned for a tabletop: drag to turn, right-drag or
 * two fingers to pan, wheel or pinch to zoom. `flyTo` animates to a new framing.
 */
export class CameraRig {
	target = new THREE.Vector3(0, 0, 8);
	azimuth = -0.62;
	polar = 0.86;
	radius = 330;

	private goal = { target: new THREE.Vector3(0, 0, 8), azimuth: -0.62, polar: 0.86, radius: 330 };
	limits = { minPolar: 0.25, maxPolar: 1.18, minRadius: 110, maxRadius: 720, pan: 150 };
	autoRotate = 0;
	enabled = true;
	/** True if the last pointer gesture moved enough to count as a drag, not a click. */
	dragged = false;

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
		this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * f, this.limits.minRadius, this.limits.maxRadius);
	}

	private pan(dx: number, dy: number, h: number) {
		const scale = (this.radius / h) * 0.9;
		const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
		const fwd = new THREE.Vector3(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));
		this.goal.target.addScaledVector(right, -dx * scale).addScaledVector(fwd, -dy * scale);
		const len = Math.hypot(this.goal.target.x, this.goal.target.z);
		if (len > this.limits.pan) this.goal.target.multiplyScalar(this.limits.pan / len);
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
		const s = Math.sin(this.polar);
		this.camera.position.set(
			this.target.x + this.radius * s * Math.sin(this.azimuth),
			this.target.y + this.radius * Math.cos(this.polar),
			this.target.z + this.radius * s * Math.cos(this.azimuth)
		);
		this.camera.lookAt(this.target);
	}

	dispose() {
		window.removeEventListener('pointermove', this.onMove);
		window.removeEventListener('pointerup', this.onUp);
		window.removeEventListener('pointercancel', this.onUp);
	}
}
