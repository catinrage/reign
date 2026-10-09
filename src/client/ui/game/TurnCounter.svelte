<script lang="ts">
	import { client } from '../../state/client.svelte';

	/**
	 * Which turn the game is in: every player's turn counts one, the same number the board's
	 * tooltips date pieces by. The draft and the setup come before turn 1 and say so instead.
	 */
	const view = $derived(client.view!);
	const label = $derived(
		view.phase === 'draft' ? 'Draft' : view.phase === 'setup' ? 'Setup' : null
	);
	const tip = $derived(
		label
			? `${label}: turn 1 starts once everyone has placed two settlements.`
			: `Turn ${view.turn} of the game. Every player's turn counts one.`
	);
</script>

<div class="turn plaque" title={tip} aria-label={label ?? `Turn ${view.turn}`} role="status">
	{#if label}
		<span class="word">{label}</span>
	{:else}
		<span class="word">Turn</span>
		{#key view.turn}<b class="n">{view.turn}</b>{/key}
	{/if}
</div>

<style>
	.turn {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: calc(var(--s) * 16);
		min-width: calc(var(--s) * 16);
		box-sizing: border-box;
		padding: 0 calc(var(--s) * 3);
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.word {
		font-family: var(--px);
		font-size: 15px;
		color: var(--gold);
		text-shadow: var(--outline-dark);
	}
	.n {
		display: inline-block;
		min-width: 1ch;
		/* The body face: the pixel one's 2 reads as an 8 this small. */
		font-family: var(--body);
		font-weight: 900;
		font-size: 19px;
		line-height: 1;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
		animation: bump 0.4s ease-out;
	}
	@keyframes bump {
		40% {
			transform: scale(1.45);
			color: #ffd86b;
		}
	}
	@media (max-width: 900px) {
		/* A square in the corner's column: the number alone (the tooltip says what it is). */
		.turn {
			padding: 0;
		}
		.turn:has(.n) .word {
			display: none;
		}
		.word {
			font-size: 11px;
		}
		.n {
			font-size: 16px;
		}
	}
</style>
