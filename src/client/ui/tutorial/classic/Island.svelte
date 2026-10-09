<script lang="ts">
	import {
		RESOURCE_LABEL,
		STANDARD_NUMBER_POOL,
		STANDARD_PORT_POOL,
		STANDARD_TERRAIN_POOL,
		TERRAIN_RESOURCE,
		TERRAINS
	} from '../../../../shared/rules/config';
	import { t } from '../../../i18n/index.svelte';
	import Rich from '../../../i18n/Rich.svelte';
	import { getIcons } from '../../../scene/icons';
	import { TERRAIN_NAME } from '../../extended/terrainColors';
	import { PIXEL } from '../../pixel';
	import HexTile from '../bits/HexTile.svelte';
	import Token from '../bits/Token.svelte';
	import { TUT_ICON } from '../icons';

	const icons = getIcons().urls;
	const count = (kind: string) => STANDARD_TERRAIN_POOL.filter((x) => x === kind).length;
	const numbers = [...new Set(STANDARD_NUMBER_POOL)];
	const anyPorts = STANDARD_PORT_POOL.filter((p) => p === 'any').length;
	const harborRes = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
</script>

{#snippet tiles()}<b>{t('{n, plural, one {# tile} other {# tiles}}', { n: STANDARD_TERRAIN_POOL.length })}</b
	>{/snippet}
{#snippet red()}<b>{t('6 and 8 are red:')}</b>{/snippet}
{#snippet rare()}<b>{t('2 and 12')}</b>{/snippet}
{#snippet seven()}<b>7</b>{/snippet}
{#snippet desert()}<b>{t('desert')}</b>{/snippet}
{#snippet trading()}<i>{t('Trading')}</i>{/snippet}

<p>
	<Rich
		text={t('The Classic island has {tiles}, shuffled for every game. Each kind of land yields one resource card:')}
		slots={{ tiles }}
	/>
</p>

<div class="figure terrains">
	{#each TERRAINS as terrain (terrain)}
		{@const res = TERRAIN_RESOURCE[terrain]}
		<div class="land">
			<HexTile {terrain} size={78} />
			<b>{t(TERRAIN_NAME[terrain])}</b>
			<span class="yield">{res ? t(RESOURCE_LABEL[res]) : t('Nothing')}</span>
			<span class="caption">{t('{n} on the island', { n: count(terrain) })}</span>
		</div>
	{/each}
</div>

<h3>{t('Number tokens')}</h3>
<p>
	{t(
		'Every tile but the desert carries a number from 2 to 12. When the dice show that number, the tile pays its resource to every settlement and city on its corners. The dots under a number show how likely it is: each dot is one way to roll it with two dice.'
	)}
</p>
<div class="figure tokens">
	{#each numbers as n (n)}<Token {n} size={42} />{/each}
</div>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.star} alt="" /><span
			><Rich
				text={t(
					'{red} after 7 they are the most common rolls, five chances in 36 each. Tiles with red numbers are the richest spots on the island.'
				)}
				slots={{ red }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			><Rich
				text={t('{rare} come up only once in 36 rolls. {seven} has no token at all: it calls the robber instead.')}
				slots={{ rare, seven }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={TUT_ICON.robber} alt="" /><span
			><Rich text={t('The {desert} pays nothing. The robber starts the game there.')} slots={{ desert }} /></span
		>
	</li>
</ul>

<h3>{t('Harbors')}</h3>
<p>
	<Rich
		text={t(
			'{n, plural, one {# harbor sits} other {# harbors sit}} on the coast, each touching two corners. A settlement or city on one of those corners lets you trade with the bank at a better rate (see {trading}).',
			{ n: STANDARD_PORT_POOL.length }
		)}
		slots={{ trading }}
	/>
</p>
<div class="figure">
	<div class="port">
		<span class="ratio">3:1</span>
		<img class="icon-px" src={PIXEL.anchor} alt="" />
		<span class="caption"
			>{t('{n, plural, one {# harbor takes any resource} other {# harbors take any resource}}', {
				n: anyPorts
			})}</span
		>
	</div>
	<div class="port">
		<span class="ratio">2:1</span>
		<span class="res">
			{#each harborRes as r (r)}<img src={icons[r]} alt={t(RESOURCE_LABEL[r])} />{/each}
		</span>
		<span class="caption">{t('one harbor for each resource')}</span>
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
