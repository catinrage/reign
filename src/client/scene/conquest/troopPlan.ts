import type { RealmRaster } from '../../../shared/conquest/realm';

/**
 * The plans behind the troops on the Realm (see troops.ts), kept apart from drawing them: which
 * pieces stand for a territory's armies, and the way overland from one place to another.
 */

/** The pieces, as in the classic war game: a footman is one army, a knight five, a catapult ten. */
export type UnitKind = 'footman' | 'knight' | 'catapult';

export const UNIT_WORTH: Record<UnitKind, number> = { footman: 1, knight: 5, catapult: 10 };

/** The most pieces one territory shows; past that its medallion's count says how many. */
export const MAX_FIGURES = 10;

/** The fewest pieces that make `count` armies, biggest first, at most MAX_FIGURES of them. */
export function unitsFor(count: number): UnitKind[] {
	const n = Math.max(0, Math.floor(count));
	const out: UnitKind[] = [];
	const add = (kind: UnitKind, k: number) => {
		for (let i = 0; i < k && out.length < MAX_FIGURES; i++) out.push(kind);
	};
	add('catapult', Math.floor(n / 10));
	add('knight', Math.floor((n % 10) / 5));
	add('footman', n % 5);
	return out;
}

/** How many of each kind a list of pieces holds. */
export function tally(units: UnitKind[]): Record<UnitKind, number> {
	const out: Record<UnitKind, number> = { footman: 0, knight: 0, catapult: 0 };
	for (const u of units) out[u]++;
	return out;
}

export interface Point {
	x: number;
	z: number;
}

/**
 * The way on foot from `from` to `to` (world x, z) through the territories in `allowed`, as a few
 * points from start to end: the shortest way over the map's cells, pulled straight wherever the
 * land allows. `cost` makes some cells slower going (woods, rocks). Null if there is no way.
 */
export function walkPath(
	raster: RealmRaster,
	from: Point,
	to: Point,
	allowed: ReadonlySet<number>,
	cost: (cell: number) => number = () => 1
): Point[] | null {
	const { nx, nz, ids } = raster;
	const cellOf = (p: Point) => {
		const ix = Math.floor((p.x - raster.x0) / raster.cell);
		const iz = Math.floor((p.z - raster.z0) / raster.cell);
		return ix >= 0 && iz >= 0 && ix < nx && iz < nz ? ix + iz * nx : -1;
	};
	const open = (c: number) => c >= 0 && allowed.has(ids[c]);
	const start = nearestOpen(raster, cellOf(from), from, open);
	const goal = nearestOpen(raster, cellOf(to), to, open);
	if (start < 0 || goal < 0) return null;
	const cells = astar(nx, nz, start, goal, open, cost);
	if (!cells) return null;
	const centre = (c: number): Point => ({ x: raster.x0 + ((c % nx) + 0.5) * raster.cell, z: raster.z0 + (Math.floor(c / nx) + 0.5) * raster.cell });
	// Pull the way straight: from each point, on to the farthest one in plain sight over open land.
	const pts = [from, ...cells.map(centre), to];
	const out: Point[] = [from];
	let i = 0;
	while (i < pts.length - 1) {
		let j = pts.length - 1;
		while (j > i + 1 && !clear(raster, pts[i], pts[j], open)) j--;
		out.push(pts[j]);
		i = j;
	}
	return out;
}

/** The open cell nearest `c` (itself if open), looking a few cells round it. */
function nearestOpen(raster: RealmRaster, c: number, p: Point, open: (c: number) => boolean): number {
	if (open(c)) return c;
	const { nx, nz } = raster;
	const ix = Math.floor((p.x - raster.x0) / raster.cell);
	const iz = Math.floor((p.z - raster.z0) / raster.cell);
	let best = -1;
	let near = Infinity;
	for (let dz = -8; dz <= 8; dz++)
		for (let dx = -8; dx <= 8; dx++) {
			const x = ix + dx;
			const z = iz + dz;
			if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
			const k = x + z * nx;
			const d = dx * dx + dz * dz;
			if (d < near && open(k)) {
				near = d;
				best = k;
			}
		}
	return best;
}

/** Whether the straight line from a to b stays on open cells. */
function clear(raster: RealmRaster, a: Point, b: Point, open: (c: number) => boolean): boolean {
	const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (raster.cell * 0.5));
	for (let s = 0; s <= steps; s++) {
		const u = steps ? s / steps : 0;
		const x = a.x + (b.x - a.x) * u;
		const z = a.z + (b.z - a.z) * u;
		const ix = Math.floor((x - raster.x0) / raster.cell);
		const iz = Math.floor((z - raster.z0) / raster.cell);
		if (ix < 0 || iz < 0 || ix >= raster.nx || iz >= raster.nz || !open(ix + iz * raster.nx)) return false;
	}
	return true;
}

/** A* over the grid's cells, eight ways round, diagonals a little longer. The cells from start to goal. */
function astar(nx: number, nz: number, start: number, goal: number, open: (c: number) => boolean, cost: (c: number) => number): number[] | null {
	const gx = goal % nx;
	const gz = Math.floor(goal / nx);
	const h = (c: number) => {
		const dx = Math.abs((c % nx) - gx);
		const dz = Math.abs(Math.floor(c / nx) - gz);
		return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
	};
	const g = new Map<number, number>([[start, 0]]);
	const prev = new Map<number, number>();
	const heap = new MinHeap();
	heap.push(start, h(start));
	const done = new Set<number>();
	while (heap.size) {
		const c = heap.pop();
		if (c === goal) {
			const path = [c];
			for (let p = prev.get(c); p !== undefined; p = prev.get(p)) path.push(p);
			return path.reverse();
		}
		if (done.has(c)) continue;
		done.add(c);
		const x = c % nx;
		const z = Math.floor(c / nx);
		for (let dz = -1; dz <= 1; dz++)
			for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dz) continue;
				const ux = x + dx;
				const uz = z + dz;
				if (ux < 0 || uz < 0 || ux >= nx || uz >= nz) continue;
				const n = ux + uz * nx;
				if (!open(n) || done.has(n)) continue;
				// No cutting a corner between two closed cells.
				if (dx && dz && (!open(x + dx + z * nx) || !open(x + (z + dz) * nx))) continue;
				const step = (dx && dz ? Math.SQRT2 : 1) * cost(n);
				const gn = g.get(c)! + step;
				if (gn < (g.get(n) ?? Infinity)) {
					g.set(n, gn);
					prev.set(n, c);
					heap.push(n, gn + h(n));
				}
			}
	}
	return null;
}

/** A binary heap of cells by priority, lowest first. */
class MinHeap {
	private items: number[] = [];
	private prio: number[] = [];

	get size() {
		return this.items.length;
	}

	push(item: number, p: number) {
		const { items, prio } = this;
		let i = items.length;
		items.push(item);
		prio.push(p);
		while (i > 0) {
			const up = (i - 1) >> 1;
			if (prio[up] <= p) break;
			items[i] = items[up];
			prio[i] = prio[up];
			i = up;
		}
		items[i] = item;
		prio[i] = p;
	}

	pop(): number {
		const { items, prio } = this;
		const top = items[0];
		const last = items.pop()!;
		const lp = prio.pop()!;
		const n = items.length;
		if (n) {
			let i = 0;
			for (;;) {
				const l = i * 2 + 1;
				if (l >= n) break;
				const r = l + 1;
				const c = r < n && prio[r] < prio[l] ? r : l;
				if (prio[c] >= lp) break;
				items[i] = items[c];
				prio[i] = prio[c];
				i = c;
			}
			items[i] = last;
			prio[i] = lp;
		}
		return top;
	}
}
