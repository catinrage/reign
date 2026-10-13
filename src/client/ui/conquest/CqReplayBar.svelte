<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { CQ_SPEEDS, cqReplay } from '../../state/cqReplay.svelte';
	import { PIXEL } from '../pixel';
	import { cqPlay } from './play.svelte';
	import { cqColor } from './text';

	/** Watching a recorded war: play and pause, turn by turn, faster or slower, and a timeline to scrub. */
	const r = cqReplay;
	const v = $derived(cqPlay.view!);
	const turn = $derived(r.turn);
	const label = $derived(
		!turn
			? ''
			: turn.deploy
				? t('Deployment')
				: t('Round {round}: {player}', { round: turn.round, player: v.players[turn.player]?.name ?? '' })
	);
</script>

<div class="bar-wrap">
	<div class="bar panel">
		<div class="row">
			<span class="tag ribbon">{t('Replay')}</span>
			<span class="who" style="--c:{turn && !turn.deploy ? cqColor(v, turn.player) : 'var(--gold)'}">{label}</span>
			<button class="btn small red" onclick={() => r.close()}>{t('Close replay')}</button>
		</div>
		<div class="row">
			<button class="icon-btn" onclick={() => r.prevTurn()} aria-label={t('Previous turn')} title={t('Previous turn')}><img src={PIXEL.turnBack} alt="" /></button>
			<button class="icon-btn" onclick={() => r.toggle()} aria-label={r.playing ? t('Pause') : t('Play')} title={r.playing ? t('Pause') : t('Play')}
				><img src={r.playing ? PIXEL.pause : PIXEL.play} alt="" /></button
			>
			<button class="icon-btn" onclick={() => r.nextTurn()} aria-label={t('Next turn')} title={t('Next turn')}><img src={PIXEL.turnOn} alt="" /></button>
			<input
				class="slider"
				type="range"
				min="0"
				max={r.last}
				value={r.index}
				aria-label={t('Timeline')}
				oninput={(e) => r.seek(Number((e.target as HTMLInputElement).value))}
			/>
			<div class="seg speeds">
				{#each CQ_SPEEDS as s (s)}
					<button class="btn small wood" class:on={r.speed === s} onclick={() => r.setSpeed(s)}>{s}×</button>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.bar-wrap {
		position: absolute;
		left: 336px;
		right: 276px;
		bottom: 12px;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.bar {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		max-width: 680px;
		padding: 4px 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.tag {
		--rib: var(--art-ribbon-crimson);
		font-size: 15px;
		height: calc(var(--s) * 12);
		min-width: 0;
	}
	.who {
		flex: 1;
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		color: var(--c);
		text-shadow: var(--outline-dark);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.slider {
		flex: 1;
		min-width: 80px;
	}
	.speeds .btn {
		min-width: 34px;
	}
	.speeds .btn.on {
		--art: var(--art-btn-gold);
		color: #3a1d04;
	}
	@media (max-width: 900px) {
		.bar-wrap {
			left: 6px;
			right: 6px;
			bottom: 6px;
		}
		.speeds .btn:nth-child(1),
		.speeds .btn:nth-child(5) {
			display: none;
		}
	}
</style>
