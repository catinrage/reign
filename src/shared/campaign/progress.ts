import type { MissionResult } from '../rules/campaign';
import { missionById } from './missions';

/** The best a player has done on a mission they have won. */
export interface MissionRecord {
	/** Most stars earned in one game, 1 to 3. */
	stars: number;
	/** The fewest rounds a win took. */
	bestRound: number;
}

/** A player's campaign: their record on every mission they have won, by mission id. */
export type CampaignProgress = Record<string, MissionRecord>;

/** The progress with a finished mission counted in (only a win changes it). */
export function withResult(progress: CampaignProgress, mission: string, r: MissionResult): CampaignProgress {
	if (!r.won || !missionById(mission)) return progress;
	const was = progress[mission];
	return {
		...progress,
		[mission]: {
			stars: Math.max(was?.stars ?? 0, r.stars),
			bestRound: Math.min(was?.bestRound ?? Infinity, r.round)
		}
	};
}

/** Progress read from storage or a request, with anything unknown or broken dropped. */
export function cleanProgress(raw: unknown): CampaignProgress {
	const out: CampaignProgress = {};
	if (!raw || typeof raw !== 'object') return out;
	for (const [id, rec] of Object.entries(raw as Record<string, unknown>)) {
		const r = rec as Partial<MissionRecord> | null;
		if (!missionById(id) || !r) continue;
		const stars = Math.round(Number(r.stars));
		const bestRound = Math.round(Number(r.bestRound));
		if (stars >= 1 && stars <= 3 && bestRound >= 1) out[id] = { stars, bestRound };
	}
	return out;
}
