import { regionKind, regionName, territoryName, worldName } from './names';
import { type RealmMap, type RealmTerrain, type RegionDef, type TerritoryDef, REALM_CELL, realmLand, realmRaster } from './realm';
import { cleanWorld } from './settings';
import type { Climate, WorldOptions } from './types';

/**
 * Random worlds for Conquest. The host picks a size, a shape, how many regions, how many sea
 * lanes and a climate; every machine at the table (and the server) makes the same world from those
 * and a seed. The land is grown from discs the way the Realm's is drawn, territories are spread
 * evenly over it, and everything the rules need (who borders whom, the sea lanes, the regions and
 * what they are worth) is read off the board's own cells, so the rules and the board always agree.
 */

/** Land a territory gets, about as much as the Realm's (world units squared). */
const LAND_PER_TERRITORY = 520;
/** Share of the board that is land, by shape. */
const LAND_SHARE = { continents: 0.4, pangaea: 0.48, archipelago: 0.3, ring: 0.4 };
/** The board's width over its depth. */
const ASPECT = 1.18;
/** Cells of the coarse map the land is planned on (world units). */
const PLAN = 1.2;
/** Regions' colors on the legend (the Realm's six first). */
const REGION_COLORS = ['#9fd3ea', '#3f9a3a', '#8c8e96', '#e9b632', '#d9733a', '#3a7fd0', '#b06cc8', '#d65a78', '#5fc0a8', '#b8c94a'];

/** A small, fast generator of numbers in [0, 1) from a seed. */
function mulberry(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
type Rand = () => number;
const between = (rand: Rand, lo: number, hi: number) => lo + rand() * (hi - lo);

const made = new Map<string, RealmMap>();

/** The world these options make (made once, then remembered). */
export function generateWorld(options: WorldOptions): RealmMap {
	const o = cleanWorld(options);
	const key = `world:${o.territories}:${o.shape}:${o.regions}:${o.lanes}:${o.climate}:${o.seed}`;
	const hit = made.get(key);
	if (hit) return hit;
	let map: RealmMap | null = null;
	// A rare unlucky draw (a territory squeezed to nothing): try again from the next one.
	for (let attempt = 0; attempt < 12 && !map; attempt++) map = tryWorld(o, key, attempt, attempt >= 8);
	if (!map) throw new Error(`No world could be made from ${key}.`);
	made.set(key, map);
	if (made.size > 6) made.delete(made.keys().next().value!);
	return map;
}

interface Disc {
	x: number;
	z: number;
	r: number;
}

/** One go at a world; null when it came out unplayable. `lenient` accepts smaller territories. */
function tryWorld(o: WorldOptions, key: string, attempt: number, lenient: boolean): RealmMap | null {
	const rand = mulberry(Math.imul(o.seed, 2654435761) ^ (attempt * 40503 + 17));
	const n = o.territories;
	const regionsWanted = Math.min(o.regions, Math.floor(n / 3));
	const land = n * LAND_PER_TERRITORY;
	const width = Math.round(Math.sqrt((land / LAND_SHARE[o.shape]) * ASPECT) / 6) * 6;
	const depth = Math.round(width / ASPECT / 6) * 6;
	const hx = width / 2;
	const hz = depth / 2;
	// Room in the sea for the legend (bottom right) and the compass (bottom left).
	const legendDepth = (14 + regionsWanted * 6) * 0.57;
	const legend: [number, number] = [hx - 29, hz - 14 - legendDepth / 2];
	const compass: [number, number] = [-hx + 21, hz - 17];
	const blocked = (x: number, z: number, pad: number) =>
		Math.abs(x) > hx - 16 - pad ||
		Math.abs(z) > hz - 16 - pad ||
		(x > legend[0] - 17 - 12 - pad && z > legend[1] - legendDepth / 2 - 12 - pad) ||
		Math.hypot(x - compass[0], z - compass[1]) < 20 + pad;

	// ---- the land
	const masses = growLands(o, rand, land, hx, hz, blocked);
	const id = `${key}#${attempt}`;
	const seed = (o.seed ^ (attempt * 7919)) & 0xffff;
	const base: RealmMap = {
		id,
		name: '',
		width,
		depth,
		seed,
		regions: [],
		territories: [],
		lands: Object.fromEntries(masses.map((m, i) => [`l${i}`, m.map((d): [number, number, number] => [d.x, d.z, d.r])])),
		waters: lakes(o, rand, masses),
		borders: [],
		lanes: [],
		missionRegions: [],
		legend,
		compass,
		generated: true
	};

	// The land as the board will draw it, coarsely: which landmass each cell is, how far from the sea.
	let plan = planLand(base, hx, hz);
	// Landmasses too small for a territory sink back into the sea.
	const small = plan.areas.flatMap((a, i) => (a < LAND_PER_TERRITORY * 0.45 ? [`l${i}`] : []));
	if (small.length) {
		for (const l of small) delete base.lands[l];
		plan = planLand(base, hx, hz);
	}
	const lands = Object.keys(base.lands);
	if (!lands.length) return null;
	const share = allot(n, lands.map((l) => plan.areas[Number(l.slice(1))]));
	if (!share) return null;

	// ---- the territories: spread evenly over each landmass
	const seats: { x: number; z: number; land: string }[] = [];
	lands.forEach((l, k) => {
		for (const s of spread(plan, Number(l.slice(1)), share[k], rand)) seats.push({ ...s, land: l });
	});
	base.territories = seats.map((s, i): TerritoryDef => ({ id: `t${i}`, name: `t${i}`, region: 0, blobs: [[s.x, s.z, 0]], land: s.land, terrain: 'meadow' }));

	// ---- who borders whom, read off the board's own cells
	const raster = realmRaster(base, REALM_CELL);
	const cells = new Array(n).fill(0);
	const touch = new Map<string, number>();
	const coast = new Array(n).fill(false);
	const { nx, nz, ids } = raster;
	for (let iz = 0; iz < nz; iz++)
		for (let ix = 0; ix < nx; ix++) {
			const t = ids[ix + iz * nx];
			if (t < 0) continue;
			cells[t]++;
			for (const [dx, dz] of [
				[1, 0],
				[0, 1],
				[-1, 0],
				[0, -1]
			]) {
				const x = ix + dx;
				const z = iz + dz;
				const u = x < 0 || z < 0 || x >= nx || z >= nz ? -1 : ids[x + z * nx];
				if (u < 0) coast[t] = true;
				else if (u > t) touch.set(`${t}:${u}`, (touch.get(`${t}:${u}`) ?? 0) + 1);
			}
		}
	const least = (LAND_PER_TERRITORY / (REALM_CELL * REALM_CELL)) * (lenient ? 0.12 : 0.28);
	for (let t = 0; t < n; t++) {
		const [x, z] = base.territories[t].blobs[0];
		const at = ids[Math.floor((x - raster.x0) / REALM_CELL) + Math.floor((z - raster.z0) / REALM_CELL) * nx];
		if (cells[t] < least || at !== t) return null;
	}
	const border = [...touch.keys()].map((k) => k.split(':').map(Number) as [number, number]);
	const adjacent = new Set(border.map(([a, b]) => `${a}:${b}`));

	// ---- sea lanes
	const lanes = seaLanes(o, seats, coast, adjacent, plan, width);
	if (!lanes) return null;

	// ---- regions
	const graph: { to: number; cost: number }[][] = seats.map(() => []);
	for (const [a, b] of border) {
		graph[a].push({ to: b, cost: 1 });
		graph[b].push({ to: a, cost: 1 });
	}
	for (const [a, b] of lanes) {
		graph[a].push({ to: b, cost: 2.5 });
		graph[b].push({ to: a, cost: 2.5 });
	}
	const region = growRegions(regionsWanted, seats, graph, rand);
	const members = Array.from({ length: regionsWanted }, (_, r) => region.flatMap((g, t) => (g === r ? [t] : [])));

	// ---- terrain, by climate and by how far north each region lies
	const massSize = new Map<string, number>();
	for (const s of seats) massSize.set(s.land, (massSize.get(s.land) ?? 0) + 1);
	const isle = Math.max(2, Math.round(n / 10));
	const isles = members.map((ts) => ts.every((t) => (massSize.get(seats[t].land) ?? 0) <= isle));
	const terrain = new Array<RealmTerrain>(n);
	members.forEach((ts, r) => {
		const north = ts.reduce((sum, t) => sum + seats[t].z, 0) / ts.length / depth + 0.5;
		const theme = themeFor(o.climate, north, isles[r], rand);
		for (const t of ts) terrain[t] = weighted(rand, THEMES[theme]);
	});

	// ---- names, bonuses and the map's own record
	const taken = new Set<string>();
	const regionsTaken = new Set<string>();
	const regionDefs: RegionDef[] = members.map((ts, r) => {
		const outward = ts.filter((t) => graph[t].some((e) => region[e.to] !== r)).length;
		return {
			id: `r${r}`,
			name: regionName(rand, regionKind(ts.map((t) => terrain[t]), isles[r]), regionsTaken),
			// Bigger regions, and ones with more ways in, are worth more: this gives the Realm's own bonuses back.
			bonus: Math.max(1, Math.round(ts.length * 0.35 + outward * 0.4 - 0.4)),
			color: REGION_COLORS[r % REGION_COLORS.length]
		};
	});
	const territories = base.territories.map((t, i): TerritoryDef => ({
		...t,
		name: territoryName(rand, terrain[i], taken),
		region: region[i],
		terrain: terrain[i]
	}));
	return {
		...base,
		name: worldName(rand),
		regions: regionDefs,
		territories,
		borders: border.map(([a, b]) => [`t${a}`, `t${b}`]),
		lanes: lanes.map(([a, b]) => [`t${a}`, `t${b}`]),
		missionRegions: missionPairs(members, n)
	};
}

// ---------------------------------------------------------------- land

/** Discs for each landmass, grown to the shape asked for. */
function growLands(o: WorldOptions, rand: Rand, land: number, hx: number, hz: number, blocked: (x: number, z: number, pad: number) => boolean): Disc[][] {
	const masses: Disc[][] = [];
	const near = (x: number, z: number, r: number, gap: number, except: number) =>
		masses.some((m, i) => i !== except && m.some((d) => Math.hypot(d.x - x, d.z - z) < d.r + r + gap));
	/** A free spot for a landmass's first disc, as far from the others as can be found. */
	const spot = (tries: number): [number, number] | null => {
		let best: [number, number] | null = null;
		let far = -1;
		for (let k = 0; k < tries; k++) {
			const x = between(rand, -hx + 30, hx - 30);
			const z = between(rand, -hz + 30, hz - 30);
			if (blocked(x, z, 14)) continue;
			const d = Math.min(1e9, ...masses.flatMap((m) => m.map((q) => Math.hypot(q.x - x, q.z - z))));
			if (d > far) {
				far = d;
				best = [x, z];
			}
		}
		return best;
	};
	/** Grow a landmass from (x, z) until it covers `area`, leaning along `lean` (radians) if given. */
	const grow = (x: number, z: number, area: number, lean: number | null) => {
		const i = masses.length;
		const discs: Disc[] = [{ x, z, r: between(rand, 10, 13) }];
		masses.push(discs);
		let covered = Math.PI * (discs[0].r * 0.85) ** 2;
		for (let fails = 0; covered < area && fails < 300; ) {
			const from = discs[Math.floor(rand() * discs.length)];
			const r = between(rand, 9, 13);
			const a = lean === null ? rand() * Math.PI * 2 : lean + (rand() < 0.5 ? 0 : Math.PI) + between(rand, -0.7, 0.7);
			const d = (from.r + r) * between(rand, 0.5, 0.8);
			const nx = from.x + Math.cos(a) * d;
			const nz = from.z + Math.sin(a) * d;
			if (blocked(nx, nz, r) || near(nx, nz, r, 9, i)) {
				fails++;
				continue;
			}
			discs.push({ x: nx, z: nz, r });
			// The new disc adds about the part of it the others don't already cover.
			const overlap = discs.slice(0, -1).reduce((m, q) => Math.max(m, 1 - Math.hypot(q.x - nx, q.z - nz) / (q.r + r)), 0);
			covered += Math.PI * (r * 0.85) ** 2 * (1 - overlap * 0.8);
		}
	};
	const weights = (k: number) => {
		const w = Array.from({ length: k }, () => between(rand, 0.7, 1.3));
		const sum = w.reduce((a, b) => a + b, 0);
		return w.map((v) => v / sum);
	};
	switch (o.shape) {
		case 'pangaea': {
			grow(between(rand, -hx * 0.1, hx * 0.1), between(rand, -hz * 0.1, hz * 0.1), land * 0.9, null);
			for (let k = 0; k < 2; k++) {
				const at = spot(30);
				if (at) grow(at[0], at[1], land * 0.05, null);
			}
			break;
		}
		case 'archipelago': {
			const count = Math.max(4, Math.round(o.territories / 3.5));
			for (const w of weights(count)) {
				const at = spot(40);
				if (at) grow(at[0], at[1], land * w, null);
			}
			break;
		}
		case 'ring': {
			const count = Math.max(3, Math.min(7, Math.round(o.regions * 0.8)));
			const turn = rand() * Math.PI * 2;
			weights(count).forEach((w, k) => {
				const a = turn + (k / count) * Math.PI * 2 + between(rand, -0.15, 0.15);
				const x = Math.cos(a) * hx * 0.62;
				const z = Math.sin(a) * hz * 0.6;
				// Each lies along the ring, so they close round an inland sea.
				if (!blocked(x, z, 10)) grow(x, z, land * w, a + Math.PI / 2);
			});
			break;
		}
		default: {
			const count = Math.max(2, Math.min(5, Math.round(o.regions * 0.6)));
			for (const w of weights(count)) {
				const at = spot(40);
				if (at) grow(at[0], at[1], land * w * 0.9, null);
			}
			for (let k = 0; k < 2; k++) {
				const at = spot(30);
				if (at) grow(at[0], at[1], land * 0.05, null);
			}
		}
	}
	return masses.filter((m) => m.length);
}

/** A lake or two in the big lands of continents and one great land. */
function lakes(o: WorldOptions, rand: Rand, masses: Disc[][]): [number, number, number][] {
	if (o.shape !== 'continents' && o.shape !== 'pangaea') return [];
	const big = masses.filter((m) => m.length >= 6);
	const out: [number, number, number][] = [];
	for (let k = 0; k < Math.min(big.length, rand() < 0.5 ? 1 : 2); k++) {
		const m = big[Math.floor(rand() * big.length)];
		// Inland: the disc with the most others round it.
		const inner = m.reduce((a, b) => (m.filter((q) => Math.hypot(q.x - b.x, q.z - b.z) < 22).length > m.filter((q) => Math.hypot(q.x - a.x, q.z - a.z) < 22).length ? b : a));
		out.push([inner.x, inner.z, between(rand, 3.5, 5)]);
	}
	return out;
}

interface LandPlan {
	nx: number;
	nz: number;
	x0: number;
	z0: number;
	/** Per cell: the landmass's index, or -1 for water. */
	mass: Int16Array;
	/** Per cell: cells to the nearest water. */
	inland: Float32Array;
	/** Per landmass (by index in the map's lands): its area. */
	areas: number[];
}

/** The land as the board will draw it, on coarse cells. */
function planLand(map: RealmMap, hx: number, hz: number): LandPlan {
	const nx = Math.ceil((hx * 2) / PLAN);
	const nz = Math.ceil((hz * 2) / PLAN);
	const mass = new Int16Array(nx * nz).fill(-1);
	const areas: number[] = [];
	for (let iz = 0; iz < nz; iz++)
		for (let ix = 0; ix < nx; ix++) {
			const l = realmLand(map, -hx + (ix + 0.5) * PLAN, -hz + (iz + 0.5) * PLAN);
			if (!l) continue;
			const m = Number(l.slice(1));
			mass[ix + iz * nx] = m;
			areas[m] = (areas[m] ?? 0) + PLAN * PLAN;
		}
	for (let i = 0; i < areas.length; i++) areas[i] ??= 0;
	// Distance to the water, a sweep each way.
	const inland = new Float32Array(nx * nz);
	for (let i = 0; i < inland.length; i++) inland[i] = mass[i] < 0 ? 0 : 1e6;
	for (let pass = 0; pass < 2; pass++)
		for (let iz = 0; iz < nz; iz++)
			for (let ix = 0; ix < nx; ix++) {
				const x = pass ? nx - 1 - ix : ix;
				const z = pass ? nz - 1 - iz : iz;
				const i = x + z * nx;
				if (!inland[i]) continue;
				const step = pass ? 1 : -1;
				const a = x + step >= 0 && x + step < nx ? inland[i + step] + 1 : 1;
				const b = z + step >= 0 && z + step < nz ? inland[i + step * nx] + 1 : 1;
				inland[i] = Math.min(inland[i], a, b);
			}
	return { nx, nz, x0: -hx, z0: -hz, mass, inland, areas };
}

/** Territories for each landmass by its area (largest remainders), at least one each; null if they don't fit. */
function allot(n: number, areas: number[]): number[] | null {
	if (areas.length > n) return null;
	const total = areas.reduce((a, b) => a + b, 0);
	const exact = areas.map((a) => (a / total) * n);
	const share = exact.map((e) => Math.max(1, Math.floor(e)));
	let left = n - share.reduce((a, b) => a + b, 0);
	const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
	for (let k = 0; left > 0; k++, left--) share[order[k % order.length].i]++;
	// Rounding a landmass up to one may have left too many: take them from the biggest.
	while (left < 0) {
		const big = share.indexOf(Math.max(...share));
		share[big]--;
		left++;
	}
	return share;
}

/**
 * `count` seats spread evenly over landmass `m`: the middles of as many even parts of it (a few
 * rounds of k-means over its cells), each moved to the part's most inland cell near its middle.
 */
function spread(plan: LandPlan, m: number, count: number, rand: Rand): { x: number; z: number }[] {
	const pts: number[] = [];
	for (let i = 0; i < plan.mass.length; i++) if (plan.mass[i] === m) pts.push(i);
	const px = (i: number) => plan.x0 + ((i % plan.nx) + 0.5) * PLAN;
	const pz = (i: number) => plan.z0 + (Math.floor(i / plan.nx) + 0.5) * PLAN;
	// k-means++ for a start: each next centre far from those chosen.
	const centres: [number, number][] = [];
	const first = pts[Math.floor(rand() * pts.length)];
	centres.push([px(first), pz(first)]);
	const near = new Float64Array(pts.length).fill(Infinity);
	while (centres.length < count) {
		const [cx, cz] = centres[centres.length - 1];
		let sum = 0;
		pts.forEach((p, k) => {
			near[k] = Math.min(near[k], (px(p) - cx) ** 2 + (pz(p) - cz) ** 2);
			sum += near[k];
		});
		let r = rand() * sum;
		let pickK = pts.length - 1;
		for (let k = 0; k < pts.length; k++) if ((r -= near[k]) <= 0) {
			pickK = k;
			break;
		}
		centres.push([px(pts[pickK]), pz(pts[pickK])]);
	}
	const owner = new Int32Array(pts.length);
	for (let round = 0; round < 10; round++) {
		const sx = new Float64Array(count);
		const sz = new Float64Array(count);
		const sn = new Float64Array(count);
		pts.forEach((p, k) => {
			let best = 0;
			let bd = Infinity;
			for (let c = 0; c < count; c++) {
				const d = (px(p) - centres[c][0]) ** 2 + (pz(p) - centres[c][1]) ** 2;
				if (d < bd) {
					bd = d;
					best = c;
				}
			}
			owner[k] = best;
			sx[best] += px(p);
			sz[best] += pz(p);
			sn[best]++;
		});
		for (let c = 0; c < count; c++) if (sn[c]) centres[c] = [sx[c] / sn[c], sz[c] / sn[c]];
	}
	return centres.map(([cx, cz], c) => {
		let best = -1;
		let score = -Infinity;
		pts.forEach((p, k) => {
			if (owner[k] !== c) return;
			const s = Math.min(plan.inland[p], 7) * PLAN - Math.hypot(px(p) - cx, pz(p) - cz) * 0.45;
			if (s > score) {
				score = s;
				best = p;
			}
		});
		return best < 0 ? { x: cx, z: cz } : { x: px(best), z: pz(best) };
	});
}

// ---------------------------------------------------------------- sea lanes

/**
 * Sea lanes between coastal territories of different landmasses (or across a bay of one): the
 * shortest joining every landmass first, then more by the host's choice, never over a third land.
 */
function seaLanes(o: WorldOptions, seats: { x: number; z: number; land: string }[], coast: boolean[], adjacent: Set<string>, plan: LandPlan, width: number): [number, number][] | null {
	const n = seats.length;
	const crossesOther = (a: number, b: number) => {
		const A = seats[a];
		const B = seats[b];
		const steps = Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / PLAN);
		let water = 0;
		for (let s = 1; s < steps; s++) {
			const x = A.x + ((B.x - A.x) * s) / steps;
			const z = A.z + ((B.z - A.z) * s) / steps;
			const i = Math.floor((x - plan.x0) / PLAN) + Math.floor((z - plan.z0) / PLAN) * plan.nx;
			const m = plan.mass[i] ?? -1;
			if (m < 0) water++;
			else if (`l${m}` !== A.land && `l${m}` !== B.land) return { blocked: true, water: water / steps };
		}
		return { blocked: false, water: water / steps };
	};
	type Lane = { a: number; b: number; d: number };
	const cands: Lane[] = [];
	for (let a = 0; a < n; a++)
		for (let b = a + 1; b < n; b++) {
			if (!coast[a] || !coast[b] || adjacent.has(`${a}:${b}`)) continue;
			const d = Math.hypot(seats[a].x - seats[b].x, seats[a].z - seats[b].z);
			const across = seats[a].land !== seats[b].land;
			if (d > (across ? width * 0.45 : 46)) continue;
			const c = crossesOther(a, b);
			// Across a bay of one land: mostly over water, and the way round by land a long one.
			if (c.blocked || (!across && c.water < 0.45)) continue;
			cands.push({ a, b, d: across ? d : d * 1.4 });
		}
	cands.sort((x, y) => x.d - y.d);
	const lands = [...new Set(seats.map((s) => s.land))];
	const root = new Map(lands.map((l) => [l, l]));
	const find = (l: string): string => (root.get(l) === l ? l : find(root.get(l)!));
	const out: Lane[] = [];
	const count = new Array(n).fill(0);
	// Join every landmass, shortest first.
	for (const c of cands) {
		const ra = find(seats[c.a].land);
		const rb = find(seats[c.b].land);
		if (ra === rb) continue;
		root.set(ra, rb);
		out.push(c);
		count[c.a]++;
		count[c.b]++;
	}
	if (new Set(lands.map(find)).size > 1) return null;
	const extra = { few: Math.round(n / 24), some: Math.round(n / 9), many: Math.round(n / 4.5) }[o.lanes];
	const pairs = new Map<string, number>();
	for (const c of out) {
		const k = [seats[c.a].land, seats[c.b].land].sort().join();
		pairs.set(k, (pairs.get(k) ?? 0) + 1);
	}
	const perPair = { few: 1, some: 2, many: 3 }[o.lanes];
	for (let added = 0, k = 0; added < extra && k < cands.length; k++) {
		const c = cands[k];
		if (out.includes(c) || count[c.a] >= 2 || count[c.b] >= 2) continue;
		const key = [seats[c.a].land, seats[c.b].land].sort().join();
		if ((pairs.get(key) ?? 0) >= perPair) continue;
		// Not right beside another lane: two from next-door shores to next-door shores say nothing new.
		if (out.some((l) => Math.hypot(seats[l.a].x - seats[c.a].x, seats[l.a].z - seats[c.a].z) + Math.hypot(seats[l.b].x - seats[c.b].x, seats[l.b].z - seats[c.b].z) < 30)) continue;
		out.push(c);
		pairs.set(key, (pairs.get(key) ?? 0) + 1);
		count[c.a]++;
		count[c.b]++;
		added++;
	}
	return out.map((l) => [l.a, l.b]);
}

// ---------------------------------------------------------------- regions

/**
 * `count` regions grown over the territories from seeds far apart, the smallest region growing
 * next, by land before sea: each region one piece, about the same size.
 */
function growRegions(count: number, seats: { x: number; z: number }[], graph: { to: number; cost: number }[][], rand: Rand): number[] {
	const n = seats.length;
	const region = new Array(n).fill(-1);
	const seeds: number[] = [Math.floor(rand() * n)];
	while (seeds.length < count) {
		let far = -1;
		let best = 0;
		for (let t = 0; t < n; t++) {
			if (seeds.includes(t)) continue;
			const d = Math.min(...seeds.map((s) => Math.hypot(seats[s].x - seats[t].x, seats[s].z - seats[t].z)));
			if (d > far) {
				far = d;
				best = t;
			}
		}
		seeds.push(best);
	}
	const size = new Array(count).fill(1);
	seeds.forEach((s, r) => (region[s] = r));
	for (let left = n - count; left > 0; left--) {
		let choice: { t: number; r: number; score: number } | null = null;
		for (let r = 0; r < count; r++) {
			for (let t = 0; t < n; t++) {
				if (region[t] !== r) continue;
				for (const e of graph[t]) {
					if (region[e.to] >= 0) continue;
					const s = seats[seeds[r]];
					const score = size[r] * 10 + e.cost * 3 + Math.hypot(seats[e.to].x - s.x, seats[e.to].z - s.z) * 0.05;
					if (!choice || score < choice.score) choice = { t: e.to, r, score };
				}
			}
		}
		if (!choice) {
			// Cut off from every region (should not happen: the lanes join every land): the nearest takes it.
			const t = region.indexOf(-1);
			const r = seeds.reduce((a, s, k) => (Math.hypot(seats[s].x - seats[t].x, seats[s].z - seats[t].z) < Math.hypot(seats[seeds[a]].x - seats[t].x, seats[seeds[a]].z - seats[t].z) ? k : a), 0);
			choice = { t, r, score: 0 };
		}
		region[choice.t] = choice.r;
		size[choice.r]++;
	}
	return region;
}

// ---------------------------------------------------------------- terrain

type Theme = 'cold' | 'north' | 'wood' | 'temperate' | 'high' | 'dry' | 'isle' | 'drift' | 'scrub' | 'green';

const THEMES: Record<Theme, [RealmTerrain, number][]> = {
	cold: [['snow', 3], ['taiga', 3], ['mountains', 1], ['hills', 1]],
	north: [['taiga', 3], ['forest', 3], ['hills', 2], ['mountains', 1]],
	wood: [['forest', 4], ['meadow', 1], ['hills', 1]],
	temperate: [['fields', 3], ['meadow', 3], ['forest', 2], ['hills', 1], ['mountains', 1]],
	high: [['mountains', 3], ['hills', 3], ['forest', 1]],
	dry: [['desert', 4], ['badlands', 3], ['hills', 1]],
	isle: [['jungle', 3], ['meadow', 2], ['hills', 1]],
	drift: [['snow', 4], ['taiga', 2], ['mountains', 2]],
	scrub: [['badlands', 3], ['desert', 2], ['hills', 2], ['mountains', 1], ['meadow', 1]],
	green: [['forest', 3], ['jungle', 2], ['meadow', 2], ['fields', 1], ['hills', 1]]
};

/** A region's kind of land: by the climate, how far north it lies (0 to 1), and whether it is islands. */
function themeFor(climate: Climate, north: number, isles: boolean, rand: Rand): Theme {
	const any = (...ts: Theme[]) => ts[Math.floor(rand() * ts.length)];
	switch (climate) {
		case 'frozen':
			return isles ? any('north', 'cold') : any('cold', 'cold', 'drift', 'north', 'high');
		case 'desert':
			return isles ? any('scrub', 'isle') : any('dry', 'dry', 'scrub', 'high');
		case 'verdant':
			return isles ? 'isle' : any('wood', 'green', 'temperate', 'green');
		default:
			if (north < 0.2) return 'cold';
			if (north < 0.38) return isles ? 'north' : any('north', 'wood');
			if (isles) return 'isle';
			if (north > 0.74) return 'dry';
			return any('wood', 'temperate', 'temperate', 'high');
	}
}

function weighted<T>(rand: Rand, list: [T, number][]): T {
	let r = rand() * list.reduce((a, [, w]) => a + w, 0);
	for (const [v, w] of list) if ((r -= w) < 0) return v;
	return list[list.length - 1][0];
}

// ---------------------------------------------------------------- missions

/**
 * Pairs of regions for the secret missions: about a third of the world together, each region in
 * two pairs at most; a pair that falls well short asks for one more region of the player's choice.
 */
function missionPairs(members: number[][], n: number): RealmMap['missionRegions'] {
	if (members.length < 3) return [];
	const target = n * 0.36;
	const pairs: { a: number; b: number; size: number }[] = [];
	for (let a = 0; a < members.length; a++)
		for (let b = a + 1; b < members.length; b++) pairs.push({ a, b, size: members[a].length + members[b].length });
	pairs.sort((x, y) => Math.abs(x.size - target) - Math.abs(y.size - target) || x.a - y.a || x.b - y.b);
	const used = new Array(members.length).fill(0);
	const out: RealmMap['missionRegions'] = [];
	for (const p of pairs) {
		if (out.length >= 4) break;
		if (used[p.a] >= 2 || used[p.b] >= 2) continue;
		used[p.a]++;
		used[p.b]++;
		out.push({ regions: [`r${p.a}`, `r${p.b}`], extra: p.size < target - 2 && members.length > 3 ? 1 : 0 });
	}
	return out;
}
