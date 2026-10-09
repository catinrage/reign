import { getTopology } from '../board/topology';
import type { CharacterId } from './characters';
import { PLAGUE_LIMIT, busiestTile, type EventCard } from './events';
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
	canPay,
	citySpots,
	costOf,
	discardLimit,
	draftLeft,
	longestRoad,
	longestRoadMin,
	paveSpots,
	playersOnHex,
	publicPoints,
	roadSpots,
	settlementSpots,
	tradeRatios,
	vertexValue,
	workshopSpots
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
	// A card a trait owes it: taken straight away, whatever it needs most.
	if (s.phase !== 'draft' && s.picks?.[me]?.length) {
		const r = pickWanted(s, me);
		if (r) return { type: 'takePick', resource: r };
	}
	if (s.trade && s.trade.from !== me && s.trade.responses[me] === undefined) {
		return { type: 'respondTrade', offerId: s.trade.id, accept: wantsTrade(s, me) };
	}
	// Reign Extended events: the Royal Decree's pick, and the Bountiful Year's free card.
	if (s.step === 'eventChoice' && s.events?.choice?.player === me) {
		return { type: 'chooseEvent', card: decreePick(s, me, s.events.choice.cards) };
	}
	if (s.phase === 'main' && s.events?.bounty.includes(me)) {
		const r = neededResource(s, me);
		if (r) return { type: 'claimBounty', resource: r };
	}
	if (s.current !== me) return null;

	switch (s.step) {
		case 'pickCharacter':
			return { type: 'pickCharacter', character: draftPick(s) };
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
			return {
				type: 'steal',
				victim: best(s.stealCandidates, (p) =>
					// Robbing the Witch costs a card, so only as a last resort.
					s.players[p].character === 'witch' ? -100 : publicPoints(s, p) * 10 + totalResources(s.players[p].resources)
				)
			};
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

	if (canPay(s, me, 'city', res) && pl.piecesLeft.city > 0) {
		const spots = citySpots(s, me);
		if (spots.length) return { type: 'buildCity', vertex: best(spots, (v) => vertexValue(s, v)) };
	}
	const settleSpots = settlementSpots(s, me, false);
	if (canPay(s, me, 'settlement', res) && pl.piecesLeft.settlement > 0 && settleSpots.length) {
		return { type: 'placeSettlement', vertex: best(settleSpots, (v) => spotScore(s, me, v)) };
	}
	// Reign Extended: a workshop on its best tile, if that tile pays often enough to be worth it
	// (with an Ore in the price, only a 6 or an 8 is: two bots that keep to those win about 47% of
	// games against two that build none, and building on 5s and 9s too does worse).
	const shop = bestWorkshop(s, me);
	if (shop !== null && canPay(s, me, 'workshop', res)) return { type: 'buildWorkshop', hex: shop };
	const roadsOk = roadSpots(s, me);
	const wantsRoad = settleSpots.length === 0 || pl.longestRoad >= 4;
	if (canPay(s, me, 'road', res) && pl.piecesLeft.road > 0 && roadsOk.length && wantsRoad) {
		return { type: 'placeRoad', edge: best(roadsOk, (e) => roadScore(s, me, e)) };
	}
	// Reign Extended: pave a road while racing for the Longest Road.
	const pave = bestPaving(s, me);
	if (pave !== null && canPay(s, me, 'stoneRoad', res)) return { type: 'paveRoad', edge: pave };
	if (canPay(s, me, 'devCard', res) && s.devDeck.length > 0) {
		const keepForCity = citySpots(s, me).length > 0 && res.ore < 4;
		if (!keepForCity || totalResources(res) > discardLimit(s, me)) return { type: 'buyDevCard' };
	}

	const trade = bankTradeTowards(s, me);
	if (trade) return trade;
	return { type: 'endTurn' };
}

/** The tile a bot would put a workshop on: its best paying one, or null if none pays enough. */
function bestWorkshop(s: GameState, me: number): number | null {
	const spots = workshopSpots(s, me);
	if (!spots.length) return null;
	const score = (h: number) => {
		const hex = s.board.hexes[h];
		// Grain and ore build cities, so their tiles are worth a little more.
		const res = TERRAIN_RESOURCE[hex.terrain];
		return pips(hex.number) + (res === 'wheat' || res === 'ore' ? 0.5 : 0) - (h === s.robberHex ? 2 : 0);
	};
	const h = best(spots, score);
	return score(h) >= 5 ? h : null;
}

/**
 * The road a bot would pave with stone, or null unless it's in a race for the Longest Road: one or
 * two pavings from taking it, or holding it with a rival close behind.
 */
function bestPaving(s: GameState, me: number): number | null {
	const spots = paveSpots(s, me);
	if (!spots.length) return null;
	const mine = s.players[me].longestRoad;
	const holder = s.longestRoadHolder;
	if (holder === me) {
		if (!s.players.some((p, i) => i !== me && p.longestRoad >= mine - 1)) return null;
	} else {
		const goal = Math.max(longestRoadMin(s, me), holder === null ? 0 : s.players[holder].longestRoad + 1);
		if (mine < 3 || goal - mine > 2) return null;
	}
	// The road that makes the longest trail longer still.
	let bestEdge: number | null = null;
	let bestLen = mine;
	for (const e of spots) {
		const stoneRoads = s.stoneRoads.slice();
		stoneRoads[e] = true;
		const len = longestRoad({ ...s, stoneRoads }, me);
		if (len > bestLen) {
			bestLen = len;
			bestEdge = e;
		}
	}
	return bestEdge;
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
	// Roads beside the Baron's pay his toll, so other routes come first.
	const baron = s.players.findIndex((p) => p.character === 'baron');
	const toll =
		baron >= 0 && baron !== me && [edge.a, edge.b].some((v) => topo.vertices[v].edges.some((o) => o !== e && s.roads[o] === baron))
			? 1.5
			: 0;
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
	return score - toll;
}

function robberTarget(s: GameState, me: number): number {
	const candidates = s.board.hexes.map((_, i) => i).filter((h) => h !== s.robberHex);
	return best(candidates, (h) => {
		const victims = playersOnHex(s, h);
		if (victims.includes(me)) return -100;
		const hex = s.board.hexes[h];
		let score = pips(hex.number);
		const robbable = victims.filter((v) => s.players[v].character !== 'witch');
		for (const v of robbable) score += publicPoints(s, v) * 2 + (totalResources(s.players[v].resources) > 0 ? 3 : 0);
		// A tile with only the Witch on it still blocks her income, but robbing her costs a card.
		if (victims.length && !robbable.length) score -= 6;
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

/** The resource a bot takes when a trait owes it one: what its next build lacks, else its scarcest. */
function pickWanted(s: GameState, me: number): Resource | null {
	const res = s.players[me].resources;
	const stocked = RESOURCES.filter((r) => s.bank[r] > 0);
	if (!stocked.length) return null;
	const goals = [costOf(s, me, 'city'), costOf(s, me, 'settlement'), costOf(s, me, 'devCard')];
	for (const goal of goals) {
		const need = missingFor(res, goal).filter((r) => s.bank[r] > 0);
		if (need.length) return need[0];
	}
	return stocked.reduce((a, b) => (res[a] <= res[b] ? a : b));
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
	if (bestWorkshop(s, me) !== null) goals.push(costOf(s, me, 'workshop'));
	if (bestPaving(s, me) !== null) goals.push(costOf(s, me, 'stoneRoad'));
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

/**
 * The character a bot drafts: the strongest trait still free, judged plainly (steady income and
 * cheaper building first, situational traits last). Bots read the same table everyone sees.
 */
const DRAFT_ORDER: CharacterId[] = [
	'merchant',
	'shepherd',
	'mason',
	'alchemist',
	'cartographer',
	'scholar',
	'abbess',
	'seer',
	'baron',
	'veteran',
	'bard',
	'explorer',
	'jester',
	'witch',
	'rogue',
	'steward'
];

function draftPick(s: GameState): CharacterId {
	const left = draftLeft(s);
	return DRAFT_ORDER.find((c) => left.includes(c)) ?? left[0];
}

/** The resource a bot most wants from the bank: what its next city, settlement or card lacks. */
function neededResource(s: GameState, me: number): Resource | null {
	const res = s.players[me].resources;
	const need = [
		...missingFor(res, costOf(s, me, 'city')),
		...missingFor(res, costOf(s, me, 'settlement')),
		...missingFor(res, costOf(s, me, 'devCard'))
	].filter((r) => s.bank[r] > 0);
	if (need.length) return need[0];
	return RESOURCES.filter((r) => s.bank[r] > 0).sort((a, b) => res[a] - res[b])[0] ?? null;
}

/**
 * Royal Decree: the bot is in last place and picks the card that does it the most good, roughly
 * in cards gained (or kept) this round. It reads only what everyone can see, plus its own hand.
 */
function decreePick(s: GameState, me: number, cards: EventCard[]): EventCard {
	const topo = getTopology(s.board);
	const n = s.players.length;
	const myCards = totalResources(s.players[me].resources);
	// Expected cards per roll from tiles of a terrain (or all), counting cities twice; or, `any`,
	// the cards those tiles would pay if their number came up.
	const income = (terrain?: string, any = false) => {
		let k = 0;
		s.buildings.forEach((b, v) => {
			if (!b || b.owner !== me) return;
			for (const h of topo.vertices[v].hexes) {
				const hex = s.board.hexes[h];
				if (h === s.robberHex || (terrain && hex.terrain !== terrain)) continue;
				if (TERRAIN_RESOURCE[hex.terrain]) k += (any ? 1 : pips(hex.number) / 36) * (b.kind === 'city' ? 2 : 1);
			}
		});
		return k;
	};
	const bandits = busiestTile(s);
	const value = (c: EventCard): number => {
		switch (c) {
			case 'harvestFestival':
				return income('fields') * n;
			case 'migratingHerds':
				// A 7 comes up about once in six rolls, and the round has one roll per player.
				return (income('pasture', true) * n) / 6;
			case 'comet':
				return income();
			case 'bountifulYear':
				return 1;
			case 'travelingFair':
				return myCards >= 4 ? 1 : 0.3;
			case 'royalWedding':
			case 'royalDecree':
				return n - 1;
			case 'tournament': {
				const most = Math.max(...s.players.map((p) => p.knightsPlayed));
				const top = s.players.filter((p) => p.knightsPlayed === most).length;
				return most > 0 && top === 1 && s.players[me].knightsPlayed === most ? n - 1 : -1;
			}
			case 'plagueOfRats':
				return myCards > PLAGUE_LIMIT ? -1 : 0.2;
			case 'taxCollector':
				return 0.3 - s.buildings.filter((b) => b?.owner === me && b.kind === 'city').length;
			case 'banditUprising':
				return bandits !== null && playersOnHex(s, bandits).includes(me) ? -1.5 : 0.3;
			case 'stormAtSea':
				return -0.2;
			case 'earthquake':
				return 0;
		}
	};
	return best(cards, value);
}
