import { fractal } from '../noise';

/**
 * Conquest's map: the Realm, a cluster of kingdoms round an inland sea. Each territory is laid
 * out from a seat (x, z in world units, north is -z) and a reach, and the land between seats is
 * shared out the way a cartographer would draw it: whichever seat is nearest, with borders and
 * coasts wobbled by noise so no two look alike. The rules only need who borders whom, which is
 * written down here (`borders`, `lanes`); a test checks it against the land as it is drawn.
 */

export type RealmTerrain = 'snow' | 'taiga' | 'forest' | 'mountains' | 'hills' | 'fields' | 'meadow' | 'desert' | 'badlands' | 'jungle';

export interface RegionDef {
	id: string;
	name: string;
	/** Extra armies each turn for holding every territory in the region. */
	bonus: number;
	/** The region's heraldic color on the map's legend (not a player color). */
	color: string;
}

export interface TerritoryDef {
	id: string;
	name: string;
	/** Index into `regions`. */
	region: number;
	/**
	 * Where the territory lies, as points [x, z, pull] in world units (x east, z south): it holds
	 * the land of its landmass nearer one of its points (less its pull) than any other
	 * territory's. The first point is its seat, where its armies stand.
	 */
	blobs: [number, number, number][];
	/** Land that is one piece: territories of different landmasses never touch, only face each other across water. */
	land: string;
	terrain: RealmTerrain;
}

export interface RealmMap {
	id: string;
	name: string;
	/** The board is width × depth world units, centered on the origin. */
	width: number;
	depth: number;
	seed: number;
	regions: RegionDef[];
	territories: TerritoryDef[];
	/** Each landmass's outline, as discs [x, z, radius] whose coasts the noise roughens. */
	lands: Record<string, [number, number, number][]>;
	/** Bays, lakes and fjords cut into the land, as discs [x, z, radius]. */
	waters: [number, number, number][];
	/** Pairs of territories that share a border on land. */
	borders: [string, string][];
	/** Pairs of territories joined by a sea lane across the water. */
	lanes: [string, string][];
	/**
	 * The secret missions to hold regions (see Mission in types.ts): these regions, by id, and how
	 * many more of the player's choice.
	 */
	missionRegions: { regions: string[]; extra: number }[];
	/** Where the regions' legend board and the compass rose stand in the sea (x, z); the Realm's places if left out. */
	legend?: [number, number];
	compass?: [number, number];
	/** A generated world (see world.ts): its names are made up, not to be translated. */
	generated?: boolean;
}

const REGIONS: RegionDef[] = [
	{ id: 'frostmarch', name: 'Frostmarch', bonus: 3, color: '#9fd3ea' },
	{ id: 'elderwood', name: 'Elderwood', bonus: 4, color: '#3f9a3a' },
	{ id: 'ironpeaks', name: 'Ironpeaks', bonus: 4, color: '#8c8e96' },
	{ id: 'heartlands', name: 'Heartlands', bonus: 5, color: '#e9b632' },
	{ id: 'embersands', name: 'Ember Sands', bonus: 3, color: '#d9733a' },
	{ id: 'sapphire', name: 'Sapphire Isles', bonus: 3, color: '#3a7fd0' }
];

const T = (id: string, name: string, region: string, land: string, terrain: RealmTerrain, ...blobs: [number, number, number][]): TerritoryDef => ({
	id,
	name,
	region: REGIONS.findIndex((g) => g.id === region),
	blobs,
	land,
	terrain
});

const TERRITORIES: TerritoryDef[] = [
	// Frostmarch: a frozen arc across the northern strait.
	T('icewind', 'Icewind Shore', 'frostmarch', 'north', 'snow', [-84, -62, 0], [-92, -52, 0], [-78, -72, 0]),
	T('wolfden', 'Wolfden', 'frostmarch', 'north', 'taiga', [-58, -68, 0], [-50, -58, 0]),
	T('rimeholt', 'Rimeholt', 'frostmarch', 'north', 'snow', [-32, -72, 0], [-28, -60, 0]),
	T('hoarfell', 'Hoarfell', 'frostmarch', 'north', 'taiga', [-6, -76, 0], [-4, -66, 0]),
	T('frostgate', 'Frostgate', 'frostmarch', 'north', 'snow', [16, -62, 0], [20, -52, 0]),
	T('snowmere', 'Snowmere', 'frostmarch', 'north', 'taiga', [40, -72, 0], [54, -66, 0]),
	// Elderwood: deep forest in the west.
	T('owlhollow', 'Owlhollow', 'elderwood', 'main', 'forest', [-90, -40, 0], [-84, -50, 0]),
	T('thornwick', 'Thornwick', 'elderwood', 'main', 'forest', [-66, -46, 0], [-58, -40, 0]),
	T('elderheart', 'Elderheart', 'elderwood', 'main', 'forest', [-90, -12, 0], [-98, -4, 0]),
	T('mossvale', 'Mossvale', 'elderwood', 'main', 'meadow', [-68, -24, 0]),
	T('briarmoor', 'Briarmoor', 'elderwood', 'main', 'forest', [-86, 18, 0], [-92, 28, 0]),
	T('fernmere', 'Fernmere', 'elderwood', 'main', 'forest', [-67, 7, 0]),
	// Ironpeaks: a mountain range running down the middle of the Realm.
	T('highwatch', 'Highwatch', 'ironpeaks', 'main', 'mountains', [-40, -44, 0], [-36, -52, 0]),
	T('stonehelm', 'Stonehelm', 'ironpeaks', 'main', 'mountains', [-16, -48, 0], [-6, -52, 0]),
	T('grimcrag', 'Grimcrag', 'ironpeaks', 'main', 'hills', [-49, -19, 0]),
	T('anvilpass', 'Anvil Pass', 'ironpeaks', 'main', 'mountains', [-24, -32, 0]),
	T('ironhold', 'Ironhold', 'ironpeaks', 'main', 'hills', [0, -30, 0]),
	T('ashfall', 'Ashfall', 'ironpeaks', 'main', 'mountains', [-38, 7, 0], [-32, 14, 0]),
	// Heartlands: farmland round Crown Lake in the east.
	T('goldmeadow', 'Goldmeadow', 'heartlands', 'main', 'fields', [18, -42, 0]),
	T('millbrook', 'Millbrook', 'heartlands', 'main', 'fields', [44, -40, 0], [56, -32, 0]),
	T('crownhaven', 'Crownhaven', 'heartlands', 'main', 'meadow', [22, -18, 0]),
	T('riverbend', 'Riverbend', 'heartlands', 'main', 'meadow', [54, -8, 0], [62, 0, 0]),
	T('oakshire', 'Oakshire', 'heartlands', 'main', 'meadow', [8, 0, 0]),
	T('harvestdowns', 'Harvest Downs', 'heartlands', 'main', 'fields', [34, 8, 0]),
	T('westford', 'Westford', 'heartlands', 'main', 'fields', [-16, -4, 0], [-8, 12, 0]),
	// Ember Sands: desert down the southern isthmus.
	T('scorchwind', 'Scorchwind', 'embersands', 'main', 'desert', [2, 36, 0], [8, 46, 0]),
	T('redrock', 'Redrock', 'embersands', 'main', 'badlands', [-44, 44, 0], [-54, 38, 0]),
	T('sunspire', 'Sunspire', 'embersands', 'main', 'desert', [-14, 48, 0]),
	T('dunewatch', 'Dunewatch', 'embersands', 'main', 'desert', [-38, 68, 0]),
	T('oasis', 'Oasis of Ilm', 'embersands', 'main', 'badlands', [-10, 78, 0], [8, 74, 0]),
	T('sandhaven', 'Sandhaven', 'embersands', 'main', 'desert', [28, 58, 0], [38, 66, 0]),
	// Sapphire Isles: an archipelago off the east coast.
	T('gullrock', 'Gullrock', 'sapphire', 'gull', 'hills', [86, -60, 0], [94, -52, 0]),
	T('stormkeep', 'Stormkeep', 'sapphire', 'storm', 'jungle', [92, -24, 0]),
	T('pearl', 'Pearl Isle', 'sapphire', 'pearl', 'jungle', [80, 8, 0], [88, 16, 0]),
	T('coralreach', 'Coralreach', 'sapphire', 'coral', 'jungle', [92, 42, 0]),
	T('tidewell', 'Tidewell', 'sapphire', 'tide', 'meadow', [62, 60, 0])
];

export const REALM: RealmMap = {
	id: 'realm',
	name: 'The Realm',
	width: 234,
	depth: 198,
	seed: 7,
	regions: REGIONS,
	territories: TERRITORIES,
	lands: {
		north: [[-86, -60, 14], [-70, -68, 13], [-50, -68, 13], [-30, -70, 13], [-10, -72, 13], [10, -64, 12], [22, -56, 8], [40, -70, 13], [56, -66, 10]],
		main: [
			// Elderwood
			[-88, -40, 13], [-72, -40, 13], [-90, -14, 14], [-66, -16, 14], [-86, 12, 13], [-64, 8, 12], [-92, 26, 8],
			// Ironpeaks
			[-44, -44, 13], [-20, -44, 12], [-8, -48, 8], [-42, -18, 13], [-22, -20, 13], [-2, -24, 13], [-36, 6, 12], [-14, 8, 12],
			// Heartlands
			[18, -42, 13], [42, -40, 13], [58, -32, 9], [22, -16, 13], [44, -18, 12], [56, -6, 12], [64, 2, 8], [6, -2, 12], [34, 8, 13], [-8, 16, 9],
			// the isthmus and Ember Sands
			[0, 26, 7], [4, 36, 9], [8, 46, 9], [-44, 44, 12], [-56, 38, 8], [-28, 48, 9], [-18, 54, 13], [-38, 68, 13], [-6, 76, 12], [10, 74, 9], [28, 58, 13], [38, 66, 9]
		],
		gull: [[88, -58, 10], [94, -50, 7]],
		storm: [[92, -24, 11]],
		pearl: [[80, 8, 10], [88, 16, 7]],
		coral: [[92, 42, 10]],
		tide: [[62, 60, 11]]
	},
	waters: [
		[38, -24, 5],
		[-20, -58, 5]
	],
	borders: [
		['icewind', 'wolfden'],
		['wolfden', 'rimeholt'],
		['rimeholt', 'hoarfell'],
		['hoarfell', 'frostgate'],
		['frostgate', 'snowmere'],
		['owlhollow', 'thornwick'],
		['owlhollow', 'elderheart'],
		['owlhollow', 'mossvale'],
		['thornwick', 'mossvale'],
		['thornwick', 'highwatch'],
		['thornwick', 'grimcrag'],
		['elderheart', 'mossvale'],
		['elderheart', 'briarmoor'],
		['elderheart', 'fernmere'],
		['mossvale', 'fernmere'],
		['mossvale', 'grimcrag'],
		['briarmoor', 'fernmere'],
		['fernmere', 'grimcrag'],
		['fernmere', 'ashfall'],
		['highwatch', 'stonehelm'],
		['highwatch', 'grimcrag'],
		['highwatch', 'anvilpass'],
		['stonehelm', 'anvilpass'],
		['stonehelm', 'ironhold'],
		['grimcrag', 'anvilpass'],
		['grimcrag', 'ashfall'],
		['grimcrag', 'westford'],
		['anvilpass', 'ironhold'],
		['anvilpass', 'westford'],
		['ironhold', 'goldmeadow'],
		['ironhold', 'crownhaven'],
		['ironhold', 'oakshire'],
		['ironhold', 'westford'],
		['ashfall', 'westford'],
		['goldmeadow', 'millbrook'],
		['goldmeadow', 'crownhaven'],
		['millbrook', 'crownhaven'],
		['millbrook', 'riverbend'],
		['crownhaven', 'riverbend'],
		['crownhaven', 'oakshire'],
		['crownhaven', 'harvestdowns'],
		['riverbend', 'harvestdowns'],
		['oakshire', 'harvestdowns'],
		['oakshire', 'westford'],
		['westford', 'scorchwind'],
		['scorchwind', 'sandhaven'],
		['redrock', 'sunspire'],
		['redrock', 'dunewatch'],
		['sunspire', 'dunewatch'],
		['sunspire', 'oasis'],
		['dunewatch', 'oasis'],
		['oasis', 'sandhaven']
	],
	lanes: [
		['frostgate', 'stonehelm'],
		['icewind', 'owlhollow'],
		['snowmere', 'goldmeadow'],
		['snowmere', 'gullrock'],
		['millbrook', 'gullrock'],
		['riverbend', 'stormkeep'],
		['riverbend', 'pearl'],
		['gullrock', 'stormkeep'],
		['stormkeep', 'pearl'],
		['pearl', 'coralreach'],
		['coralreach', 'tidewell'],
		['tidewell', 'sandhaven'],
		['harvestdowns', 'tidewell'],
		['briarmoor', 'redrock']
	],
	missionRegions: [
		{ regions: ['heartlands', 'embersands'], extra: 0 },
		{ regions: ['elderwood', 'ironpeaks'], extra: 1 },
		{ regions: ['frostmarch', 'heartlands'], extra: 0 },
		{ regions: ['sapphire', 'frostmarch'], extra: 1 }
	]
};

/** The cell size the board draws a map at (world units): the borders the rules know are read off cells this size. */
export const REALM_CELL = 0.6;

/** What lies at a point of the map: a territory (its index) or water (-1). */
export interface RealmCell {
	territory: number;
	/** The next nearest territory, which the nearest one borders here if this is a border. */
	next: number;
}

/**
 * Which territory holds the point (x, z), or water. Deterministic, so the board drawn in every
 * browser and the borders the rules know agree to the last grain of sand.
 */
export function realmCell(map: RealmMap, x: number, z: number): RealmCell {
	const s = map.seed;
	const land = realmLand(map, x, z);
	if (!land) return WATER;
	// Borders between territories wander too, less than the coast.
	const qx = x + (fractal(x * 0.06, z * 0.06, s + 51) - 0.5) * 7 + (fractal(x * 0.22, z * 0.22, s + 55) - 0.5) * 1.6;
	const qz = z + (fractal(x * 0.06, z * 0.06, s + 61) - 0.5) * 7 + (fractal(x * 0.22, z * 0.22, s + 65) - 0.5) * 1.6;
	let d1 = Infinity;
	let d2 = Infinity;
	let t1 = -1;
	let t2 = -1;
	const ts = map.territories;
	for (let i = 0; i < ts.length; i++) {
		if (ts[i].land !== land) continue;
		let d = Infinity;
		for (const [bx, bz, pull] of ts[i].blobs) d = Math.min(d, Math.hypot(qx - bx, qz - bz) - pull);
		if (d < d1) {
			d2 = d1;
			t2 = t1;
			d1 = d;
			t1 = i;
		} else if (d < d2) {
			d2 = d;
			t2 = i;
		}
	}
	return t1 < 0 ? WATER : { territory: t1, next: t2 };
}

/** How strong a landmass's blend of discs is at its coast (a lone disc reaches 0.8 of its radius). */
const COAST = 0.5;
const WATER: RealmCell = { territory: -1, next: -1 };

/**
 * The landmass at (x, z), or '' for water: the coast as the board draws it. Each landmass is a
 * soft blend of its discs, so neighbouring discs flow into one coast, and the coast wanders in bays
 * and headlands big and small.
 */
export function realmLand(map: RealmMap, x: number, z: number): string {
	const s = map.seed;
	const cx = x + (fractal(x * 0.035, z * 0.035, s) - 0.5) * 12 + (fractal(x * 0.13, z * 0.13, s + 5) - 0.5) * 4;
	const cz = z + (fractal(x * 0.035, z * 0.035, s + 31) - 0.5) * 12 + (fractal(x * 0.13, z * 0.13, s + 37) - 0.5) * 4;
	const index = discIndex(map);
	const bucket = index.buckets.get(index.key(cx, cz));
	let land = '';
	let best = 0;
	let second = 0;
	if (bucket) {
		// The discs near enough to count, landmass by landmass in the map's order, as if every disc were added up.
		let k = 0;
		while (k < bucket.length) {
			const l = bucket[k].land;
			let f = 0;
			for (; k < bucket.length && bucket[k].land === l; k++) {
				const [lx, lz, lr] = bucket[k].disc;
				const dx = cx - lx;
				const dz = cz - lz;
				const q = (dx * dx + dz * dz) / (lr * lr);
				if (q < 9) f += Math.exp(-q);
			}
			if (f > best) {
				second = best;
				best = f;
				land = index.lands[l];
			} else if (f > second) second = f;
		}
	}
	if (best < COAST) return '';
	// Two landmasses never meet: where they would, a strait runs between them.
	if (second > COAST * 0.55) return '';
	for (const [lx, lz, lr] of map.waters) if (Math.hypot(cx - lx, cz - lz) < lr) return '';
	return land;
}

/**
 * The land discs sorted into squares of the map, each square holding every disc that reaches into
 * it (a disc counts out to three radii), in the map's order.
 */
interface DiscIndex {
	lands: string[];
	size: number;
	key(x: number, z: number): number;
	buckets: Map<number, { land: number; disc: [number, number, number] }[]>;
}

const discIndexes = new WeakMap<RealmMap, DiscIndex>();

function discIndex(map: RealmMap): DiscIndex {
	let index = discIndexes.get(map);
	if (index) return index;
	const lands = Object.keys(map.lands);
	let reach = 1;
	for (const id of lands) for (const [, , r] of map.lands[id]) reach = Math.max(reach, r * 3);
	const size = reach;
	const key = (x: number, z: number) => (Math.floor(z / size) + 4096) * 8192 + (Math.floor(x / size) + 4096);
	const buckets = new Map<number, { land: number; disc: [number, number, number] }[]>();
	lands.forEach((id, l) => {
		for (const disc of map.lands[id]) {
			const [x, z, r] = disc;
			for (let bz = Math.floor((z - r * 3) / size); bz <= Math.floor((z + r * 3) / size); bz++)
				for (let bx = Math.floor((x - r * 3) / size); bx <= Math.floor((x + r * 3) / size); bx++) {
					const k = (bz + 4096) * 8192 + (bx + 4096);
					let list = buckets.get(k);
					if (!list) buckets.set(k, (list = []));
					list.push({ land: l, disc });
				}
		}
	});
	index = { lands, size, key, buckets };
	discIndexes.set(map, index);
	return index;
}

/**
 * The map drawn out cell by cell (`cell` world units square), as the board shows it: each cell is
 * a territory's index or -1 for water. Crumbs of a territory cut off from the rest of it by the
 * coast or a lake go to the neighbour they lie in, or to the sea, so every territory is one piece.
 */
export interface RealmRaster {
	nx: number;
	nz: number;
	cell: number;
	/** World x and z of the corner of cell (0, 0). */
	x0: number;
	z0: number;
	ids: Int16Array;
}

const rasters = new Map<string, RealmRaster>();

export function realmRaster(map: RealmMap, cell: number): RealmRaster {
	const key = `${map.id}:${cell}`;
	const hit = rasters.get(key);
	if (hit) return hit;
	const nx = Math.ceil(map.width / cell);
	const nz = Math.ceil(map.depth / cell);
	const x0 = -map.width / 2;
	const z0 = -map.depth / 2;
	const ids = new Int16Array(nx * nz);
	for (let iz = 0; iz < nz; iz++)
		for (let ix = 0; ix < nx; ix++) ids[ix + iz * nx] = realmCell(map, x0 + (ix + 0.5) * cell, z0 + (iz + 0.5) * cell).territory;
	// Every piece of every territory; all but each territory's biggest are crumbs.
	const piece = new Int32Array(nx * nz).fill(-1);
	const pieces: { t: number; cells: number[] }[] = [];
	for (let i = 0; i < ids.length; i++) {
		if (ids[i] < 0 || piece[i] >= 0) continue;
		const t = ids[i];
		const cells: number[] = [];
		const stack = [i];
		piece[i] = pieces.length;
		while (stack.length) {
			const j = stack.pop()!;
			cells.push(j);
			const x = j % nx;
			for (const k of [x > 0 ? j - 1 : -1, x < nx - 1 ? j + 1 : -1, j - nx, j + nx]) {
				if (k < 0 || k >= ids.length || piece[k] >= 0 || ids[k] !== t) continue;
				piece[k] = pieces.length;
				stack.push(k);
			}
		}
		pieces.push({ t, cells });
	}
	const biggest = new Map<number, number>();
	for (const p of pieces) biggest.set(p.t, Math.max(biggest.get(p.t) ?? 0, p.cells.length));
	for (const p of pieces) {
		if (p.cells.length === biggest.get(p.t)) continue;
		// The neighbour it shares the most edge with takes it; the sea, if that is all round it.
		const touch = new Map<number, number>();
		for (const j of p.cells) {
			const x = j % nx;
			for (const k of [x > 0 ? j - 1 : -1, x < nx - 1 ? j + 1 : -1, j - nx, j + nx]) {
				if (k < 0 || k >= ids.length || ids[k] === p.t) continue;
				touch.set(ids[k], (touch.get(ids[k]) ?? 0) + 1);
			}
		}
		let to = -1;
		let most = 0;
		for (const [t, n] of touch) if (t >= 0 && n > most) [to, most] = [t, n];
		for (const j of p.cells) ids[j] = to;
	}
	const r = { nx, nz, cell, x0, z0, ids };
	rasters.set(key, r);
	// Random worlds come and go as the host rerolls: keep only the last few.
	if (rasters.size > 8) rasters.delete(rasters.keys().next().value!);
	return r;
}

/** The territory at world (x, z) as the board draws it, or -1 for water. */
export function territoryAt(raster: RealmRaster, x: number, z: number): number {
	const ix = Math.floor((x - raster.x0) / raster.cell);
	const iz = Math.floor((z - raster.z0) / raster.cell);
	if (ix < 0 || iz < 0 || ix >= raster.nx || iz >= raster.nz) return -1;
	return raster.ids[ix + iz * raster.nx];
}

/** Every territory's neighbours, by land and by sea, as indexes. */
export function realmNeighbors(map: RealmMap): number[][] {
	const index = new Map(map.territories.map((t, i) => [t.id, i]));
	const out: number[][] = map.territories.map(() => []);
	for (const [a, b] of [...map.borders, ...map.lanes]) {
		const i = index.get(a)!;
		const j = index.get(b)!;
		out[i].push(j);
		out[j].push(i);
	}
	return out.map((n) => [...new Set(n)].sort((a, b) => a - b));
}
