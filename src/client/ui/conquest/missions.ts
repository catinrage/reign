import { conquestMap, regionTerritories, regionsHeld } from '../../../shared/conquest/queries';
import type { CqView, Mission } from '../../../shared/conquest/types';
import { t } from '../../i18n/index.svelte';
import { playerName, regionName } from './text';

/** Secret missions in words: what each asks, and how far a player has come with it. */

/** What `m` asks, in a sentence. */
export function missionText(v: CqView, m: Mission): string {
	switch (m.kind) {
		case 'regions':
			return regionsText(
				m.regions.map((r) => regionName(v, r)),
				m.extra
			);
		case 'territories':
			return territoriesText(m.count, m.armies);
		case 'destroy':
			return t('Knock {player} out of the war.', { player: playerName(v, m.target) });
	}
}

/** A mission to hold the regions `names` (already in the player's language), and `extra` more. */
export function regionsText(names: string[], extra: number): string {
	const a = names.slice(0, -1).join(', ');
	const b = names[names.length - 1];
	return extra ? t('Hold {a} and {b}, and one more region of your choice.', { a, b }) : t('Hold {a} and {b}.', { a, b });
}

/** A mission to hold `count` territories with `armies` or more on each. */
export function territoriesText(count: number, armies: number): string {
	return armies > 1
		? t('Hold {n} territories with at least {k} armies on each.', { n: count, k: armies })
		: t('Hold {n} territories.', { n: count });
}

/** One part of a mission and how it stands: `done` of `of`, or (knocking a player out) how many territories they have `left`. */
export interface MissionStep {
	label: string;
	done: number;
	of: number;
	left?: number;
}

/** How far `p` has come with `m`, part by part. */
export function missionSteps(v: CqView, p: number, m: Mission): MissionStep[] {
	const map = conquestMap(v.settings);
	switch (m.kind) {
		case 'regions': {
			const regions = regionTerritories(map);
			const steps: MissionStep[] = m.regions.map((r) => ({
				label: regionName(v, r),
				done: regions[r].filter((x) => v.owner[x] === p).length,
				of: regions[r].length
			}));
			if (m.extra) {
				const others = regionsHeld(v, p).filter((r) => !m.regions.includes(r)).length;
				steps.push({ label: t('Another whole region'), done: Math.min(others, m.extra), of: m.extra });
			}
			return steps;
		}
		case 'territories': {
			const n = v.owner.filter((o, x) => o === p && v.armies[x] >= m.armies).length;
			return [{ label: m.armies > 1 ? t('Territories with {k} armies or more', { k: m.armies }) : t('Territories'), done: Math.min(n, m.count), of: m.count }];
		}
		case 'destroy': {
			const left = v.owner.filter((o) => o === m.target).length;
			return [{ label: t('Territories {player} still holds', { player: playerName(v, m.target) }), done: left ? 0 : 1, of: 1, left }];
		}
	}
}

/** How far along a mission is, in a few characters: "12/20", or a knocked-out player's territories left. */
export function missionShort(v: CqView, p: number, m: Mission): string {
	const steps = missionSteps(v, p, m);
	if (m.kind === 'destroy') return String(steps[0].left ?? 0);
	const done = steps.reduce((n, s) => n + s.done, 0);
	const of = steps.reduce((n, s) => n + s.of, 0);
	return `${done}/${of}`;
}
