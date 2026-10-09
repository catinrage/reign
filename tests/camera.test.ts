import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CameraRig, orbitDirection, roomToBack } from '../src/client/scene/camera';

/** Small seeded random numbers in [0, 1). */
function rand(seed: number) {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return (s - 1) / 2147483646;
	};
}

/** A stand-in canvas that keeps its listeners, so a test can turn the mouse wheel. */
function fakeCanvas() {
	const on = new Map<string, (e: unknown) => void>();
	const el = {
		clientHeight: 800,
		addEventListener: (type: string, fn: (e: unknown) => void) => on.set(type, fn)
	};
	return {
		el: el as unknown as HTMLElement,
		wheel: (deltaY: number) => on.get('wheel')!({ deltaY, preventDefault() {} })
	};
}

const g = globalThis as { window?: unknown };
const hadWindow = 'window' in g;
beforeAll(() => {
	if (!hadWindow) g.window = { addEventListener() {}, removeEventListener() {} };
});
afterAll(() => {
	if (!hadWindow) delete g.window;
});

/** The standard room as the room sets it: walls 175 world units out, beams 174 up. */
const ROOM = { half: 175, top: 174 };

function rigInRoom() {
	const canvas = fakeCanvas();
	const rig = new CameraRig(new THREE.PerspectiveCamera(50, 16 / 9, 4, 2400), canvas.el);
	rig.bounds = { ...ROOM };
	return { rig, wheel: canvas.wheel };
}

const settle = (rig: CameraRig) => {
	for (let i = 0; i < 400; i++) rig.update(0.05);
};

const inside = (p: THREE.Vector3) =>
	Math.abs(p.x) <= ROOM.half + 1e-6 && Math.abs(p.z) <= ROOM.half + 1e-6 && p.y <= ROOM.top + 1e-6;

describe('camera in the room', () => {
	it('backs away as far as the nearest wall or the ceiling allows', () => {
		const target = new THREE.Vector3(0, 0, 0);
		expect(roomToBack(target, new THREE.Vector3(1, 0, 0), ROOM)).toBeCloseTo(175);
		expect(roomToBack(target, new THREE.Vector3(0, 1, 0), ROOM)).toBeCloseTo(174);
		const diag = new THREE.Vector3(1, 1, -1).normalize();
		expect(roomToBack(new THREE.Vector3(100, 0, 0), diag, ROOM)).toBeCloseTo(75 * Math.sqrt(3));
	});

	it('never leaves the room, whatever the orbit, tilt, zoom and pan', () => {
		const { rig } = rigInRoom();
		const r = rand(7);
		for (let i = 0; i < 2000; i++) {
			const a = r() * Math.PI * 2;
			const d = r() * rig.limits.pan;
			rig.set(
				{
					target: new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d),
					azimuth: r() * Math.PI * 8 - Math.PI * 4,
					polar: rig.limits.minPolar + r() * (rig.limits.maxPolar - rig.limits.minPolar),
					radius: rig.limits.minRadius + r() * (rig.limits.maxRadius - rig.limits.minRadius)
				},
				i % 2 === 0
			);
			for (let k = 0; k < 6; k++) {
				rig.update(0.05);
				expect(inside(rig.camera.position), `pose ${i}`).toBe(true);
			}
		}
	});

	it('comes in along its line of sight at a wall, still looking at the target', () => {
		const { rig } = rigInRoom();
		const target = new THREE.Vector3(20, 0, -10);
		rig.set({ target, azimuth: Math.PI / 2, polar: 1.1, radius: 480 }, true);
		const p = rig.camera.position;
		expect(p.x).toBeCloseTo(ROOM.half);
		const seen = p.clone().sub(target).normalize();
		const want = orbitDirection(Math.PI / 2, 1.1);
		expect(seen.distanceTo(want)).toBeLessThan(1e-6);
	});

	it('stops zooming out at the wall, and zooms back in from there at once', () => {
		const { rig, wheel } = rigInRoom();
		rig.set({ target: new THREE.Vector3(0, 0, 0), azimuth: 0, polar: 0.82, radius: 150 }, true);
		for (let i = 0; i < 20; i++) wheel(600);
		settle(rig);
		const wall = rig.radius;
		expect(rig.camera.position.z).toBeCloseTo(ROOM.half);
		wheel(-100);
		rig.update(0.05);
		expect(rig.radius).toBeLessThan(wall - 1);
	});

	it('zooms out to the wall of a big room, past the radius limit', () => {
		const { rig, wheel } = rigInRoom();
		rig.bounds = { half: 556, top: 684 };
		rig.set({ target: new THREE.Vector3(0, 0, 0), azimuth: 0, polar: 0.82, radius: 300 }, true);
		for (let i = 0; i < 30; i++) wheel(600);
		settle(rig);
		expect(rig.radius).toBeGreaterThan(rig.limits.maxRadius);
		expect(rig.camera.position.z).toBeCloseTo(556);
	});
});
