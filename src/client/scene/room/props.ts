import * as THREE from 'three';
import { Mat, VoxelGrid, hash3, hex, mix, pick, shade } from '../voxel/grid';
import { GREEN_PLAID, SWAY_Y, grain, rand, tartan, voxels } from './util';

// ---------------------------------------------------------------- lantern (1-unit voxels)

/** Iron lantern with glowing glass, ~13 x 24 x 13, base centred at the origin. */
export function buildLantern(): THREE.Group {
	const g = new VoxelGrid(13, 25, 13, -6, 0, -6);
	const iron = hex('#2b221d');
	const ironHi = hex('#4a3b30');
	const glass = (x: number, y: number, z: number) => mix(hex('#ffcf6a'), hex('#ff9a3a'), hash3(x, y, z) * 0.5 + (y - 3) / 30);
	g.box(-5, 0, -5, 5, 2, 5, (x, y, z) => (y === 2 ? ironHi : iron));
	g.box(-4, 3, -4, 4, 14, 4, glass, Mat.Glow);
	// candle inside shows as a brighter core
	g.box(-1, 3, -1, 1, 8, 1, hex('#fff1c8'), Mat.Glow);
	g.box(0, 9, 0, 0, 11, 0, hex('#fff6d0'), Mat.Fire);
	// frame: corner posts and mid bars
	for (const x of [-5, 5]) for (const z of [-5, 5]) g.box(x, 3, z, x, 15, z, iron);
	for (const y of [3, 9, 15]) {
		g.box(-5, y, -5, 5, y, -5, iron);
		g.box(-5, y, 5, 5, y, 5, iron);
		g.box(-5, y, -5, -5, y, 5, iron);
		g.box(5, y, -5, 5, y, 5, iron);
	}
	// roof
	g.box(-5, 16, -5, 5, 16, 5, iron);
	g.box(-4, 17, -4, 4, 17, 4, ironHi);
	g.box(-3, 18, -3, 3, 18, 3, iron);
	g.box(-1, 19, -1, 1, 20, 1, iron);
	// handle ring
	g.box(-3, 21, 0, 3, 21, 0, iron);
	g.box(-3, 22, 0, -3, 23, 0, iron);
	g.box(3, 22, 0, 3, 23, 0, iron);
	g.box(-2, 24, 0, 2, 24, 0, iron);
	return voxels(g, 1, { jitter: 0.04, mats: { [Mat.Glow]: { emissive: 2.4 } } });
}

// ---------------------------------------------------------------- mug of coffee

export function buildMug(): THREE.Group {
	const g = new VoxelGrid(26, 16, 26, -13, 0, -13);
	// wooden coaster
	g.box(-11, 0, -11, 10, 0, 10, (x, _y, z) => {
		const edge = x === -11 || x === 10 || z === -11 || z === 10;
		return shade(grain(hex('#7a4a28'), x, z >> 2, 3), edge ? 0.75 : 1);
	});
	const white = hex('#f2eee6');
	const R = 7;
	for (let y = 1; y <= 13; y++)
		for (let z = -R; z <= R; z++)
			for (let x = -R; x <= R; x++) {
				const d = Math.hypot(x, z);
				if (d > R + 0.3) continue;
				if (y >= 11 && d < R - 1.2) {
					if (y === 11) g.set(x, y, z, mix(hex('#3a1e10'), hex('#5a3018'), hash3(x, y, z) * 0.5));
					continue;
				}
				let c = shade(white, 0.94 + hash3(x, y, z) * 0.06);
				if (y === 13) c = shade(white, 1.02);
				g.set(x, y, z, c);
			}
	// green pine logo on the +z face
	const logo = [
		'...#...',
		'..###..',
		'.#####.',
		'..###..',
		'.#####.',
		'#######',
		'...#...'
	];
	logo.forEach((row, i) => {
		for (let j = 0; j < row.length; j++)
			if (row[j] === '#') {
				const x = j - 3;
				const y = 10 - i;
				const c = i === 6 ? hex('#6a4024') : shade(hex('#2f7a35'), 0.9 + hash3(x, y, 0) * 0.2);
				for (let z = R; z >= 0; z--)
					if (g.solid(x, y, z)) {
						g.set(x, y, z, c);
						break;
					}
			}
	});
	// handle on +x side
	g.box(R + 1, 4, 0, R + 3, 4, 0, white);
	g.box(R + 1, 10, 0, R + 3, 10, 0, white);
	g.box(R + 3, 5, 0, R + 4, 9, 0, white);
	g.box(R + 1, 4, -1, R + 2, 4, 1, white);
	g.box(R + 1, 10, -1, R + 2, 10, 1, white);
	return voxels(g, 1, { jitter: 0.03 });
}

// ---------------------------------------------------------------- piece trays

/** Shallow wooden tray holding a player's spare roads, settlements and cities (1.5-unit voxels). */
export function buildTray(color: number, seed: number): THREE.Group {
	const W = 34;
	const D = 18;
	const g = new VoxelGrid(W, 9, D, -W / 2, 0, -D / 2);
	const wood = [hex('#6a3420'), hex('#743a24'), hex('#62301c')];
	g.box(-W / 2, 0, -D / 2, W / 2 - 1, 4, D / 2 - 1, (x, y, z) => grain(pick(wood, hash3(y >> 1, 0, 0, 2)), x + z, y, 6, 0.2));
	for (let y = 2; y <= 4; y++)
		for (let z = -D / 2 + 1; z <= D / 2 - 2; z++) for (let x = -W / 2 + 1; x <= W / 2 - 2; x++) g.clear(x, y, z);
	g.box(-W / 2 + 1, 1, -D / 2 + 1, W / 2 - 2, 1, D / 2 - 2, (x, _y, z) => shade(grain(wood[2], x, z, 4), 0.7));
	const r = rand(seed);
	const col = (x: number, y: number, z: number) => shade(color, 0.88 + hash3(x, y, z) * 0.18);
	const roof = (x: number, y: number, z: number) => shade(color, 0.66 + hash3(x, y, z, 2) * 0.1);
	// little houses
	for (const [hx, hz] of [
		[-15, -7],
		[-10, -2],
		[-15, 3],
		[-5, -7],
		[-5, 3]
	]) {
		const x = hx + Math.floor(r() * 2);
		const z = hz;
		g.box(x, 2, z, x + 2, 3, z + 2, col);
		g.box(x, 4, z, x + 2, 4, z + 2, roof);
		g.box(x, 5, z + 1, x + 2, 5, z + 1, roof);
	}
	// roads: bars along x, heaped
	for (let i = 0; i < 6; i++) {
		const z = -7 + i * 2 + (i > 2 ? 1 : 0);
		const x = 0 + Math.floor(r() * 4);
		g.box(x, 2 + (i % 2), z, x + 6, 2 + (i % 2), z, col);
	}
	// cities
	g.box(12, 2, -7, 14, 6, -5, col);
	g.box(11, 2, -4, 15, 3, -1, col);
	g.box(11, 4, -4, 15, 4, -1, roof);
	g.box(11, 2, 2, 14, 3, 6, col);
	g.box(11, 4, 2, 14, 4, 6, roof);
	return voxels(g, 1.5, { jitter: 0.04, drop: (_x, y) => y < 0 });
}

// ---------------------------------------------------------------- resource card stacks

const CARD_ART: Record<string, { bg: number; art: (x: number, z: number) => number }> = {
	wood: {
		bg: hex('#6fae4c'),
		art: (x, z) => {
			const tree = (cx: number, cz: number) => {
				const dz = z - cz;
				if (dz >= 0 && dz <= 6 && Math.abs(x - cx) <= Math.floor(dz / 2) + 0.5) return hex('#2e7a32');
				if (dz === 7 && x === cx) return hex('#6a4024');
				return -1;
			};
			const a = tree(4, 4);
			return a >= 0 ? a : tree(8, 7);
		}
	},
	brick: {
		bg: hex('#d8805a'),
		art: (x, z) => (x >= 3 && x <= 9 && z >= 6 && z <= 12 ? ((z & 1) === 0 || (x + (z >> 1) * 2) % 4 === 0 ? hex('#f0d0b0') : hex('#b84a2a')) : -1)
	},
	sheep: {
		bg: hex('#8cc85a'),
		art: (x, z) => {
			if (x >= 3 && x <= 8 && z >= 7 && z <= 10) return hex('#ffffff');
			if (x >= 8 && x <= 9 && z >= 6 && z <= 8) return hex('#3a3030');
			if ((x === 4 || x === 7) && z === 11) return hex('#3a3030');
			return -1;
		}
	},
	wheat: {
		bg: hex('#f0c450'),
		art: (x, z) => (x >= 3 && x <= 9 && z >= 4 && z <= 13 && (x & 1) === 1 ? (z < 8 ? hex('#e8a020') : hex('#c9822a')) : -1)
	},
	ore: {
		bg: hex('#9aa0aa'),
		art: (x, z) => {
			const d = Math.hypot(x - 6, (z - 9) * 1.3);
			if (d < 3.8) return hash3(x, z, 0) < 0.3 ? hex('#cfe0f0') : hex('#6a6e76');
			return -1;
		}
	},
	dev: {
		bg: hex('#5a3a7a'),
		art: (x, z) => (Math.abs(x - 6) + Math.abs(z - 9) <= 3 ? hex('#f0c040') : -1)
	}
};

/** A stack of cards: white edges, top card with framed voxel art. Long side along z. */
export function buildCards(kind: keyof typeof CARD_ART, count = 5): THREE.Group {
	const W = 16;
	const D = 23;
	const g = new VoxelGrid(W + 2, count + 2, D + 2, -1, 0, -1);
	const art = CARD_ART[kind];
	for (let i = 0; i < count; i++) {
		const dx = Math.round((hash3(i, 1, 0) - 0.5) * 1.4);
		const dz = Math.round((hash3(i, 2, 0) - 0.5) * 1.4);
		const top = i === count - 1;
		g.box(dx, i, dz, dx + W - 1, i, dz + D - 1, (x, _y, z) => {
			const lx = x - dx;
			const lz = z - dz;
			const edge = lx === 0 || lz === 0 || lx === W - 1 || lz === D - 1;
			if (!top) return i % 2 ? hex('#f4efe4') : hex('#e2dccf');
			if (edge) return hex('#f6f1e6');
			if (lx === 1 || lz === 1 || lx === W - 2 || lz === D - 2) return kind === 'dev' ? hex('#d8b04a') : hex('#efe6d2');
			const a = art.art(lx - 1, lz - 2);
			return a >= 0 ? a : shade(art.bg, 0.95 + hash3(lx, i, lz) * 0.08);
		});
	}
	return voxels(g, 1, { jitter: 0.02, drop: (_x, y) => y < 0 });
}

// ---------------------------------------------------------------- plants (foliage sways)

/** Potted plant. `kind` = bush | tall | hanging (vines trail down `hang` voxels). */
export function buildPlant(kind: 'bush' | 'tall' | 'hanging', seed: number, scale = 2, hang = 0): THREE.Group {
	const r = rand(seed);
	const Y = SWAY_Y + hang + 2;
	const g = new VoxelGrid(26, Y + 34, 26, -13, SWAY_Y - 2, -13);
	const pot = [hex('#b0603a'), hex('#a25534'), hex('#c06c40')];
	const potH = kind === 'tall' ? 8 : 6;
	const pr = kind === 'tall' ? 5 : 4;
	for (let y = 0; y < potH; y++)
		for (let z = -pr; z <= pr; z++)
			for (let x = -pr; x <= pr; x++) {
				const rr = pr - (y < 2 ? 1 : 0);
				if (Math.hypot(x, z) > rr + 0.3) continue;
				g.set(x, Y + y, z, y === potH - 1 ? shade(pot[0], 1.12) : pick(pot, hash3(x, y, z, seed)));
			}
	for (let z = -pr + 1; z <= pr - 1; z++) for (let x = -pr + 1; x <= pr - 1; x++) if (Math.hypot(x, z) < pr - 0.6) g.set(x, Y + potH - 1, z, hex('#3a2416'));
	const leaf = [hex('#3f8f35'), hex('#4ea43e'), hex('#2f7a2c'), hex('#5cb247'), hex('#2a6a28')];
	const L = (x: number, y: number, z: number) => g.set(x, y, z, pick(leaf, hash3(x, y, z, seed)), Mat.Sway);
	const base = Y + potH;
	if (kind === 'bush' || kind === 'hanging') {
		const blobs = kind === 'bush' ? 7 : 5;
		for (let i = 0; i < blobs; i++) {
			const a = r() * Math.PI * 2;
			const d = r() * (kind === 'bush' ? 4 : 3);
			const bx = Math.cos(a) * d;
			const bz = Math.sin(a) * d;
			const by = base + 1 + r() * (kind === 'bush' ? 8 : 3);
			const br = 2.2 + r() * 2;
			for (let y = Math.floor(by - br); y <= by + br; y++)
				for (let z = Math.floor(bz - br); z <= bz + br; z++)
					for (let x = Math.floor(bx - br); x <= bx + br; x++)
						if (Math.hypot(x - bx, (y - by) * 1.2, z - bz) < br && hash3(x, y, z, seed + 1) > 0.15) L(x, y, z);
		}
	}
	if (kind === 'tall') {
		// stems with big drooping leaves
		for (let i = 0; i < 7; i++) {
			const a = (i / 7) * Math.PI * 2 + r();
			const h = 10 + r() * 14;
			let x = 0;
			let z = 0;
			for (let y = 0; y < h; y++) {
				x += Math.cos(a) * 0.18 * (y / h) * 2;
				z += Math.sin(a) * 0.18 * (y / h) * 2;
				g.set(Math.round(x), base + y, Math.round(z), hex('#3a6a26'), Mat.Sway);
			}
			for (let k = 0; k < 7; k++) {
				const lx = x + Math.cos(a) * k * 0.9;
				const lz = z + Math.sin(a) * k * 0.9;
				const ly = base + h - k * 0.5 + (k < 2 ? 1 : 0);
				const w = k < 1 || k > 5 ? 1 : 2;
				for (let dw = -w; dw <= w; dw++) L(Math.round(lx - Math.sin(a) * dw), Math.round(ly), Math.round(lz + Math.cos(a) * dw));
			}
		}
	}
	if (kind === 'hanging') {
		// vines trailing over the front edge (+z) and the sides
		const vines = 6 + Math.floor(r() * 3);
		for (let i = 0; i < vines; i++) {
			const a = -Math.PI * 0.1 + (i / vines) * Math.PI * 1.2 + r() * 0.3;
			let x = Math.round(Math.cos(a) * (pr + 1));
			let z = Math.round(Math.sin(a) * (pr + 1));
			const len = hang * (0.45 + r() * 0.55);
			for (let k = 0; k < len; k++) {
				const y = base - k;
				if (r() < 0.15) x += r() < 0.5 ? 1 : -1;
				if (r() < 0.1) z += 1;
				g.set(x, y, z, hex('#3c7a2c'), Mat.Sway);
				if (k % 3 === 0) {
					const s = r() < 0.5 ? 1 : -1;
					L(x + s, y, z);
					L(x, y - 1, z + 1);
				}
			}
		}
	}
	return voxels(g, scale, { jitter: 0.06, center: [0, Y, 0], shadows: false });
}

// ---------------------------------------------------------------- armchair with the cat

/** A wooden bench-armchair with a green plaid blanket, facing +z, 2-unit voxels. */
export function buildArmchair(): THREE.Group {
	const g = new VoxelGrid(38, 46, 32, -19, 0, -16);
	const wood = [hex('#5a3020'), hex('#653722'), hex('#4f2a1a')];
	const w = (x: number, y: number, z: number) => grain(pick(wood, hash3(x, 0, z)), y, x + z, 3, 0.18);
	// legs and frame
	for (const lx of [-18, 16]) for (const lz of [-15, 13]) g.box(lx, 0, lz, lx + 1, 10, lz + 1, w);
	g.box(-18, 11, -15, 17, 12, 14, (x, y, z) => grain(wood[1], x, z, 5));
	// arms
	for (const ax of [-18, 14]) {
		g.box(ax, 13, -15, ax + 3, 24, 14, (x, y, z) => tartan(z + 30, y + 30, GREEN_PLAID, 8));
		g.box(ax, 25, -15, ax + 3, 26, 15, w);
	}
	// back
	g.box(-18, 13, -15, 17, 44, -11, (x, y) => tartan(x + 30, y + 30, GREEN_PLAID, 8));
	g.box(-18, 45, -15, 17, 45, -11, w);
	// seat cushion
	g.box(-14, 13, -10, 13, 17, 14, (x, y, z) => (y === 17 ? tartan(x + 30, z + 30, GREEN_PLAID, 8) : shade(tartan(x + 30, y + 30, GREEN_PLAID, 8), 0.85)));
	// blanket draped over the back and one arm
	g.box(-10, 30, -10, 4, 45, -10, (x, y) => shade(tartan(x + 4, y, { ...GREEN_PLAID, base: 0x5a8a3e }, 6), 1.05));
	g.box(-10, 46, -15, 4, 46, -10, (x, _y, z) => tartan(x + 4, z, { ...GREEN_PLAID, base: 0x5a8a3e }, 6));
	g.box(-10, 34, -16, 4, 45, -16, (x, y) => tartan(x + 4, y, { ...GREEN_PLAID, base: 0x5a8a3e }, 6));
	return voxels(g, 2, { jitter: 0.04, drop: (_x, y) => y < 0, shadows: false });
}

export interface Cat {
	group: THREE.Group;
	update(t: number): void;
}

/** A sleeping orange tabby curled up, ~30 x 15 x 24 units. Breathes gently. */
export function buildCat(): Cat {
	const g = new VoxelGrid(34, 16, 28, -17, 0, -14);
	const fur = hex('#e08a3a');
	const stripe = hex('#a85a24');
	const cream = hex('#f6e4c4');
	const furAt = (x: number, y: number, z: number) => {
		const s = Math.sin(x * 0.9 + z * 0.25) > 0.55;
		const c = s ? stripe : fur;
		return shade(c, 0.92 + hash3(x, y, z) * 0.12);
	};
	// body: squashed ellipsoid curled into a crescent
	for (let y = 0; y < 12; y++)
		for (let z = -11; z <= 11; z++)
			for (let x = -15; x <= 15; x++) {
				const d = Math.hypot(x / 13.5, (y - 4.5) / 7, z / 9.5);
				if (d > 1) continue;
				let c = furAt(x, y, z);
				if (z > 6 && y < 6 && x < 4) c = shade(cream, 0.95 + hash3(x, y, z) * 0.06);
				g.set(x, y, z, c);
			}
	// head resting on the front paws, towards -x/+z
	const hx = -10;
	const hy = 6;
	const hz = 7;
	for (let y = -5; y <= 5; y++)
		for (let z = -5; z <= 5; z++)
			for (let x = -6; x <= 6; x++) {
				if (Math.hypot(x / 6, y / 5, z / 5) > 1) continue;
				let c = furAt(hx + x, hy + y, hz + z);
				if (z >= 3 && y <= 0 && Math.abs(x) <= 3) c = cream;
				g.set(hx + x, hy + y, hz + z, c);
			}
	// ears
	for (const ex of [-4, 3]) {
		g.box(hx + ex, hy + 5, hz - 1, hx + ex + 1, hy + 6, hz + 1, fur);
		g.set(hx + ex, hy + 7, hz, fur);
		g.set(hx + ex + (ex < 0 ? 1 : 0), hy + 5, hz + 1, hex('#e8a090'));
	}
	// closed eyes, nose
	for (const ex of [-3, 2]) g.box(hx + ex, hy + 1, hz + 5, hx + ex + 1, hy + 1, hz + 5, hex('#3a2418'));
	g.set(hx, hy - 1, hz + 6, hex('#e07a80'));
	g.set(hx - 1, hy - 1, hz + 6, hex('#e07a80'));
	// paws
	for (const px of [-6, -2]) g.box(px, 0, 9, px + 2, 1, 12, cream);
	// tail wrapping round the front
	for (let a = 0; a < Math.PI * 0.95; a += 0.06) {
		const x = Math.round(Math.cos(a) * 14);
		const z = Math.round(Math.sin(a) * 10.5);
		const c = Math.floor(a * 6) % 2 ? stripe : fur;
		g.box(x, 0, z, x + 1, 2, z + 1, c);
	}
	const body = voxels(g, 1, { jitter: 0.05, shadows: false });
	const group = new THREE.Group();
	group.add(body);
	return {
		group,
		update(t) {
			const b = Math.sin(t * 1.7) * 0.5 + 0.5;
			body.scale.set(1 + b * 0.015, 1 + b * 0.05, 1 + b * 0.025);
		}
	};
}

// ---------------------------------------------------------------- odds and ends

/** Wooden chest with iron bands, 2-unit voxels, facing +z. */
export function buildChest(): THREE.Group {
	const g = new VoxelGrid(30, 22, 18, -15, 0, -9);
	const wood = [hex('#6a3820'), hex('#7a4426'), hex('#5e311c')];
	const iron = hex('#3a3230');
	g.box(-14, 0, -8, 13, 13, 8, (x, y, z) => grain(pick(wood, hash3(0, y >> 2, 0, 3)), x + z, y >> 2, 3, 0.2));
	g.box(-14, 14, -8, 13, 16, 8, (x, y, z) => grain(wood[1], x + z, y, 4, 0.2));
	g.box(-13, 17, -7, 12, 18, 7, (x, y, z) => grain(wood[0], x + z, y, 4, 0.2));
	for (const bx of [-12, 10]) {
		g.box(bx, 0, -9, bx + 1, 16, 9, iron);
		g.box(bx, 17, -8, bx + 1, 19, 8, iron);
		g.box(bx - 1 + 1, 0, -9, bx, 0, 9, iron);
	}
	g.box(-15, 13, 8, 14, 14, 9, iron);
	g.box(-2, 9, 9, 1, 13, 9, hex('#c9a040'));
	g.box(-1, 10, 10, 0, 11, 10, hex('#2a2018'));
	return voxels(g, 2, { jitter: 0.04, drop: (_x, y) => y < 0, shadows: false });
}

/** Log basket for the fireplace, 2-unit voxels. */
export function buildLogBasket(): THREE.Group {
	const g = new VoxelGrid(26, 20, 18, -13, 0, -9);
	const wick = [hex('#9a6a38'), hex('#8a5a2e'), hex('#b07c44')];
	for (let y = 0; y < 10; y++)
		for (let z = -8; z <= 8; z++)
			for (let x = -12; x <= 12; x++) {
				const e = x === -12 || x === 12 || z === -8 || z === 8 || y === 0;
				if (!e) continue;
				g.set(x, y, z, shade(pick(wick, hash3(x, y, z)), (x + y + z) & 1 ? 0.85 : 1));
			}
	const bark = [hex('#4a2c18'), hex('#5a3620'), hex('#3d2414')];
	for (let i = 0; i < 7; i++) {
		const z = -6 + (i % 4) * 4;
		const y = 7 + Math.floor(i / 4) * 3 + (i % 2);
		g.box(-14, y, z, 13, y + 2, z + 2, (x, yy, zz) => (x <= -13 || x >= 12 ? hex('#c08a58') : pick(bark, hash3(x, yy, zz, i))));
	}
	return voxels(g, 2, { jitter: 0.05, drop: (_x, y) => y < 0, shadows: false });
}

/** Simple candle (1-unit voxels) with a flame. */
export function buildCandles(): THREE.Group {
	const g = new VoxelGrid(16, 16, 10, -8, 0, -5);
	const wax = hex('#efe2c4');
	const hs = [10, 7, 12];
	[-5, 0, 5].forEach((cx, i) => {
		g.box(cx - 1, 0, -1, cx + 1, hs[i], 1, (x, y, z) => shade(wax, 0.92 + hash3(x, y, z) * 0.08));
		g.set(cx, hs[i] + 1, 0, hex('#ffd46a'), Mat.Fire);
		g.set(cx, hs[i] + 2, 0, hex('#fff2b0'), Mat.Fire);
	});
	return voxels(g, 1, { jitter: 0.03, shadows: false });
}

/** Window with a moonlit night outside (glow), wooden frame and curtains; 3-unit voxels, faces +z. */
export function buildWindow(): THREE.Group {
	const g = new VoxelGrid(48, 44, 4, -24, 0, 0);
	const frame = hex('#4a2a18');
	g.box(-15, 0, 0, 14, 37, 1, frame);
	g.box(-13, 2, 0, 12, 35, 0, (x, y) => {
		const sky = mix(hex('#0d1838'), hex('#28407a'), y / 40);
		const star = hash3(x, y, 3) < 0.04 ? hex('#cfe0ff') : sky;
		const moon = Math.hypot(x - 6, y - 27) < 3.2 ? hex('#f4f0d8') : star;
		return moon;
	}, Mat.Glow);
	for (let y = 2; y <= 35; y++) for (let x = -13; x <= 12; x++) g.clear(x, y, 1);
	g.box(-15, 18, 1, 14, 19, 1, frame);
	g.box(-1, 2, 1, 0, 35, 1, frame);
	g.box(-17, -1, 1, 16, 0, 3, (x, y, z) => grain(frame, x, z, 3));
	// curtains (red plaid-ish folds)
	for (const side of [-1, 1]) {
		const x0 = side < 0 ? -22 : 11;
		for (let x = x0; x < x0 + 11; x++)
			for (let y = -1; y <= 41; y++) {
				const fold = (x + (side < 0 ? 0 : 1)) % 3 === 0 ? 3 : 2;
				const c = shade(mix(hex('#8a2420'), hex('#a8322a'), (x & 1) * 0.5), y % 8 === 0 ? 0.8 : 0.95 + hash3(x, y, 0) * 0.08);
				g.box(x, y, 2, x, y, fold, c);
			}
	}
	g.box(-23, 41, 0, 22, 42, 3, hex('#2a1a12'));
	return voxels(g, 3, { jitter: 0.03, drop: (_x, y, z) => y < 0 || z < 0, shadows: false, mats: { [Mat.Glow]: { emissive: 0.7 } } });
}
