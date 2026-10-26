/**
 * What the site the game runs on asks of it while it plays (CrazyGames' game settings), set by
 * platform/crazygames.ts. Elsewhere it stays as it is here.
 */
export const site = $state({
	/** No chat: the chronicle shows no one's words and nobody can send pigeons. */
	chatOff: false,
	/** The site shows rewarded ads (platform.rewardedAd): the campaign offers a head start for one. */
	rewarded: false
});
