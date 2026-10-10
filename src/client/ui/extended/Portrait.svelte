<script lang="ts">
	import { CHARACTER_INFO, type CharacterId } from '../../../shared/rules/characters';
	import { portraitUrl } from '../../scene/portraits';
	import { t } from '../../i18n/index.svelte';

	let {
		id,
		size = 64,
		framed = true,
		tip = true
	}: { id: CharacterId | null; size?: number; framed?: boolean; tip?: boolean } = $props();

	const url = $derived(id ? portraitUrl(id) : null);
	const info = $derived(id ? CHARACTER_INFO[id] : null);
	const name = $derived(info ? t(info.name) : '');
</script>

<span class="portrait" class:framed style="--size:{size}px" title={info && tip ? t('{character} {epithet}', { character: name, epithet: t(info.title) }) : undefined}>
	<!-- The url is undefined while the picture is being drawn, and null where WebGL isn't available. -->
	{#if url}
		<img src={url} alt={name} draggable="false" />
	{:else if url === null}
		<span class="initial">{name[0] ?? '?'}</span>
	{/if}
</span>

<style>
	.portrait {
		position: relative;
		display: inline-grid;
		place-items: center;
		width: var(--size);
		height: var(--size);
		flex: none;
		box-sizing: border-box;
		overflow: hidden;
	}
	.framed {
		border-style: solid;
		border-width: calc(var(--s) * 3);
		border-image: var(--art-well) 3 / calc(var(--s) * 3) stretch;
		background:
			radial-gradient(circle at 50% 38%, rgba(255, 196, 120, 0.55), transparent 62%),
			linear-gradient(#6b3a1e, #2c150a);
		background-clip: padding-box;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		image-rendering: auto;
		filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.45));
	}
	.initial {
		font-family: var(--px);
		font-weight: 700;
		font-size: calc(var(--size) * 0.45);
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
</style>
