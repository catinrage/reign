<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';

	/**
	 * How many people are watching without a seat, shown to everyone at the table while anyone
	 * is. It bumps when the count changes.
	 */
	const count = $derived(client.lobby?.spectators ?? 0);
	const tip = $derived(
		`${count} ${count === 1 ? 'person is' : 'people are'} watching this game. Spectators never see a hand.`
	);
</script>

{#if count > 0}
	<div class="eye plaque" title={tip} aria-label={tip} role="status">
		<img src={PIXEL.eye} alt="" />
		{#key count}<b class="n">{count}</b>{/key}
	</div>
{/if}

<style>
	.eye {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: calc(var(--s) * 16);
		padding: 0 calc(var(--s) * 2);
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	img {
		width: calc(var(--s) * 9);
		height: auto;
		image-rendering: pixelated;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5));
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
		.eye {
			gap: 4px;
		}
		.n {
			font-size: 16px;
		}
	}
</style>
