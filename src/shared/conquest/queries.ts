import { REALM, realmNeighbors, type RealmMap } from './realm';
import type { ConquestCard, ConquestSettings, CqPhase, CqStep, Occupation } from './types';

/**
 * Questions about a game of Conquest that the rules, the bots and the table all ask. Each takes
 * either the full state or a player's view, so it only reads what both of them have.
 */
export interface CqTable {
	settings: ConquestSettings;
	owner: number[];
	armies: number[];
	players: { out: boolean }[];
	phase: CqPhase;
	step: CqStep;
	current: number;
	reserve: number[];
	placed: number[];
	occupy: Occupation | null;
	mustTrade: boolean;
	trades: number;
}

/** The map a game is played on. The Realm is the only one so far, so every id gets it. */
export function conquestMap(_settings?: ConquestSettings): RealmMap {
	return REALM;
}

const neighborCache = new Map<RealmMap, number[][]>();
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
export function regionsHeld(s: CqTable, p: number): number[] {
	return regionTerritories(conquestMap(s.settings)).flatMap((ts, r) =>
		ts.every((t) => s.owner[t] === p) ? [r] : []
	);
}

/**
 * The armies `p` gets at the start of a turn: a third of their territories (never fewer than
 * three), and each region's bonus for holding all of it.
 */
export function reinforcementsFor(s: CqTable, p: number) {
	const map = conquestMap(s.settings);
	const territories = territoriesOf(s, p).length;
	const base = Math.max(3, Math.floor(territories / 3));
	const regions = regionsHeld(s, p).map((region) => ({ region, bonus: map.regions[region].bonus }));
	return { territories, base, regions, total: base + regions.reduce((n, r) => n + r.bonus, 0) };
}

/** Enemy territories next to `from`. */
export function attackTargets(s: CqTable, from: number): number[] {
	return neighbors(from, conquestMap(s.settings)).filter((n) => s.owner[n] !== s.owner[from]);
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

/** Territories of the same player that armies on `from` can march to, through territories of theirs. */
export function fortifyTargets(s: CqTable, from: number): number[] {
	const map = conquestMap(s.settings);
	const p = s.owner[from];
	const seen = new Set([from]);
	const queue = [from];
	while (queue.length) {
		const t = queue.pop()!;
		for (const n of neighbors(t, map)) {
			if (s.owner[n] !== p || seen.has(n)) continue;
			seen.add(n);
			queue.push(n);
		}
	}
	seen.delete(from);
	return [...seen].sort((a, b) => a - b);
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

/** The armies these cards would bring if traded now (0 if they aren't a set), before the territory bonus. */
export function setValue(s: Pick<CqTable, 'settings' | 'trades'>, cards: ConquestCard[]): number {
	if (!isSet(cards)) return 0;
	if (s.settings.cards === 'escalating') return escalatingValue(s.trades);
	const kinds = new Set(cards.map((c) => c.symbol));
	if (kinds.size === 1 && !kinds.has('wild'))
		return FIXED_VALUES[cards[0].symbol as keyof typeof FIXED_VALUES];
	return 10;
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
				const armies = setValue(s, set);
				const bonus =
					set.find((c) => c.territory !== null && s.owner[c.territory] === p)?.territory ?? null;
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

/** Armies each player starts with, scaled to the size of the map. */
export function startingArmies(players: number, map: RealmMap = REALM): number {
	return Math.round(((CLASSIC_START[players] ?? 20) * map.territories.length) / 42);
}
