import { platform } from '../../platform';
import { client } from '../../state/client.svelte';

/**
 * Play a mission with a head start (HEAD_START: one of each card), the reward for watching a
 * rewarded ad on sites that have them (site.rewarded). False if the ad wasn't watched to the end.
 */
export async function playWithHeadStart(id: string): Promise<boolean> {
	if (!(await platform.rewardedAd())) return false;
	client.playMission(id, true);
	return true;
}
