<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { msg, t, tParts } from '../../i18n/index.svelte';
	import { roundOf } from '../../../shared/rules/events';
	import { PIXEL } from '../pixel';

	/**
	 * Which round the game is in: every player taking one turn, the count the Events deck and
	 * power recharge go by. The draft and the setup come before round 1 and say so instead. Last,
	 * under a crown, the points it takes to win, which the host set in the lobby: a bare number, as
	 * words would push the corner over the prompt at 1366 wide.
	 */
	const view = $derived(client.view!);
	const round = $derived(roundOf(view.turn, view.players.length));
	type Part = { n: number } | { word: string };
	/** "Round 2" with the number apart, in each language's word order. */
	const roundParts = $derived(
		tParts<Part>(msg('Round {round}'), { round: { n: round } }, (s) => ({ word: s.trim() })).filter(
			(p) => !('word' in p) || p.word
		)
	);
	const goalTip = $derived(
		t('First to {points, plural, one {# point} other {# points}} wins the game.', {
			points: view.pointsToWin
		})
	);
	const label = $derived(
		view.phase === 'draft' ? t('Draft') : view.phase === 'setup' ? t('Setup') : null
	);
	const tip = $derived(
		view.phase === 'draft'
			? t('Draft: round 1 starts once everyone has placed two settlements.')
			: view.phase === 'setup'
				? t('Setup: round 1 starts once everyone has placed two settlements.')
				: t('Round {round}. A round is every player taking one turn.', { round })
	);
</script>

<div
	class="turn plaque"
	title={tip}
	aria-label={`${label ?? t('Round {round}', { round })}. ${goalTip}`}
	role="status"
>
	{#if label}
		<span class="word">{label}</span>
	{:else}
		{#each roundParts as part, j (j)}
			{#if 'n' in part}
				{#key part.n}<b class="n">{part.n}</b>{/key}
			{:else}
				<span class="word">{part.word}</span>
			{/if}
		{/each}
	{/if}
	<span class="split" aria-hidden="true"></span>
	<span class="goal" title={goalTip}
		><img class="icon-px crown" src={PIXEL.crown} alt="" />{#key view.pointsToWin}<b class="n"
				>{view.pointsToWin}</b
			>{/key}</span
	>
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
	/* A notch in the plank between the round and the goal. */
	.split {
		align-self: stretch;
		width: var(--s);
		margin: calc(var(--s) * 3) calc(var(--s) * 1);
		background: rgba(20, 10, 4, 0.55);
		box-shadow: 1px 0 rgba(255, 220, 160, 0.18);
	}
	/* The goal: a crown, then how many points win. */
	.goal {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.crown {
		width: 18px;
		height: 18px;
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
		.goal {
			gap: 3px;
		}
		.crown {
			width: 14px;
			height: 14px;
		}
	}
</style>
