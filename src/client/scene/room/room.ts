import * as THREE from 'three';
import type { Stage } from '../stage';
import { hex } from '../voxel/grid';
import { sharedUniforms } from '../voxel/materials';
import { FIRE_LIGHT, buildChimney, buildFireplace } from './fireplace';
import {
	type Cat,
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
	buildMoonbeam,
	buildWindow,
	moonbeamMaterial
} from './props';
import { type Side, buildCeiling, buildFloor, buildWalls, wallFrame } from './shell';
import { SHELF_S, buildBookcase } from './shelves';
import { buildTable, placeChairs } from './table';
import { FLOOR_Y, ROOM_HALF, ROOM_SCALE, WALL_H, place } from './util';

/** The cozy room around the board: table, furniture, fireplace, decorations. */
export interface Room {
	group: THREE.Group;
	/** Things standing on the table top (trays, cards, mug...), which the dice keep clear of. */
	props: THREE.Group;
	/** Everything has been built (some of it is built in slices after `buildRoom` returns). */
	readonly ready: boolean;
	/** Half the table's width, in world units. */
	readonly tableHalf: number;
	/**
	 * Grow the table for a bigger island (1 is the standard table): the top is rebuilt wider and
	 * the chairs and everything standing on the rim move out with its edge. The room grows too:
	 * the walls move out, with all that stands against them, and the ceiling goes up, so the
	 * camera still has room to stand back.
	 */
	fitTable(scale: number): void;
	/**
	 * The table scale (as for `fitTable`) that keeps the mug, the lantern and the plant on the rim
	 * clear of a rectangular board of these half extents (world units) in the middle.
	 */
	clearScale(halfX: number, halfZ: number): number;
	/** The cat asleep on the armchair, once it is built (it purrs when clicked). */
	readonly cat: Cat | null;
	update(dt: number, t: number): void;
}

const N = <T extends THREE.Object3D>(o: T, name: string) => ((o.name = name), o);
/**
 * Table-top layout in room units: everything sits on the rim outside the board's sea. `r` is how
 * far each reaches from its middle (it doesn't grow with the table, only its place moves out).
 */
const MUG = { x: -104, z: -126, r: 12 };
const LANTERN = { x: -128, z: -100, r: 7 };
const PLANT = { x: 124, z: -124, r: 13 };
/** Room units kept between a board's edge and what stands beside it. */
const BOARD_GAP = 6;
const SIDES: Side[] = ['nx', 'px', 'nz', 'pz'];
/**
 * The camera keeps this far (room units) from the walls, clear of the bookcases and the mantel,
 * and this far under the ceiling beams.
 */
const CAMERA_WALL = 50;
const CAMERA_BEAMS = 16;
/** The beams hang this far under the ceiling boards. */
const BEAM_DEPTH = 24;

const dispose = (o: THREE.Object3D) => o.traverse((c) => (c as THREE.Mesh).geometry?.dispose());

export function buildRoom(stage: Stage): Room {
	const t0 = performance.now();
	const group = new THREE.Group();
	group.name = 'room';
	const updaters: ((dt: number, t: number) => void)[] = [];
	/** Point lights live in the scene, so room-unit positions are scaled to world. */
	const K = ROOM_SCALE;
	const flame = (
		x: number,
		y: number,
		z: number,
		color: string,
		intensity: number,
		distance: number,
		minor = false
	) =>
		stage.lighting.addFlame(
			new THREE.Vector3(x * K, y * K, z * K),
			color,
			intensity,
			distance * K,
			minor
		);
	/** Medium and low quality skip some purely decorative pieces. */
	const hq = stage.qualityLevel === 'high';

	// ---------------------------------------------------------------- table, chairs, floor
	let tableScale = 1;
	let tableHalfVox = 37;
	/** Half the room's width and its height in room units: the room grows for a bigger table. */
	let roomHalf = ROOM_HALF;
	let roomH = WALL_H;
	let table = N(buildTable(), 'table');
	group.add(table);
	let chairs = placeChairs(group);
	for (const c of chairs) c.name = 'chair';
	/** The floor reaches the walls, and the rug stays under the chairs. */
	const makeFloor = () => {
		const f = N(buildFloor(roomHalf, Math.round(37 * tableScale)), 'floor');
		f.position.y = FLOOR_Y;
		group.add(f);
		return f;
	};
	let floor = makeFloor();

	// Everything but the table, chairs and floor is built in small slices right after
	// buildRoom returns (see `pump` below), so the first frame is quick.
	const queue: (() => void)[] = [];
	const later = (fn: () => void) => queue.push(fn);
	const soon = (fn: () => void) => queue.unshift(fn);

	// ---------------------------------------------------------------- walls and what stands against them
	// The room is closed all round (floor, walls and a beamed ceiling) and the camera never
	// leaves it, so whichever way it looks there is more room, never the dark outside.
	const sides: Record<Side, THREE.Group> = { nx: new THREE.Group(), px: new THREE.Group(), nz: new THREE.Group(), pz: new THREE.Group() };
	let walls: Record<Side, THREE.Object3D> | undefined;
	let ceiling: THREE.Object3D | undefined;
	/** Swap a piece of the shell for one built at the room's current size. */
	const rebuild = (
		old: THREE.Object3D | undefined,
		next: THREE.Object3D,
		parent: THREE.Object3D
	) => {
		if (old) {
			parent.remove(old);
			dispose(old);
		}
		parent.add(next);
		return next;
	};
	const buildSides = () => {
		const next = buildWalls(roomHalf, roomH);
		for (const s of SIDES) rebuild(walls?.[s], N(next[s], 'wall'), sides[s]);
		walls = next;
	};
	const buildTop = () => {
		ceiling = rebuild(ceiling, N(buildCeiling(roomHalf, roomH), 'ceiling'), group);
	};
	for (const s of SIDES) {
		sides[s].name = `side-${s}`;
		group.add(sides[s]);
	}
	later(buildSides);
	later(buildTop);

	/** The camera stays in the room, and the fog, focus and shadows grow with it. */
	const fitStage = () => {
		const top = FLOOR_Y + roomH - BEAM_DEPTH - CAMERA_BEAMS;
		stage.rig.bounds = { half: (roomHalf - CAMERA_WALL) * K, top: top * K };
		stage.fitRoom(roomHalf / ROOM_HALF);
	};
	fitStage();

	const shelfW = 30;
	const shelves: THREE.Group[] = [];
	const shelfSeeds = [3, 8, 15];
	let shelfN = 0;
	/**
	 * Put an object against a wall: `along` is the left edge (or centre) along the wall, as it is
	 * in the standard room; in a bigger room things spread out along the longer walls.
	 */
	const against = (side: Side, obj: THREE.Object3D, along: number, out: number, y = FLOOR_Y, turn = 0) => {
		const p = place(obj, 0, y, 0);
		p.name = obj.name || 'item';
		p.userData.wall = { side, along, out, turn };
		sides[side].add(p);
		return putAgainst(p);
	};
	/** Stand a piece in its place against its wall, at the room's current size. */
	const putAgainst = (p: THREE.Object3D) => {
		const w: { side: Side; along: number; out: number; turn: number } = p.userData.wall;
		const f = wallFrame(w.side, roomHalf)((w.along * roomHalf) / ROOM_HALF, w.out);
		p.position.x = f.x;
		p.position.z = f.z;
		p.rotation.y = f.rot + w.turn;
		return p;
	};
	/** Set something on a piece against a wall (x along it, z out from it), to move with it. */
	const onto = (base: THREE.Object3D, obj: THREE.Object3D, x: number, y: number, z: number) =>
		base.add(place(obj, x, y, z));
	const bookcase = (side: Side, left: number, plant?: { seed: number; at: number; hang: number }) =>
		later(() => {
			const i = shelfN++ % shelfSeeds.length;
			if (!shelves[i]) shelves[i] = N(buildBookcase({ width: shelfW, height: 50, seed: shelfSeeds[i] }), 'bookcase');
			const b = shelfN <= shelfSeeds.length ? shelves[i] : shelves[i].clone(true);
			const p = against(side, b, left, 0);
			if (plant && hq) {
				const vine = N(buildPlant('hanging', plant.seed, 2, plant.hang, 8), 'vine');
				onto(p, vine, plant.at, 51 * SHELF_S, 22);
			}
		});
	const item = (side: Side, make: () => THREE.Object3D, name: string, along: number, out: number, y = FLOOR_Y, turn = 0, onlyHq = false) => {
		if (!onlyHq || hq) later(() => against(side, N(make(), name), along, out, y, turn));
	};

	// Right wall (+x): the fireplace, seen back-right from the default view, with the cat's
	// armchair beside it.
	let cat: Cat | null = null;
	const fireLeft = -160;
	const fireLight = flame(0, FLOOR_Y + FIRE_LIGHT.y, 0, '#ff6a1e', 950, 1100);
	let hearth: THREE.Object3D | undefined;
	let chimney: THREE.Object3D | undefined;
	/** The chimney breast goes on up to the ceiling, however high the room is. */
	const buildFlue = () => {
		if (hearth) chimney = rebuild(chimney, N(buildChimney(roomH), 'chimney'), hearth);
	};
	soon(() => {
		const fire = buildFireplace();
		hearth = against('px', N(fire.group, 'fireplace'), fireLeft, 0);
		buildFlue();
		updaters.push(fire.update);
		onto(hearth, N(buildLantern(), 'lantern'), 20, fire.mantelY, 24);
		onto(hearth, N(buildCandles(), 'candles'), 112, fire.mantelY, 26);
		onto(hearth, N(buildPlant('hanging', 31, 1.4, 16, 13), 'plant'), 40, fire.mantelY, 30);
	});
	later(() => {
		const chair = buildArmchair();
		cat = buildCat();
		cat.group.scale.setScalar(1.35);
		cat.group.position.set(-2, 36, 6);
		cat.group.rotation.y = 0.3;
		chair.add(cat.group);
		against('px', N(chair, 'armchair'), -226, 74, FLOOR_Y, Math.PI / 2 - 0.7);
		updaters.push((_dt, t) => cat!.update(t));
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
	const chestLight = flame(0, FLOOR_Y + 52, 0, '#ff9a3a', 140, 360, true);
	/** The fire's light and the chest lantern's move out with their walls. */
	const placeLights = () => {
		const k = roomHalf / ROOM_HALF;
		const fire = wallFrame('px', roomHalf)(fireLeft * k + FIRE_LIGHT.x, FIRE_LIGHT.z);
		fireLight.position.set(fire.x * K, fireLight.position.y, fire.z * K);
		const lamp = wallFrame('nz', roomHalf)(-16 * k, 40);
		chestLight.position.set(lamp.x * K, chestLight.position.y, lamp.z * K);
	};
	placeLights();
	bookcase('nz', 62, { seed: 12, at: 60, hang: 30 });
	item('nz', () => buildPlant('tall', 21, 2.2), 'plant', 222, 36);
	item('nz', () => buildPlant('bush', 19, 2.4), 'plant', 272, 30, FLOOR_Y, 0, true);

	// The windows let in shafts of moonlight at night.
	const beamMat = moonbeamMaterial();
	const moonWindow = () => {
		const w = buildWindow();
		w.add(buildMoonbeam(beamMat));
		return w;
	};
	updaters.push(() => {
		const n = sharedUniforms.uNight.value;
		beamMat.uniforms.uOpacity.value = n * 0.35;
		beamMat.visible = n > 0.01;
	});

	// Left wall (-x): a snowy window between bookcases.
	bookcase('nx', 172, { seed: 5, at: 80, hang: 26 });
	bookcase('nx', 46);
	item('nx', moonWindow, 'window', -60, 3, FLOOR_Y + 115);
	item('nx', buildChest, 'chest', -180, 24, FLOOR_Y, 0.05, true);
	item('nx', () => buildPlant('tall', 33, 2.2), 'plant', -238, 40);
	item('nx', () => buildPlant('bush', 17, 2.4), 'plant', -276, 30, FLOOR_Y, 0, true);

	// Front wall (+z): bookcases, a window and a grandfather clock in the corner.
	bookcase('pz', -292, { seed: 11, at: 64, hang: 24 });
	item('pz', () => buildPlant('tall', 27, 2.2), 'plant', -142, 40);
	bookcase('pz', -112);
	item('pz', moonWindow, 'window', 86, 3, FLOOR_Y + 115);
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
		onTable.add(N(place(buildPlant('bush', 41, 1), PLANT.x, 0, PLANT.z), 'tablePlant'));
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
		layoutTable();
	});

	/** Things on the rim keep their place relative to the table's edge (the steam follows the mug by itself). */
	const layoutTable = () => {
		for (const o of onTable.children) {
			const base = (o.userData.base ??= { x: o.position.x, z: o.position.z }) as { x: number; z: number };
			o.position.x = base.x * tableScale;
			o.position.z = base.z * tableScale;
		}
	};

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
			s.m.position.set(MUG.x * tableScale + Math.sin(t * 1.3 + s.ph * 9) * 2.5 * p, 14 + p * 26, MUG.z * tableScale + Math.cos(t + s.ph * 7) * 2 * p);
			s.m.scale.setScalar(0.6 + p * 1.4);
			s.m.rotation.y = p * 2;
			s.m.visible = p > 0.04 && p < 0.92;
		}
	});

	// ---------------------------------------------------------------- lights
	const tableLight = flame(LANTERN.x, 12, LANTERN.z, '#ffb04a', 80, 320, true);

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
		props: onTable,
		get ready() {
			return queue.length === 0;
		},
		get tableHalf() {
			return tableHalfVox * 4 * K;
		},
		get cat() {
			return cat;
		},
		clearScale(halfX: number, halfZ: number) {
			// Each stands clear past the board's side or past its end, whichever comes sooner as the table grows.
			const need = (along: number, half: number, r: number) => (half / K + BOARD_GAP + r) / Math.abs(along);
			const most = Math.max(...[MUG, LANTERN, PLANT].map((p) => Math.min(need(p.x, halfX, p.r), need(p.z, halfZ, p.r))));
			// Half a voxel more, for the table's size being rounded to whole voxels.
			return most + 0.5 / 37;
		},
		fitTable(scale: number) {
			const half = Math.round(37 * Math.max(1, scale));
			if (half === tableHalfVox) return;
			const f = half / 37;
			group.remove(table);
			dispose(table);
			table = N(buildTable(half), 'table');
			group.add(table);
			for (const c of chairs) group.remove(c);
			chairs = placeChairs(group, 178 * f);
			for (const c of chairs) c.name = 'chair';
			tableLight.position.set(LANTERN.x * f * K, 12 * K, LANTERN.z * f * K);
			tableScale = f;
			tableHalfVox = half;
			layoutTable();
			// The room grows in proportion with the table, the ceiling too (in whole 8-unit voxels).
			roomHalf = ROOM_HALF + Math.round((ROOM_HALF * (f - 1)) / 8) * 8;
			roomH = Math.round((WALL_H * roomHalf) / ROOM_HALF / 8) * 8;
			group.remove(floor);
			dispose(floor);
			floor = makeFloor();
			if (walls) buildSides();
			for (const s of SIDES) for (const p of sides[s].children) if (p.userData.wall) putAgainst(p);
			if (ceiling) buildTop();
			buildFlue();
			placeLights();
			fitStage();
		},
		update(dt, t) {
			for (const u of updaters) u(dt, t);
		}
	};
}
