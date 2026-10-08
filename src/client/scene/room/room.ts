import * as THREE from 'three';
import type { Stage } from '../stage';
import { hex } from '../voxel/grid';
import { FIRE_LIGHT, buildFireplace } from './fireplace';
import {
	buildArmchair,
	buildCandles,
	buildCards,
	buildCat,
	buildChest,
	buildClock,
	buildLantern,
	buildLogBasket,
	buildMug,
	buildPlant,
	buildTray,
	buildWindow
} from './props';
import { type Side, buildFloor, buildWall, wallFrame } from './shell';
import { SHELF_S, buildBookcase } from './shelves';
import { buildTable, placeChairs } from './table';
import { FLOOR_Y, ROOM_HALF, ROOM_SCALE, place } from './util';

/** The cozy room around the board: table, furniture, fireplace, decorations. */
export interface Room {
	group: THREE.Group;
	update(dt: number, t: number): void;
}

const N = <T extends THREE.Object3D>(o: T, name: string) => ((o.name = name), o);
/** Table-top layout in room units: everything sits on the rim outside the board's hex frame. */
const MUG = { x: -104, z: -126 };
const LANTERN = { x: -128, z: -100 };
const OUTWARD: Record<Side, [number, number]> = { nx: [-1, 0], px: [1, 0], nz: [0, -1], pz: [0, 1] };

export function buildRoom(stage: Stage): Room {
	const t0 = performance.now();
	const group = new THREE.Group();
	group.name = 'room';
	const updaters: ((dt: number, t: number) => void)[] = [];
	/** Point lights live in the scene, so room-unit positions are scaled to world. */
	const K = ROOM_SCALE;
	const flame = (x: number, y: number, z: number, color: string, intensity: number, distance: number) =>
		stage.lighting.addFlame(new THREE.Vector3(x * K, y * K, z * K), color, intensity, distance * K);
	/** Low quality skips some purely decorative pieces. */
	const hq = stage.qualityLevel === 'high';

	// ---------------------------------------------------------------- table, chairs, floor
	group.add(N(buildTable(), 'table'));
	for (const c of placeChairs(group)) c.name = 'chair';
	const floor = buildFloor();
	floor.position.y = FLOOR_Y;
	floor.name = 'floor';
	group.add(floor);

	// Everything but the table, chairs and floor is built in small slices right after
	// buildRoom returns (see `pump` below), so the first frame is quick.
	const queue: (() => void)[] = [];
	const later = (fn: () => void) => queue.push(fn);
	const soon = (fn: () => void) => queue.unshift(fn);

	// ---------------------------------------------------------------- walls and what stands against them
	const sides: Record<Side, THREE.Group> = { nx: new THREE.Group(), px: new THREE.Group(), nz: new THREE.Group(), pz: new THREE.Group() };
	for (const s of Object.keys(sides) as Side[]) {
		sides[s].name = `side-${s}`;
		group.add(sides[s]);
		later(() => sides[s].add(N(buildWall(s), 'wall')));
	}

	const shelfW = 30;
	const shelves: THREE.Group[] = [];
	const shelfSeeds = [3, 8, 15];
	let shelfN = 0;
	/** Put an object against a wall: `along` is the left edge (or centre) along the wall. */
	const against = (side: Side, obj: THREE.Object3D, along: number, out: number, y = FLOOR_Y, turn = 0) => {
		const f = wallFrame(side)(along, out);
		const p = place(obj, f.x, y, f.z, f.rot + turn);
		p.name = obj.name || 'item';
		sides[side].add(p);
		return p;
	};
	const bookcase = (side: Side, left: number, plant?: { seed: number; at: number; hang: number }) =>
		later(() => {
			const i = shelfN++ % shelfSeeds.length;
			if (!shelves[i]) shelves[i] = N(buildBookcase({ width: shelfW, height: 50, seed: shelfSeeds[i] }), 'bookcase');
			const b = shelfN <= shelfSeeds.length ? shelves[i] : shelves[i].clone(true);
			against(side, b, left, 0);
			if (plant && hq) against(side, N(buildPlant('hanging', plant.seed, 2, plant.hang, 8), 'vine'), left + plant.at, 22, FLOOR_Y + 51 * SHELF_S);
		});
	const item = (side: Side, make: () => THREE.Object3D, name: string, along: number, out: number, y = FLOOR_Y, turn = 0, onlyHq = false) => {
		if (!onlyHq || hq) later(() => against(side, N(make(), name), along, out, y, turn));
	};

	// Right wall (+x): the fireplace, seen back-right from the default view, with the cat's
	// armchair beside it.
	const fireLeft = -160;
	const fireAt = wallFrame('px')(fireLeft + FIRE_LIGHT.x, FIRE_LIGHT.z);
	flame(fireAt.x, FLOOR_Y + FIRE_LIGHT.y, fireAt.z, '#ff6a1e', 950, 1100);
	soon(() => {
		const fire = buildFireplace();
		against('px', N(fire.group, 'fireplace'), fireLeft, 0);
		updaters.push(fire.update);
		against('px', N(buildLantern(), 'lantern'), fireLeft + 20, 24, FLOOR_Y + fire.mantelY);
		against('px', N(buildCandles(), 'candles'), fireLeft + 112, 26, FLOOR_Y + fire.mantelY);
		against('px', N(buildPlant('hanging', 31, 1.4, 16, 13), 'plant'), fireLeft + 40, 30, FLOOR_Y + fire.mantelY);
	});
	later(() => {
		const chair = buildArmchair();
		const cat = buildCat();
		cat.group.scale.setScalar(1.35);
		cat.group.position.set(-2, 36, 6);
		cat.group.rotation.y = 0.3;
		chair.add(cat.group);
		sides.px.add(N(place(chair, 226, FLOOR_Y, -226, -0.7), 'armchair'));
		updaters.push((_dt, t) => cat.update(t));
	});
	item('px', buildLogBasket, 'logbasket', fireLeft + 176, 40, FLOOR_Y, 0.25);
	bookcase('px', -292, { seed: 7, at: 70, hang: 26 });
	bookcase('px', 54, { seed: 13, at: 40, hang: 30 });
	item('px', () => buildPlant('tall', 23, 2.2), 'plant', 232, 34);

	// Back wall (-z): bookcases behind the board, a chest and plants.
	bookcase('nz', -292, { seed: 4, at: 30, hang: 28 });
	bookcase('nz', -168);
	item('nz', buildChest, 'chest', -8, 24);
	item('nz', buildLantern, 'lantern', -16, 26, FLOOR_Y + 38, 0.4);
	{
		const at = wallFrame('nz')(-16, 40);
		flame(at.x, FLOOR_Y + 52, at.z, '#ff9a3a', 140, 360);
	}
	bookcase('nz', 62, { seed: 12, at: 60, hang: 30 });
	item('nz', () => buildPlant('tall', 21, 2.2), 'plant', 222, 36);
	item('nz', () => buildPlant('bush', 19, 2.4), 'plant', 272, 30, FLOOR_Y, 0, true);

	// Left wall (-x): a snowy window between bookcases.
	bookcase('nx', 172, { seed: 5, at: 80, hang: 26 });
	bookcase('nx', 46);
	item('nx', buildWindow, 'window', -60, 3, FLOOR_Y + 115);
	item('nx', buildChest, 'chest', -180, 24, FLOOR_Y, 0.05, true);
	item('nx', () => buildPlant('tall', 33, 2.2), 'plant', -238, 40);
	item('nx', () => buildPlant('bush', 17, 2.4), 'plant', -276, 30, FLOOR_Y, 0, true);

	// Front wall (+z): bookcases, a window and a grandfather clock in the corner.
	bookcase('pz', -292, { seed: 11, at: 64, hang: 24 });
	item('pz', () => buildPlant('tall', 27, 2.2), 'plant', -142, 40);
	bookcase('pz', -112);
	item('pz', buildWindow, 'window', 86, 3, FLOOR_Y + 115);
	item('pz', () => buildPlant('bush', 29, 2.4), 'plant', 186, 30, FLOOR_Y, 0, true);
	later(() => {
		const clock = buildClock();
		against('pz', N(clock.group, 'clock'), 250, 2);
		updaters.push((_dt, t) => clock.update(t));
	});

	// ---------------------------------------------------------------- things on the table
	const onTable = new THREE.Group();
	onTable.name = 'onTable';
	group.add(onTable);
	soon(() => {
		const lantern = buildLantern();
		onTable.add(N(place(lantern, LANTERN.x, 0, LANTERN.z, 0.3), 'tableLantern'));
		const mug = buildMug();
		onTable.add(N(place(mug, MUG.x, 0, MUG.z, -0.25), 'mug'));
		onTable.add(N(place(buildPlant('bush', 41, 1), 124, 0, -124), 'tablePlant'));
		const trays: [number, number, number, number][] = [
			[hex('#d8352a'), 60, -128, 0],
			[hex('#f2c12e'), -128, 60, Math.PI / 2],
			[hex('#2f9a3a'), -60, 128, 0],
			[hex('#2c5fd6'), 128, -60, Math.PI / 2]
		];
		trays.forEach(([c, x, z, r], i) => onTable.add(N(place(buildTray(c, 30 + i), x, 0, z, r + (i % 2 ? 0.04 : -0.03)), 'tray')));
		const cards: [Parameters<typeof buildCards>[0], number, number, number][] = [
			['wood', -128, -36, Math.PI / 2 + 0.08],
			['brick', -126, -62, Math.PI / 2 - 0.05],
			['sheep', 128, 36, Math.PI / 2 - 0.06],
			['ore', 126, 62, Math.PI / 2 + 0.05],
			['wheat', 36, 128, 0.06],
			['dev', -36, -128, -0.05]
		];
		for (const [k, x, z, r] of cards) {
			const c = buildCards(k, k === 'dev' ? 7 : 5);
			c.position.set(-8, 0, -11.5);
			onTable.add(N(place(c, x, 0, z, r), 'cards'));
		}
	});

	// steam over the mug
	const steamMat = new THREE.MeshStandardMaterial({ color: '#fff4e8', transparent: true, opacity: 0.32, depthWrite: false, roughness: 1 });
	const steamGeo = new THREE.BoxGeometry(2, 2, 2);
	const steam: { m: THREE.Mesh; ph: number }[] = [];
	for (let i = 0; i < 9; i++) {
		const m = new THREE.Mesh(steamGeo, steamMat);
		onTable.add(m);
		steam.push({ m, ph: i / 9 });
	}
	updaters.push((_dt, t) => {
		for (const s of steam) {
			const p = (t * 0.22 + s.ph) % 1;
			s.m.position.set(MUG.x + Math.sin(t * 1.3 + s.ph * 9) * 2.5 * p, 14 + p * 26, MUG.z + Math.cos(t + s.ph * 7) * 2 * p);
			s.m.scale.setScalar(0.6 + p * 1.4);
			s.m.rotation.y = p * 2;
			s.m.visible = p > 0.04 && p < 0.92;
		}
	});

	// ---------------------------------------------------------------- lights
	flame(LANTERN.x, 12, LANTERN.z, '#ffb04a', 80, 320);

	// ---------------------------------------------------------------- cutaway walls
	// The camera can orbit outside the room; a wall (and what stands against it) between
	// the camera and the table is hidden.
	const cam = stage.camera.position;
	updaters.push(() => {
		for (const s of Object.keys(sides) as Side[]) {
			const [nx, nz] = OUTWARD[s];
			sides[s].visible = (cam.x * nx + cam.z * nz) / K < ROOM_HALF - 80;
		}
	});

	group.scale.setScalar(K);
	stage.scene.add(group);
	group.userData.roomBuildMs = performance.now() - t0;
	let queuedMs = 0;
	const pump = () => {
		const q0 = performance.now();
		while (queue.length && performance.now() - q0 < 12) queue.shift()!();
		queuedMs += performance.now() - q0;
		if (queue.length) setTimeout(pump, 0);
		else group.userData.roomQueuedMs = queuedMs;
	};
	setTimeout(pump, 0);
	return {
		group,
		update(dt, t) {
			for (const u of updaters) u(dt, t);
		}
	};
}
