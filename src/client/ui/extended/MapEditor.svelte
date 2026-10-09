<script lang="ts">
	import { untrack } from 'svelte';
	import { hexKey, hexToWorld, hexesInRadius } from '../../../shared/board/hex';
	import {
		MAP_MAX_TILES,
		MAP_PRESETS,
		MAP_RADIUS,
		centerTiles,
		encodeMap,
		validateCustomMap,
		type CustomMap,
		type MapTile
	} from '../../../shared/board/maps';
	import { TERRAINS, type Terrain } from '../../../shared/rules/config';
	import { client } from '../../state/client.svelte';
	import Modal from '../menu/Modal.svelte';
	import { PIXEL } from '../pixel';
	import { saveMap } from './savedMaps.svelte';
	import { TERRAIN_CSS, TERRAIN_NAME } from './terrainColors';

	type Brush = Terrain | 'random' | 'sea';

	let {
		initial = null,
		index = null,
		canUse = false,
		onuse = undefined,
		onclose
	}: {
		/** The map to edit, or null to start from the classic isle. */
		initial?: CustomMap | null;
		/** Where it is saved in this browser's maps, when editing one. */
		index?: number | null;
		canUse?: boolean;
		onuse?: (map: CustomMap) => void;
		onclose: () => void;
	} = $props();

	const cells = hexesInRadius(MAP_RADIUS).map((h) => ({ ...h, key: hexKey(h), ...hexToWorld(h) }));
	// The editor keeps its own copy: later changes to the props don't reset the drawing.
	const start = untrack(() => $state.snapshot(initial)) ?? { name: 'My island', tiles: MAP_PRESETS[0].tiles };
	let name = $state(start.name);
	let land = $state<Record<string, Terrain | null>>(Object.fromEntries(start.tiles.map((t) => [hexKey(t), t.terrain])));
	let brush = $state<Brush>('random');
	let painting = false;
	let savedAt = $state(untrack(() => index));

	const tiles = $derived<MapTile[]>(
		cells.filter((c) => c.key in land).map((c) => ({ q: c.q, r: c.r, terrain: land[c.key] }))
	);
	const map = $derived<CustomMap>({ name: name.trim() || 'My island', tiles: centerTiles(tiles) });
	const problem = $derived(validateCustomMap(map));
	const counts = $derived.by(() => {
		const n: Record<string, number> = {};
		for (const t of tiles) n[t.terrain ?? 'random'] = (n[t.terrain ?? 'random'] ?? 0) + 1;
		return n;
	});

	const corners = Array.from({ length: 6 }, (_, i) => {
		const a = ((60 * i - 90) * Math.PI) / 180;
		return [Math.cos(a), Math.sin(a)] as const;
	});
	const poly = (x: number, z: number, k: number) => corners.map(([cx, cz]) => `${(x + cx * k).toFixed(3)},${(z + cz * k).toFixed(3)}`).join(' ');

	function paint(key: string) {
		if (brush === 'sea') {
			if (key in land) delete land[key];
			return;
		}
		if (!(key in land) && tiles.length >= MAP_MAX_TILES) return;
		land[key] = brush === 'random' ? null : brush;
	}

	function down(e: PointerEvent) {
		const key = (e.target as Element).getAttribute?.('data-key');
		if (!key) return;
		painting = true;
		(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
		paint(key);
	}
	function move(e: PointerEvent) {
		if (!painting) return;
		const el = document.elementFromPoint(e.clientX, e.clientY);
		const key = el?.getAttribute('data-key');
		if (key) paint(key);
	}
	function up() {
		painting = false;
	}

	function loadPreset(id: string) {
		const p = MAP_PRESETS.find((m) => m.id === id);
		if (p) land = Object.fromEntries(p.tiles.map((t) => [hexKey(t), t.terrain]));
	}

	function save() {
		if (problem) return;
		savedAt = saveMap(map, savedAt);
		client.toast(`Saved "${map.name}" to your maps.`, 'good');
	}

	function use() {
		if (problem) return;
		savedAt = saveMap(map, savedAt);
		onuse?.(map);
	}

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(encodeMap(map));
			client.toast('Map code copied. Friends can paste it in the map list.', 'good');
		} catch {
			client.toast(encodeMap(map));
		}
	}

	const BRUSHES: Brush[] = ['random', ...TERRAINS, 'sea'];
</script>

<Modal title="Map maker" width={880} {onclose}>
	<div class="editor">
		<div class="board" role="application" aria-label="Map grid">
			<svg
				role="presentation"
				viewBox="-9.6 -7.6 19.2 15.2"
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
				onpointerleave={up}
			>
				{#each cells as c (c.key)}
					{@const t = c.key in land ? (land[c.key] ?? 'random') : null}
					{#if t}
						<polygon points={poly(c.x, c.z, 1.32)} fill="#63abc4" />
					{/if}
				{/each}
				{#each cells as c (c.key)}
					{@const t = c.key in land ? (land[c.key] ?? 'random') : null}
					<polygon
						data-key={c.key}
						class="cell"
						class:land={!!t}
						points={poly(c.x, c.z, 0.94)}
						fill={t ? TERRAIN_CSS[t] : 'rgba(40, 90, 130, 0.35)'}
					/>
					{#if t === 'random'}
						<text x={c.x} y={c.z + 0.34} text-anchor="middle">?</text>
					{/if}
				{/each}
			</svg>
		</div>

		<div class="side">
			<label class="field">
				<span class="label">Name</span>
				<input class="input" maxlength="24" bind:value={name} />
			</label>

			<div class="field">
				<span class="label">Paint with</span>
				<div class="brushes seg">
					{#each BRUSHES as b (b)}
						<button class="brush btn small" class:on={brush === b} onclick={() => (brush = b)}>
							<span class="chip" class:sea={b === 'sea'} style="--c:{b === 'sea' ? '#4d90bd' : TERRAIN_CSS[b]}"
								>{b === 'random' ? '?' : ''}</span
							>
							{b === 'sea' ? 'Sea' : TERRAIN_NAME[b]}
							{#if b !== 'sea' && counts[b]}<em>{counts[b]}</em>{/if}
						</button>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="label">Start from</span>
				<div class="starts">
					{#each MAP_PRESETS as p (p.id)}
						<button class="btn small wood" onclick={() => loadPreset(p.id)}>{p.name}</button>
					{/each}
				</div>
			</div>

			<p class="status" class:bad={!!problem}>
				{problem ?? `${tiles.length} tiles · random tiles get a classic mix, numbers and harbors are dealt each game.`}
			</p>

			<div class="actions">
				<button class="btn small wood" onclick={copyCode} disabled={!!problem}
					><img class="icon-px" src={PIXEL.letter} alt="" />Copy code</button
				>
				<button class="btn small" onclick={save} disabled={!!problem}>Save</button>
				{#if canUse}
					<button class="btn green" onclick={use} disabled={!!problem}>Play this map</button>
				{/if}
			</div>
		</div>
	</div>
</Modal>

<style>
	.editor {
		display: flex;
		gap: 14px;
		align-items: stretch;
	}
	.board {
		flex: 1.4 1 0;
		min-width: 0;
		display: grid;
		place-items: center;
		padding: 6px;
		border: 3px solid #1a0c05;
		box-shadow:
			inset 0 3px 0 rgba(0, 0, 0, 0.45),
			0 2px 0 rgba(255, 220, 160, 0.18);
		background: radial-gradient(ellipse at 50% 45%, #3a80aa, #1d4664 75%);
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		touch-action: none;
		user-select: none;
		cursor: crosshair;
	}
	.cell {
		stroke: rgba(255, 255, 255, 0.16);
		stroke-width: 0.05;
		transition: fill 0.12s;
	}
	.cell:hover {
		stroke: #fff2b0;
		stroke-width: 0.12;
	}
	.cell.land {
		stroke: rgba(40, 20, 8, 0.45);
	}
	text {
		font-family: var(--px);
		font-size: 0.9px;
		font-weight: 700;
		fill: #7a5a32;
		pointer-events: none;
	}
	.side {
		flex: 1 1 0;
		min-width: 230px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.brushes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5px;
	}
	.brush {
		justify-content: flex-start;
		gap: 7px;
		font-size: 14px;
	}
	.brush em {
		margin-left: auto;
		font-style: normal;
		font-size: 12px;
		opacity: 0.8;
	}
	.chip {
		width: 16px;
		height: 18px;
		flex: none;
		display: grid;
		place-items: center;
		font-size: 12px;
		color: #7a5a32;
		background: var(--c);
		clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
	}
	.starts {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.status {
		margin: 0 !important;
		text-align: left !important;
		font-size: 14px;
	}
	.status.bad {
		color: #ffb08a !important;
		font-weight: 700;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: auto;
	}
	.actions .btn img {
		height: 16px;
		margin-right: 4px;
	}
	@media (max-width: 760px) {
		.editor {
			flex-direction: column;
		}
		.side {
			min-width: 0;
		}
	}
</style>
