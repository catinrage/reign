<script lang="ts">
	import { MAP_PRESETS, decodeMap, mapSeats, validateCustomMap, type CustomMap, type MapChoice } from '../../../shared/board/maps';
	import { client } from '../../state/client.svelte';
	import Modal from '../menu/Modal.svelte';
	import { PIXEL } from '../pixel';
	import MapEditor from './MapEditor.svelte';
	import MapPreview from './MapPreview.svelte';
	import RandomIsland from './RandomIsland.svelte';
	import { deleteMap, saveMap, savedMaps } from './savedMaps.svelte';
	import { t, tx } from '../../i18n/index.svelte';

	let { onclose }: { onclose: () => void } = $props();

	const current = $derived(client.lobby!.settings.map);
	let editing = $state<{ map: CustomMap | null; index: number | null } | null>(null);
	let code = $state('');

	function choose(map: MapChoice) {
		client.send({ t: 'setMap', map });
		onclose();
	}

	function paste() {
		const map = decodeMap(code);
		if (!map) return client.toast(t("That doesn't look like a map code."), 'error');
		const problem = validateCustomMap(map);
		if (problem) return client.toast(tx(problem), 'error');
		saveMap(map);
		code = '';
		client.toast(t('Added "{name}" to your maps.', { name: map.name }), 'good');
	}

	// An island too small for everyone already at the table can't be picked.
	const seated = $derived(client.lobby!.seats.length);
	const tooSmall = (n: number) => mapSeats(n) < seated;
	const seatsLabel = (n: number) =>
		t('{tiles, plural, one {# tile} other {# tiles}} · {players, plural, one {# player} other {# players}}', {
			tiles: n,
			players: mapSeats(n)
		});

	const isCurrent = (m: CustomMap) => 'custom' in current && JSON.stringify(current.custom.tiles) === JSON.stringify(m.tiles);
</script>

{#if editing}
	<MapEditor
		initial={editing.map}
		index={editing.index}
		canUse={client.isHost}
		onuse={(m) => choose({ custom: m })}
		onclose={() => (editing = null)}
	/>
{:else}
	<Modal title={t('Choose the island')} width={820} {onclose}>
		<div class="section">
			<div class="divider"><i></i><span>{t('Random island')}</span><i></i></div>
			<RandomIsland onedit={(m) => (editing = { map: m, index: null })} />
		</div>

		<div class="section">
			<div class="divider"><i></i><span>{t('Islands')}</span><i></i></div>
			<div class="grid">
				{#each MAP_PRESETS as p (p.id)}
					<button
						class="map plaque"
						class:on={'preset' in current && current.preset === p.id}
						disabled={tooSmall(p.tiles.length)}
						title={tooSmall(p.tiles.length) ? t('Seats {seats}: too small for this table', { seats: mapSeats(p.tiles.length) }) : undefined}
						onclick={() => choose({ preset: p.id })}
					>
						<MapPreview tiles={p.tiles} width={150} height={104} />
						<span class="name title">{t(p.name)}</span>
						<span class="blurb">{t(p.blurb)}</span>
						<span class="count">{seatsLabel(p.tiles.length)}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="section">
			<div class="divider"><i></i><span>{t('Your maps')}</span><i></i></div>
			{#if savedMaps.list.length}
				<div class="grid">
					{#each savedMaps.list as m, i (i)}
						<div class="map plaque" class:on={isCurrent(m)}>
							<button
								class="pick"
								disabled={tooSmall(m.tiles.length)}
								onclick={() => choose({ custom: m })}
								title={tooSmall(m.tiles.length) ? t('Too small for this table') : t('Play {map}', { map: m.name })}
							>
								<MapPreview tiles={m.tiles} width={150} height={104} />
								<span class="name title">{m.name}</span>
								<span class="count">{seatsLabel(m.tiles.length)}</span>
							</button>
							<span class="tools">
								<button class="btn small wood" onclick={() => (editing = { map: m, index: i })}>{t('Edit')}</button>
								<button class="icon-btn del" onclick={() => deleteMap(i)} aria-label={t('Delete {map}', { map: m.name })} title={t('Delete')}
									><img src={PIXEL.close} alt="" /></button
								>
							</span>
						</div>
					{/each}
				</div>
			{:else}
				<p>{t('Draw your own island in the map maker, or paste a code a friend sent you.')}</p>
			{/if}
			<div class="row">
				<button class="btn green" onclick={() => (editing = { map: null, index: null })}>{t('New map')}</button>
				<input class="input code" placeholder={t('Paste a map code')} bind:value={code} onkeydown={(e) => e.key === 'Enter' && paste()} />
				<button class="btn small" disabled={!code.trim()} onclick={paste}>{t('Add')}</button>
			</div>
		</div>
	</Modal>
{/if}

<style>
	.section {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 14px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 8px;
	}
	.map {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 6px 6px 8px;
		color: var(--text);
		font: inherit;
		text-align: center;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.map:hover:not(:disabled) {
		transform: translateY(-3px);
	}
	.map:disabled,
	.map:has(.pick:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.map.on {
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 4px #ffd45a);
	}
	.pick {
		all: unset;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		cursor: pointer;
	}
	.name {
		font-size: 17px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.blurb {
		font-size: 13px;
		line-height: 1.25;
		color: #f1dfc2;
		text-wrap: balance;
	}
	.count {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: var(--gold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.tools {
		display: flex;
		gap: 6px;
		align-items: center;
		margin-top: 4px;
	}
	.del {
		width: calc(var(--s) * 10);
		height: calc(var(--s) * 10);
		border-image-source: var(--art-btn-red);
	}
	.del img {
		width: calc(var(--s) * 4);
		height: calc(var(--s) * 4);
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.code {
		flex: 1;
		min-width: 160px;
	}
</style>
