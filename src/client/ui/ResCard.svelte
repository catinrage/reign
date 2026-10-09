<script lang="ts">
	import type { Resource } from '../../shared/rules/config';
	import { getIcons } from '../scene/icons';
	import { RESOURCE_LABEL } from './helpers';
	import { t } from '../i18n/index.svelte';

	let {
		res,
		count = undefined,
		size = 64,
		dim = false,
		label = false,
		selected = false,
		onclick = undefined
	}: {
		res: Resource;
		count?: number;
		size?: number;
		dim?: boolean;
		label?: boolean;
		selected?: boolean;
		onclick?: () => void;
	} = $props();
	const icon = $derived(getIcons().urls[res]);
	// One pixel of card art: whole device pixels keep the frame crisp.
	const px = $derived(size >= 56 ? 3 : 2);
</script>

<button
	class="card"
	class:dim
	class:selected
	class:clickable={!!onclick}
	style="--w:{size}px; --cp:{px}px; --pat: var(--pat-{res})"
	{onclick}
	disabled={!onclick}
	title={t(RESOURCE_LABEL[res])}
>
	<span class="art"><img src={icon} alt={t(RESOURCE_LABEL[res])} draggable="false" /></span>
	{#if label}<span class="name">{t(RESOURCE_LABEL[res])}</span>{/if}
	{#if count !== undefined}<span class="count">{count}</span>{/if}
</button>

<style>
	.card {
		position: relative;
		width: var(--w);
		height: calc(var(--w) * 1.36);
		box-sizing: border-box;
		padding: 0;
		margin: 0;
		border-style: solid;
		border-width: calc(var(--cp) * 3);
		border-image: var(--art-card) 3 fill / calc(var(--cp) * 3) stretch;
		background: none;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: calc(var(--cp) * 1);
		font: inherit;
		color: var(--ink);
		cursor: default;
		filter: drop-shadow(0 3px 0 rgba(40, 20, 8, 0.55)) drop-shadow(0 6px 8px rgba(0, 0, 0, 0.3));
		transition:
			transform 0.14s,
			filter 0.2s;
		pointer-events: auto;
	}
	.card:disabled {
		opacity: 1;
	}
	.clickable {
		cursor: pointer;
	}
	.clickable:hover {
		transform: translateY(-4px);
	}
	.selected {
		transform: translateY(-4px);
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 3px #ffd45a)
			drop-shadow(0 0 7px rgba(255, 200, 80, 0.9));
	}
	.art {
		flex: 1;
		min-height: 0;
		position: relative;
		background: var(--pat) 0 0 / calc(var(--cp) * 8) calc(var(--cp) * 8) repeat;
		box-shadow:
			inset 0 0 0 var(--cp) rgba(40, 20, 8, 0.55),
			inset 0 calc(var(--cp) * 2) 0 rgba(255, 255, 255, 0.18),
			inset 0 calc(var(--cp) * -3) 0 rgba(0, 0, 0, 0.2);
		display: grid;
		place-items: center;
		overflow: hidden;
	}
	img {
		width: 124%;
		max-width: none;
		margin: -12%;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.3));
	}
	.name {
		font-family: var(--px);
		font-size: calc(var(--w) * 0.17);
		font-weight: 700;
		text-align: center;
		line-height: 1;
		padding-bottom: 1px;
	}
	.count {
		position: absolute;
		top: calc(var(--w) * -0.2);
		right: calc(var(--w) * -0.2);
		width: calc(var(--cp) * 12);
		height: calc(var(--cp) * 12);
		background: var(--art-badge) center / 100% 100%;
		color: #fff3d6;
		font-family: var(--px);
		font-weight: 700;
		font-size: calc(var(--cp) * 6.5);
		line-height: 1;
		display: grid;
		place-items: center;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.dim {
		filter: grayscale(0.85) brightness(0.62) drop-shadow(0 3px 0 rgba(40, 20, 8, 0.55));
	}
</style>
