<script lang="ts">
	import {
		RESOURCE_LABEL,
		STANDARD_NUMBER_POOL,
		STANDARD_PORT_POOL,
		STANDARD_TERRAIN_POOL,
		TERRAIN_RESOURCE,
		TERRAINS
	} from '../../../../shared/rules/config';
	import { getIcons } from '../../../scene/icons';
	import { TERRAIN_NAME } from '../../extended/terrainColors';
	import { PIXEL } from '../../pixel';
	import HexTile from '../bits/HexTile.svelte';
	import Token from '../bits/Token.svelte';
	import { TUT_ICON } from '../icons';

	const icons = getIcons().urls;
	const count = (t: string) => STANDARD_TERRAIN_POOL.filter((x) => x === t).length;
	const numbers = [...new Set(STANDARD_NUMBER_POOL)];
	const anyPorts = STANDARD_PORT_POOL.filter((p) => p === 'any').length;
</script>

<p>
	The Classic island has <b>{STANDARD_TERRAIN_POOL.length} tiles</b>, shuffled for every game. Each
	kind of land yields one resource card:
</p>

<div class="figure terrains">
	{#each TERRAINS as t (t)}
		{@const res = TERRAIN_RESOURCE[t]}
		<div class="land">
			<HexTile terrain={t} size={78} />
			<b>{TERRAIN_NAME[t]}</b>
			<span class="yield">{res ? RESOURCE_LABEL[res] : 'Nothing'}</span>
			<span class="caption">{count(t)} on the island</span>
		</div>
	{/each}
</div>

<h3>Number tokens</h3>
<p>
	Every tile but the desert carries a number from 2 to 12. When the dice show that number, the tile
	pays its resource to every settlement and city on its corners. The dots under a number show how
	likely it is: each dot is one way to roll it with two dice.
</p>
<div class="figure tokens">
	{#each numbers as n (n)}<Token {n} size={42} />{/each}
</div>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.star} alt="" /><span
			><b>6 and 8 are red:</b> after 7 they are the most common rolls, five chances in 36 each. Tiles
			with red numbers are the richest spots on the island.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			><b>2 and 12</b> come up only once in 36 rolls. <b>7</b> has no token at all: it calls the robber
			instead.</span
		>
	</li>
	<li>
		<img class="icon-px" src={TUT_ICON.robber} alt="" /><span
			>The <b>desert</b> pays nothing. The robber starts the game there.</span
		>
	</li>
</ul>

<h3>Harbors</h3>
<p>
	{STANDARD_PORT_POOL.length} harbors sit on the coast, each touching two corners. A settlement or city
	on one of those corners lets you trade with the bank at a better rate (see <i>Trading</i>).
</p>
<div class="figure">
	<div class="port">
		<span class="ratio">3:1</span>
		<img class="icon-px" src={PIXEL.anchor} alt="" />
		<span class="caption">{anyPorts} harbors take any resource</span>
	</div>
	<div class="port">
		<span class="ratio">2:1</span>
		<span class="res">
			{#each ['wood', 'brick', 'sheep', 'wheat', 'ore'] as r (r)}<img
					src={icons[r]}
					alt={r}
				/>{/each}
		</span>
		<span class="caption">one harbor for each resource</span>
	</div>
</div>

<style>
	.terrains {
		align-items: flex-start;
	}
	.land {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 96px;
		text-align: center;
		line-height: 1.25;
	}
	.land b {
		margin-top: 4px;
	}
	.yield {
		font-size: 14px;
		color: var(--ink-soft);
	}
	.land .caption {
		margin-top: 0;
		font-weight: 400;
		font-size: 12px;
	}
	.tokens {
		gap: 8px;
	}
	.port {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		min-width: 150px;
	}
	.port img.icon-px {
		width: 30px;
		height: 30px;
	}
	.ratio {
		font-family: var(--px);
		font-weight: 700;
		font-size: 24px;
		color: #2c3a52;
	}
	.port .res img {
		width: 40px;
		height: 40px;
		margin: -4px -3px;
	}
</style>
