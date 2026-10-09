<script lang="ts">
	import {
		MAP_MAX_TILES,
		MAP_MIN_TILES,
		MAP_RADIUS,
		parseAscii
	} from '../../../../shared/board/maps';
	import { TERRAINS } from '../../../../shared/rules/config';
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

<p>
	Want a different shape? Draw your own island. In the lobby, choose <b>Island</b>, then
	<b>Change or make your own</b>, then <b>New map</b>.
</p>

<div class="spread">
	<div class="figure sample">
		<MapPreview tiles={sample} width={210} height={170} />
		<span class="caption">A home-made island: fixed mountains and desert, the rest random</span>
	</div>
	<ol class="steps">
		<li>
			<b>Pick a brush.</b> Paint a terrain to fix it, <i>Random</i> to let each game decide, or
			<i>Sea</i> to rub land out.
		</li>
		<li><b>Paint the grid.</b> Click or drag over the hexes.</li>
		<li>
			<b>Name it and save.</b> Saved maps stay in this browser and show up in the island list.
		</li>
		<li><b>Play this map</b> puts it on the table straight away.</li>
	</ol>
</div>

<div class="brushes">
	{#each brushes as b (b)}
		<span class="brush"
			><span class="swatch" style="background:{TERRAIN_CSS[b]}"></span>{TERRAIN_NAME[b]}</span
		>
	{/each}
	<span class="brush"><span class="swatch sea"></span>Sea</span>
</div>

<h3>What makes a map playable</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			>Between {MAP_MIN_TILES} and {MAP_MAX_TILES} land tiles, no more than {MAP_RADIUS} hexes from the
			center.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			>All land joined into <b>one island</b>, since there are no ships to cross the sea.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			>A <b>desert</b> or a random tile, so the robber has somewhere to start.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			>At least five tiles that produce something.</span
		>
	</li>
</ul>
<p>The map maker tells you what is missing, and the Save button waits until the map works.</p>

<h3>Sharing</h3>
<p>
	<b>Copy code</b> turns your map into a short line of text. Send it to a friend; they paste it into
	the
	<i>Paste a map code</i> box in their island list and press <b>Add</b>.
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
