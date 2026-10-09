import { getTopology } from '../board/topology';
import { POWER_INFO, type CharacterId } from './characters';
import { PLAGUE_LIMIT, busiestTile, type EventCard } from './events';
import {
	RESOURCES,
	TERRAIN_RESOURCE,
	hasResources,
	pips,
	totalResources,
	type Resource,
	type ResourceCounts,
	type Terrain
} from './config';
import {
	canPay,
	citySpots,
	costOf,
	discardLimit,
	draftLeft,
	holdersOf,
	longestRoad,
	longestRoadMin,
	paveSpots,
	isVertexFree,
	playersOnHex,
	powerReady,
	publicPoints,
	roadSpots,
	rollIncome,
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
			const power = powerMove(s, me);
			if (power) return power;
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
		case 'chooseRoll':
			return { type: 'keepRoll', index: best(s.rollChoices!.map((_, i) => i), (i) => rollScore(s, me, s.rollChoices![i])) };
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

	const power = powerMove(s, me);
	if (power) return power;

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
	// Nothing better to do with the turn: the Scholar takes her free card.
	if (pl.character === 'scholar' && powerReady(s, me) && s.devDeck.length) return { type: 'usePower' };
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
	// Roads beside a Baron's pay his toll, so other routes come first.
	const toll =
		1.5 *
		holdersOf(s, 'baron').filter(
			(b) => b !== me && [edge.a, edge.b].some((v) => topo.vertices[v].edges.some((o) => o !== e && s.roads[o] === b))
		).length;
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
	// When picks can repeat, a character nobody has yet still comes first, so a table of bots
	// isn't a table of Merchants; once the pool runs out they double up on the strongest.
	const fresh = left.filter((c) => !s.players.some((p) => p.character === c));
	const pick = (from: CharacterId[]) => DRAFT_ORDER.find((c) => from.includes(c)) ?? from[0];
	return fresh.length ? pick(fresh) : pick(left);
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

// ---------------------------------------------------------------- powers

/**
 * The power a bot uses now, if this is a good moment for it. Each rule waits for the moment the
 * power is worth about a development card, and most don't fire every game.
 */
function powerMove(s: GameState, me: number): Action | null {
	if (!powerReady(s, me)) return null;
	const pl = s.players[me];
	const ch = pl.character!;
	const when = POWER_INFO[ch].when;
	if ((when === 'roll' && s.step !== 'roll') || (when === 'main' && s.step !== 'main')) return null;
	const res = pl.resources;
	const others = s.players.map((_, i) => i).filter((i) => i !== me);
	const leader = best(others, (i) => publicPoints(s, i) * 10 + totalResources(s.players[i].resources) * 0.1);
	const blocked = playersOnHex(s, s.robberHex).includes(me);
	switch (ch) {
		case 'merchant':
			return marketDay(s, me);
		case 'mason': {
			if (res.ore < 1 || pl.piecesLeft.city <= 0 || canPay(s, me, 'city', res)) return null;
			const spots = citySpots(s, me);
			if (!spots.length) return null;
			const v = best(spots, (x) => vertexValue(s, x));
			return vertexValue(s, v) >= 7 ? { type: 'usePower', vertex: v } : null;
		}
		case 'scholar':
			// Taken at the end of a turn with nothing else to do (see mainTurn).
			return null;
		case 'veteran': {
			const holder = s.largestArmyHolder;
			const takesArmy =
				holder !== me && pl.knightsPlayed + 1 >= 3 && (holder === null || pl.knightsPlayed + 1 > s.players[holder].knightsPlayed);
			return blocked || takesArmy ? { type: 'usePower' } : null;
		}
		case 'rogue': {
			const rich = others.filter((i) => s.players[i].character !== 'witch' && totalResources(s.players[i].resources) >= 2);
			if (!rich.length) return null;
			const t = best(rich, (i) => totalResources(s.players[i].resources) + publicPoints(s, i) * 1.5);
			return totalResources(s.players[t].resources) >= 4 ? { type: 'usePower', target: t } : null;
		}
		case 'steward': {
			let bestN = 0;
			let bestGain: Partial<ResourceCounts> = {};
			for (let n = 2; n <= 12; n++) {
				if (n === 7) continue;
				const g = rollIncome(s, me, n, 3);
				if (totalResources({ ...emptyCounts(), ...g }) > totalResources({ ...emptyCounts(), ...bestGain })) {
					bestN = n;
					bestGain = g;
				}
			}
			if (!bestN) return null;
			const after = { ...res };
			for (const r of RESOURCES) after[r] += bestGain[r] ?? 0;
			const completes = (['city', 'settlement'] as const).some(
				(k) => !canPay(s, me, k, res) && canPay(s, me, k, after) && (k === 'city' ? citySpots(s, me).length : settlementSpots(s, me, false).length)
			);
			return completes || totalResources(after) - totalResources(res) >= 3 ? { type: 'usePower', number: bestN } : null;
		}
		case 'shepherd':
			return blocked && s.robberHex !== s.robberHome ? { type: 'usePower' } : null;
		case 'explorer':
			return pl.piecesLeft.road >= 2 &&
				pl.piecesLeft.settlement > 0 &&
				settlementSpots(s, me, false).length === 0 &&
				roadSpots(s, me).length
				? { type: 'usePower' }
				: null;
		case 'seer': {
			const n = totalResources(res);
			const oneShort = (['city', 'settlement'] as const).some((k) => missingFor(res, costOf(s, me, k)).length === 1);
			return n > discardLimit(s, me) || oneShort ? { type: 'usePower' } : null;
		}
		case 'alchemist':
			return transmute(s, me);
		case 'bard': {
			if (!s.dice || s.dice[0] + s.dice[1] === 7) return null;
			const total = s.dice[0] + s.dice[1];
			const gain = (p: number) => totalResources({ ...emptyCounts(), ...rollIncome(s, p, total) });
			const mine = gain(me);
			const theirs = Math.max(0, ...others.map(gain));
			return mine >= 2 && mine - theirs >= 2 ? { type: 'usePower' } : null;
		}
		case 'witch': {
			if (s.hexed?.[leader] || publicPoints(s, leader) < Math.max(4, publicPoints(s, me))) return null;
			return { type: 'usePower', target: leader };
		}
		case 'cartographer':
			return redraw(s, me, leader);
		case 'baron':
			return landGrant(s, me);
		case 'abbess': {
			const topo = getTopology(s.board);
			const tiles = s.board.hexes.map((_, h) => h).filter((h) => h !== s.robberHex && TERRAIN_RESOURCE[s.board.hexes[h].terrain]);
			const weight = (h: number) =>
				pips(s.board.hexes[h].number) *
				topo.hexes[h].vertices.reduce((n, v) => n + (s.buildings[v]?.owner === me ? (s.buildings[v]!.kind === 'city' ? 2 : 1) : 0), 0);
			if (!tiles.length) return null;
			const h = best(tiles, weight);
			return weight(h) >= 8 ? { type: 'usePower', hex: h } : null;
		}
		case 'jester': {
			const mine = totalResources(res);
			const theirs = others.reduce((n, i) => n + totalResources(s.players[i].resources), 0);
			return theirs >= 6 && mine + 3 <= theirs / others.length ? { type: 'usePower' } : null;
		}
	}
	return null;
}

function emptyCounts(): ResourceCounts {
	return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

/** How much the Seer likes a roll: what it pays her, a build it completes, and a 7 she'd dread. */
function rollScore(s: GameState, me: number, dice: [number, number]): number {
	const total = dice[0] + dice[1];
	const res = s.players[me].resources;
	if (total === 7) return totalResources(res) > discardLimit(s, me) ? -10 : 1;
	const gain = rollIncome(s, me, total);
	const after = { ...res };
	for (const r of RESOURCES) after[r] += gain[r] ?? 0;
	let score = totalResources({ ...emptyCounts(), ...gain });
	for (const k of ['city', 'settlement'] as const) if (!canPay(s, me, k, res) && canPay(s, me, k, after)) score += 3;
	return score;
}

/** The Merchant's Market Day: spare cards 1:1 for what one build lacks, if that finishes it. */
function marketDay(s: GameState, me: number): Action | null {
	const pl = s.players[me];
	const res = pl.resources;
	const goals: Partial<ResourceCounts>[] = [];
	if (citySpots(s, me).length && pl.piecesLeft.city > 0) goals.push(costOf(s, me, 'city'));
	if (settlementSpots(s, me, false).length && pl.piecesLeft.settlement > 0) goals.push(costOf(s, me, 'settlement'));
	for (const goal of goals) {
		if (hasResources(res, goal)) return null;
		const need = missingFor(res, goal);
		if (need.length < 2 || need.length > 4) continue;
		const spare: Resource[] = [];
		for (const r of RESOURCES) for (let i = goal[r] ?? 0; i < res[r]; i++) if (!need.includes(r)) spare.push(r);
		if (spare.length < need.length) continue;
		const give: Partial<ResourceCounts> = {};
		const get: Partial<ResourceCounts> = {};
		// Give from the biggest stacks first.
		spare.sort((a, b) => res[b] - res[a]);
		for (let i = 0; i < need.length; i++) {
			give[spare[i]] = (give[spare[i]] ?? 0) + 1;
			get[need[i]] = (get[need[i]] ?? 0) + 1;
		}
		if (RESOURCES.every((r) => s.bank[r] >= (get[r] ?? 0))) return { type: 'usePower', give, get };
	}
	return null;
}

/** The Alchemist turns one of its doubled-up tiles into the resource it has no income for. */
function transmute(s: GameState, me: number): Action | null {
	const topo = getTopology(s.board);
	const income = new Map<Resource, number>();
	const mine: number[] = [];
	s.board.hexes.forEach((hex, h) => {
		const r = TERRAIN_RESOURCE[hex.terrain];
		if (!r || !topo.hexes[h].vertices.some((v) => s.buildings[v]?.owner === me)) return;
		mine.push(h);
		income.set(r, (income.get(r) ?? 0) + pips(hex.number));
	});
	const lacking = RESOURCES.filter((r) => !income.has(r));
	if (!lacking.length || !mine.length) return null;
	// The tile whose resource it has the most of besides, and the best of its numbers.
	const h = best(mine, (x) => {
		const r = TERRAIN_RESOURCE[s.board.hexes[x].terrain]!;
		const own = pips(s.board.hexes[x].number);
		return (income.get(r)! - own) * 2 + own;
	});
	const r0 = TERRAIN_RESOURCE[s.board.hexes[h].terrain]!;
	if (income.get(r0)! - pips(s.board.hexes[h].number) < 3) return null;
	// Grain and Ore build cities, so those come first.
	const want = (['ore', 'wheat', 'brick', 'wood', 'sheep'] as Resource[]).find((r) => lacking.includes(r))!;
	const terrain = (Object.keys(TERRAIN_RESOURCE) as Terrain[]).find((t) => TERRAIN_RESOURCE[t] === want)!;
	return { type: 'usePower', hex: h, terrain };
}

/** The Cartographer swaps two of her tiles' numbers when that gains her more than it gains the leader. */
function redraw(s: GameState, me: number, leader: number): Action | null {
	const topo = getTopology(s.board);
	const weight = (h: number, p: number) =>
		topo.hexes[h].vertices.reduce((n, v) => n + (s.buildings[v]?.owner === p ? (s.buildings[v]!.kind === 'city' ? 2 : 1) : 0), 0);
	const tiles = s.board.hexes.map((_, h) => h).filter((h) => s.board.hexes[h].number !== null && weight(h, me) > 0);
	let top: [number, number] | null = null;
	let topGain = 2;
	for (const a of tiles) {
		for (const b of tiles) {
			if (b <= a || s.board.hexes[a].number === s.board.hexes[b].number) continue;
			const pa = pips(s.board.hexes[a].number);
			const pb = pips(s.board.hexes[b].number);
			const delta = (p: number) => (weight(a, p) - weight(b, p)) * (pb - pa);
			const gain = delta(me) - Math.max(0, delta(leader));
			if (gain > topGain) {
				topGain = gain;
				top = [a, b];
			}
		}
	}
	return top ? { type: 'usePower', hex: top[0], hex2: top[1] } : null;
}

/** The Baron claims the best open corner within two roads of his own, before someone else takes it. */
function landGrant(s: GameState, me: number): Action | null {
	const topo = getTopology(s.board);
	const reach = new Map<number, number>();
	s.buildings.forEach((b, v) => b?.owner === me && reach.set(v, 0));
	s.roads.forEach((o, e) => {
		if (o !== me) return;
		reach.set(topo.edges[e].a, 0);
		reach.set(topo.edges[e].b, 0);
	});
	for (let step = 1; step <= 2; step++) {
		for (const [v, d] of [...reach]) {
			if (d !== step - 1 || (s.buildings[v] && s.buildings[v]!.owner !== me)) continue;
			for (const e of topo.vertices[v].edges) {
				if (s.roads[e] !== null && s.roads[e] !== me) continue;
				const o = topo.edges[e].a === v ? topo.edges[e].b : topo.edges[e].a;
				if (!reach.has(o)) reach.set(o, step);
			}
		}
	}
	const spots = [...reach.keys()].filter((v) => reach.get(v)! > 0 && isVertexFree(s, v) && s.claims?.[v] === undefined);
	if (!spots.length || s.players[me].piecesLeft.settlement <= 0) return null;
	const v = best(spots, (x) => spotScore(s, me, x));
	return spotScore(s, me, v) >= 9 ? { type: 'usePower', vertex: v } : null;
}
