import { getTopology } from '../board/topology';
import {
	RESOURCES,
	TERRAIN_RESOURCE,
	hasResources,
	pips,
	totalResources,
	type Resource,
	type ResourceCounts
} from './config';
import {
	citySpots,
	costOf,
	playersOnHex,
	publicPoints,
	roadSpots,
	settlementSpots,
	tradeRatios,
	vertexValue
} from './queries';
import type { Action, GameState } from './types';

/**
 * A simple, honest bot: it only reads public information plus its own hand.
 * Returns the next action for `me`, or null if it has nothing to do right now.
 */
export function botAction(s: GameState, me: number, actionsThisTurn = 0): Action | null {
	if (s.phase === 'ended') return null;
	const pl = s.players[me];

	if (s.step === 'discard' && s.pendingDiscards[me]) {
		return { type: 'discard', resources: pickDiscard(pl.resources, s.pendingDiscards[me]) };
	}
	if (s.trade && s.trade.from !== me && s.trade.responses[me] === undefined) {
		return { type: 'respondTrade', offerId: s.trade.id, accept: wantsTrade(s, me) };
	}
	if (s.current !== me) return null;

	switch (s.step) {
		case 'setupSettlement': {
			const spots = settlementSpots(s, me, true);
			return { type: 'placeSettlement', vertex: best(spots, (v) => spotScore(s, me, v)) };
		}
		case 'setupRoad': {
			const spots = roadSpots(s, me, s.setupLastSettlement);
			return { type: 'placeRoad', edge: best(spots, (e) => roadScore(s, me, e)) };
		}
		case 'roll': {
			const knight = playableCard(s, me, 'knight');
			if (knight && playersOnHex(s, s.robberHex).includes(me)) return { type: 'playKnight' };
			return { type: 'rollDice' };
		}
		case 'moveRobber':
			return { type: 'moveRobber', hex: robberTarget(s, me) };
		case 'steal':
			return { type: 'steal', victim: best(s.stealCandidates, (p) => publicPoints(s, p) * 10 + totalResources(s.players[p].resources)) };
		case 'roadBuilding': {
			const spots = roadSpots(s, me);
			return { type: 'placeRoad', edge: best(spots, (e) => roadScore(s, me, e)) };
		}
		case 'main':
			return mainTurn(s, me, actionsThisTurn);
		default:
			return null;
	}
}

function mainTurn(s: GameState, me: number, actions: number): Action {
	const pl = s.players[me];
	const res = pl.resources;
	if (s.trade?.from === me) {
		const yes = Object.entries(s.trade.responses).find(([, r]) => r === 'accept');
		if (yes) return { type: 'confirmTrade', offerId: s.trade.id, with: Number(yes[0]) };
		const answered = Object.keys(s.trade.responses).length;
		if (answered >= s.players.length - 1) return { type: 'cancelTrade' };
	}
	if (actions > 40) return { type: 'endTurn' };

	if (!s.devCardPlayedThisTurn) {
		if (playableCard(s, me, 'knight') && playersOnHex(s, s.robberHex).includes(me)) return { type: 'playKnight' };
		if (playableCard(s, me, 'monopoly')) {
			const r = monopolyPick(s, me);
			if (r) return { type: 'playMonopoly', resource: r };
		}
		if (playableCard(s, me, 'yearOfPlenty')) {
			const need = missingFor(res, costOf(s, me, 'city')).concat(missingFor(res, costOf(s, me, 'settlement')));
			const pick = [need[0] ?? 'ore', need[1] ?? need[0] ?? 'wheat'] as [Resource, Resource];
			if (s.bank[pick[0]] > 1 && s.bank[pick[1]] > 1) return { type: 'playYearOfPlenty', resources: pick };
		}
		if (playableCard(s, me, 'roadBuilding') && pl.piecesLeft.road >= 2 && roadSpots(s, me).length) {
			return { type: 'playRoadBuilding' };
		}
	}

	if (hasResources(res, costOf(s, me, 'city')) && pl.piecesLeft.city > 0) {
		const spots = citySpots(s, me);
		if (spots.length) return { type: 'buildCity', vertex: best(spots, (v) => vertexValue(s, v)) };
	}
	const settleSpots = settlementSpots(s, me, false);
	if (hasResources(res, costOf(s, me, 'settlement')) && pl.piecesLeft.settlement > 0 && settleSpots.length) {
		return { type: 'placeSettlement', vertex: best(settleSpots, (v) => spotScore(s, me, v)) };
	}
	const roadsOk = roadSpots(s, me);
	const wantsRoad = settleSpots.length === 0 || pl.longestRoad >= 4;
	if (hasResources(res, costOf(s, me, 'road')) && pl.piecesLeft.road > 0 && roadsOk.length && wantsRoad) {
		return { type: 'placeRoad', edge: best(roadsOk, (e) => roadScore(s, me, e)) };
	}
	if (hasResources(res, costOf(s, me, 'devCard')) && s.devDeck.length > 0) {
		const keepForCity = citySpots(s, me).length > 0 && res.ore < 4;
		if (!keepForCity || totalResources(res) > 7) return { type: 'buyDevCard' };
	}

	const trade = bankTradeTowards(s, me);
	if (trade) return trade;
	return { type: 'endTurn' };
}

function playableCard(s: GameState, me: number, type: string) {
	return !s.devCardPlayedThisTurn && s.players[me].devCards.some((c) => c.type === type && c.boughtTurn < s.turn);
}

function best<T>(items: T[], score: (t: T) => number): T {
	let top = items[0];
	let topScore = -Infinity;
	for (const it of items) {
		const sc = score(it) + Math.random() * 0.01;
		if (sc > topScore) {
			topScore = sc;
			top = it;
		}
	}
	return top;
}

function spotScore(s: GameState, me: number, v: number): number {
	const topo = getTopology(s.board);
	const have = new Set<Resource>();
	s.buildings.forEach((b, vid) => {
		if (!b || b.owner !== me) return;
		for (const h of topo.vertices[vid].hexes) {
			const r = TERRAIN_RESOURCE[s.board.hexes[h].terrain];
			if (r) have.add(r);
		}
	});
	let score = 0;
	for (const h of topo.vertices[v].hexes) {
		const hex = s.board.hexes[h];
		const r = TERRAIN_RESOURCE[hex.terrain];
		if (!r) continue;
		score += pips(hex.number) * (have.has(r) ? 1 : 1.4);
		if (h === s.robberHex) score -= pips(hex.number);
	}
	if (topo.vertices[v].port) score += 1;
	return score;
}

function roadScore(s: GameState, me: number, e: number): number {
	const topo = getTopology(s.board);
	const edge = topo.edges[e];
	let score = 0;
	for (const v of [edge.a, edge.b]) {
		if (s.buildings[v]) continue;
		const free = topo.vertices[v].neighbors.every((n) => !s.buildings[n]);
		if (free) score = Math.max(score, spotScore(s, me, v));
		for (const n of topo.vertices[v].neighbors) {
			if (!s.buildings[n] && topo.vertices[n].neighbors.every((m) => !s.buildings[m])) {
				score = Math.max(score, spotScore(s, me, n) * 0.6);
			}
		}
	}
	return score;
}

function robberTarget(s: GameState, me: number): number {
	const candidates = s.board.hexes.map((_, i) => i).filter((h) => h !== s.robberHex);
	return best(candidates, (h) => {
		const victims = playersOnHex(s, h);
		if (victims.includes(me)) return -100;
		const hex = s.board.hexes[h];
		let score = pips(hex.number);
		for (const v of victims) score += publicPoints(s, v) * 2 + (totalResources(s.players[v].resources) > 0 ? 3 : 0);
		return victims.length ? score : -50 + pips(hex.number);
	});
}

function pickDiscard(have: ResourceCounts, n: number): Partial<ResourceCounts> {
	const left = { ...have };
	const out: Partial<ResourceCounts> = {};
	for (let i = 0; i < n; i++) {
		const r = RESOURCES.reduce((a, b) => (left[a] >= left[b] ? a : b));
		left[r]--;
		out[r] = (out[r] ?? 0) + 1;
	}
	return out;
}

function missingFor(have: ResourceCounts, cost: Partial<ResourceCounts>): Resource[] {
	const out: Resource[] = [];
	for (const r of RESOURCES) for (let i = have[r]; i < (cost[r] ?? 0); i++) out.push(r);
	return out;
}

function monopolyPick(s: GameState, me: number): Resource | null {
	let bestR: Resource | null = null;
	let bestN = 2;
	for (const r of RESOURCES) {
		let n = 0;
		s.players.forEach((p, i) => i !== me && (n += p.resources[r]));
		if (n > bestN) {
			bestN = n;
			bestR = r;
		}
	}
	return bestR;
}

function bankTradeTowards(s: GameState, me: number): Action | null {
	const res = s.players[me].resources;
	const ratios = tradeRatios(s, me);
	const goals: Partial<ResourceCounts>[] = [];
	if (citySpots(s, me).length && s.players[me].piecesLeft.city > 0) goals.push(costOf(s, me, 'city'));
	if (settlementSpots(s, me, false).length && s.players[me].piecesLeft.settlement > 0) goals.push(costOf(s, me, 'settlement'));
	goals.push(costOf(s, me, 'devCard'));
	for (const goal of goals) {
		const need = missingFor(res, goal);
		if (need.length !== 1) continue;
		const target = need[0];
		if (s.bank[target] <= 0) continue;
		for (const r of RESOURCES) {
			const spare = res[r] - (goal[r] ?? 0);
			if (r !== target && spare >= ratios[r]) return { type: 'bankTrade', give: r, get: target };
		}
	}
	return null;
}

function wantsTrade(s: GameState, me: number): boolean {
	const t = s.trade!;
	const res = s.players[me].resources;
	if (!hasResources(res, t.want)) return false;
	// Points everyone can see: victory point cards stay secret until the game ends.
	if (publicPoints(s, t.from) >= s.pointsToWin - 2) return false;
	const gets = totalResources(t.give);
	const gives = totalResources(t.want);
	if (gets < gives) return false;
	// Only give away things it has plenty of.
	return RESOURCES.every((r) => (t.want[r] ?? 0) === 0 || res[r] - (t.want[r] ?? 0) >= 1);
}
