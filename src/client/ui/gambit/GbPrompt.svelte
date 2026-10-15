<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import TurnClock from '../game/TurnClock.svelte';
	import { ui } from '../game/ui.svelte';
	import { PIXEL } from '../pixel';
	import { gbPlay } from './play.svelte';
	import { playerName } from './text';

	/** The banner at the top: what to do now, or who the table is waiting for. */
	const v = $derived(gbPlay.view!);
	const ended = $derived(v.phase === 'ended');
	const mine = $derived(gbPlay.ordering && !gbPlay.ready);
	const color = $derived(v.me >= 0 ? v.players[v.me].color : 'white');
	const text = $derived.by(() => {
		if (ended) {
			const w = v.winner ?? 0;
			return w === v.me ? t('You won the game!') : t('{player} won the game!', { player: playerName(v, w) });
		}
		if (gbPlay.resolving) return t('Round {round} plays out', { round: Math.max(1, v.round - 1) });
		if (mine) {
			const n = gbPlay.drafts.length;
			return t('Round {round}: give your orders ({n} of {most})', { round: v.round, n, most: gbPlay.allowed });
		}
		const waiting = v.players.filter((_, i) => !v.ready[i]).map((p) => p.name);
		if (!waiting.length) return t('Round {round}: all orders in', { round: v.round });
		if (waiting.length <= 2) return t('Round {round}: waiting for {players}', { round: v.round, players: waiting.join(', ') });
		return t('Round {round}: waiting for {n} players', { round: v.round, n: waiting.length });
	});
</script>

<div class="wrap" style:--corner="{ui.cornerWidth ? 14 + ui.cornerWidth + 12 : 290}px">
	<div class="banner">
		{#key text}
			<div class="ribbon" class:mine={mine && !client.spectating} style="--rib: var(--art-ribbon-{ended ? 'gold' : color})">
				{#if !mine && !ended}<img class="icon-px" src={PIXEL.hourglass} alt="" />{/if}
				<span class="text">{text}</span>
			</div>
		{/key}
		<TurnClock {color} />
	</div>
</div>

<style>
	.wrap {
		position: absolute;
		top: 14px;
		left: 0;
		right: 0;
		display: grid;
		grid-template-columns: minmax(var(--corner), 1fr) auto minmax(290px, 1fr);
		pointer-events: none;
	}
	.banner {
		grid-column: 2;
		position: relative;
		display: flex;
		min-width: 0;
	}
	.ribbon {
		max-width: 100%;
		font-size: 19px;
		pointer-events: auto;
		animation: drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.ribbon.mine {
		animation:
			drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1),
			glow 1.8s ease-in-out infinite 0.4s;
	}
	.ribbon img {
		width: 20px;
		height: 20px;
		flex: none;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.6));
	}
	.text {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	@media (max-width: 900px) {
		.wrap {
			top: 68px;
			display: flex;
			justify-content: center;
		}
		.banner {
			max-width: calc(100vw / var(--ui-zoom) - 32px);
		}
		.ribbon {
			font-size: 15px;
		}
	}
</style>
