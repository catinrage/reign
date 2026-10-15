<script lang="ts">
	import { untrack } from 'svelte';
	import { conquestMap } from '../../../shared/conquest/queries';
	import { REALM } from '../../../shared/conquest/realm';
	import { CLIMATES, LANE_RULES, WORLD_SHAPES, maxRegions } from '../../../shared/conquest/settings';
	import { WORLD_MAX_TERRITORIES, WORLD_MIN_REGIONS, WORLD_MIN_TERRITORIES, type Climate, type LaneRule, type WorldShape } from '../../../shared/conquest/types';
	import { randomSeed } from '../../../shared/rng';
	import { msg, t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import Modal from '../menu/Modal.svelte';
	import { sfx } from '../sound';
	import WorldPreview from './WorldPreview.svelte';

	/**
	 * Where the war is fought: the Realm, drawn by hand, or a random world. The host picks its size,
	 * shape, regions, sea lanes and climate, and every press of Generate makes a new one on the table
	 * for everyone; the others see what was picked.
	 */
	let { onclose }: { onclose: () => void } = $props();
	const s = $derived(client.lobby!.conquest);
	const host = $derived(client.isHost);
	const map = $derived(conquestMap(s));
	// Start from the world on the table, if there is one.
	const start = untrack(() => s.world);
	let territories = $state(start.territories);
	let regions = $state(start.regions);
	let shape = $state<WorldShape>(start.shape);
	let lanes = $state<LaneRule>(start.lanes);
	let climate = $state<Climate>(start.climate);
	const most = $derived(maxRegions(territories));
	$effect(() => {
		if (regions > most) regions = most;
	});

	const SHAPES: Record<WorldShape, { name: string; text: string }> = {
		continents: { name: msg('Continents'), text: msg('A few great lands apart, joined by sea lanes.') },
		pangaea: { name: msg('One land'), text: msg('One great land, and a few islands off its coast.') },
		archipelago: { name: msg('Islands'), text: msg('Many islands: every war crosses the sea.') },
		ring: { name: msg('Ring'), text: msg('Lands in a ring round an inland sea, as the Realm is.') }
	};
	const LANES: Record<LaneRule, string> = { few: msg('Few'), some: msg('Some'), many: msg('Many') };
	const CLIMATE: Record<Climate, { name: string; text: string }> = {
		mixed: { name: msg('Mixed'), text: msg('Snow in the north, sands in the south, all sorts between.') },
		frozen: { name: msg('Frozen'), text: msg('Snowfields, pine woods and cold mountains.') },
		desert: { name: msg('Desert'), text: msg('Dunes, badlands and rocky hills.') },
		verdant: { name: msg('Verdant'), text: msg('Forests, jungles and green fields.') }
	};

	function generate() {
		sfx.click();
		client.setConquest({ map: 'random', world: { territories, regions, shape, lanes, climate, seed: randomSeed() | 0 } });
	}
	function realm() {
		sfx.click();
		client.setConquest({ map: 'realm' });
	}
</script>

<Modal title={t('Choose the map')} width={720} {onclose}>
	<div class="picker">
		<div class="opts">
			<div class="choice seg">
				<button class="btn small" class:on={s.map === 'realm'} disabled={!host} onclick={realm}>{t('The Realm')}</button>
				<button class="btn small" class:on={s.map === 'random'} disabled={!host} onclick={generate}>{t('A random world')}</button>
			</div>
			<label class="field">
				<span class="label">{t('Territories')}</span>
				<span class="size">
					<input
						class="slider"
						type="range"
						min={WORLD_MIN_TERRITORIES}
						max={WORLD_MAX_TERRITORIES}
						step="1"
						disabled={!host}
						bind:value={territories}
						style="--fill:{((territories - WORLD_MIN_TERRITORIES) / (WORLD_MAX_TERRITORIES - WORLD_MIN_TERRITORIES)) * 100}%"
					/>
					<b class="val">{territories}</b>
				</span>
			</label>
			<label class="field">
				<span class="label">{t('Regions')}</span>
				<span class="size">
					<input
						class="slider"
						type="range"
						min={WORLD_MIN_REGIONS}
						max={most}
						step="1"
						disabled={!host}
						bind:value={regions}
						style="--fill:{((regions - WORLD_MIN_REGIONS) / Math.max(1, most - WORLD_MIN_REGIONS)) * 100}%"
					/>
					<b class="val">{regions}</b>
				</span>
			</label>
			<div class="field">
				<span class="label">{t('Shape')}</span>
				<div class="seg four">
					{#each WORLD_SHAPES as w (w)}
						<button class="btn small" class:on={shape === w} disabled={!host} title={t(SHAPES[w].text)} onclick={() => (shape = w)}>{t(SHAPES[w].name)}</button>
					{/each}
				</div>
				<span class="hint">{t(SHAPES[shape].text)}</span>
			</div>
			<div class="field">
				<span class="label">{t('Sea lanes')}</span>
				<div class="seg three">
					{#each LANE_RULES as l (l)}
						<button class="btn small" class:on={lanes === l} disabled={!host} onclick={() => (lanes = l)}>{t(LANES[l])}</button>
					{/each}
				</div>
			</div>
			<div class="field">
				<span class="label">{t('Climate')}</span>
				<div class="seg four">
					{#each CLIMATES as c (c)}
						<button class="btn small" class:on={climate === c} disabled={!host} title={t(CLIMATE[c].text)} onclick={() => (climate = c)}>{t(CLIMATE[c].name)}</button>
					{/each}
				</div>
				<span class="hint">{t(CLIMATE[climate].text)}</span>
			</div>
			{#if host}
				<button class="btn green shine generate" onclick={generate}>{s.map === 'random' ? t('Generate another') : t('Generate')}</button>
			{/if}
		</div>
		<div class="result well">
			<WorldPreview {map} width={280} height={238} />
			<span class="name title">{map === REALM ? t(REALM.name) : map.name}</span>
			<span class="caption"
				>{t('{n} territories in {r} regions, {l, plural, one {# sea lane} other {# sea lanes}}. Everyone sees it on the table.', {
					n: map.territories.length,
					r: map.regions.length,
					l: map.lanes.length
				})}</span
			>
		</div>
	</div>
</Modal>

<style>
	.picker {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 14px;
	}
	@media (max-width: 720px) {
		.picker {
			grid-template-columns: 1fr;
		}
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.label {
		font-family: var(--px);
		font-size: 12px;
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 1px;
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
		min-width: 3ch;
		text-align: right;
		font-family: var(--px);
		font-size: 16px;
		color: #fff2d2;
	}
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}
	.seg.three {
		grid-template-columns: repeat(3, 1fr);
	}
	.seg.four {
		grid-template-columns: repeat(4, 1fr);
	}
	.hint {
		font-size: 12px;
		color: var(--muted);
	}
	.generate {
		margin-top: 4px;
	}
	.result {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 10px;
	}
	.name {
		font-size: 17px;
		color: #fff2d2;
		text-align: center;
		text-shadow: var(--outline-dark);
	}
	.caption {
		font-size: 12.5px;
		line-height: 1.35;
		text-align: center;
		color: #e2cba8;
	}
</style>
