import { getTopology } from '../board/topology';
import {
	COSTS,
	DISCARD_THRESHOLD,
	LONGEST_ROAD_MIN,
	RESOURCES,
	TERRAIN_RESOURCE,
	type BuildKind,
	type Resource,
	type ResourceCounts,
	pips
} from './config';
import type { CharacterId } from './characters';
import type { GameState, GameView } from './types';

/** Read-only helpers shared by the engine, the bots and the client's highlighting. */
type Shared = Pick<
	GameState | GameView,
	'board' | 'buildings' | 'roads' | 'robberHex' | 'longestRoadHolder' | 'largestArmyHolder'
> & { players: { character: GameState['players'][number]['character'] }[] };

/** What a build costs this player: the standard price, bent by their character's trait. */
export function costOf(s: Shared, player: number, kind: BuildKind): Partial<ResourceCounts> {
	const ch = s.players[player]?.character;
	if (ch === 'mason' && kind === 'city') return { wheat: 2, ore: 2 };
	if (ch === 'scholar' && kind === 'devCard') return { wheat: 1, ore: 1 };
	return COSTS[kind];
}

/** A 7 makes this player discard half their hand when they hold more than this many cards. */
export function discardLimit(s: Shared, player: number): number {
	return s.players[player]?.character === 'steward' ? 9 : DISCARD_THRESHOLD;
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

/** Trade ratio per resource with the bank, given the harbors a player has built on. */
export function tradeRatios(s: Shared, player: number): Record<Resource, number> {
	const topo = getTopology(s.board);
	const base = s.players[player]?.character === 'merchant' ? 3 : 4;
	const ratios = { wood: base, brick: base, sheep: base, wheat: base, ore: base } as Record<Resource, number>;
	s.buildings.forEach((b, v) => {
		if (!b || b.owner !== player) return;
		const port = topo.vertices[v].port;
		if (port === 'any') for (const r of RESOURCES) ratios[r] = Math.min(ratios[r], 3);
		else if (port) ratios[port] = 2;
	});
	return ratios;
}

export function buildingPoints(s: Shared, player: number): number {
	let p = 0;
	for (const b of s.buildings) if (b && b.owner === player) p += b.kind === 'city' ? 2 : 1;
	return p;
}

export function publicPoints(s: Shared, player: number): number {
	return (
		buildingPoints(s, player) +
		(s.longestRoadHolder === player ? 2 : 0) +
		(s.largestArmyHolder === player ? 2 : 0)
	);
}

/** Longest trail of a player's roads that doesn't pass through another player's building. */
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
			walk(edge.a === v ? edge.b : edge.a, len + 1);
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

/** Characters still free in the character draft. */
export function draftLeft(s: Pick<GameState | GameView, 'draft' | 'players'>): CharacterId[] {
	if (!s.draft) return [];
	return s.draft.pool.filter((c) => !s.players.some((p) => p.character === c));
}
