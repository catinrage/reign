import * as THREE from 'three';
import { neighbors } from '../../../shared/conquest/queries';
import { type RealmMap, realmRaster } from '../../../shared/conquest/realm';
import { shipModel } from '../board/models';
import type { Particles } from '../effects';
import { SEA_Y, VOXEL } from '../layout';
import type { RealmBuild } from './realmTerrain';
import { TROOP_VOXEL, type TroopPart, rockModel, troopParts } from './troopModels';
import { type Point, UNIT_WORTH, type UnitKind, unitsFor, walkPath } from './troopPlan';

/**
 * The armies on the Realm as miniatures, the way the classic war game is played: footmen,
 * knights and catapults for ones, fives and tens, drawn up on each territory facing its nearest
 * enemy. They are pieces at rest until something happens: armies placed drop onto the board,
 * attackers lunge and catapults throw stones, the fallen topple and sink away, and armies on the
 * move march over their own land (and sail the sea lanes) to where they are going, then fall in
 * there. The medallions keep the exact counts; the pieces show the army's size and its moves.
 *
 * Every piece of one kind and color is drawn in one go (an instanced mesh per part), so a crowded
 * board costs a handful of draw calls.
 */

/** How a piece comes onto the board: dropped from above (placed), formed up (a regroup), or just there. */
type Arrive = 'drop' | 'pop' | 'quiet';
/** How it leaves: falling (in battle), into a puff of dust (a regroup), or just gone. */
type Leave = 'fall' | 'poof' | 'quiet';

/** Why a territory's count changed, which says how its pieces come and go. */
export type TroopCause = 'placed' | 'battle' | 'regroup' | 'quiet';

const CAUSES: Record<TroopCause, [Arrive, Leave]> = {
	placed: ['drop', 'poof'],
	battle: ['pop', 'fall'],
	regroup: ['pop', 'poof'],
	quiet: ['quiet', 'quiet']
};

/** Room each kind of piece takes on the ground (world units). */
const ROOM: Record<UnitKind, number> = { footman: 1.25, knight: 2.2, catapult: 2.5 };
/** How fast each kind goes at the least (world units a second). */
const PACE: Record<UnitKind, number> = { footman: 11, knight: 15, catapult: 9 };
/** The order a column marches in: horse ahead, foot behind, the engines last. */
const COLUMN: Record<UnitKind, number> = { knight: 0, footman: 1, catapult: 2 };
/** A march's leader arrives within this many seconds, however far it goes. */
const MARCH_TIME = 2.2;
/** Between pieces in a marching column. */
const SPACING = 2.4;
/** Pieces gather this far in front of the medallion's post (towards the default view). */
const FRONT = 2.5;
/** The way from the medallion to the view, kept clear so its count shows: half its width, its length. */
const SIGHT_HALF = 3;
const SIGHT_DEEP = 7;
/** Pieces never stand closer than this to the post. */
const POST_CLEAR = 2.6;
/** How far from its square a territory's pieces may stand. */
const REACH = 13;
/** Pieces grow from afar (as the medallions do) to about this many pixels tall, to this much at most. */
const SEEN_PX = 28;
const MOST_GROWN = 1.6;
/** A footman's height on screen per pixel a world unit takes: his height, seen from above at an angle. */
const FOOTMAN_TALL = 14 * TROOP_VOXEL * 0.65;
/** Height of the deck above the sea, for pieces aboard. */
const DECK = SEA_Y + 1.3;

/** A point of a way, and whether the stretch leading to it is over water. */
interface WayPoint extends Point {
	sail: boolean;
}

interface Walk {
	pts: WayPoint[];
	/** Distance along the way at each point. */
	len: number[];
	d: number;
	speed: number;
	/** Seconds before it sets off (its place in the column). */
	wait: number;
	/** The segment it is on. */
	seg: number;
	group: March | null;
}

type AnimKind = 'drop' | 'pop' | 'fall' | 'poof' | 'lunge' | 'recoil' | 'cheer';

interface Anim {
	kind: AnimKind;
	t: number;
	dur: number;
	/** Seconds before it starts. */
	wait: number;
	/** Facing for a lunge or a fall (radians). */
	dir: number;
	/** Dust raised yet (a drop's landing). */
	dusted?: boolean;
}

interface Figure {
	kind: UnitKind;
	color: number;
	/** The territory it stands in, or marches to. */
	home: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	goalYaw: number;
	spot: Point | null;
	walk: Walk | null;
	anim: Anim | null;
	/** On its way off the board: removed once its animation is over. */
	gone: boolean;
	/** Just made, not yet anywhere: it appears in its place rather than walking there. */
	born: boolean;
	/** The gait's phase. */
	phase: number;
	/** Its own small differences (a turn of the head, the gait's start). */
	seed: number;
}

/** Armies on the march: the pieces carrying them, and the ship that takes them over water. */
interface March {
	to: number;
	armies: number;
	figures: Figure[];
	left: number;
	ship: THREE.Group | null;
}

interface Stone {
	mesh: THREE.Group;
	from: THREE.Vector3;
	to: THREE.Vector3;
	t: number;
	dur: number;
	apex: number;
}

/** All the meshes for one kind of piece in one color. */
interface Batch {
	parts: TroopPart[];
	meshes: THREE.InstancedMesh[];
	cap: number;
	count: number;
}

export class Troops {
	readonly group = new THREE.Group();
	private figures: Figure[] = [];
	private marches: March[] = [];
	private stones: Stone[] = [];
	private batches = new Map<string, Batch>();
	/** Armies each territory shows, those still marching to it counted in. */
	private count: number[];
	/** Of those, the ones still on their way. */
	private inbound: number[];
	private owner: number[];
	/** Each player's color, by seat. */
	private colors: number[] = [];
	/** Each territory's facing (radians; 0 is +z, towards the default view). */
	private facing: number[];
	/** Places a piece may stand in each territory, worked out when first needed. */
	private grounds: (Point[] | null)[];
	private readonly raster;
	/** How hard going each of the map's cells is (woods and rocks slow a march). */
	private readonly going: Float32Array;
	private readonly lanes = new Map<string, { k: number; reversed: boolean }>();
	private readonly borders = new Set<string>();
	private dirty = true;
	private seeds = 1;
	/** How much bigger than life the pieces are drawn now (see SEEN_PX). */
	private grown = 1;

	constructor(
		readonly map: RealmMap,
		public realm: RealmBuild,
		/** The sea lanes' courses, in the map's order, each from its first territory to its second. */
		readonly laneCourses: THREE.Curve<THREE.Vector3>[],
		readonly particles: Particles | null
	) {
		const n = map.territories.length;
		this.count = new Array(n).fill(0);
		this.inbound = new Array(n).fill(0);
		this.owner = new Array(n).fill(-1);
		this.facing = new Array(n).fill(0);
		this.grounds = new Array(n).fill(null);
		this.raster = realmRaster(map, VOXEL);
		this.going = new Float32Array(this.raster.nx * this.raster.nz);
		this.measureGoing();
		const index = new Map(map.territories.map((t, i) => [t.id, i]));
		map.lanes.forEach(([a, b], k) => {
			const i = index.get(a)!;
			const j = index.get(b)!;
			this.lanes.set(`${i}-${j}`, { k, reversed: false });
			this.lanes.set(`${j}-${i}`, { k, reversed: true });
		});
		for (const [a, b] of map.borders) {
			const i = index.get(a)!;
			const j = index.get(b)!;
			this.borders.add(`${i}-${j}`).add(`${j}-${i}`);
		}
		this.group.name = 'troops';
	}

	/** The land rebuilt at another detail: the squares are the same, the ground a little different. */
	setRealm(realm: RealmBuild) {
		this.realm = realm;
		this.measureGoing();
	}

	/** How hard each map column is to walk: slow under trees and on anything standing on the ground. */
	private measureGoing() {
		const { nx, x0, z0, cell, ids } = this.raster;
		this.going.fill(1);
		for (let i = 0; i < ids.length; i++) {
			if (ids[i] < 0) continue;
			const x = x0 + ((i % nx) + 0.5) * cell;
			const z = z0 + (Math.floor(i / nx) + 0.5) * cell;
			if (this.realm.surfaceY(x, z) - this.realm.groundY(x, z) > 0.25) this.going[i] = 5;
		}
	}

	// ------------------------------------------------------------ what the game says

	/** Each player's color, by seat. */
	setColors(colors: number[]) {
		this.colors = colors.slice();
	}

	/** The board as it stands, every piece in its place at once (a new game, a jump in a replay). */
	reset(owner: number[], armies: number[]) {
		for (const f of this.figures) f.gone = true;
		this.figures = [];
		for (const m of this.marches) this.dropShip(m);
		this.marches = [];
		for (const s of this.stones) this.group.remove(s.mesh);
		this.stones = [];
		this.owner = owner.slice();
		this.count = armies.map((a, t) => (owner[t] >= 0 ? a : 0));
		this.inbound.fill(0);
		this.owner.forEach((_, t) => (this.facing[t] = this.faceOf(t)));
		this.owner.forEach((_, t) => this.reconcile(t, 'quiet', 'quiet'));
		this.dirty = true;
	}

	/**
	 * Catch up with the board as it stands after its events played out: whoever holds what now,
	 * armies marching into a territory just taken (the occupy step: `moveIn` of them), and any
	 * count that differs set straight.
	 */
	settle(owner: number[], armies: number[], moveIn: { from: number; to: number } | null) {
		owner.forEach((p, t) => {
			if (p !== this.owner[t]) this.own(t, p);
		});
		if (moveIn && owner[moveIn.from] === owner[moveIn.to]) this.flowTo([moveIn.from, moveIn.to], armies[moveIn.to]);
		armies.forEach((a, t) => {
			if (owner[t] >= 0 && a !== this.count[t]) this.set(t, a, 'quiet');
		});
	}

	/** Territory `t` shows `armies` now; `from` is where an attack that cost them came from. */
	set(t: number, armies: number, cause: TroopCause, from?: number) {
		if (armies === this.count[t]) return;
		const lost = cause === 'battle' ? Math.max(0, this.count[t] - armies) : 0;
		this.count[t] = Math.max(0, armies);
		const [arrive, leave] = CAUSES[cause];
		this.reconcile(t, arrive, leave, from, lost);
	}

	/** Territory `t` changed hands (taken in battle): what is left of its old army falls. */
	own(t: number, player: number) {
		if (this.owner[t] === player) return;
		this.owner[t] = player;
		if (player < 0) this.count[t] = 0;
		this.facing[t] = this.faceOf(t);
		for (const n of neighbors(t, this.map)) this.refaceTerritory(n);
		this.reconcile(t, 'pop', 'fall');
	}

	/**
	 * Armies march along `route` (territories, first to last, each next to the one before) until
	 * the last shows `armies`: as many as that takes leave the first. If the last already shows more,
	 * the difference marches back.
	 */
	flowTo(route: number[], armies: number) {
		const to = route[route.length - 1];
		const d = armies - this.count[to];
		if (d > 0) this.march(route, d);
		else if (d < 0) this.march([...route].reverse(), -d);
	}

	/** An attack from `from` on `to`, `dice` thrown: the front ranks lunge, catapults loose a stone. */
	attack(from: number, to: number, dice: number, fast: boolean) {
		const at = this.realm.anchors[to];
		const ready = this.standing(from).filter((f) => !f.walk);
		const dir = (f: Figure) => Math.atan2(at.x - f.x, at.z - f.z);
		const front = ready
			.filter((f) => f.kind !== 'catapult')
			.sort((a, b) => Math.hypot(at.x - a.x, at.z - a.z) - Math.hypot(at.x - b.x, at.z - b.z))
			.slice(0, dice);
		for (const f of front) {
			f.goalYaw = dir(f);
			f.anim = { kind: 'lunge', t: 0, dur: fast ? 0.32 : 0.55, wait: Math.random() * 0.06, dir: dir(f) };
		}
		// The defenders turn to meet it.
		const fa = this.realm.anchors[from];
		const targets = this.standing(to);
		for (const f of targets) if (!f.walk) f.goalYaw = Math.atan2(fa.x - f.x, fa.z - f.z);
		for (const f of ready.filter((g) => g.kind === 'catapult').slice(0, 2)) {
			f.goalYaw = dir(f);
			f.anim = { kind: 'recoil', t: 0, dur: 0.45, wait: 0, dir: dir(f) };
			const aim = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
			const end = aim ? new THREE.Vector3(aim.x, aim.y + 0.4, aim.z) : at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.3, FRONT + (Math.random() - 0.5) * 2));
			const start = new THREE.Vector3(f.x - Math.sin(f.goalYaw) * 1.4, f.y + 3.4, f.z - Math.cos(f.goalYaw) * 1.4);
			this.throwStone(start, end, fast ? 0.26 : 0.5);
		}
		this.dirty = true;
	}

	/** The war is won: the winner's pieces throw their arms up, all over the Realm. */
	cheer(player: number) {
		for (const f of this.figures) {
			if (f.gone || f.walk || this.owner[f.home] !== player) continue;
			f.anim = { kind: 'cheer', t: 0, dur: 1.1, wait: Math.random() * 0.5, dir: 0 };
		}
		this.dirty = true;
	}

	/** The pieces standing in `t` now (not marching there, not leaving), biggest first. */
	piecesAt(t: number): UnitKind[] {
		return this.standing(t)
			.map((f) => f.kind)
			.sort((x, y) => UNIT_WORTH[y] - UNIT_WORTH[x]);
	}

	/** In `t`'s player's color, every piece standing there. */
	colorsAt(t: number): number[] {
		return this.standing(t).map((f) => f.color);
	}

	/** Something is still going on: a march, a piece stepping into place or falling, a stone in the air. */
	get busy(): boolean {
		return this.marches.length > 0 || this.stones.length > 0 || this.figures.some((f) => f.walk || f.anim);
	}

	/** Ships at sea right now. */
	get sailing(): number {
		return this.marches.filter((m) => m.ship?.visible).length;
	}

	// ------------------------------------------------------------ pieces in and out

	/** The pieces standing in `t` (not marching there, not on their way off the board). */
	private standing(t: number) {
		return this.figures.filter((f) => f.home === t && !f.gone && !f.walk?.group);
	}

	/**
	 * Put the right pieces in `t` for its armies (those still marching there left out), the ones
	 * not wanted leaving and the missing ones arriving as said, then draw them up. Armies `lost` in
	 * battle fall as footmen of the front rank; pieces only changed for others (a knight for five
	 * footmen) go and come in puffs of dust.
	 */
	private reconcile(t: number, arrive: Arrive, leave: Leave, from?: number, lost = 0) {
		const p = this.owner[t];
		const color = p >= 0 ? this.colors[p] : undefined;
		const here = this.standing(t);
		const wanted = p >= 0 && color !== undefined ? unitsFor(Math.max(0, this.count[t] - this.inbound[t])) : [];
		const away = from !== undefined ? this.realm.anchors[from] : null;
		// Nearest the attack first: the front rank falls first.
		const order = (fs: Figure[]) => (away ? fs.sort((a, b) => Math.hypot(a.x - away.x, a.z - away.z) - Math.hypot(b.x - away.x, b.z - away.z)) : fs.reverse());
		for (const f of here) if (f.color !== color) this.remove(f, leave, away);
		const mine = here.filter((f) => f.color === color);
		const born: Figure[] = [];
		let falling = lost;
		for (const kind of ['catapult', 'knight', 'footman'] as UnitKind[]) {
			const have = order(mine.filter((f) => f.kind === kind));
			const want = wanted.filter((u) => u === kind).length;
			for (let i = 0; i < have.length - want; i++) {
				if (!lost) this.remove(have[i], leave, away);
				else if (kind === 'footman' && falling > 0) {
					this.remove(have[i], 'fall', away);
					falling--;
				} else this.remove(have[i], 'poof', away);
			}
			for (let i = have.length; i < want; i++) born.push(this.add(kind, color!, t));
		}
		// Losses no footman of theirs fell for (a knight broken up into the rest): fallen in front.
		if (color !== undefined) for (let i = 0; i < Math.min(3, falling); i++) this.casualty(t, color, away, i);
		this.layout(t);
		born.forEach((f, i) => {
			if (arrive === 'quiet') return;
			f.anim = { kind: arrive, t: 0, dur: arrive === 'drop' ? 0.42 : 0.34, wait: i * 0.07, dir: 0 };
		});
		this.dirty = true;
	}

	private add(kind: UnitKind, color: number, t: number): Figure {
		const a = this.realm.anchors[t];
		const f: Figure = { kind, color, home: t, x: a.x, y: a.y, z: a.z + FRONT, yaw: this.facing[t], goalYaw: this.facing[t], spot: null, walk: null, anim: null, gone: false, born: true, phase: 0, seed: this.seeds++ };
		this.figures.push(f);
		return f;
	}

	/** A footman of `t`'s front rank, facing `away`, falls (the `i`-th of a battle's losses). */
	private casualty(t: number, color: number, away: THREE.Vector3 | null, i: number) {
		const a = this.realm.anchors[t];
		const near = this.standing(t).reduce<Figure | null>((best, f) => (!away ? best ?? f : !best || Math.hypot(f.x - away.x, f.z - away.z) < Math.hypot(best.x - away.x, best.z - away.z) ? f : best), null);
		const x0 = near?.x ?? a.x;
		const z0 = near?.z ?? a.z + FRONT;
		const d = away ? Math.atan2(away.x - x0, away.z - z0) : 0;
		const side = (i - 1) * 1.6;
		const f = this.add('footman', color, t);
		f.born = false;
		f.x = x0 + Math.sin(d) * 1.8 + Math.cos(d) * side;
		f.z = z0 + Math.cos(d) * 1.8 - Math.sin(d) * side;
		f.y = this.realm.groundY(f.x, f.z);
		this.remove(f, 'fall', away);
	}

	private remove(f: Figure, how: Leave, away: THREE.Vector3 | null) {
		if (how === 'quiet') {
			f.gone = true;
			this.figures.splice(this.figures.indexOf(f), 1);
			return;
		}
		f.gone = true;
		f.walk = null;
		if (how === 'poof') {
			f.anim = { kind: 'poof', t: 0, dur: 0.32, wait: 0, dir: 0 };
			this.particles?.dust(new THREE.Vector3(f.x, f.y + 0.6, f.z), 8);
			return;
		}
		// Facing the blow, falling back from it.
		const dir = away ? Math.atan2(away.x - f.x, away.z - f.z) : f.yaw;
		f.yaw = f.goalYaw = dir;
		f.anim = { kind: 'fall', t: 0, dur: 1.6, wait: Math.random() * 0.12, dir };
	}

	// ------------------------------------------------------------ drawn up

	/**
	 * Draw `t`'s pieces up round its square: engines at the back, horse in the middle, foot in front,
	 * the whole facing the territory's enemies. Pieces already there step over to their new places.
	 */
	private layout(t: number) {
		const figs = this.standing(t).sort((a, b) => COLUMN[b.kind] - COLUMN[a.kind] || a.seed - b.seed);
		if (!figs.length) return;
		const ground = this.groundOf(t);
		const a = this.realm.anchors[t];
		const centre = { x: a.x, z: a.z + FRONT };
		const yaw = this.facing[t];
		const fx = Math.sin(yaw);
		const fz = Math.cos(yaw);
		// Each kind wants the front (foot) or the back (engines) of the formation.
		const lean: Record<UnitKind, number> = { footman: 0.9, knight: 0.2, catapult: -0.9 };
		const taken: { p: Point; r: number }[] = [];
		const spots = new Map<Figure, Point>();
		for (const kind of ['catapult', 'knight', 'footman'] as UnitKind[]) {
			const ofKind = figs.filter((f) => f.kind === kind);
			const chosen: Point[] = [];
			for (let i = 0; i < ofKind.length; i++) {
				const r = ROOM[kind];
				let best: Point | null = null;
				let bestCost = Infinity;
				for (let pass = 0; pass < 2 && !best; pass++) {
					for (const c of ground) {
						// The second pass lets pieces stand closer, rather than nowhere.
						if (taken.some((q) => Math.hypot(q.p.x - c.x, q.p.z - c.z) < (q.r + r) * (pass ? 0.7 : 1) + 0.12)) continue;
						const dx = c.x - centre.x;
						const dz = c.z - centre.z;
						// Behind the medallion is hidden from view, and right in front of it hides its count:
						// stand either side of it, towards the view, if there's room.
						const behind = Math.max(0, a.z - c.z);
						const sightline = Math.abs(c.x - a.x) < SIGHT_HALF && c.z > a.z && c.z - a.z < SIGHT_DEEP ? 6 : 0;
						const cost = Math.hypot(dx, dz) - lean[kind] * (dx * fx + dz * fz) * 0.6 + behind * 0.8 + sightline;
						if (cost < bestCost) {
							bestCost = cost;
							best = c;
						}
					}
				}
				best ??= { x: centre.x + (Math.random() - 0.5) * 2, z: centre.z + (Math.random() - 0.5) * 2 };
				taken.push({ p: best, r });
				chosen.push(best);
			}
			// The pieces already there take the nearest places, so they move as little as they can.
			const left = [...chosen];
			for (const f of ofKind.sort((p, q) => (p.spot ? 0 : 1) - (q.spot ? 0 : 1))) {
				let k = 0;
				for (let j = 1; j < left.length; j++) if (Math.hypot(left[j].x - f.x, left[j].z - f.z) < Math.hypot(left[k].x - f.x, left[k].z - f.z)) k = j;
				spots.set(f, left.splice(k, 1)[0]);
			}
		}
		for (const f of figs) {
			const s = spots.get(f)!;
			f.spot = s;
			f.goalYaw = yaw + (((f.seed * 7919) % 100) / 100 - 0.5) * 0.35;
			if (f.born) {
				f.born = false;
				f.x = s.x;
				f.z = s.z;
				f.y = this.realm.groundY(s.x, s.z);
				f.yaw = f.goalYaw;
			} else if (Math.hypot(s.x - f.x, s.z - f.z) > 0.15) this.walkTo(f, [{ x: s.x, z: s.z, sail: false }], 5, 0, null);
		}
	}

	/** Places in `t` a piece can stand: its own ground, clear of trees, rocks, edges and the post. */
	private groundOf(t: number): Point[] {
		const hit = this.grounds[t];
		if (hit) return hit;
		const a = this.realm.anchors[t];
		const r = this.realm;
		const out: Point[] = [];
		const step = 0.7;
		for (let dz = -REACH; dz <= REACH; dz += step)
			for (let dx = -REACH; dx <= REACH; dx += step) {
				if (dx * dx + dz * dz > REACH * REACH) continue;
				const x = a.x + dx;
				const z = a.z + dz;
				if (Math.hypot(dx, dz) < POST_CLEAR) continue;
				if (r.territoryAt(x, z) !== t) continue;
				const ring = [
					[1.1, 0],
					[-1.1, 0],
					[0, 1.1],
					[0, -1.1]
				];
				if (ring.some(([ox, oz]) => r.territoryAt(x + ox, z + oz) !== t)) continue;
				if (r.surfaceY(x, z) - r.groundY(x, z) > 0.25) continue;
				const ys = ring.map(([ox, oz]) => r.groundY(x + ox, z + oz));
				if (Math.max(...ys) - Math.min(...ys) > 1.25) continue;
				out.push({ x, z });
			}
		// A crumb of an island with nowhere clear: round its square, whatever stands there.
		if (out.length < 12) for (let k = 0; k < 16; k++) out.push({ x: a.x + Math.sin(k * 0.79) * (2 + (k % 3)), z: a.z + Math.cos(k * 0.79) * (2 + (k % 3)) });
		this.grounds[t] = out;
		return out;
	}

	/** Which way `t`'s pieces face: towards the enemies next door (the strongest most), or the view. */
	private faceOf(t: number): number {
		const p = this.owner[t];
		const a = this.realm.anchors[t];
		let vx = 0;
		let vz = 0;
		for (const n of neighbors(t, this.map)) {
			const o = this.owner[n];
			if (o < 0 || o === p) continue;
			const b = this.realm.anchors[n];
			const d = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
			const w = (this.count[n] + 1) / d;
			vx += ((b.x - a.x) / d) * w;
			vz += ((b.z - a.z) / d) * w;
		}
		return vx || vz ? Math.atan2(vx, vz) : 0;
	}

	/** Turn `t`'s pieces to face the way its enemies now lie. */
	private refaceTerritory(t: number) {
		const yaw = this.faceOf(t);
		if (Math.abs(angleTo(this.facing[t], yaw)) < 0.05) return;
		this.facing[t] = yaw;
		for (const f of this.standing(t)) if (!f.walk) f.goalYaw = yaw + (((f.seed * 7919) % 100) / 100 - 0.5) * 0.35;
		this.dirty = true;
	}

	// ------------------------------------------------------------ marching

	private march(route: number[], armies: number) {
		const from = route[0];
		const to = route[route.length - 1];
		const p = this.owner[from];
		const color = this.colors[p];
		if (p < 0 || color === undefined || armies <= 0) return;
		this.count[from] = Math.max(0, this.count[from] - armies);
		this.count[to] += armies;
		this.inbound[to] += armies;
		const units = unitsFor(armies).sort((a, b) => COLUMN[a] - COLUMN[b]);
		const way = this.wayAlong(route);
		const exit = way[Math.min(1, way.length - 1)];
		// The pieces that go are the ones of their kind nearest the way out; any missing form up.
		const pool = this.standing(from).filter((f) => f.color === color);
		const goers = units.map((kind) => {
			const ofKind = pool.filter((f) => f.kind === kind);
			if (!ofKind.length) {
				const f = this.add(kind, color, from);
				f.anim = { kind: 'pop', t: 0, dur: 0.3, wait: 0, dir: 0 };
				return f;
			}
			const f = ofKind.reduce((best, g) => (Math.hypot(g.x - exit.x, g.z - exit.z) < Math.hypot(best.x - exit.x, best.z - exit.z) ? g : best));
			pool.splice(pool.indexOf(f), 1);
			return f;
		});
		const length = pathLength(way);
		const slowest = Math.min(...units.map((u) => PACE[u]));
		const speed = Math.min(70, Math.max(slowest, (length + goers.length * SPACING) / MARCH_TIME));
		const m: March = { to, armies, figures: goers, left: goers.length, ship: null };
		if (way.some((w) => w.sail)) {
			m.ship = shipModel(color).clone(true);
			m.ship.scale.setScalar(0.7);
			m.ship.visible = false;
			this.group.add(m.ship);
		}
		this.marches.push(m);
		goers.forEach((f, i) => {
			f.home = to;
			f.spot = null;
			// Where the column ends up: gathered in front of the square, then drawn up from there.
			const a = this.realm.anchors[to];
			const end = { x: a.x + ((i % 3) - 1) * 1.7, z: a.z + FRONT + Math.floor(i / 3) * 1.7, sail: false };
			this.walkTo(f, [...way, end], speed, (i * SPACING) / speed, m);
		});
		this.reconcile(from, 'pop', 'poof');
	}

	/**
	 * The way along `route` from the first territory's square to the last's: overland between
	 * neighbours, over their own ground, and down to the shore, across and up the beach for a sea lane.
	 */
	private wayAlong(route: number[]): WayPoint[] {
		const a0 = this.realm.anchors[route[0]];
		const out: WayPoint[] = [{ x: a0.x, z: a0.z + FRONT, sail: false }];
		const walk = (to: Point, within: number[]) => {
			const last = out[out.length - 1];
			const path = walkPath(this.raster, last, to, new Set(within), (c) => this.going[c]) ?? [last, to];
			for (const p of path.slice(1)) out.push({ x: p.x, z: p.z, sail: false });
		};
		for (let i = 0; i < route.length - 1; i++) {
			const a = route[i];
			const b = route[i + 1];
			const ab = this.realm.anchors[b];
			const centre = { x: ab.x, z: ab.z + (i === route.length - 2 ? FRONT : 0) };
			const lane = this.lanes.get(`${a}-${b}`);
			if (!lane || this.borders.has(`${a}-${b}`)) {
				walk(centre, [a, b]);
				continue;
			}
			const curve = this.laneCourses[lane.k];
			const steps = 24;
			const at = (s: number) => curve.getPointAt(lane.reversed ? 1 - s / steps : s / steps);
			const shore = at(0);
			walk({ x: shore.x, z: shore.z }, [a]);
			for (let s = 1; s <= steps; s++) {
				const p = at(s);
				out.push({ x: p.x, z: p.z, sail: true });
			}
			walk(centre, [b]);
		}
		return out;
	}

	/** Send `f` along `pts` from where it stands (setting off after `wait` seconds). */
	private walkTo(f: Figure, pts: WayPoint[], speed: number, wait: number, group: March | null) {
		const all = [{ x: f.x, z: f.z, sail: false }, ...pts];
		const len = [0];
		for (let i = 1; i < all.length; i++) len.push(len[i - 1] + Math.hypot(all[i].x - all[i - 1].x, all[i].z - all[i - 1].z));
		f.walk = { pts: all, len, d: 0, speed, wait, seg: 0, group };
		f.born = false;
		this.dirty = true;
	}

	/** A march's last piece is in: they join whatever stands there. */
	private arrived(m: March) {
		this.marches.splice(this.marches.indexOf(m), 1);
		this.dropShip(m);
		this.inbound[m.to] = Math.max(0, this.inbound[m.to] - m.armies);
		this.reconcile(m.to, 'pop', 'poof');
	}

	private dropShip(m: March) {
		if (m.ship) this.group.remove(m.ship);
		m.ship = null;
	}

	// ------------------------------------------------------------ stones

	private throwStone(from: THREE.Vector3, to: THREE.Vector3, dur: number) {
		const mesh = rockModel().clone(true);
		mesh.position.copy(from);
		this.group.add(mesh);
		this.stones.push({ mesh, from, to, t: 0, dur, apex: 3 + from.distanceTo(to) * 0.18 });
	}

	// ------------------------------------------------------------ every frame

	/** `ppu`: pixels per world unit on the board where the camera looks. */
	update(dt: number, ppu = Infinity) {
		// A slow frame moves things on as far as it took; a long gap (a hidden tab) no further than this.
		dt = Math.min(dt, 0.25);
		let moving = false;
		const grown = troopGrowth(ppu);
		if (Math.abs(grown - this.grown) > 0.01) {
			this.grown = grown;
			this.dirty = true;
		}
		for (const f of [...this.figures]) if (this.step(f, dt)) moving = true;
		for (const m of this.marches) this.sail(m);
		for (const s of [...this.stones]) {
			s.t += dt;
			const u = Math.min(1, s.t / s.dur);
			s.mesh.position.lerpVectors(s.from, s.to, u);
			s.mesh.position.y += Math.sin(Math.PI * u) * s.apex;
			s.mesh.rotation.set(u * 9, u * 5, 0);
			if (u >= 1) {
				this.group.remove(s.mesh);
				this.stones.splice(this.stones.indexOf(s), 1);
				this.particles?.dust(s.to.clone(), 16);
				this.particles?.emit({ at: s.to.clone(), count: 8, colors: ['#8e8a84', '#a29d96', '#5f5a55'], speed: 8, up: 9, spread: 0.6, life: 0.6, size: 0.4, gravity: 30, drag: 1 });
			}
		}
		if (moving || this.dirty) this.draw();
		this.dirty = moving;
	}

	/** Move one piece on by `dt`. True while it is still moving (it needs drawing again). */
	private step(f: Figure, dt: number): boolean {
		let moving = false;
		const w = f.walk;
		if (w) {
			moving = true;
			if (w.wait > 0) w.wait -= dt;
			else {
				w.d += w.speed * dt;
				const total = w.len[w.len.length - 1];
				if (w.d >= total) {
					const end = w.pts[w.pts.length - 1];
					f.x = end.x;
					f.z = end.z;
					f.walk = null;
					if (w.group && --w.group.left === 0) this.arrived(w.group);
				} else {
					while (w.seg < w.len.length - 2 && w.len[w.seg + 1] < w.d) w.seg++;
					const a = w.pts[w.seg];
					const b = w.pts[w.seg + 1];
					const u = (w.d - w.len[w.seg]) / Math.max(1e-6, w.len[w.seg + 1] - w.len[w.seg]);
					f.x = a.x + (b.x - a.x) * u;
					f.z = a.z + (b.z - a.z) * u;
					if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-3) f.goalYaw = Math.atan2(b.x - a.x, b.z - a.z);
					f.phase += dt * w.speed * (f.kind === 'knight' ? 1.1 : f.kind === 'catapult' ? 2.4 : 1.7);
				}
			}
		}
		const aboard = !!w && w.wait <= 0 && w.seg < w.pts.length - 1 && w.pts[w.seg + 1].sail;
		const goalY = aboard ? DECK : this.realm.groundY(f.x, f.z);
		if (Math.abs(goalY - f.y) > 1e-3) {
			f.y += (goalY - f.y) * (1 - Math.exp(-dt * 16));
			moving = true;
		}
		const turn = angleTo(f.yaw, f.goalYaw);
		if (Math.abs(turn) > 1e-3) {
			f.yaw += turn * (1 - Math.exp(-dt * 9));
			moving = true;
		}
		const an = f.anim;
		if (an) {
			moving = true;
			if (an.wait > 0) an.wait -= dt;
			else {
				an.t += dt;
				if (an.kind === 'drop' && !an.dusted && an.t >= an.dur * 0.62) {
					an.dusted = true;
					this.particles?.dust(new THREE.Vector3(f.x, f.y + 0.2, f.z), 7);
				}
				if (an.t >= an.dur) {
					f.anim = null;
					if (f.gone) {
						const i = this.figures.indexOf(f);
						if (i >= 0) this.figures.splice(i, 1);
					}
				}
			}
		}
		return moving;
	}

	/** A march over water: its ship under the pieces aboard. */
	private sail(m: March) {
		const s = m.ship;
		if (!s) return;
		const aboard = m.figures.filter((f) => {
			const w = f.walk;
			return w && w.wait <= 0 && w.seg < w.pts.length - 1 && w.pts[w.seg + 1].sail;
		});
		s.visible = aboard.length > 0;
		if (!s.visible) return;
		let x = 0;
		let z = 0;
		for (const f of aboard) {
			x += f.x;
			z += f.z;
		}
		const lead = aboard[0].walk!;
		const a = lead.pts[lead.seg];
		const b = lead.pts[lead.seg + 1];
		s.position.set(x / aboard.length, SEA_Y - 0.1, z / aboard.length);
		s.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
	}

	// ------------------------------------------------------------ drawing

	private draw() {
		for (const b of this.batches.values()) b.count = 0;
		const m = new THREE.Matrix4();
		const out = new THREE.Matrix4();
		for (const f of this.figures) {
			const batch = this.batch(f.kind, f.color);
			this.pose(f, m);
			const i = batch.count++;
			batch.parts.forEach((part, k) => {
				out.multiplyMatrices(m, part.local);
				batch.meshes[k].setMatrixAt(i, out);
			});
		}
		for (const b of this.batches.values())
			for (const mesh of b.meshes) {
				mesh.count = b.count;
				mesh.instanceMatrix.needsUpdate = true;
			}
	}

	/** Where `f` is and how it stands this frame, gait and animation included. */
	private pose(f: Figure, m: THREE.Matrix4) {
		let x = f.x;
		let y = f.y;
		let z = f.z;
		let pitch = 0;
		let roll = 0;
		let s = 1;
		let sy = 1;
		if (f.walk && f.walk.wait <= 0) {
			const ph = f.phase + f.seed;
			if (f.kind === 'footman') {
				y += Math.abs(Math.sin(ph)) * 0.22;
				roll = Math.sin(ph) * 0.07;
			} else if (f.kind === 'knight') {
				y += Math.abs(Math.sin(ph)) * 0.32;
				pitch = Math.sin(ph * 2) * 0.07;
			} else {
				y += Math.abs(Math.sin(ph)) * 0.04;
				roll = Math.sin(ph) * 0.03;
			}
		}
		const an = f.anim;
		if (an) {
			const u = an.wait > 0 ? 0 : Math.min(1, an.t / an.dur);
			switch (an.kind) {
				case 'drop': {
					// Falls from on high, lands with a squash.
					const land = 0.62;
					if (an.wait > 0) s = 0;
					else if (u < land) y += 7 * (1 - u / land) ** 2;
					else {
						const v = (u - land) / (1 - land);
						sy = 1 - 0.22 * Math.sin(Math.PI * v);
						s = 1 + 0.08 * Math.sin(Math.PI * v);
					}
					break;
				}
				case 'pop':
					s = an.wait > 0 ? 0 : backOut(u);
					break;
				case 'poof':
					s = 1 - u * u;
					y += u * 0.4;
					break;
				case 'lunge': {
					const k = Math.sin(Math.PI * u);
					x += Math.sin(an.dir) * k * 1.8;
					z += Math.cos(an.dir) * k * 1.8;
					pitch = k * 0.25;
					break;
				}
				case 'recoil': {
					const k = Math.sin(Math.PI * Math.min(1, u * 2));
					x -= Math.sin(an.dir) * k * 0.35;
					z -= Math.cos(an.dir) * k * 0.35;
					pitch = -k * 0.12;
					break;
				}
				case 'cheer':
					if (an.wait <= 0) y += Math.abs(Math.sin(Math.PI * 2 * u)) * 0.9;
					break;
				case 'fall': {
					// Topples back (an engine sags and splinters), lies a moment, sinks away.
					const t = an.wait > 0 ? 0 : an.t;
					const tip = Math.min(1, t / 0.32);
					const most = f.kind === 'catapult' ? 0.5 : f.kind === 'knight' ? 1.25 : 1.5;
					pitch = -most * tip * tip;
					if (f.kind !== 'footman') roll = tip * 0.35;
					const sink = Math.max(0, (t - 0.9) / 0.7);
					y -= sink * 1.4;
					s = 1 - sink * 0.5;
					break;
				}
			}
		}
		Q.setFromEuler(E.set(pitch, f.yaw, roll, 'YXZ'));
		s *= this.grown;
		m.compose(P.set(x, y, z), Q, S.set(s, s * sy, s));
	}

	/** The meshes that draw every `kind` piece in `color`, with room for one more. */
	private batch(kind: UnitKind, color: number): Batch {
		const key = `${kind}:${color}`;
		let b = this.batches.get(key);
		if (!b) {
			b = { parts: troopParts(kind, color), meshes: [], cap: 0, count: 0 };
			this.batches.set(key, b);
		}
		if (b.count >= b.cap) {
			const cap = Math.max(16, b.cap * 2);
			const old = b.meshes;
			b.meshes = b.parts.map((part, k) => {
				const mesh = new THREE.InstancedMesh(part.geometry, part.material, cap);
				mesh.castShadow = part.castShadow;
				mesh.receiveShadow = true;
				// The pieces go all over the board; their bounds are those of one piece.
				mesh.frustumCulled = false;
				mesh.name = `troops:${key}:${k}`;
				if (old[k]) mesh.instanceMatrix.array.set(old[k].instanceMatrix.array.subarray(0, b!.cap * 16));
				return mesh;
			});
			for (const o of old) {
				this.group.remove(o);
				o.dispose();
			}
			for (const mesh of b.meshes) this.group.add(mesh);
			b.cap = cap;
		}
		return b;
	}

	dispose() {
		for (const b of this.batches.values()) for (const mesh of b.meshes) mesh.dispose();
		this.batches.clear();
	}
}

const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const P = new THREE.Vector3();
const S = new THREE.Vector3();

/** How much bigger than life the pieces are drawn where a world unit takes `ppu` pixels. */
export function troopGrowth(ppu: number) {
	return Math.min(MOST_GROWN, Math.max(1, SEEN_PX / (FOOTMAN_TALL * ppu)));
}

/** The shortest turn from angle a to angle b. */
function angleTo(a: number, b: number) {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}

function pathLength(pts: Point[]) {
	let n = 0;
	for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
	return n;
}

/** Eases out past the end and back (a piece springing up into place). */
function backOut(u: number) {
	const c = 1.9;
	const v = u - 1;
	return 1 + (c + 1) * v * v * v + c * v * v;
}
