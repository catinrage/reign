<script lang="ts">
	import { REALM } from '../../../../shared/conquest/realm';
	import { majorityGoal } from '../../../../shared/conquest/queries';
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { CQ_PIXEL } from '../../conquest/icons';
</script>

<p>
	{t('Conquest is a game of territorial war on the Realm: {n} territories in six regions, joined by borders and by sea lanes. Every territory always belongs to someone, with at least one army on it.', { n: REALM.territories.length })}
</p>

<h3>{t('How to win')}</h3>
<ul class="rows">
	<li><img class="icon-px" src={PIXEL.crown} alt="" /><span>{t('Conquest (the standard rule): take every territory on the map.')}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.flag} alt="" /><span>{t('Majority: be the first to hold {n} territories, two thirds of the Realm.', { n: majorityGoal() })}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.skull} alt="" /><span>{t('Lose your last territory and you are out. Whoever took it gets your cards.')}</span></li>
</ul>

<h3>{t('The regions')}</h3>
<div class="regions">
	{#each REALM.regions as r (r.id)}
		<div class="region"><i style="background:{r.color}"></i><b>{t(r.name)}</b><span>+{r.bonus}</span></div>
	{/each}
</div>
<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t('Hold every territory of a region at the start of your turn and it brings that many extra armies. Hover a territory on the board to see its region.')}</span
	>
</p>
<p class="tip">
	<img class="icon-px" src={PIXEL.anchor} alt="" /><span
		>{t('Dotted sea lanes with a little ship join islands and coasts across the water. Territories joined by a lane are neighbours, just like ones that share a border.')}</span
	>
</p>

<style>
	.regions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 6px;
		margin-bottom: 10px;
	}
	.region {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		background: rgba(255, 250, 235, 0.55);
		box-shadow: inset 0 0 0 2px rgba(138, 98, 54, 0.35);
	}
	.region i {
		width: 14px;
		height: 14px;
		box-shadow: 0 0 0 2px #3a2214;
	}
	.region b {
		flex: 1;
	}
	.region span {
		font-family: var(--px);
		font-weight: 700;
		font-size: 18px;
		color: #b8740f;
	}
</style>
