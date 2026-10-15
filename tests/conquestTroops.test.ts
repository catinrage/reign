import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REALM, realmRaster, territoryAt } from '../src/shared/conquest/realm';
import { buildRealm } from '../src/client/scene/conquest/realmTerrain';
import { MAX_FIGURES, tally, unitsFor, walkPath } from '../src/client/scene/conquest/troopPlan';
import { Troops } from '../src/client/scene/conquest/troops';

/** The cell size the board is drawn at (see scene/conquest). */
const BOARD_CELL = 0.6;

const T = (id: string) => REALM.territories.findIndex((t) => t.id === id);
const seat = (id: string) => {
	const [x, z] = REALM.territories[T(id)].blobs[0];
	return { x, z };
};

describe('the pieces for an army', () => {
	it('makes the count with the fewest pieces, biggest first', () => {
		expect(unitsFor(0)).toEqual([]);
		expect(unitsFor(3)).toEqual(['footman', 'footman', 'footman']);
		expect(unitsFor(5)).toEqual(['knight']);
		expect(unitsFor(9)).toEqual(['knight', 'footman', 'footman', 'footman', 'footman']);
		expect(unitsFor(10)).toEqual(['catapult']);
		expect(unitsFor(37)).toEqual(['catapult', 'catapult', 'catapult', 'knight', 'footman', 'footman']);
	});

	it('never shows more than a territory holds pieces for, keeping the biggest', () => {
		expect(unitsFor(99)).toHaveLength(MAX_FIGURES);
		expect(tally(unitsFor(99))).toEqual({ catapult: 9, knight: 1, footman: 0 });
		expect(tally(unitsFor(3640))).toEqual({ catapult: MAX_FIGURES, knight: 0, footman: 0 });
	});
});

describe('marching overland', () => {
	const raster = realmRaster(REALM, BOARD_CELL);

	/** Every step of the way, sampled finely, lies in one of `allowed`. */
	function staysIn(path: { x: number; z: number }[], allowed: number[]) {
		for (let i = 1; i < path.length; i++) {
			const a = path[i - 1];
			const b = path[i];
			const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
			for (let s = 0; s <= n; s++) {
				const t = territoryAt(raster, a.x + ((b.x - a.x) * s) / n, a.z + ((b.z - a.z) * s) / n);
				if (!allowed.includes(t)) return false;
			}
		}
		return true;
	}

	it('goes from one territory into its neighbour over their own land', () => {
		const allowed = [T('owlhollow'), T('thornwick')];
		const path = walkPath(raster, seat('owlhollow'), seat('thornwick'), new Set(allowed));
		expect(path).not.toBeNull();
		expect(path![0]).toEqual(seat('owlhollow'));
		expect(path!.at(-1)).toEqual(seat('thornwick'));
		expect(staysIn(path!, allowed)).toBe(true);
	});

	it('crosses several territories on their land alone', () => {
		// Elderheart to Fernmere, free to go by way of Briarmoor: never into the sea or another territory.
		const allowed = [T('elderheart'), T('briarmoor'), T('fernmere')];
		const path = walkPath(raster, seat('elderheart'), seat('fernmere'), new Set(allowed));
		expect(path).not.toBeNull();
		expect(staysIn(path!, allowed)).toBe(true);
	});

	it('finds no way between lands the sea divides', () => {
		expect(walkPath(raster, seat('briarmoor'), seat('redrock'), new Set([T('briarmoor'), T('redrock')]))).toBeNull();
	});

	it('takes the same way when every cell costs alike', () => {
		const allowed = new Set([T('owlhollow'), T('thornwick')]);
		const plain = walkPath(raster, seat('owlhollow'), seat('thornwick'), allowed)!;
		const length = (p: { x: number; z: number }[]) => p.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - p[i].x, q.z - p[i].z), 0);
		expect(length(walkPath(raster, seat('owlhollow'), seat('thornwick'), allowed, () => 3)!)).toBeCloseTo(length(plain), 5);
	});
});

describe('the troops on the board', () => {
	const realm = buildRealm(REALM);
	// The lanes' courses as the board draws them: straight is near enough for these checks.
	const courses = REALM.lanes.map(([a, b]) => {
		const p = realm.anchors[T(a)];
		const q = realm.anchors[T(b)];
		return new THREE.LineCurve3(p.clone(), q.clone());
	});
	const RED = 0xd8352a;
	const BLUE = 0x3a6fd8;
	const ids = { oak: T('oakshire'), harvest: T('harvestdowns'), crown: T('crownhaven'), river: T('riverbend'), pearl: T('pearl') };

	/** A board: Oakshire, Crownhaven and Riverbend red (player 0), everything else blue (player 1). */
	function board(armies: Record<number, number> = {}) {
		const owner = REALM.territories.map((_, t) => ([ids.oak, ids.crown, ids.river].includes(t) ? 0 : 1));
		const counts = REALM.territories.map((_, t) => armies[t] ?? 1);
		const troops = new Troops(REALM, realm, courses, null);
		troops.setColors([RED, BLUE]);
		troops.reset(owner, counts);
		return troops;
	}

	/** Let everything going on play out. */
	function settle(troops: Troops) {
		for (let i = 0; i < 2000 && troops.busy; i++) troops.update(0.05);
		expect(troops.busy).toBe(false);
	}

	it('stands each army up as its pieces', () => {
		const troops = board({ [ids.oak]: 37, [ids.crown]: 9 });
		expect(troops.piecesAt(ids.oak)).toEqual(unitsFor(37));
		expect(troops.piecesAt(ids.crown)).toEqual(unitsFor(9));
		expect(troops.colorsAt(ids.oak).every((c) => c === RED)).toBe(true);
		expect(troops.busy).toBe(false);
	});

	it('changes the pieces as armies are placed and lost', () => {
		const troops = board({ [ids.oak]: 9 });
		troops.set(ids.oak, 12, 'placed');
		settle(troops);
		expect(troops.piecesAt(ids.oak)).toEqual(unitsFor(12));
		troops.set(ids.oak, 10, 'battle', ids.harvest);
		settle(troops);
		expect(troops.piecesAt(ids.oak)).toEqual(['catapult']);
	});

	it('marches armies over a land border, and they join those already there', () => {
		const troops = board({ [ids.oak]: 25, [ids.crown]: 3 });
		troops.flowTo([ids.oak, ids.crown], 10);
		// On the way: they have left, and not yet arrived.
		troops.update(0.05);
		expect(troops.piecesAt(ids.oak)).toEqual(unitsFor(18));
		expect(troops.piecesAt(ids.crown)).toEqual(unitsFor(3));
		settle(troops);
		expect(troops.piecesAt(ids.crown)).toEqual(unitsFor(10));
	});

	it('takes a ship over a sea lane', () => {
		const troops = board({ [ids.river]: 20 });
		troops.own(ids.pearl, 0);
		troops.set(ids.pearl, 1, 'quiet');
		settle(troops);
		troops.flowTo([ids.river, ids.pearl], 8);
		let sailed = false;
		for (let i = 0; i < 2000 && troops.busy; i++) {
			troops.update(0.05);
			if (troops.sailing) sailed = true;
		}
		expect(sailed).toBe(true);
		expect(troops.piecesAt(ids.pearl)).toEqual(unitsFor(8));
		expect(troops.piecesAt(ids.river)).toEqual(unitsFor(13));
	});

	it('marches back when fewer are to move in after all', () => {
		const troops = board({ [ids.oak]: 12 });
		troops.own(ids.harvest, 0);
		troops.set(ids.harvest, 0, 'quiet');
		troops.flowTo([ids.oak, ids.harvest], 6);
		troops.flowTo([ids.oak, ids.harvest], 4);
		settle(troops);
		expect(troops.piecesAt(ids.harvest)).toEqual(unitsFor(4));
		expect(troops.piecesAt(ids.oak)).toEqual(unitsFor(8));
	});

	it("clears a territory taken of its old army, and keeps a march's count when its target is hit", () => {
		const troops = board({ [ids.oak]: 12, [ids.harvest]: 2 });
		troops.set(ids.harvest, 0, 'battle', ids.oak);
		troops.own(ids.harvest, 0);
		troops.flowTo([ids.oak, ids.harvest], 5);
		// Mid-march, the territory is hit and loses two of the five on their way.
		troops.update(0.1);
		troops.set(ids.harvest, 3, 'battle', ids.crown);
		settle(troops);
		expect(troops.piecesAt(ids.harvest)).toEqual(unitsFor(3));
		expect(troops.colorsAt(ids.harvest).every((c) => c === RED)).toBe(true);
	});
});
