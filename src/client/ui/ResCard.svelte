<script lang="ts">
	import type { Resource } from '../../shared/rules/config';
	import { getIcons } from '../scene/icons';
	import { RES_BG, RESOURCE_LABEL } from './helpers';

	let {
		res,
		count = undefined,
		size = 64,
		dim = false,
		label = false,
		onclick = undefined
	}: {
		res: Resource;
		count?: number;
		size?: number;
		dim?: boolean;
		label?: boolean;
		onclick?: () => void;
	} = $props();
	const icon = $derived(getIcons().urls[res]);
	const a = $derived(RES_BG[res][0]);
	const b = $derived(RES_BG[res][1]);
</script>

<button
	class="card"
	class:dim
	class:clickable={!!onclick}
	style="--w:{size}px; --a:{a}; --b:{b}"
	onclick={onclick}
	disabled={!onclick}
	title={RESOURCE_LABEL[res]}
>
	<span class="art"><img src={icon} alt={RESOURCE_LABEL[res]} draggable="false" /></span>
	{#if label}<span class="label">{RESOURCE_LABEL[res]}</span>{/if}
	{#if count !== undefined}<span class="count">{count}</span>{/if}
</button>

<style>
	.card {
		position: relative;
		width: var(--w);
		height: calc(var(--w) * 1.36);
		padding: calc(var(--w) * 0.07);
		border-radius: calc(var(--w) * 0.12);
		background: linear-gradient(180deg, #fff6e2, #ecd6aa);
		border: 2px solid #8a6436;
		box-shadow:
			inset 0 2px 0 rgba(255, 255, 255, 0.8),
			0 3px 0 #5a3c1c,
			0 6px 12px rgba(0, 0, 0, 0.35);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		font: inherit;
		color: var(--ink);
		cursor: default;
		transition:
			transform 0.12s,
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
	.art {
		flex: 1;
		width: 100%;
		border-radius: calc(var(--w) * 0.08);
		background:
			repeating-linear-gradient(
				90deg,
				rgba(255, 255, 255, 0.07) 0 6px,
				transparent 6px 12px
			),
			linear-gradient(180deg, var(--a), var(--b));
		box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.15);
		display: grid;
		place-items: center;
		overflow: hidden;
	}
	img {
		width: 92%;
		filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.35));
	}
	.label {
		font-family: var(--px);
		font-size: calc(var(--w) * 0.18);
		font-weight: 700;
	}
	.count {
		position: absolute;
		top: calc(var(--w) * -0.16);
		right: calc(var(--w) * -0.16);
		min-width: calc(var(--w) * 0.4);
		height: calc(var(--w) * 0.4);
		padding: 0 4px;
		border-radius: 999px;
		background: #2a170d;
		color: #fff3d6;
		border: 2px solid #f2c14e;
		font-family: var(--px);
		font-weight: 700;
		font-size: calc(var(--w) * 0.24);
		display: grid;
		place-items: center;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
	}
	.dim {
		filter: grayscale(0.9) brightness(0.65);
	}
</style>
