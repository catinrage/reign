import { CROWN_CHOICES, DEFAULT_GAMBIT_SETTINGS, ORDER_CHOICES, ROUND_CHOICES, TERRAIN_RULES, type GambitSettings } from './types';

/** A table's Gambit settings as the host sent them, made safe: anything unknown goes back to the default. */
export function cleanGambitSettings(input: unknown): GambitSettings {
	const s = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof GambitSettings, unknown>>;
	const d = DEFAULT_GAMBIT_SETTINGS;
	const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
	const seed = Number(s.seed);
	return {
		orders: pick(Number(s.orders), ORDER_CHOICES, d.orders as (typeof ORDER_CHOICES)[number]),
		crowns: pick(Number(s.crowns), CROWN_CHOICES, d.crowns as (typeof CROWN_CHOICES)[number]),
		rounds: pick(Number(s.rounds), ROUND_CHOICES, d.rounds as (typeof ROUND_CHOICES)[number]),
		terrain: pick(s.terrain, TERRAIN_RULES, d.terrain),
		seed: Number.isInteger(seed) ? seed | 0 : d.seed
	};
}
