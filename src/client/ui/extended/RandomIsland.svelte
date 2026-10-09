<script lang="ts">
	import { untrack } from 'svelte';
	import { mapSeats, mapTiles, type CustomMap } from '../../../shared/board/maps';
	import {
		DEFAULT_RANDOM_OPTIONS,
		RANDOM_MAX_TILES,
		RANDOM_MIN_TILES,
		RANDOM_SHAPES,
		RANDOM_SHAPE_INFO,
		type RandomShape
	} from '../../../shared/board/random';
	import { maxPointsFor, suggestedPoints } from '../../../shared/rules/modes';
	import { client } from '../../state/client.svelte';
	import MapPreview from './MapPreview.svelte';
	import { generateIsland } from './randomIsland';
	import { t, tx } from '../../i18n/index.svelte';

	let { onedit }: { onedit: (map: CustomMap) => void } = $props();

	const lobby = $derived(client.lobby!);
	const current = $derived(lobby.settings.map);
	const seated = $derived(lobby.seats.length);
	// Start from the options of the island on the table, if it was a random one.
	const start = untrack(() => ('custom' in current && current.custom.random) || DEFAULT_RANDOM_OPTIONS);
	let tiles = $state(start.tiles);
	let shape = $state<RandomShape>(start.shape);
	let lakes = $state(start.lakes);
	// An island has to seat everyone already at the table: five tiles a player beyond four.
	const minTiles = $derived(Math.max(RANDOM_MIN_TILES, seated > 4 ? seated * 5 : 0));
	$effect(() => {
		if (tiles < minTiles) tiles = minTiles;
	});
	const onTable = $derived('custom' in current && current.custom.random ? current.custom : null);
	const tableTiles = $derived(mapTiles(current) ?? []);
	const players = $derived(Math.max(seated, 2));

	function generate() {
		generateIsland({ tiles, shape, lakes });
	}
</script>

<div class="random">
	<div class="opts">
		<label class="field">
			<span class="label">{t('Size')}</span>
			<span class="size">
				<input
					class="slider"
					type="range"
					min={minTiles}
					max={RANDOM_MAX_TILES}
					step="1"
					bind:value={tiles}
					style="--fill:{((tiles - minTiles) / (RANDOM_MAX_TILES - minTiles)) * 100}%"
				/>
				<span class="val">{t('{tiles, plural, one {# tile} other {# tiles}}', { tiles })}</span>
			</span>
		</label>
		<p class="note">
			{t(
				'Seats up to {seats, plural, one {# player} other {# players}}. With {players, plural, one {# player} other {# players}} it plays best to about {points, plural, one {# point} other {# points}}, {max} at most.',
				{ seats: mapSeats(tiles), players, points: suggestedPoints(tiles, players), max: maxPointsFor(tiles, players) }
			)}
		</p>
		<div class="field">
			<span class="label">{t('Shape')}</span>
			<div class="seg shapes">
				{#each RANDOM_SHAPES as s (s)}
					<button class="btn small" class:on={shape === s} title={t(RANDOM_SHAPE_INFO[s].text)} onclick={() => (shape = s)}
						>{t(RANDOM_SHAPE_INFO[s].name)}</button
					>
				{/each}
			</div>
			<span class="hint">{t(RANDOM_SHAPE_INFO[shape].text)}</span>
		</div>
		<div class="field row">
			<span class="label">{t('Lakes')}</span>
			<div class="seg">
				<button class="btn small" class:on={!lakes} onclick={() => (lakes = false)}>{t('None')}</button>
				<button class="btn small" class:on={lakes} onclick={() => (lakes = true)}>{t('A few')}</button>
			</div>
		</div>
		<button class="btn green shine generate" onclick={generate}>
			{onTable ? t('Generate another') : t('Generate')}
		</button>
	</div>
	<div class="result well">
		{#if onTable}
			<MapPreview tiles={tableTiles} width={250} height={190} />
			<span class="caption"
				>{t('On the table: {map}, {tiles, plural, one {# tile} other {# tiles}}. Everyone sees it.', {
					map: tx(onTable.name),
					tiles: tableTiles.length
				})}</span
			>
			<button
				class="btn small wood"
				title={t('Open it in the map maker to paint terrains or save it to your maps')}
				onclick={() => onedit({ name: onTable.name, tiles: onTable.tiles })}>{t('Edit or save')}</button
			>
		{:else}
			<span class="empty">{t('Pick a size and shape, then Generate. Press it again until you like the island.')}</span>
		{/if}
	</div>
</div>

<style>
	.random {
		display: grid;
		grid-template-columns: 1fr 270px;
		gap: 14px;
		align-items: stretch;
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field.row {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}
	.size {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.size .slider {
		flex: 1;
	}
	.val {
		min-width: 76px;
		text-align: right;
		font-family: var(--px);
		font-weight: 700;
		color: #fff2d2;
	}
	.note,
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.3;
		color: var(--muted);
	}
	.shapes {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
	}
	.generate {
		align-self: flex-start;
	}
	.result {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px;
		background: radial-gradient(ellipse, #2f6f98, #1d4664);
		background-clip: padding-box;
		min-height: 220px;
	}
	.caption,
	.empty {
		font-size: 13px;
		line-height: 1.3;
		color: #e8f2ff;
		text-align: center;
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
	}
	@media (max-width: 640px) {
		.random {
			grid-template-columns: 1fr;
		}
		.result {
			min-height: 160px;
		}
	}
</style>
