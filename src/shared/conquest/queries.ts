import { HARVEST_ARMIES, MERCENARY_ARMIES, type OmenId } from './omens';
import { REALM, realmNeighbors, type RealmMap } from './realm';
import type { ConquestCard, ConquestSettings, CqPhase, CqStep, Mission, Occupation, ReinforceExtra } from './types';
import { FULL_STORES, HIGH_GROUND, RESTLESS_MOST, RESTLESS_PER, STRONGHOLD, WOODLAND, type WarlordId } from './warlords';
import { generateWorld } from './world';

/**
 * Questions about a game of Conquest that the rules, the bots and the table all ask. Each takes
 * either the full state or a player's view, so it only reads what both of them have.
 */
export interface CqTable {
	settings: ConquestSettings;
	owner: number[];
	armies: number[];
	players: { out: boolean; warlord?: WarlordId | null }[];
	/** This round's omen, when the table plays with them. */
	omens?: { current: OmenId | null; region: number | null; target: number | null } | null;
	/** Territories each player lost since their own last turn began (the Gravewarden's armies). */
	lostSince?: number[];
	phase: CqPhase;
	step: CqStep;
	current: number;
	reserve: number[];
	placed: number[];
	occupy: Occupation | null;
	mustTrade: boolean;
	trades: number;
}

const worlds = new WeakMap<object, RealmMap>();

/** The map a game is played on: the Realm, or the random world its settings make. */
export function conquestMap(settings?: Pick<ConquestSettings, 'map' | 'world'>): RealmMap {
	if (settings?.map !== 'random' || !settings.world) return REALM;
	let map = worlds.get(settings.world);
	if (!map) worlds.set(settings.world, (map = generateWorld(settings.world)));
	return map;
}

const neighborCache = new Map<RealmMap, number[][]>();
const laneCache = new Map<RealmMap, Set<number>>();

/** Territories `a` and `b` are joined by a sea lane (not a land border). */
export function isLane(map: RealmMap, a: number, b: number): boolean {
	let lanes = laneCache.get(map);
	if (!lanes) {
		const index = new Map(map.territories.map((t, i) => [t.id, i]));
		lanes = new Set(map.lanes.flatMap(([x, y]) => [index.get(x)! * 4096 + index.get(y)!, index.get(y)! * 4096 + index.get(x)!]));
		laneCache.set(map, lanes);
	}
	return lanes.has(a * 4096 + b);
}

/** `p`'s warlord, if the table plays with warlords. */
export function warlordOf(s: Pick<CqTable, 'players'>, p: number): WarlordId | null {
	return s.players[p]?.warlord ?? null;
}

/** This round's omen, if any. */
export function omenNow(s: Pick<CqTable, 'omens'>): OmenId | null {
	return s.omens?.current ?? null;
}
const regionCache = new Map<RealmMap, number[][]>();

/** Every territory's neighbours on a map, worked out once. */
function neighborsOf(map: RealmMap): number[][] {
	let n = neighborCache.get(map);
	if (!n) neighborCache.set(map, (n = realmNeighbors(map)));
	return n;
}

/** The territories of each region of a map, worked out once. */
export function regionTerritories(map: RealmMap = REALM): number[][] {
	let r = regionCache.get(map);
	if (!r) {
		r = map.regions.map((_, i) => map.territories.flatMap((t, j) => (t.region === i ? [j] : [])));
		regionCache.set(map, r);
	}
	return r;
}

/** The territories next to `t`, by land or across a sea lane. */
export function neighbors(t: number, map: RealmMap = REALM): number[] {
	return neighborsOf(map)[t] ?? [];
}

export function territoriesOf(s: CqTable, p: number): number[] {
	const out: number[] = [];
	for (let t = 0; t < s.owner.length; t++) if (s.owner[t] === p) out.push(t);
	return out;
}

/** The regions `p` holds every territory of. */
export function regionsHeld(s: Pick<CqTable, 'settings' | 'owner'>, p: number): number[] {
	return regionTerritories(conquestMap(s.settings)).flatMap((ts, r) =>
		ts.every((t) => s.owner[t] === p) ? [r] : []
	);
}

/**
 * The armies `p` gets at the start of a turn: a third of their territories (never fewer than the
 * table's least, three as a rule), each region's bonus for holding all of it, and what their
 * warlord and the round's omen add.
 */
export function reinforcementsFor(s: CqTable, p: number) {
	const map = conquestMap(s.settings);
	const mine = territoriesOf(s, p);
	const territories = mine.length;
	const base = Math.max(s.settings.minReinforce ?? 3, Math.floor(territories / 3));
	const omen = omenNow(s);
	const regions = regionsHeld(s, p).map((region) => ({ region, bonus: map.regions[region].bonus * (omen === 'musterBells' ? 2 : 1) }));
	const extra: ReinforceExtra[] = [];
	const warlord = warlordOf(s, p);
	if (warlord === 'dunstan') {
		const high = mine.filter((t) => (HIGH_GROUND as readonly string[]).includes(map.territories[t].terrain)).length;
		if (high >= 2) extra.push({ source: 'warlord', armies: Math.floor(high / 2) });
	}
	const restless = warlord === 'gorm' ? Math.min(RESTLESS_MOST, Math.floor((s.lostSince?.[p] ?? 0) / RESTLESS_PER)) : 0;
	if (restless) extra.push({ source: 'warlord', armies: restless });
	if (omen === 'harvestMoon') extra.push({ source: 'omen', armies: HARVEST_ARMIES });
	if (omen === 'mercenaries' && s.omens?.target === p) extra.push({ source: 'omen', armies: MERCENARY_ARMIES });
	const total = base + regions.reduce((n, r) => n + r.bonus, 0) + extra.reduce((n, e) => n + e.armies, 0);
	return { territories, base, regions, extra, total };
}

/**
 * Why `from` can't attack `to` this round, though they are enemies next door: the round's omen.
 * Null if it can.
 */
export function attackBlock(s: CqTable, from: number, to: number): 'seaFog' | 'snowbound' | 'truce' | null {
	const omen = omenNow(s);
	if (!omen) return null;
	const map = conquestMap(s.settings);
	if (omen === 'seaFog' && isLane(map, from, to)) return 'seaFog';
	if (omen === 'snowbound' && map.territories[to]?.region === s.omens?.region) return 'snowbound';
	if (omen === 'truce' && s.owner[to] === s.omens?.target) return 'truce';
	return null;
}

/** Enemy territories next to `from` that it may attack this round. */
export function attackTargets(s: CqTable, from: number): number[] {
	return neighbors(from, conquestMap(s.settings)).filter((n) => s.owner[n] !== s.owner[from] && !attackBlock(s, from, n));
}

/** The most dice an attack from `from` on `to` may roll: three, fewer with fewer armies, two into the Woodwarden's woods. */
export function attackDiceMax(s: CqTable, from: number, to: number): number {
	let most = Math.min(3, s.armies[from] - 1);
	const terrain = conquestMap(s.settings).territories[to]?.terrain;
	if (warlordOf(s, s.owner[to]) === 'rowan' && (WOODLAND as readonly string[]).includes(terrain)) most = Math.min(most, 2);
	return Math.max(0, most);
}

/**
 * The dice `to` defends with against `from`: two (one with a single army), three for the
 * Ironwall where she has three or more, one against the Corsair across a sea lane.
 */
export function defendDice(s: CqTable, from: number, to: number): number {
	const d = s.armies[to];
	if (warlordOf(s, s.owner[from]) === 'ysra' && isLane(conquestMap(s.settings), from, to)) return 1;
	if (warlordOf(s, s.owner[to]) === 'morwen' && d >= 3) return 3;
	return Math.min(2, d);
}

/**
 * Which of the attacker's dice (by rank, highest first) win ties against `to`: all of them under a
 * Blood Moon, the highest for the Siegemaster rolling three at a stronghold; none as a rule.
 */
export function attackerTies(s: CqTable, attacker: number, dice: number, to: number): number {
	if (omenNow(s) === 'bloodMoon') return 3;
	return warlordOf(s, attacker) === 'aldric' && dice === 3 && s.armies[to] >= STRONGHOLD ? 1 : 0;
}

/**
 * Which territories' armies `p` can see in the fog of war: their own and those next to them
 * (everything for the Spymistress, and when there's no fog).
 */
export function visibleTo(s: CqTable, p: number): boolean[] {
	if (!s.settings.fog || p < 0 || warlordOf(s, p) === 'vey' || s.players[p]?.out) return s.owner.map(() => true);
	const map = conquestMap(s.settings);
	const seen = s.owner.map((o) => o === p);
	s.owner.forEach((o, t) => {
		if (o === p) for (const n of neighbors(t, map)) seen[n] = true;
	});
	return seen;
}

/** `t` is p's, has an army to spare and an enemy next door. It says nothing of whose turn it is. */
export function canAttackFrom(s: CqTable, p: number, t: number): boolean {
	return s.owner[t] === p && s.armies[t] >= 2 && attackTargets(s, t).length > 0;
}

export function attackSources(s: CqTable, p: number): number[] {
	return territoriesOf(s, p).filter((t) => canAttackFrom(s, p, t));
}

/**
 * The moment lets `p` attack, fortify or end the attacks: it's their turn, the cards are traded
 * down and every army is placed (attacking from the reinforce step moves on to attacking).
 */
export function canAttackNow(s: CqTable, p: number): boolean {
	return (
		s.phase === 'play' &&
		s.current === p &&
		!s.mustTrade &&
		(s.step === 'attack' || (s.step === 'reinforce' && s.reserve[p] === 0))
	);
}

/** `p` can fortify now: attacking is allowed, or they've moved on to fortifying. */
export function canFortifyNow(s: CqTable, p: number): boolean {
	return canAttackNow(s, p) || (s.phase === 'play' && s.current === p && s.step === 'fortify');
}

/** `p` can end their turn now: nothing is left half done. */
export function canEndTurnNow(s: CqTable, p: number): boolean {
	return (
		s.phase === 'play' &&
		s.current === p &&
		s.step !== 'occupy' &&
		!s.mustTrade &&
		s.reserve[p] === 0
	);
}

/**
 * The armies on each territory with the move into a territory just taken already made, `count` of
 * them (the fewest allowed when left out). A territory taken stands empty until armies move in;
 * the table shows it as it will be.
 */
export function armiesMovedIn(
	s: Pick<CqTable, 'armies' | 'step' | 'occupy'>,
	count?: number | null
): number[] {
	const o = s.step === 'occupy' ? s.occupy : null;
	if (!o) return s.armies;
	const n = Math.max(o.min, Math.min(o.max, count ?? o.min));
	const out = s.armies.slice();
	out[o.from] -= n;
	out[o.to] += n;
	return out;
}

/**
 * Territories of the same player that armies on `from` can march to: through territories of
 * theirs, or only next door if that is the table's rule; never over a sea lane in a Sea Fog, and
 * nowhere in the Floods.
 */
export function fortifyTargets(s: Pick<CqTable, 'settings' | 'owner' | 'omens'>, from: number): number[] {
	const map = conquestMap(s.settings);
	const p = s.owner[from];
	const omen = omenNow(s);
	if (omen === 'floods') return [];
	const step = (t: number) => neighbors(t, map).filter((n) => s.owner[n] === p && !(omen === 'seaFog' && isLane(map, t, n)));
	if (s.settings.fortify === 'adjacent') return step(from).sort((a, b) => a - b);
	const seen = new Set([from]);
	const queue = [from];
	while (queue.length) {
		const t = queue.pop()!;
		for (const n of step(t)) {
			if (seen.has(n)) continue;
			seen.add(n);
			queue.push(n);
		}
	}
	seen.delete(from);
	return [...seen].sort((a, b) => a - b);
}

/** How many fortify moves `p` may make in a turn: one (two for the Horselord), or any number. */
export function fortifyMoves(s: Pick<CqTable, 'settings' | 'players'>, p: number): number {
	if (s.settings.fortify === 'free') return Infinity;
	return warlordOf(s, p) === 'kael' ? 2 : 1;
}

/**
 * The shortest way from `from` to `to` through territories held by from's owner, both ends
 * included (by land or sea lane), or [] if there is none.
 */
export function fortifyRoute(s: Pick<CqTable, 'owner' | 'settings' | 'omens'>, from: number, to: number): number[] {
	const map = conquestMap(s.settings);
	const p = s.owner[from];
	const fog = omenNow(s) === 'seaFog';
	const prev = new Map<number, number>([[from, -1]]);
	const queue = [from];
	while (queue.length) {
		const t = queue.shift()!;
		if (t === to) break;
		for (const n of neighbors(t, map)) {
			if (s.owner[n] !== p || prev.has(n) || (fog && isLane(map, t, n))) continue;
			prev.set(n, t);
			queue.push(n);
		}
	}
	if (!prev.has(to)) return [];
	const path: number[] = [];
	for (let t = to; t !== -1; t = prev.get(t)!) path.push(t);
	return path.reverse();
}

/** Three cards alike, one of each, or any three with a wild among them. */
export function isSet(cards: ConquestCard[]): boolean {
	if (cards.length !== 3) return false;
	if (cards.some((c) => c.symbol === 'wild')) return true;
	const kinds = new Set(cards.map((c) => c.symbol)).size;
	return kinds === 1 || kinds === 3;
}

/** The armies the n-th set traded in the game (counting from 0) is worth with escalating cards. */
export function escalatingValue(n: number): number {
	const first = [4, 6, 8, 10, 12, 15];
	return n < first.length ? first[n] : 15 + 5 * (n - first.length + 1);
}

const FIXED_VALUES = { footman: 4, knight: 6, catapult: 8 } as const;

/**
 * The armies these cards would bring `p` if traded now (0 if they aren't a set), before the
 * territory bonus: the Quartermaster's bring more.
 */
export function setValue(s: Pick<CqTable, 'settings' | 'trades'> & Partial<Pick<CqTable, 'players'>>, cards: ConquestCard[], p?: number): number {
	if (!isSet(cards) || s.settings.cards === 'none') return 0;
	const more = p !== undefined && s.players && warlordOf({ players: s.players }, p) === 'tobin' ? FULL_STORES : 0;
	if (s.settings.cards === 'escalating') return escalatingValue(s.trades) + more;
	const kinds = new Set(cards.map((c) => c.symbol));
	if (kinds.size === 1 && !kinds.has('wild'))
		return FIXED_VALUES[cards[0].symbol as keyof typeof FIXED_VALUES] + more;
	return 10 + more;
}

/** A card pictures a territory `p` holds, and the table pays two armies there for it. */
export function cardBonusTerritory(s: Pick<CqTable, 'settings' | 'owner'>, cards: ConquestCard[], p: number): number | null {
	if (s.settings.cardBonus === false) return null;
	return cards.find((c) => c.territory !== null && s.owner[c.territory] === p)?.territory ?? null;
}

/** Holding this many cards as a turn begins, a set must be traded first. */
export function tradeLimit(s: Pick<CqTable, 'settings'>): number {
	return s.settings.tradeAt ?? 5;
}

/** Some three of these cards make a set (any five always do). */
export function hasSet(cards: ConquestCard[]): boolean {
	for (let i = 0; i < cards.length; i++)
		for (let j = i + 1; j < cards.length; j++) for (let k = j + 1; k < cards.length; k++) if (isSet([cards[i], cards[j], cards[k]])) return true;
	return false;
}

/**
 * A hand this big must be traded down before anything else: at the table's number of cards (one
 * more after taking a knocked-out player's), as long as it holds a set to trade.
 */
export function mustTradeHand(s: Pick<CqTable, 'settings'>, cards: ConquestCard[], over = 0): boolean {
	return s.settings.cards !== 'none' && cards.length >= tradeLimit(s) + over && hasSet(cards);
}

/** What the next set will bring: one number with escalating cards, a range with fixed ones. */
export function nextSetValue(s: Pick<CqTable, 'settings' | 'trades'>): {
	min: number;
	max: number;
} {
	if (s.settings.cards === 'fixed') return { min: 4, max: 10 };
	const v = escalatingValue(s.trades);
	return { min: v, max: v };
}

export interface CardSet {
	cards: ConquestCard[];
	/** Armies to the reserve. */
	armies: number;
	/** The territory that gets two more armies, if any card shows one `p` holds. */
	bonus: number | null;
}

/**
 * The best set in a hand for `p` (the current player unless said): the most armies, counting the
 * two for a territory they hold, and among equals the one that keeps wild cards back. Null if the
 * hand has no set.
 */
export function bestSet(cards: ConquestCard[], s: CqTable, p = s.current): CardSet | null {
	let best: CardSet | null = null;
	let bestScore = -Infinity;
	for (let i = 0; i < cards.length; i++)
		for (let j = i + 1; j < cards.length; j++)
			for (let k = j + 1; k < cards.length; k++) {
				const set = [cards[i], cards[j], cards[k]];
				if (!isSet(set)) continue;
				const armies = setValue(s, set, p);
				const bonus = cardBonusTerritory(s, set, p);
				const wilds = set.filter((c) => c.symbol === 'wild').length;
				const score = (armies + (bonus === null ? 0 : 2)) * 10 - wilds * 3;
				if (score > bestScore) {
					bestScore = score;
					best = { cards: set, armies, bonus };
				}
			}
	return best;
}

/** Territories it takes to win by majority: two thirds of the map. */
export function majorityGoal(map: RealmMap = REALM): number {
	return Math.ceil((map.territories.length * 2) / 3);
}

/** The classic starting armies for a table of 2 to 6, which assume a map of 42 territories. */
const CLASSIC_START: Record<number, number> = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };
/** Fewer or more starting armies: a quarter either way. */
const START_SCALE = { fewer: 0.75, standard: 1, more: 1.25 };

/**
 * Armies each player starts with, scaled to the size of the map and to the table's rule, and
 * never fewer than a few more than the territories they are dealt.
 */
export function startingArmies(players: number, map: RealmMap = REALM, start: keyof typeof START_SCALE = 'standard'): number {
	const classic = ((CLASSIC_START[players] ?? 20) * map.territories.length) / 42;
	return Math.max(Math.ceil(map.territories.length / players) + 3, Math.round(classic * START_SCALE[start]));
}

/**
 * The missions to hold territories, scaled to the map from the classic game's 24 of 42, and 18 of
 * 42 with two armies on each: on the Realm, 20, and 15 with two each.
 */
export function missionHold(map: RealmMap = REALM): { count: number; armies: number } {
	return { count: Math.floor((map.territories.length * 24) / 42), armies: 1 };
}

export function missionGuard(map: RealmMap = REALM): { count: number; armies: number } {
	return { count: Math.floor((map.territories.length * 18) / 42), armies: 2 };
}

/** Every secret mission for a table of `players`: the map's regions, territories, and one to knock out each player. */
export function missionDeck(map: RealmMap, players: number): Mission[] {
	const region = (id: string) => map.regions.findIndex((r) => r.id === id);
	return [
		...map.missionRegions.map((m): Mission => ({ kind: 'regions', regions: m.regions.map(region), extra: m.extra })),
		{ kind: 'territories', ...missionHold(map) },
		{ kind: 'territories', ...missionGuard(map) },
		...Array.from({ length: players }, (_, target): Mission => ({ kind: 'destroy', target }))
	];
}

/** `p` has done what `mission` asks, as the table stands. */
export function missionDone(s: Pick<CqTable, 'settings' | 'owner' | 'armies' | 'players'>, p: number, mission: Mission): boolean {
	switch (mission.kind) {
		case 'regions': {
			const held = regionsHeld(s, p);
			return mission.regions.every((r) => held.includes(r)) && held.length >= mission.regions.length + mission.extra;
		}
		case 'territories': {
			let n = 0;
			for (let t = 0; t < s.owner.length; t++) if (s.owner[t] === p && s.armies[t] >= mission.armies) n++;
			return n >= mission.count;
		}
		case 'destroy':
			return !!s.players[mission.target]?.out;
	}
}
