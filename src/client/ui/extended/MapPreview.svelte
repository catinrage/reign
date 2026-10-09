<script lang="ts">
	import { hexToWorld } from '../../../shared/board/hex';
	import type { MapTile } from '../../../shared/board/maps';
	import { TERRAIN_CSS } from './terrainColors';

	let { tiles, width = 120, height = 96 }: { tiles: MapTile[]; width?: number; height?: number } = $props();

	const R = 1;
	const corners = Array.from({ length: 6 }, (_, i) => {
		const a = ((60 * i - 90) * Math.PI) / 180;
		return [Math.cos(a), Math.sin(a)] as const;
	});
	const poly = (x: number, z: number, k: number) => corners.map(([cx, cz]) => `${(x + cx * k).toFixed(3)},${(z + cz * k).toFixed(3)}`).join(' ');

	const shapes = $derived(tiles.map((t) => ({ ...hexToWorld(t), terrain: t.terrain })));
	const box = $derived.by(() => {
		if (!shapes.length) return '-3 -3 6 6';
		const xs = shapes.map((s) => s.x);
		const zs = shapes.map((s) => s.z);
		const pad = 1.9;
		const x0 = Math.min(...xs) - pad;
		const z0 = Math.min(...zs) - pad;
		return `${x0} ${z0} ${Math.max(...xs) + pad - x0} ${Math.max(...zs) + pad - z0}`;
	});
</script>

<svg class="map-preview" viewBox={box} style="width:{width}px;height:{height}px" aria-hidden="true">
	{#each shapes as s, i (i)}
		<polygon points={poly(s.x, s.z, R * 1.75)} fill="#4d90bd" opacity="0.55" />
	{/each}
	{#each shapes as s, i (i)}
		<polygon points={poly(s.x, s.z, R * 1.3)} fill="#63abc4" />
	{/each}
	{#each shapes as s, i (i)}
		<polygon points={poly(s.x, s.z, R * 1.04)} fill="#f4d48e" />
	{/each}
	{#each shapes as s, i (i)}
		<polygon
			points={poly(s.x, s.z, R * 0.9)}
			fill={s.terrain ? TERRAIN_CSS[s.terrain] : TERRAIN_CSS.random}
			stroke="rgba(40,20,8,0.35)"
			stroke-width="0.06"
		/>
		{#if !s.terrain}
			<text x={s.x} y={s.z + 0.32} text-anchor="middle" font-size="0.9" font-weight="700" fill="#7a5a32">?</text>
		{/if}
	{/each}
</svg>

<style>
	.map-preview {
		display: block;
		flex: none;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.35));
	}
	text {
		font-family: var(--px);
	}
</style>
