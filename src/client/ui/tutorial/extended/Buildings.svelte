<script lang="ts">
	import { BUILDING_INFO, EXTRA_BUILDINGS, WORKSHOP_LIMIT, WORKSHOP_NAME } from '../../../../shared/rules/buildings';
	import { COSTS, type Resource } from '../../../../shared/rules/config';
	import { getIcons } from '../../../scene/icons';
	import { countsList } from '../../helpers';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
	const LIMIT: Record<string, number> = { workshop: WORKSHOP_LIMIT };
	/** The tile each workshop stands on, and what it does there. */
	const KINDS: Record<Resource, { tile: string; work: string }> = {
		wheat: { tile: 'Fields', work: 'Its sails turn in the wind.' },
		wood: { tile: 'Forest', work: 'A water wheel drives the saw.' },
		brick: { tile: 'Hills', work: 'The bottle kiln smokes as it fires.' },
		ore: { tile: 'Mountains', work: 'A cart rolls out under the pulley.' },
		sheep: { tile: 'Pasture', work: 'Two sheep wander the pen.' }
	};
	const order: Resource[] = ['wheat', 'wood', 'brick', 'ore', 'sheep'];
</script>

<p>
	Reign Extended adds buildings that do jobs settlements and cities don't. The host switches each one on
	or off under <b>Buildings</b> in the lobby, and all of them are on unless the host says otherwise. Bots
	build them too.
</p>

<div class="costs">
	{#each EXTRA_BUILDINGS as b (b)}
		<div class="cost">
			<img class="piece" src={icons[`${b}:red`]} alt="" />
			<div class="what">
				<div class="head">
					<b class="title">{BUILDING_INFO[b].name}</b>
					<span class="res">
						{#each countsList(COSTS[b]) as c (c.res)}
							{#each Array(c.n) as _, k (k)}<img src={icons[c.res]} alt={c.res} />{/each}
						{/each}
					</span>
				</div>
				<span>{BUILDING_INFO[b].text}</span>
			</div>
			{#if LIMIT[b]}<span class="limit" title="How many each player can build">×{LIMIT[b]}</span>{/if}
		</div>
	{/each}
</div>

<h3>Workshops</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.hammer} alt="" /><span
			>Once you have rolled, pick <b>Workshop</b> in the build panel and click a tile next to one of your
			settlements or cities. Each tile holds one workshop, so whoever builds first has it.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.cards} alt="" /><span
			>Whenever the tile pays you, its workshop adds one more card: a settlement there brings you two, a
			city three.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.lock} alt="" /><span
			>The robber stops a workshop along with its tile, and when the bank runs short of a resource
			nobody gets it, workshop or not.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.trade} alt="" /><span
			>Found a better tile? Once you have rolled, pick <b>Tear down</b> and click one of your
			workshops: it's gone, the bank gives you back a Lumber, and you can build it somewhere else.</span
		>
	</li>
</ul>

<div class="kinds">
	{#each order as r (r)}
		<div class="kind">
			<img class="piece" src={icons[`workshop:${r}`]} alt="" />
			<div class="what">
				<b class="title">{WORKSHOP_NAME[r]}</b>
				<span class="tile"><img src={icons[r]} alt="" />{KINDS[r].tile}</span>
				<span class="rule">{KINDS[r].work}</span>
			</div>
		</div>
	{/each}
</div>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>A workshop pays when its tile does, so put it where the number comes up often: a 6 or an 8 is rolled
		five times as often as a 2 or a 12.</span
	>
</p>

<h3>Stone roads</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.hammer} alt="" /><span
			>Once you have rolled, pick <b>Stone road</b> in the build panel and click one of your roads to pave
			it. It stays your road, and paving doesn't use up a road from your supply.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.road} alt="" /><span
			>A stone road counts as two roads towards the Longest Road: a trail of four roads with two of them
			paved is six long.</span
		>
	</li>
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>Paving makes a trail longer without needing room to build, so it can win the Longest Road on an
		island crowded with other people's roads.</span
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
