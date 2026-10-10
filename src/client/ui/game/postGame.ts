import { RESOURCES, type Resource } from '../../../shared/rules/config';
import { rollOdds, type GameStats, type PlayerStats } from '../../../shared/rules/stats';

/** One line of the end-of-game honors: who earned it and the numbers behind it. */
export type Honor =
	| {
			kind: 'lucky' | 'unlucky';
			players: number[];
			got: number;
			expected: number;
			longShots: number;
			robbed: number;
	  }
	| { kind: 'haul'; players: number[]; n: number; total: number }
	| { kind: 'builder' | 'thief' | 'trader' | 'target' | 'scholar'; players: number[]; n: number };

/** How many cards the dice paid beyond (or short of) what the odds promised. */
export function luck(p: PlayerStats): number {
	return p.rolled - p.expected;
}

/** Who holds the most of something, ties shared; nobody when the best is nothing. */
function top(
	stats: GameStats,
	value: (p: PlayerStats) => number,
	min = 1
): { players: number[]; n: number } | null {
	const values = stats.players.map(value);
	const n = Math.max(...values);
	if (n < min) return null;
	return { players: values.flatMap((v, i) => (v === n ? [i] : [])), n };
}

/**
 * The honors handed out at the end: the luckiest and unluckiest player with the dice, then the
 * other records worth a line. Records nobody set are left out.
 */
export function honors(stats: GameStats, limit = 6): Honor[] {
	const out: Honor[] = [];
	const ps = stats.players;
	const rolls = stats.rolls.reduce((a, b) => a + b, 0);
	if (ps.length > 1 && rolls > 0) {
		// Ranked by how far off the odds a player ran for the cards they could expect: a swing of
		// five cards means more to a player with few tiles than to one with a city on every number.
		const by = ps
			.map((p, i) => ({ p, i, luck: luck(p) / Math.sqrt(Math.max(1, p.expected)) }))
			.sort((a, b) => b.luck - a.luck);
		const best = by[0];
		const worst = by[by.length - 1];
		// A table where everyone got about their odds has nobody to name.
		if (best.luck - worst.luck >= 0.1) {
			for (const [kind, x] of [
				['lucky', best],
				['unlucky', worst]
			] as const) {
				out.push({
					kind,
					players: [x.i],
					got: x.p.rolled,
					expected: Math.round(x.p.expected),
					longShots: x.p.longShots,
					robbed: x.p.robbed
				});
			}
		}
	}
	if (stats.bestHaul && stats.bestHaul.cards > 1) {
		out.push({
			kind: 'haul',
			players: [stats.bestHaul.player],
			n: stats.bestHaul.cards,
			total: stats.bestHaul.total
		});
	}
	const records: [
		Exclude<Honor['kind'], 'lucky' | 'unlucky' | 'haul'>,
		(p: PlayerStats) => number,
		number
	][] = [
		['builder', (p) => p.built, 1],
		['thief', (p) => p.stolen, 1],
		['trader', (p) => p.trades, 1],
		['target', (p) => p.lost + p.robbed, 1],
		['scholar', (p) => p.devCards, 2]
	];
	for (const [kind, value, min] of records) {
		const t = top(stats, value, min);
		// A record everyone shares says nothing.
		if (t && t.players.length < ps.length) out.push({ kind, ...t });
	}
	return out.slice(0, limit);
}

/** Per resource, the players who gathered the most of it (none when nobody gathered any). */
export function gatherLeaders(stats: GameStats): Record<Resource, number[]> {
	const out = {} as Record<Resource, number[]>;
	for (const r of RESOURCES) out[r] = top(stats, (p) => p.gained[r])?.players ?? [];
	return out;
}

/** Each total from 2 to 12: how often it came up and how often the odds said it would. */
export function diceChart(stats: GameStats): { total: number; count: number; expected: number }[] {
	const rolls = stats.rolls.reduce((a, b) => a + b, 0);
	const out = [];
	for (let total = 2; total <= 12; total++)
		out.push({ total, count: stats.rolls[total] ?? 0, expected: rolls * rollOdds(total) });
	return out;
}
