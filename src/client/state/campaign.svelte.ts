import { MISSIONS, missionOpen } from '../../shared/campaign/missions';
import { cleanProgress, withResult, type CampaignProgress } from '../../shared/campaign/progress';
import type { MissionResult } from '../../shared/rules/campaign';
import { api } from './account.svelte';

/**
 * The player's solo campaign: the missions they have won and their best on each, from their account
 * (or this browser, offline). A mission won in a game counts here at once; the server keeps it too.
 */
class Campaign {
	progress = $state<CampaignProgress>({});
	loaded = $state(false);
	/** The campaign screen is open over the main menu. */
	open = $state(false);
	/** The mission picked on the campaign screen. */
	picked = $state<string | null>(null);
	/** Dev builds only: every mission open, to try any of them. */
	unlocked = $state(false);

	async load() {
		try {
			const res = await api<{ progress: unknown }>('campaign');
			this.progress = cleanProgress(res.progress);
			this.loaded = true;
		} catch {
			/* Shown as no progress; the next look tries again. */
		}
	}

	won(id: string): boolean {
		return !!this.progress[id];
	}

	isOpen(id: string): boolean {
		return this.unlocked || missionOpen(id, (m) => this.won(m));
	}

	/** Stars earned across the campaign, and the most there are. */
	get stars(): { have: number; of: number } {
		return { have: Object.values(this.progress).reduce((n, r) => n + r.stars, 0), of: MISSIONS.length * 3 };
	}

	/** The first open mission not yet won (where the story goes on), else the last one. */
	get current(): string {
		return (MISSIONS.find((m) => this.isOpen(m.id) && !this.won(m.id)) ?? MISSIONS[MISSIONS.length - 1]).id;
	}

	record(mission: string, result: MissionResult) {
		this.progress = withResult(this.progress, mission, result);
	}
}

export const campaign = new Campaign();
