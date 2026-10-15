<script lang="ts">
	import { REALM } from '../../../../shared/conquest/realm';
	import { missionGuard, missionHold } from '../../../../shared/conquest/queries';
	import { MISSION_MIN_PLAYERS } from '../../../../shared/conquest/types';
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { CQ_PIXEL } from '../../conquest/icons';
	import { regionsText, territoriesText } from '../../conquest/missions';

	const regionName = (id: string) => t(REALM.regions.find((r) => r.id === id)?.name ?? id);
	const hold = missionHold();
	const guard = missionGuard();
</script>

<p>
	{t('Pick Missions in the lobby (for {n} players or more) and everyone draws a secret mission as the war begins. Complete yours and you win at once, even halfway through your turn. Taking every territory still wins too.', { n: MISSION_MIN_PLAYERS })}
</p>

<h3>{t('The missions')}</h3>
<ul class="rows">
	{#each REALM.missionRegions as m, i (i)}
		<li><img class="icon-px" src={CQ_PIXEL.flag} alt="" /><span>{regionsText(m.regions.map(regionName), m.extra)}</span></li>
	{/each}
	<li><img class="icon-px" src={CQ_PIXEL.troops} alt="" /><span>{territoriesText(hold.count, hold.armies)}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.troops} alt="" /><span>{territoriesText(guard.count, guard.armies)}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.skull} alt="" /><span>{t('Knock a given player out of the war (there is one such card for every player at the table, and nobody is sent after themselves).')}</span></li>
</ul>

<h3>{t('Keeping it secret')}</h3>
<ul class="rows">
	<li><img class="icon-px" src={PIXEL.letter} alt="" /><span>{t('Only you see your mission. The chip beside the round shows how far along it is; click it to see the card again.')}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.skull} alt="" /><span>{t('If someone else knocks out the player you were sent after, your mission becomes holding {n} territories.', { n: hold.count })}</span></li>
	<li><img class="icon-px" src={PIXEL.eye} alt="" /><span>{t("When the war is over, everyone's mission is shown.")}</span></li>
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span>{t('Watch where the others push: a player gathering two regions, or hunting one rival, may be close to winning.')}</span>
</p>
