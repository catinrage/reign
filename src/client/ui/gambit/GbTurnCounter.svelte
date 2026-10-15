<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';

	/** The round (of how many at most), and the crowns that win. */
	const v = $derived(client.gb!);
	const goalTip = $derived(
		t('First to {n} crowns wins, or the most crowns after round {rounds}.', { n: v.settings.crowns, rounds: v.settings.rounds })
	);
</script>

<div class="turn plaque" role="status" aria-label={`${t('Round {round}', { round: v.round })}. ${goalTip}`}>
	<span class="count" title={t('Round {round} of {rounds} at most', { round: v.round, rounds: v.settings.rounds })}>
		<span class="word">{t('Round')}</span>{#key v.round}<b class="n">{v.round}</b>{/key}
	</span>
	<span class="split" aria-hidden="true"></span>
	<span class="goal" title={goalTip}><img class="icon-px crown" src={PIXEL.crown} alt="" /><b class="n">{v.settings.crowns}</b></span>
</div>

<style>
	.turn {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: calc(var(--s) * 16);
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
	.split {
		align-self: stretch;
		width: var(--s);
		margin: calc(var(--s) * 3) calc(var(--s) * 1);
		background: rgba(20, 10, 4, 0.55);
		box-shadow: 1px 0 rgba(255, 220, 160, 0.18);
	}
	.count,
	.goal {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.crown {
		width: 18px;
		height: 18px;
	}
	.n {
		display: inline-block;
		min-width: 1ch;
		font-family: var(--body);
		font-weight: 900;
		font-size: 19px;
		line-height: 1;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	@media (max-width: 900px) {
		.word {
			font-size: 11px;
		}
		.n {
			font-size: 16px;
		}
		.crown {
			width: 14px;
			height: 14px;
		}
	}
</style>
