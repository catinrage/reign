import { getTopology } from '../board/topology';
import { CASTLE_POINTS, FORTRESS_KNIGHTS, STOREHOUSE_SAFE, WORKSHOP_LIMIT, type CityPath } from './buildings';
import {
	COSTS,
	hasResources,
	DISCARD_THRESHOLD,
	LONGEST_ROAD_MIN,
	RESOURCES,
	TERRAIN_RESOURCE,
	type BuildKind,
	type Resource,
	type ResourceCounts,
	pips
} from './config';
import { STEWARD_EXTRA, type CharacterId } from './characters';
import { eventRatio } from './events';
import type { BuiltKind, GameState, GameView } from './types';

/** Where `GameState.builtTurns` keeps the turn a piece went up on: its kind and its spot. */
export function builtKey(kind: BuiltKind, at: number): string {
	return `${kind}:${at}`;
}

/** Read-only helpers shared by the engine, the bots and the client's highlighting. */
type Shared = Pick<
	GameState | GameView,
	| 'board'
	| 'buildings'
	| 'roads'
	| 'robberHex'
	| 'longestRoadHolder'
	| 'largestArmyHolder'
	| 'handLimit'
	| 'buildingRules'
	| 'workshops'
	| 'stoneRoads'
	| 'storehouses'
	| 'cityPaths'
	| 'guildGoods'
	| 'events'
> & {
	players: { character: GameState['players'][number]['character'] }[];
	/** The Baron's claimed corners (missing on older states). */
	claims?: Record<number, number>;
};

/** What a build costs this player: the standard price, bent by their character's trait. */
export function costOf(s: Shared, player: number, kind: BuildKind): Partial<ResourceCounts> {
	const ch = s.players[player]?.character;
	if (ch === 'mason' && kind === 'city') return { wheat: 2, ore: 2 };
	if (ch === 'scholar' && kind === 'devCard') return { wheat: 1, ore: 1 };
	return COSTS[kind];
}

/**
 * The cards this player would hand over for a build, or null if they can't pay. The Alchemist
 * may pay Brick as Ore and Ore as Brick, using the asked-for kind first.
 */
export function paymentFor(
	s: Shared,
	player: number,
	kind: BuildKind,
	have: ResourceCounts
): Partial<ResourceCounts> | null {
	const cost = costOf(s, player, kind);
	if (s.players[player]?.character !== 'alchemist') return hasResources(have, cost) ? cost : null;
	const pay: Partial<ResourceCounts> = {};
	for (const r of RESOURCES) {
		if (r === 'brick' || r === 'ore' || !cost[r]) continue;
		if (have[r] < cost[r]!) return null;
		pay[r] = cost[r];
	}
	const brick = cost.brick ?? 0;
	const ore = cost.ore ?? 0;
	if (have.brick + have.ore < brick + ore) return null;
	// Each kind pays for itself first; the shortfall comes out of the other.
	const brickForBrick = Math.min(have.brick, brick);
	const oreForOre = Math.min(have.ore, ore);
	const paidBrick = brickForBrick + (ore - oreForOre);
	const paidOre = oreForOre + (brick - brickForBrick);
	if (paidBrick) pay.brick = paidBrick;
	if (paidOre) pay.ore = paidOre;
	return pay;
}

/** Whether this player can pay for a build out of this hand. */
export function canPay(s: Shared, player: number, kind: BuildKind, have: ResourceCounts | undefined): boolean {
	return !!have && paymentFor(s, player, kind, have) !== null;
}

/**
 * A 7 makes this player discard when they hold more than this many cards: the table's hand limit
 * (more for the Steward), and on top of it the cards their storehouse keeps safe. They discard
 * half of the cards beyond the safe ones.
 */
export function discardLimit(s: Shared, player: number): number {
	const limit = s.handLimit ?? DISCARD_THRESHOLD;
	return (s.players[player]?.character === 'steward' ? limit + STEWARD_EXTRA : limit) + safeCards(s, player);
}

/** The building this player's storehouse stands on, if they have one. */
export function storehouseOf(s: Shared, player: number): number | null {
	const v = s.storehouses?.findIndex((on, i) => on && s.buildings[i]?.owner === player) ?? -1;
	return v >= 0 ? v : null;
}

/** How many of this player's cards their storehouse keeps safe (none without one). */
export function safeCards(s: Shared, player: number): number {
	return storehouseOf(s, player) === null ? 0 : STOREHOUSE_SAFE;
}

/** Buildings a player can add a storehouse onto: any settlement or city of theirs, while they have none. */
export function storehouseSpots(s: Shared, player: number): number[] {
	if (!s.buildingRules.storehouse || storehouseOf(s, player) !== null) return [];
	const out: number[] = [];
	s.buildings.forEach((b, v) => {
		if (b?.owner === player) out.push(v);
	});
	return out;
}

/** Roads this player needs to claim Longest Road. */
export function longestRoadMin(s: Shared, player: number): number {
	return s.players[player]?.character === 'explorer' ? 4 : LONGEST_ROAD_MIN;
}

export function isVertexFree(s: Shared, vertex: number): boolean {
	const topo = getTopology(s.board);
	const v = topo.vertices[vertex];
	if (!v || s.buildings[vertex]) return false;
	return v.neighbors.every((n) => !s.buildings[n]);
}

export function canPlaceSettlement(s: Shared, player: number, vertex: number, setup: boolean) {
	if (!isVertexFree(s, vertex)) return false;
	// The Baron's Land Grant keeps a corner for him alone.
	const claim = s.claims?.[vertex];
	if (claim !== undefined && claim !== player) return false;
	if (setup) return true;
	const topo = getTopology(s.board);
	return topo.vertices[vertex].edges.some((e) => s.roads[e] === player);
}

export function settlementSpots(s: Shared, player: number, setup: boolean): number[] {
	const topo = getTopology(s.board);
	return topo.vertices
		.filter((v) => canPlaceSettlement(s, player, v.id, setup))
		.map((v) => v.id);
}

/** A road must touch your building, or your road through a vertex not owned by someone else. */
export function canPlaceRoad(s: Shared, player: number, edge: number, mustTouch?: number | null) {
	const topo = getTopology(s.board);
	const e = topo.edges[edge];
	if (!e || s.roads[edge] !== null) return false;
	if (mustTouch !== undefined && mustTouch !== null) return e.a === mustTouch || e.b === mustTouch;
	return [e.a, e.b].some((v) => {
		const b = s.buildings[v];
		if (b) return b.owner === player;
		return topo.vertices[v].edges.some((other) => other !== edge && s.roads[other] === player);
	});
}

export function roadSpots(s: Shared, player: number, mustTouch?: number | null): number[] {
	const topo = getTopology(s.board);
	return topo.edges.filter((e) => canPlaceRoad(s, player, e.id, mustTouch)).map((e) => e.id);
}

export function citySpots(s: Shared, player: number): number[] {
	const out: number[] = [];
	s.buildings.forEach((b, v) => {
		if (b && b.owner === player && b.kind === 'settlement') out.push(v);
	});
	return out;
}

/** How many workshops a player has built. */
export function workshopCount(s: Shared, player: number): number {
	return s.workshops.filter((o) => o === player).length;
}

/** Tiles with one of this player's workshops, any of which they can tear down. */
export function ownWorkshops(s: Shared, player: number): number[] {
	if (!s.buildingRules.workshop) return [];
	const out: number[] = [];
	s.workshops.forEach((o, h) => {
		if (o === player) out.push(h);
	});
	return out;
}

/**
 * Tiles a player can build a workshop on: ones that produce, beside one of their settlements or
 * cities, with no workshop yet, while they have workshops left to build.
 */
export function workshopSpots(s: Shared, player: number): number[] {
	if (!s.buildingRules.workshop || workshopCount(s, player) >= WORKSHOP_LIMIT) return [];
	const topo = getTopology(s.board);
	const out: number[] = [];
	s.board.hexes.forEach((hex, h) => {
		if (!TERRAIN_RESOURCE[hex.terrain] || s.workshops[h] !== null) return;
		if (topo.hexes[h].vertices.some((v) => s.buildings[v]?.owner === player)) out.push(h);
	});
	return out;
}

/** Roads a player can pave with stone: their own, not paved yet. */
export function paveSpots(s: Shared, player: number): number[] {
	if (!s.buildingRules.stoneRoad) return [];
	const out: number[] = [];
	s.roads.forEach((o, e) => {
		if (o === player && !s.stoneRoads[e]) out.push(e);
	});
	return out;
}

/**
 * Trade ratio per resource with the bank: the harbors a player has built on, bent by this round's
 * event, and the goods of their guild halls at 2:1 (on land, so a Storm at Sea doesn't shut them).
 */
export function tradeRatios(s: Shared, player: number): Record<Resource, number> {
	const ratios = harborRatios(s, player);
	// Reign Extended events: a Traveling Fair trades 2:1 everywhere, a Storm at Sea shuts harbors.
	const current = s.events?.current ?? null;
	const base = s.players[player]?.character === 'merchant' ? 3 : 4;
	if (current) for (const r of RESOURCES) ratios[r] = eventRatio(current, ratios[r], base);
	for (const r of guildGoodsOf(s, player)) ratios[r] = Math.min(ratios[r], 2);
	return ratios;
}

/** Trade ratio per resource with the bank at the harbors a player has built on (or reaches, for the Cartographer). */
function harborRatios(s: Shared, player: number): Record<Resource, number> {
	const topo = getTopology(s.board);
	const ch = s.players[player]?.character;
	const base = ch === 'merchant' ? 3 : 4;
	const ratios = { wood: base, brick: base, sheep: base, wheat: base, ore: base } as Record<Resource, number>;
	const harbor = (v: number) => {
		const port = topo.vertices[v].port;
		if (port === 'any') for (const r of RESOURCES) ratios[r] = Math.min(ratios[r], 3);
		else if (port) ratios[port] = 2;
	};
	s.buildings.forEach((b, v) => {
		if (b && b.owner === player) harbor(v);
	});
	// The Cartographer trades at every harbor her roads reach.
	if (ch === 'cartographer') {
		s.roads.forEach((o, e) => {
			if (o !== player) return;
			harbor(topo.edges[e].a);
			harbor(topo.edges[e].b);
		});
	}
	return ratios;
}

/**
 * The harbor a bank trade of `give` at `ratio` went through, as an index into `board.ports`, or
 * -1 when it was at the bank's own rate (4, or 3 for the Merchant). As in `tradeRatios`, a player
 * trades at a harbor they built beside, and the Cartographer at any her roads reach.
 */
export function tradeHarbor(s: Shared, player: number, give: Resource, ratio: number): number {
	const ch = s.players[player]?.character;
	const base = ch === 'merchant' ? 3 : 4;
	if (ratio >= base) return -1;
	const kind = ratio === 2 ? give : 'any';
	const topo = getTopology(s.board);
	const reaches = (v: number) =>
		s.buildings[v]?.owner === player ||
		(ch === 'cartographer' && topo.vertices[v].edges.some((e) => s.roads[e] === player));
	return topo.portEdges.findIndex((p) => {
		const e = topo.edges[p.edge];
		return p.kind === kind && (reaches(e.a) || reaches(e.b));
	});
}

/** Points from a player's buildings: 1 a settlement, 2 a city, 3 a castle. */
export function buildingPoints(s: Shared, player: number): number {
	let p = 0;
	s.buildings.forEach((b, v) => {
		if (b?.owner === player) p += b.kind !== 'city' ? 1 : s.cityPaths?.[v] === 'castle' ? CASTLE_POINTS : 2;
	});
	return p;
}

// ---------------------------------------------------------------- city paths (Reign Extended)

/**
 * Cities a player can take down `path`: their own that haven't taken one yet, while the host has
 * the path in the game. A player has one fortress at most, and a guild hall needs goods they
 * don't already trade at 2:1.
 */
export function pathSpots(s: Shared, player: number, path: CityPath): number[] {
	if (!s.buildingRules?.[path]) return [];
	if (path === 'fortress' && fortressOf(s, player) !== null) return [];
	if (path === 'guildHall' && !guildGoodsFor(s, player).length) return [];
	const out: number[] = [];
	s.buildings.forEach((b, v) => {
		if (b?.owner === player && b.kind === 'city' && !s.cityPaths?.[v]) out.push(v);
	});
	return out;
}

/** The city this player made their fortress, if they have one. */
export function fortressOf(s: Shared, player: number): number | null {
	const v = s.cityPaths?.findIndex((p, i) => p === 'fortress' && s.buildings[i]?.owner === player) ?? -1;
	return v >= 0 ? v : null;
}

/** What a player's knights count for towards the Largest Army: double with a fortress. */
export function armySize(s: Shared & { players: { knightsPlayed: number }[] }, player: number): number {
	const knights = s.players[player]?.knightsPlayed ?? 0;
	return fortressOf(s, player) === null ? knights : knights * FORTRESS_KNIGHTS;
}

/** The goods a player's guild halls trade with the bank at 2:1. */
export function guildGoodsOf(s: Shared, player: number): Resource[] {
	const out: Resource[] = [];
	s.cityPaths?.forEach((p, v) => {
		const r = s.guildGoods?.[v];
		if (p === 'guildHall' && r && s.buildings[v]?.owner === player) out.push(r);
	});
	return out;
}

/** Goods a new guild hall of this player's could trade: any they don't trade at 2:1 already, at a harbor or another guild hall. */
export function guildGoodsFor(s: Shared, player: number): Resource[] {
	const harbors = harborRatios(s, player);
	const guilds = guildGoodsOf(s, player);
	return RESOURCES.filter((r) => harbors[r] > 2 && !guilds.includes(r));
}

export function publicPoints(s: Shared, player: number): number {
	return (
		buildingPoints(s, player) +
		(s.longestRoadHolder === player ? 2 : 0) +
		(s.largestArmyHolder === player ? 2 : 0)
	);
}

/**
 * Longest trail of a player's roads that doesn't pass through another player's building. A stone
 * road counts as two.
 */
export function longestRoad(s: Shared, player: number): number {
	const topo = getTopology(s.board);
	const own = new Set<number>();
	s.roads.forEach((o, e) => {
		if (o === player) own.add(e);
	});
	if (own.size === 0) return 0;
	const used = new Set<number>();
	let best = 0;
	const blocked = (v: number) => {
		const b = s.buildings[v];
		return !!b && b.owner !== player;
	};
	const walk = (v: number, len: number) => {
		if (len > best) best = len;
		if (len > 0 && blocked(v)) return;
		for (const e of topo.vertices[v].edges) {
			if (!own.has(e) || used.has(e)) continue;
			used.add(e);
			const edge = topo.edges[e];
			walk(edge.a === v ? edge.b : edge.a, len + (s.stoneRoads[e] ? 2 : 1));
			used.delete(e);
		}
	};
	const starts = new Set<number>();
	for (const e of own) {
		starts.add(topo.edges[e].a);
		starts.add(topo.edges[e].b);
	}
	for (const v of starts) walk(v, 0);
	return best;
}

/** Players (other than `except`) with a building on the hex. */
export function playersOnHex(s: Shared, hex: number, except?: number): number[] {
	const topo = getTopology(s.board);
	const set = new Set<number>();
	for (const v of topo.hexes[hex].vertices) {
		const b = s.buildings[v];
		if (b && b.owner !== except) set.add(b.owner);
	}
	return [...set].sort((a, b) => a - b);
}

/** Sum of production dots around a vertex, a rough value for bots and hints. */
export function vertexValue(s: Shared, vertex: number): number {
	const topo = getTopology(s.board);
	let v = 0;
	for (const h of topo.vertices[vertex].hexes) {
		const hex = s.board.hexes[h];
		if (TERRAIN_RESOURCE[hex.terrain]) v += pips(hex.number);
	}
	return v;
}

/** What a roll of `n` would pay this player (the robber's tile aside, blessings ignored), at most `cap` cards. */
export function rollIncome(s: Shared, player: number, n: number, cap = Infinity): Partial<ResourceCounts> {
	const topo = getTopology(s.board);
	const out: Partial<ResourceCounts> = {};
	let left = cap;
	s.board.hexes.forEach((hex, h) => {
		const r = TERRAIN_RESOURCE[hex.terrain];
		if (hex.number !== n || !r || h === s.robberHex) return;
		let amount = 0;
		for (const v of topo.hexes[h].vertices) {
			const b = s.buildings[v];
			if (b?.owner === player) amount += b.kind === 'city' ? 2 : 1;
		}
		if (s.workshops?.[h] === player) amount++;
		amount = Math.min(amount, left);
		left -= amount;
		if (amount) out[r] = (out[r] ?? 0) + amount;
	});
	return out;
}

/** Whether this player is alone in last place on the points everyone can see. */
export function aloneLast(s: Shared, player: number): boolean {
	const mine = publicPoints(s, player);
	return s.players.every((_, i) => i === player || publicPoints(s, i) > mine);
}

/** The players with this character at the table (more than one when the host lets picks repeat). */
export function holdersOf(s: { players: { character: CharacterId | null }[] }, c: CharacterId): number[] {
	const out: number[] = [];
	s.players.forEach((p, i) => p.character === c && out.push(i));
	return out;
}

/** Characters still free in the character draft: the whole pool when picks can repeat. */
export function draftLeft(s: Pick<GameState | GameView, 'draft' | 'players'>): CharacterId[] {
	if (!s.draft) return [];
	if (s.draft.repeats) return s.draft.pool;
	return s.draft.pool.filter((c) => !s.players.some((p) => p.character === c));
}

type PowerShared = Pick<GameState | GameView, 'powers' | 'powerRecharge' | 'turn' | 'phase'> & {
	players: { character: CharacterId | null; powerUsed?: number | null }[];
};

/**
 * Turns until this player's power is ready again: 0 when it is ready now, null when it never will
 * be (powers are off, no character, or a once-per-game power already used).
 */
export function powerWait(s: PowerShared, player: number): number | null {
	const pl = s.players[player];
	if (!s.powers || !pl?.character) return null;
	const used = pl.powerUsed ?? null;
	if (used === null) return 0;
	if (!s.powerRecharge) return null;
	return Math.max(0, used + s.powerRecharge * s.players.length - s.turn);
}

/** Whether this player's power can be used (on their own turn, at the right step). */
export function powerReady(s: PowerShared, player: number): boolean {
	return s.phase === 'main' && powerWait(s, player) === 0;
}
