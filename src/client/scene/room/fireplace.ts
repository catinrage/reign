import * as THREE from 'three';
import { Mat, VoxelGrid, hash3, hex, mix, pick, shade } from '../voxel/grid';
import { grain, rand, voxels } from './util';

/**
 * Stone fireplace with a wooden mantel and an iron grate. Local space: back against the
 * wall at z = 0, front facing +z, 3-unit voxels. The fire itself is a flipbook of finer
 * voxel frames that the room swaps every few frames, plus rising embers.
 */
export const FIRE_S = 3;
/** Where the fire light sits, in the fireplace's local space (world units). */
export const FIRE_LIGHT = { x: 22.5 * 3, y: 12 * 3, z: 9 * 3 + 20 };

const BRICK = [hex('#a0866c'), hex('#8e735c'), hex('#b39a7e'), hex('#7d6550'), hex('#9a7a60'), hex('#ab8f72')];
const MORTAR = hex('#4a3a2f');
const SOOT = [hex('#1d1310'), hex('#241713'), hex('#2a1b14')];
const IRON = hex('#2a2320');

export interface Fireplace {
	group: THREE.Group;
	/** Local position (world units) of the fire's centre, for the light. */
	firePos: THREE.Vector3;
	/** Local top of the mantel shelf. */
	mantelY: number;
	update(dt: number, t: number): void;
}

/** Opening: x in [OX0, OX1], y from 3 up to an arch. */
const OX0 = 11;
const OX1 = 34;
const archTop = (x: number) => 19 + Math.round(3 * Math.sqrt(Math.max(0, 1 - ((x - 22.5) / 12.5) ** 2)));

export function buildFireplace(): Fireplace {
	const W = 46;
	const g = new VoxelGrid(W + 8, 72, 24, -4, 0, 0);
	const stone = (x: number, y: number, z: number, face: 'front' | 'side' = 'front') => {
		const course = y >> 1;
		const u = face === 'front' ? x : z;
		const off = (course & 1) * 3;
		const brickIdx = Math.floor((u + off) / 5);
		const mortar = (u + off) % 5 === 0;
		const c = pick(BRICK, hash3(brickIdx, course, face === 'front' ? 0 : 1, 3));
		if (mortar) return shade(MORTAR, 0.9 + hash3(x, y, z) * 0.2);
		return shade(c, 0.88 + hash3(x, y, z) * 0.16 - ((y & 1) === 1 ? 0 : 0.1));
	};
	// firebox surround
	g.box(0, 0, 0, W - 1, 29, 13, (x, y, z) => stone(x, y, z, z === 13 ? 'front' : 'side'));
	// chimney breast
	g.box(4, 30, 0, W - 5, 71, 9, (x, y, z) => stone(x, y, z, z === 9 ? 'front' : 'side'));
	// opening with a shallow arch
	for (let x = OX0; x <= OX1; x++) {
		const top = archTop(x);
		g.box(x, 3, 3, x, top, 13, -1);
		for (let y = 3; y <= top; y++) for (let z = 3; z <= 13; z++) g.clear(x, y, z);
		// voussoir bricks around the arch
		for (let y = top + 1; y <= top + 2; y++) g.set(x, y, 13, shade(pick(BRICK, hash3(x >> 1, y, 4)), 1.05));
	}
	// soot-dark interior with a glow tint near the fire
	for (let x = OX0 - 1; x <= OX1 + 1; x++)
		for (let y = 2; y <= 24; y++)
			for (let z = 2; z <= 13; z++) {
				if (!g.solid(x, y, z)) continue;
				const inside = x === OX0 - 1 || x === OX1 + 1 || z === 2 || y === 2 || y > archTop(Math.max(OX0, Math.min(OX1, x)));
				if (!inside) continue;
				if (z === 13 && y > 2) continue;
				const heat = Math.max(0, 1 - Math.abs(x - 22.5) / 14) * Math.max(0, 1 - (y - 3) / 18);
				g.set(x, y, z, mix(pick(SOOT, hash3(x, y, z)), hex('#5a2a14'), heat * 0.6));
			}
	// ash bed
	g.box(OX0, 2, 3, OX1, 2, 12, (x, y, z) => mix(hex('#3a302b'), hex('#6a5a50'), hash3(x, y, z) * 0.6));
	// logs
	const bark = [hex('#4a2c18'), hex('#3d2414'), hex('#5a3620')];
	g.box(OX0 + 3, 3, 6, OX1 - 3, 4, 7, (x, y, z) => (x === OX0 + 3 || x === OX1 - 3 ? hex('#b08050') : pick(bark, hash3(x, y, z))));
	g.box(OX0 + 6, 3, 9, OX1 - 5, 4, 10, (x, y, z) => (x === OX0 + 6 || x === OX1 - 5 ? hex('#a87848') : pick(bark, hash3(x, y, z, 2))));
	g.box(OX0 + 8, 5, 7, OX1 - 7, 6, 8, (x, y, z) => (x === OX0 + 8 || x === OX1 - 7 ? hex('#b88a58') : pick(bark, hash3(x, y, z, 3))));
	// glowing embers in the ash and on the logs
	for (let x = OX0 + 1; x < OX1; x++)
		for (let z = 4; z <= 11; z++) {
			const h = hash3(x, 7, z, 5);
			if (h < 0.35 && !g.solid(x, 3, z)) g.set(x, 3, z, h < 0.12 ? hex('#ffb347') : hex('#d8501c'), Mat.Fire);
		}
	for (let x = OX0 + 4; x < OX1 - 3; x++) if (hash3(x, 9, 1) < 0.5) g.set(x, 5, 6, hex('#ff6a1c'), Mat.Fire);
	// iron grate
	for (let x = OX0 + 2; x <= OX1 - 2; x += 2) g.box(x, 3, 12, x, 8, 12, IRON);
	g.box(OX0 + 2, 8, 12, OX1 - 2, 8, 12, IRON);
	g.box(OX0 + 2, 4, 12, OX1 - 2, 4, 12, IRON);
	for (const x of [OX0 + 2, OX1 - 2]) g.set(x, 9, 12, shade(IRON, 1.4));
	// hearth slab
	g.box(-4, 0, 13, W + 3, 1, 21, (x, y, z) => {
		const slab = Math.floor((x + 4) / 7) + Math.floor((z - 13) / 5) * 11;
		const c = mix(hex('#8a8178'), hex('#a39a8e'), hash3(slab, 0, 0, 6));
		const seam = (x + 4) % 7 === 0 || (z - 13) % 5 === 0;
		return shade(c, (seam ? 0.72 : 0.92) + hash3(x, y, z) * 0.1);
	});
	// mantel
	const wood = [hex('#5a3220'), hex('#4e2b1b'), hex('#633823')];
	g.box(-3, 30, 0, W + 2, 32, 15, (x, y, z) => grain(pick(wood, hash3(0, y, z >> 2)), x, y * 3 + z, 4, 0.2));
	g.box(-1, 28, 13, W, 29, 14, (x, y, z) => shade(grain(wood[0], x, y, 7), 0.85));
	// corbels under the mantel
	for (const cx of [0, W - 3]) g.box(cx, 24, 13, cx + 2, 27, 15, (x, y, z) => grain(wood[1], y, x + z, 8));

	const group = voxels(g, FIRE_S, { jitter: 0.05, drop: (_x, y, z) => y < 0 || z < 0, shadows: false });

	// ---------------------------------------------------------------- fire flipbook
	const FS = 1.5;
	const frames: THREE.Group[] = [];
	const fireOrigin = new THREE.Vector3((OX0 + 1) * FIRE_S, 5 * FIRE_S, 4 * FIRE_S);
	const fw = Math.round(((OX1 - OX0 - 1) * FIRE_S) / FS); // ~44
	const fd = Math.round((7 * FIRE_S) / FS); // 14
	for (let f = 0; f < 4; f++) frames.push(fireFrame(fw, 34, fd, f, FS, fireOrigin));
	for (const fr of frames) group.add(fr);
	frames.forEach((fr, i) => (fr.visible = i === 0));

	// rising embers
	const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.35), toneMapped: false });
	const emberGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
	const embers: { m: THREE.Mesh; phase: number; x: number; z: number; speed: number }[] = [];
	for (let i = 0; i < 14; i++) {
		const m = new THREE.Mesh(emberGeo, emberMat);
		const e = { m, phase: hash3(i, 1, 2), x: (OX0 + 3 + hash3(i, 2, 3) * (OX1 - OX0 - 6)) * FIRE_S, z: (5 + hash3(i, 3, 4) * 5) * FIRE_S, speed: 0.35 + hash3(i, 4, 5) * 0.4 };
		embers.push(e);
		group.add(m);
	}

	let acc = 0;
	let cur = 0;
	const r = rand(77);
	return {
		group,
		firePos: new THREE.Vector3(22.5 * FIRE_S, 12 * FIRE_S, 9 * FIRE_S),
		mantelY: 33 * FIRE_S,
		update(dt, t) {
			acc += dt;
			if (acc > 0.085) {
				acc = 0;
				frames[cur].visible = false;
				let next = Math.floor(r() * frames.length);
				if (next === cur) next = (next + 1) % frames.length;
				cur = next;
				frames[cur].visible = true;
			}
			for (const e of embers) {
				const p = (t * e.speed + e.phase) % 1;
				e.m.position.set(e.x + Math.sin(t * 2 + e.phase * 20) * 4 * p, 18 + p * 60, e.z + Math.cos(t * 1.7 + e.phase * 9) * 3 * p);
				const s = (1 - p) * 1.1;
				e.m.scale.setScalar(Math.max(0.01, s));
				e.m.visible = p < 0.95;
			}
		}
	};
}

const FLAME = [hex('#ffe680'), hex('#ffc040'), hex('#ff9624'), hex('#f46a1a'), hex('#d8441a'), hex('#b02e14')];

function fireFrame(W: number, H: number, D: number, f: number, s: number, origin: THREE.Vector3) {
	const g = new VoxelGrid(W, H, D);
	const r = rand(100 + f * 31);
	// A handful of flame tongues; each is a cone that leans and flickers between frames.
	const tongues: { x: number; z: number; rad: number; h: number; lean: number }[] = [];
	const n = 7;
	for (let i = 0; i < n; i++) {
		const u = (i + 0.5) / n;
		const centre = 1 - Math.abs(u - 0.5) * 1.6;
		tongues.push({
			x: 4 + u * (W - 8) + (r() - 0.5) * 3,
			z: D / 2 + (r() - 0.5) * 4,
			rad: 3.5 + centre * 3 + r() * 1.5,
			h: 10 + centre * 18 + r() * 8,
			lean: (r() - 0.5) * 0.25
		});
	}
	for (const t of tongues)
		for (let y = 0; y < Math.min(H, t.h); y++) {
			const k = y / t.h;
			const rad = t.rad * Math.pow(1 - k, 0.8) * (1 + Math.sin(y * 0.7 + f * 1.3 + t.x) * 0.12);
			const cx = t.x + t.lean * y + Math.sin(y * 0.35 + f * 2.1 + t.z) * 1.2;
			for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++)
				for (let z = Math.floor(t.z - rad * 0.7); z <= Math.ceil(t.z + rad * 0.7); z++) {
					const d = Math.hypot((x + 0.5 - cx) / rad, (z + 0.5 - t.z) / (rad * 0.7));
					if (d > 1) continue;
					// hotter (whiter) in the core and near the base
					const heat = (1 - d) * 0.55 + (1 - k) * 0.5;
					const idx = Math.max(0, Math.min(FLAME.length - 1, Math.floor((1 - heat) * FLAME.length + k * 2)));
					const prev = g.get(x, y, z);
					const c = FLAME[idx];
					if (!prev || (prev & 0xffffff) < c) g.set(x, y, z, c, Mat.Fire);
				}
		}
	const grp = voxels(g, s, { jitter: 0.03, shadows: false, mats: { [Mat.Fire]: { emissive: 1.5 } } });
	grp.position.copy(origin);
	return grp;
}
