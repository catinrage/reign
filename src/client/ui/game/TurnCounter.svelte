<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { msg, t, tParts } from '../../i18n/index.svelte';
	import { roundOf } from '../../../shared/rules/events';

	/**
	 * Which turn the game is in: every player's turn counts one, the same number the board's
	 * tooltips date pieces by. Beside it, the round: every player taking one turn, the count the
	 * Events deck and power recharge go by. The draft and the setup come before turn 1 and say so
	 * instead.
	 */
	const view = $derived(client.view!);
	const round = $derived(roundOf(view.turn, view.players.length));
	type Part = { n: number } | { word: string };
	/** "Turn 6" and "Round 2" with the number apart, in each language's word order. */
	const count = (message: string, n: number, slot: string) =>
		tParts<Part>(message, { [slot]: { n } }, (s) => ({ word: s.trim() })).filter(
			(p) => !('word' in p) || p.word
		);
	const turnParts = $derived(count(msg('Turn {turn}'), view.turn, 'turn'));
	const roundParts = $derived(count(msg('Round {round}'), round, 'round'));
	const label = $derived(
		view.phase === 'draft' ? t('Draft') : view.phase === 'setup' ? t('Setup') : null
	);
	const tip = $derived(
		view.phase === 'draft'
			? t('Draft: turn 1 starts once everyone has placed two settlements.')
			: view.phase === 'setup'
				? t('Setup: turn 1 starts once everyone has placed two settlements.')
				: t(
						"Turn {turn}, round {round}. A turn is one player's go; a round is every player taking one turn.",
						{
							turn: view.turn,
							round
						}
					)
	);
</script>

<div
	class="turn plaque"
	title={tip}
	aria-label={label ?? t('Turn {turn}, round {round}', { turn: view.turn, round })}
	role="status"
>
	{#if label}
		<span class="word">{label}</span>
	{:else}
		{#each [turnParts, roundParts] as parts, i (i)}
			{#if i}<span class="split" aria-hidden="true"></span>{/if}
			{#each parts as part, j (j)}
				{#if 'n' in part}
					{#key part.n}<b class="n">{part.n}</b>{/key}
				{:else}
					<span class="word">{part.word}</span>
				{/if}
			{/each}
		{/each}
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
	/* A notch in the plank between the turn and the round. */
	.split {
		align-self: stretch;
		width: var(--s);
		margin: calc(var(--s) * 3) calc(var(--s) * 1);
		background: rgba(20, 10, 4, 0.55);
		box-shadow: 1px 0 rgba(255, 220, 160, 0.18);
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
		/* Smaller, beside the corner's column: the words stay, as two bare numbers would read the
		   same. */
		.turn {
			gap: 4px;
			padding: 0 calc(var(--s) * 3);
		}
		.word {
			font-size: 11px;
		}
		.n {
			font-size: 16px;
		}
	}
</style>
