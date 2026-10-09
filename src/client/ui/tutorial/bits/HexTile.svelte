<script lang="ts">
	import { TERRAIN_RESOURCE, type Terrain } from '../../../../shared/rules/config';
	import { getIcons } from '../../../scene/icons';
	import { TERRAIN_CSS } from '../../extended/terrainColors';
	import Token from './Token.svelte';

	/** One island tile drawn flat: its terrain color, the resource it pays and its number. */
	let {
		terrain,
		n = null,
		size = 76,
		gray = false
	}: { terrain: Terrain; n?: number | null; size?: number; gray?: boolean } = $props();

	const res = $derived(TERRAIN_RESOURCE[terrain]);
	const icon = $derived(res ? getIcons().urls[res] : null);
	const hex = Array.from({ length: 6 }, (_, i) => {
		const a = ((60 * i - 90) * Math.PI) / 180;
		return `${(50 + 48 * Math.cos(a)).toFixed(2)},${(50 + 48 * Math.sin(a)).toFixed(2)}`;
	}).join(' ');
</script>

<span class="tile" class:gray style="--size:{size}px">
	<svg viewBox="0 0 100 100" aria-hidden="true">
		<polygon points={hex} fill="#f4d48e" />
		<polygon
			points={hex}
			fill={TERRAIN_CSS[terrain]}
			stroke="rgba(40,20,8,0.45)"
			stroke-width="3"
			transform="translate(50 50) scale(0.88) translate(-50 -50)"
		/>
	</svg>
	{#if icon}<img class="res" class:alone={!n} src={icon} alt="" />{/if}
	{#if n}<span class="tok"><Token {n} size={Math.round(size * 0.4)} /></span>{/if}
</span>

<style>
	.tile {
		position: relative;
		display: inline-block;
		width: var(--size);
		height: var(--size);
		flex: none;
		filter: drop-shadow(0 3px 0 rgba(90, 50, 20, 0.35));
	}
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.res {
		position: absolute;
		left: 50%;
		top: 6%;
		width: 62%;
		transform: translateX(-50%);
		filter: drop-shadow(0 2px 1px rgba(0, 0, 0, 0.4));
	}
	.res.alone {
		top: 16%;
		width: 72%;
	}
	.tok {
		position: absolute;
		left: 50%;
		bottom: 8%;
		transform: translateX(-50%);
	}
	.gray {
		filter: grayscale(1) brightness(0.8) drop-shadow(0 3px 0 rgba(90, 50, 20, 0.35));
	}
</style>
