import {
	DEFAULT_CONQUEST_SETTINGS,
	DEFAULT_WORLD,
	WORLD_MAX_REGIONS,
	WORLD_MAX_TERRITORIES,
	WORLD_MIN_REGIONS,
	WORLD_MIN_TERRITORIES,
	type CardRule,
	type Climate,
	type ConquestSettings,
	type DeployRule,
	type FortifyRule,
	type LaneRule,
	type OmenRule,
	type StartRule,
	type VictoryRule,
	type WorldOptions,
	type WorldShape
} from './types';

export const CARD_RULES: CardRule[] = ['escalating', 'fixed', 'none'];
export const VICTORY_RULES: VictoryRule[] = ['domination', 'majority', 'missions'];
export const DEPLOY_RULES: DeployRule[] = ['placed', 'random'];
export const START_RULES: StartRule[] = ['fewer', 'standard', 'more'];
export const FORTIFY_RULES: FortifyRule[] = ['connected', 'adjacent', 'free'];
export const OMEN_RULES: OmenRule[] = ['off', 'gentle', 'wild'];
export const WORLD_SHAPES: WorldShape[] = ['continents', 'pangaea', 'archipelago', 'ring'];
export const LANE_RULES: LaneRule[] = ['few', 'some', 'many'];
export const CLIMATES: Climate[] = ['mixed', 'frozen', 'desert', 'verdant'];
/** The maps Conquest is played on: the Realm, or a random world. */
export const CONQUEST_MAPS = ['realm', 'random'] as const;
/** The choices for the fewest armies a turn brings, and for how many cards force a trade. */
export const MIN_REINFORCE_CHOICES = [2, 3, 4, 5];
export const TRADE_AT_CHOICES = [4, 5, 6, 7];

const pick = <T>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** A whole number from `v` kept between `lo` and `hi`, or the fallback. */
function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
	const n = Math.round(Number(v));
	return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

/** The most regions a world of `territories` can have: three territories each at least. */
export function maxRegions(territories: number): number {
	return Math.max(WORLD_MIN_REGIONS, Math.min(WORLD_MAX_REGIONS, Math.floor(territories / 3)));
}

/** A random world's options from a client, each one checked. */
export function cleanWorld(w: Partial<WorldOptions> | null | undefined): WorldOptions {
	const d = DEFAULT_WORLD;
	const territories = clampInt(w?.territories, WORLD_MIN_TERRITORIES, WORLD_MAX_TERRITORIES, d.territories);
	const most = maxRegions(territories);
	return {
		territories,
		shape: pick(WORLD_SHAPES, w?.shape, d.shape),
		regions: clampInt(w?.regions, WORLD_MIN_REGIONS, most, Math.min(d.regions, most)),
		lanes: pick(LANE_RULES, w?.lanes, d.lanes),
		climate: pick(CLIMATES, w?.climate, d.climate),
		seed: Number.isInteger(w?.seed) ? (w!.seed as number) | 0 : d.seed
	};
}

/** Conquest settings from a client, each one checked: anything unknown keeps its default. */
export function cleanConquestSettings(s: Partial<ConquestSettings> | null | undefined): ConquestSettings {
	const d = DEFAULT_CONQUEST_SETTINGS;
	return {
		map: pick(CONQUEST_MAPS, s?.map, d.map),
		world: cleanWorld(s?.world),
		cards: pick(CARD_RULES, s?.cards, d.cards),
		cardBonus: typeof s?.cardBonus === 'boolean' ? s.cardBonus : d.cardBonus,
		tradeAt: pick(TRADE_AT_CHOICES, s?.tradeAt, d.tradeAt),
		victory: pick(VICTORY_RULES, s?.victory, d.victory),
		deploy: pick(DEPLOY_RULES, s?.deploy, d.deploy),
		start: pick(START_RULES, s?.start, d.start),
		minReinforce: pick(MIN_REINFORCE_CHOICES, s?.minReinforce, d.minReinforce),
		fortify: pick(FORTIFY_RULES, s?.fortify, d.fortify),
		fog: typeof s?.fog === 'boolean' ? s.fog : d.fog,
		warlords: typeof s?.warlords === 'boolean' ? s.warlords : d.warlords,
		omens: pick(OMEN_RULES, s?.omens, d.omens)
	};
}
