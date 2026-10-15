<script lang="ts">
	import { settings } from '../settings.svelte';
	import { gbPlay } from './play.svelte';

	/** A short note where a click did nothing, saying why. */
	const note = $derived(gbPlay.note);
</script>

<svelte:window
	onpointerdown={(e) => {
		gbPlay.pointer = { x: e.clientX, y: e.clientY };
	}}
/>

{#if note}
	{#key note.id}
		<div class="note" style:left="{note.x / settings.hudSize}px" style:top="{note.y / settings.hudSize}px" role="status">
			{note.text}
		</div>
	{/key}
{/if}

<style>
	.note {
		position: absolute;
		z-index: 31;
		transform: translate(-50%, calc(-100% - 22px));
		max-width: 260px;
		padding: 6px 10px;
		background: #fbf0d6;
		border: 3px solid #3a2214;
		box-shadow: 0 6px 12px rgba(0, 0, 0, 0.45);
		color: #6b1d0e;
		font-weight: 800;
		font-size: 14px;
		text-align: center;
		pointer-events: none;
		animation:
			pop-in 0.2s ease-out both,
			fade-in 0.4s ease-in 2.2s reverse both;
	}
	.note::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 100%;
		border: 8px solid transparent;
		border-top-color: #3a2214;
		transform: translateX(-50%);
	}
</style>
