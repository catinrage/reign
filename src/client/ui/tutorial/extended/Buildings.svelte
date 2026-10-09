<script lang="ts">
	import {
		BUILDING_INFO,
		EXTRA_BUILDINGS,
		STOREHOUSE_SAFE,
		WORKSHOP_LIMIT,
		WORKSHOP_NAME
	} from '../../../../shared/rules/buildings';
	import { COSTS, RESOURCE_LABEL, type Resource } from '../../../../shared/rules/config';
	import Rich from '../../../i18n/Rich.svelte';
	import { msg, t } from '../../../i18n/index.svelte';
	import { getIcons } from '../../../scene/icons';
	import { countsList } from '../../helpers';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
	const LIMIT: Record<string, number> = { workshop: WORKSHOP_LIMIT, storehouse: 1 };
	/** The tile each workshop stands on, and what it does there. */
	const KINDS: Record<Resource, { tile: string; work: string }> = {
		wheat: { tile: msg('Fields'), work: msg('Its sails turn in the wind.') },
		wood: { tile: msg('Forest'), work: msg('A water wheel drives the saw.') },
		brick: { tile: msg('Hills'), work: msg('The bottle kiln smokes as it fires.') },
		ore: { tile: msg('Mountains'), work: msg('A cart rolls out under the pulley.') },
		sheep: { tile: msg('Pasture'), work: msg('Two sheep wander the pen.') }
	};
	const order: Resource[] = ['wheat', 'wood', 'brick', 'ore', 'sheep'];
</script>

{#snippet bBuildings()}<b>{t('Buildings')}</b>{/snippet}
{#snippet bWorkshop()}<b>{t('Workshop')}</b>{/snippet}
{#snippet bTearDown()}<b>{t('Tear down')}</b>{/snippet}
{#snippet bStoneRoad()}<b>{t('Stone road')}</b>{/snippet}
{#snippet bStorehouse()}<b>{t('Storehouse')}</b>{/snippet}

<p>
	<Rich
		text={t("Reign Extended adds buildings that do jobs settlements and cities don't. The host switches each one on or off under {buildings} in the lobby, and all of them are on unless the host says otherwise. Bots build them too.")}
		slots={{ buildings: bBuildings }}
	/>
</p>

<div class="costs">
	{#each EXTRA_BUILDINGS as b (b)}
		<div class="cost">
			<img class="piece" src={icons[`${b}:red`]} alt="" />
			<div class="what">
				<div class="head">
					<b class="title">{t(BUILDING_INFO[b].name)}</b>
					<span class="res">
						{#each countsList(COSTS[b]) as c (c.res)}
							{#each Array(c.n) as _, k (k)}<img src={icons[c.res]} alt={t(RESOURCE_LABEL[c.res])} />{/each}
						{/each}
					</span>
				</div>
				<span>{t(BUILDING_INFO[b].text)}</span>
			</div>
			{#if LIMIT[b]}<span class="limit" title={t('How many each player can build')}>×{LIMIT[b]}</span>{/if}
		</div>
	{/each}
</div>

<h3>{t('Workshops')}</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.hammer} alt="" /><span
			><Rich
				text={t('Once you have rolled, pick {workshop} in the build panel and click a tile next to one of your settlements or cities. Each tile holds one workshop, so whoever builds first has it.')}
				slots={{ workshop: bWorkshop }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.cards} alt="" /><span
			>{t('Whenever the tile pays you, its workshop adds one more card: a settlement there brings you two, a city three.')}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.lock} alt="" /><span
			>{t('The robber stops a workshop along with its tile, and when the bank runs short of a resource nobody gets it, workshop or not.')}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.trade} alt="" /><span
			><Rich
				text={t("Found a better tile? Once you have rolled, pick {tearDown} and click one of your workshops: it's gone, the bank gives you back a Lumber, and you can build it somewhere else.")}
				slots={{ tearDown: bTearDown }}
			/></span
		>
	</li>
</ul>

<div class="kinds">
	{#each order as r (r)}
		<div class="kind">
			<img class="piece" src={icons[`workshop:${r}`]} alt="" />
			<div class="what">
				<b class="title">{t(WORKSHOP_NAME[r])}</b>
				<span class="tile"><img src={icons[r]} alt="" />{t(KINDS[r].tile)}</span>
				<span class="rule">{t(KINDS[r].work)}</span>
			</div>
		</div>
	{/each}
</div>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t('A workshop pays when its tile does, so put it where the number comes up often: a 6 or an 8 is rolled five times as often as a 2 or a 12.')}</span
	>
</p>

<h3>{t('Stone roads')}</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.hammer} alt="" /><span
			><Rich
				text={t("Once you have rolled, pick {stoneRoad} in the build panel and click one of your roads to pave it. It stays your road, and paving doesn't use up a road from your supply.")}
				slots={{ stoneRoad: bStoneRoad }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.road} alt="" /><span
			>{t('A stone road counts as two roads towards the Longest Road: a trail of four roads with two of them paved is six long.')}</span
		>
	</li>
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t("Paving makes a trail longer without needing room to build, so it can win the Longest Road on an island crowded with other people's roads.")}</span
	>
</p>

<h3>{t('Storehouses')}</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.hammer} alt="" /><span
			><Rich
				text={t('Once you have rolled, pick {storehouse} in the build panel and click one of your settlements or cities. You can have one, and it stays with its settlement when that grows into a city.')}
				slots={{ storehouse: bStorehouse }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.lock} alt="" /><span
			>{t('It keeps {safe} of your cards safe: nothing takes one of your last {safe} at random, not the robber, a character or an event.', { safe: STOREHOUSE_SAFE })}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			>{t("On a 7 those {safe} don't count towards your hand: you can hold {safe} more cards than usual, and if you do have to discard, you give back half of the cards beyond them.", { safe: STOREHOUSE_SAFE })}</span
		>
	</li>
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t("A storehouse is worth most while you save up for a city or a big trade, and with {safe} cards or fewer in hand the robber can't steal from you at all.", { safe: STOREHOUSE_SAFE })}</span
	>
</p>

<style>
	.costs {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.cost,
	.kind {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px 12px;
		background: rgba(255, 250, 235, 0.5);
		box-shadow: inset 0 0 0 2px rgba(138, 98, 54, 0.3);
	}
	.piece {
		width: 58px;
		height: 58px;
		object-fit: contain;
		flex: none;
		filter: drop-shadow(0 3px 2px rgba(60, 30, 10, 0.35));
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.35;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.head .title {
		font-size: 18px;
	}
	.cost .res img {
		width: 26px;
		height: 26px;
	}
	.limit {
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		color: #8a6236;
	}
	.kinds {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin: 4px 0;
	}
	.kind .title {
		font-size: 17px;
	}
	.tile {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 14px;
		color: var(--ink-soft);
	}
	.tile img {
		width: 20px;
		height: 20px;
	}
	.rule {
		font-size: 13.5px;
		color: var(--ink-soft);
	}
	@media (max-width: 760px) {
		.kinds {
			grid-template-columns: 1fr;
		}
	}
</style>
