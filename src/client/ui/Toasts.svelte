<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { client } from '../state/client.svelte';
	import { PIXEL } from './pixel';

	const ICON = { error: PIXEL.close, good: PIXEL.check, info: PIXEL.letter };
</script>

<div class="toasts">
	{#each client.toasts as t (t.id)}
		<div
			class="toast parch {t.kind}"
			animate:flip={{ duration: 200 }}
			in:fly={{ y: -16, duration: 220 }}
			out:fly={{ y: -10, duration: 180 }}
		>
			<img class="icon-px" src={ICON[t.kind]} alt="" />
			<span>{t.text}</span>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		top: 128px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		z-index: 70;
		pointer-events: none;
		width: max-content;
		max-width: calc(100vw / var(--ui-zoom) - 24px);
	}
	.toast {
		--s: 2px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 8px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		color: var(--ink);
		pointer-events: none;
	}
	.toast img {
		width: 18px;
		height: 18px;
		flex: none;
	}
	.toast.error {
		color: #7a1a0c;
	}
	.toast.good {
		color: #2a5a14;
	}
	@media (max-width: 900px) {
		.toasts {
			top: 150px;
		}
	}
</style>
