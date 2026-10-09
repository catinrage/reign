<script lang="ts">
	import { COSTS, PIECE_LIMITS, RESOURCE_LABEL, type BuildKind } from '../../../../shared/rules/config';
	import { msg, t } from '../../../i18n/index.svelte';
	import { getIcons } from '../../../scene/icons';
	import { countsList } from '../../helpers';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
	// name, worth and rule are marked with msg() and shown through t().
	const builds: {
		kind: BuildKind;
		name: string;
		worth: string;
		rule: string;
		icon: string;
		limit?: number;
	}[] = [
		{
			kind: 'road',
			name: msg('Road'),
			worth: msg('No points, but counts toward Longest Road.'),
			rule: msg('Goes on an edge next to one of your roads, settlements or cities.'),
			icon: icons['road:red'],
			limit: PIECE_LIMITS.road
		},
		{
			kind: 'settlement',
			name: msg('Settlement'),
			worth: msg('1 point.'),
			rule: msg('Goes on an empty corner touched by your road, at least two steps from any other town.'),
			icon: icons['settlement:red'],
			limit: PIECE_LIMITS.settlement
		},
		{
			kind: 'city',
			name: msg('City'),
			worth: msg('2 points, and it collects two cards per roll.'),
			rule: msg('Replaces one of your settlements, which goes back to your supply.'),
			icon: icons['city:red'],
			limit: PIECE_LIMITS.city
		},
		{
			kind: 'devCard',
			name: msg('Development card'),
			worth: msg('Drawn face down from the deck.'),
			rule: msg('See the Development cards chapter.'),
			icon: PIXEL.dev
		}
	];
</script>

<p>
	{t('Once you have rolled, open the build panel and pick what to build. The island lights up the spots you can use.')}
</p>

<div class="costs">
	{#each builds as b (b.kind)}
		<div class="cost">
			<img class="piece" class:icon-px={b.kind === 'devCard'} src={b.icon} alt="" />
			<div class="what">
				<div class="head">
					<b class="title">{t(b.name)}</b>
					<span class="res">
						{#each countsList(COSTS[b.kind]) as c (c.res)}
							{#each Array(c.n) as _, k (k)}<img src={icons[c.res]} alt={t(RESOURCE_LABEL[c.res])} />{/each}
						{/each}
					</span>
				</div>
				<span>{t(b.worth)}</span>
				<span class="rule">{t(b.rule)}</span>
			</div>
			{#if b.limit}<span class="limit" title={t('Pieces each player has')}>×{b.limit}</span>{/if}
		</div>
	{/each}
</div>

<h3>{t('Your supply')}</h3>
<p>
	{t(
		"Each player has {roads, plural, one {# road} other {# roads}}, {settlements, plural, one {# settlement} other {# settlements}} and {cities, plural, one {# city} other {# cities}}. When a piece runs out you can't build more of it, so upgrading settlements to cities frees them up to build again.",
		{ roads: PIECE_LIMITS.road, settlements: PIECE_LIMITS.settlement, cities: PIECE_LIMITS.city }
	)}
</p>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t(
			'Settlements need fresh corners to grow into, and roads are how you reach them. Plan your roads toward the corners you want before someone else takes them.'
		)}</span
	>
</p>

<style>
	.costs {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.cost {
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
	.piece.icon-px {
		width: 42px;
		height: 42px;
		margin: 0 8px;
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
	.rule {
		font-size: 13.5px;
		color: var(--ink-soft);
	}
	.limit {
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		color: #8a6236;
	}
</style>
