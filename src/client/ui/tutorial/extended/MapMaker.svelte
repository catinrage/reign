<script lang="ts">
	import { MAP_MIN_TILES, parseAscii } from '../../../../shared/board/maps';
	import { TERRAINS } from '../../../../shared/rules/config';
	import Rich from '../../../i18n/Rich.svelte';
	import { t } from '../../../i18n/index.svelte';
	import { TERRAIN_CSS, TERRAIN_NAME } from '../../extended/terrainColors';
	import MapPreview from '../../extended/MapPreview.svelte';
	import { PIXEL } from '../../pixel';

	// A small hand-drawn island: a fixed mountain spine and desert, the rest left to chance.
	const sample = parseAscii([
		'  x x x    ',
		' x m m x x ',
		'x x d x x x',
		' x m x p x ',
		'  x x f x  ',
		'     x     '
	]);
	const brushes = ['random', ...TERRAINS] as const;
</script>

{#snippet bIsland()}<b>{t('Island')}</b>{/snippet}
{#snippet bChange()}<b>{t('Change or make your own')}</b>{/snippet}
{#snippet bNewMap()}<b>{t('New map')}</b>{/snippet}
{#snippet bPickBrush()}<b>{t('Pick a brush.')}</b>{/snippet}
{#snippet iRandom()}<i>{t('Random')}</i>{/snippet}
{#snippet iSea()}<i>{t('Sea')}</i>{/snippet}
{#snippet bPaint()}<b>{t('Paint the grid.')}</b>{/snippet}
{#snippet bSave()}<b>{t('Name it and save.')}</b>{/snippet}
{#snippet bPlay()}<b>{t('Play this map')}</b>{/snippet}
{#snippet bOneIsland()}<b>{t('one island')}</b>{/snippet}
{#snippet bDesert()}<b>{t('desert')}</b>{/snippet}
{#snippet bCopy()}<b>{t('Copy code')}</b>{/snippet}
{#snippet iPaste()}<i>{t('Paste a map code')}</i>{/snippet}
{#snippet bAdd()}<b>{t('Add')}</b>{/snippet}

<p>
	<Rich
		text={t('Want a different shape? Draw your own island. In the lobby, choose {island}, then {change}, then {newMap}.')}
		slots={{ island: bIsland, change: bChange, newMap: bNewMap }}
	/>
</p>

<div class="spread">
	<div class="figure sample">
		<MapPreview tiles={sample} width={210} height={170} />
		<span class="caption">{t('A home-made island: fixed mountains and desert, the rest random')}</span>
	</div>
	<ol class="steps">
		<li>
			<Rich
				text={t('{step} Paint a terrain to fix it, {random} to let each game decide, or {sea} to rub land out.')}
				slots={{ step: bPickBrush, random: iRandom, sea: iSea }}
			/>
		</li>
		<li><Rich text={t('{step} Click or drag over the hexes.')} slots={{ step: bPaint }} /></li>
		<li>
			<Rich
				text={t('{step} Saved maps stay in this browser and show up in the island list.')}
				slots={{ step: bSave }}
			/>
		</li>
		<li><Rich text={t('{button} puts it on the table straight away.')} slots={{ button: bPlay }} /></li>
	</ol>
</div>

<div class="brushes">
	{#each brushes as b (b)}
		<span class="brush"
			><span class="swatch" style="background:{TERRAIN_CSS[b]}"></span>{t(TERRAIN_NAME[b])}</span
		>
	{/each}
	<span class="brush"><span class="swatch sea"></span>{t('Sea')}</span>
</div>

<h3>{t('What makes a map playable')}</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			>{t('At least {min} land tiles. There is no upper limit: the grid grows as you paint, and every five tiles seat one more player, up to eight.', { min: MAP_MIN_TILES })}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			><Rich
				text={t('All land joined into {island}, since there are no ships to cross the sea.')}
				slots={{ island: bOneIsland }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			><Rich text={t('A {desert} or a random tile, so the robber has somewhere to start.')} slots={{ desert: bDesert }} /></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span>{t('At least five tiles that produce something.')}</span>
	</li>
</ul>
<p>{t('The map maker tells you what is missing, and the Save button waits until the map works.')}</p>

<h3>{t('Sharing')}</h3>
<p>
	<Rich
		text={t('{copy} turns your map into a short line of text. Send it to a friend; they paste it into the {paste} box in their island list and press {add}.')}
		slots={{ copy: bCopy, paste: iPaste, add: bAdd }}
	/>
</p>

<style>
	.spread {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 18px;
		align-items: center;
	}
	.sample {
		flex-direction: column;
		margin: 0;
		max-width: 250px;
	}
	.steps {
		margin: 0;
		padding-left: 22px;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.steps li::marker {
		font-family: var(--px);
		font-weight: 700;
		color: #b8740f;
	}
	.brushes {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		margin: 12px 0 4px;
		font-size: 14px;
		font-weight: 700;
	}
	.brush {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		width: 18px;
		height: 18px;
		border-color: rgba(90, 60, 30, 0.6);
	}
	.swatch.sea {
		background: #4d90bd;
	}
	@media (max-width: 760px) {
		.spread {
			grid-template-columns: 1fr;
			justify-items: center;
		}
	}
</style>
