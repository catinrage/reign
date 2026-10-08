import * as THREE from 'three';
import { Mat, VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';
import { grain, rand, voxels } from './util';

/** Bookcases use 3-unit voxels. Local space: back at z = 0, front facing +z, x from 0. */
export const SHELF_S = 4;

const FRAME = [hex('#4a2918'), hex('#53301c'), hex('#452616')];
const BACK = hex('#2a170e');
const BOOKS = [
	hex('#8e2a22'),
	hex('#a8392a'),
	hex('#6e1f1c'),
	hex('#2f5a34'),
	hex('#3d6b3a'),
	hex('#2b3f6b'),
	hex('#34508a'),
	hex('#c99a3a'),
	hex('#b5832c'),
	hex('#6a4024'),
	hex('#7d5030'),
	hex('#2f6b6a'),
	hex('#d8c8a0'),
	hex('#5a3a6a'),
	hex('#c0602a'),
	hex('#1f2a3a')
];
const GOLD = hex('#e0b44c');
const JAR = [hex('#d9cfb8'), hex('#7f9fa8'), hex('#b8693a')];

export interface BookcaseSpec {
	width: number; // voxels
	height: number;
	seed: number;
}

/** A tall dark-wood bookcase crammed with colourful books and a few knick-knacks. */
export function buildBookcase({ width: W, height: H, seed }: BookcaseSpec): THREE.Group {
	const D = 9;
	const g = new VoxelGrid(W + 2, H + 1, D + 1, -1, 0, 0);
	const r = rand(seed);
	const fw = (x: number, y: number, z: number) => grain(pick(FRAME, hash3(x, 0, z, seed)), y, x * 3 + z, 4, 0.18);
	const fh = (x: number, y: number, z: number) => grain(pick(FRAME, hash3(0, y, z, seed)), x, y + z, 5, 0.18);
	// back
	g.box(0, 0, 0, W - 1, H - 1, 0, (x, y) => shade(BACK, 0.9 + hash3(x >> 2, y, 1) * 0.15));
	// sides
	g.box(0, 0, 0, 1, H - 1, D - 1, fw);
	g.box(W - 2, 0, 0, W - 1, H - 1, D - 1, fw);
	// plinth and crown
	g.box(0, 0, 0, W - 1, 2, D - 1, (x, y, z) => shade(fh(x, y, z), 0.8));
	g.box(-1, H - 3, 0, W, H - 1, D, (x, y, z) => (y === H - 3 ? shade(fh(x, y, z), 0.85) : fh(x, y, z)));
	g.box(0, H, 0, W - 1, H, D - 1, fh);
	// shelves
	const shelfYs: number[] = [];
	const rowH = 9;
	for (let y = 3; y + rowH <= H - 3; y += rowH) shelfYs.push(y);
	for (const y of shelfYs) {
		if (y > 3) g.box(2, y - 1, 0, W - 3, y - 1, D - 1, fh);
		const top = Math.min(y + rowH - 2, H - 4);
		// dark filler behind the books keeps them shallow (fewer faces)
		g.box(2, y, 1, W - 3, top, 2, (x, yy) => shade(BACK, 0.85 + hash3(x, yy, 2) * 0.15));
		fillRow(g, r, 2, W - 3, y, top, D);
	}
	return voxels(g, SHELF_S, { jitter: 0.05, drop: (_x, y, z) => y < 0 || z < 0, shadows: false });
}

function fillRow(g: VoxelGrid, r: () => number, x0: number, x1: number, y0: number, yTop: number, D: number) {
	const maxH = yTop - y0;
	let x = x0;
	while (x <= x1) {
		const k = r();
		const room = x1 - x + 1;
		if (k < 0.05 && room > 3) {
			x += 1 + Math.floor(r() * 2); // gap
			continue;
		}
		if (k < 0.1 && room > 4) {
			// jar or little pot
			const c = pick(JAR, r());
			const h = 2 + Math.floor(r() * 3);
			const z0 = D - 5;
			g.box(x + 1, y0, z0, x + 2, y0 + h - 1, z0 + 1, (xx, yy, zz) => shade(c, 0.9 + hash3(xx, yy, zz) * 0.15));
			g.box(x + 1, y0 + h, z0, x + 2, y0 + h, z0 + 1, shade(c, 0.7));
			if (r() < 0.4) g.set(x + 1, y0 + h + 1, z0 + 1, hex('#ffd27a'), Mat.Glow);
			x += 4;
			continue;
		}
		if (k < 0.16 && room > 6) {
			// stack of books lying flat
			let y = y0;
			const n = 2 + Math.floor(r() * 3);
			for (let i = 0; i < n && y + 1 < y0 + maxH; i++) {
				const c = pick(BOOKS, r());
				const w = 4 + Math.floor(r() * 2);
				const sx = x + Math.floor(r() * 2);
				g.box(sx, y, 3, sx + w - 1, y + 1, D - 3, (xx, yy, zz) => (zz === D - 3 && yy === y + 1 && r() < 0.3 ? GOLD : shade(c, 0.92 + hash3(xx, yy, zz) * 0.12)));
				g.box(sx, y, D - 3, sx + w - 1, y + 1, D - 3, (xx) => (xx === sx || xx === sx + w - 1 ? shade(c, 0.9) : hex('#e8dcc0')));
				y += 2;
			}
			x += 6;
			continue;
		}
		// upright book
		const w = Math.min(room, r() < 0.6 ? 1 : 2);
		const h = Math.max(4, maxH - Math.floor(r() * 3) - (r() < 0.2 ? 1 : 0));
		const c = pick(BOOKS, r());
		const front = D - 3 - (r() < 0.25 ? 1 : 0);
		const band = r();
		g.box(x, y0, 3, x + w - 1, y0 + h - 1, front, (xx, yy, zz) => {
			let col = shade(c, 0.9 + hash3(xx, yy, zz) * 0.14);
			if (zz === front) {
				if (band < 0.45 && (yy === y0 + h - 2 || yy === y0 + 1)) col = GOLD;
				else if (band > 0.8 && yy === y0 + Math.floor(h / 2)) col = shade(c, 1.5);
			}
			if (yy === y0 + h - 1) col = shade(col, 1.08);
			return col;
		});
		x += w;
	}
}
