<script lang="ts">
	import type { PlayerColor } from '../../../shared/rules/config';
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';

	/**
	 * In a timed game, the time left in the turn on a tab that hangs from the middle of the turn
	 * banner, in the color of the player whose turn it is, with a bar along its bottom that drains.
	 */
	let { color }: { color: PlayerColor } = $props();
	// Either game's table: Settlement's or Conquest's.
	const ended = $derived((client.view ?? client.cq ?? client.gb)?.phase === 'ended');
	const total = $derived((client.lobby?.turnTime ?? 0) * 1000);
	const left = $derived(ended || !total ? null : client.timeLeft);
	const secs = $derived(Math.ceil((left ?? 0) / 1000));
	const running = $derived(!!client.clock?.running);
</script>

{#if left !== null}
	<div
		class="clock"
		class:low={secs <= 10}
		class:paused={!running}
		style="--tab: var(--art-tab-{color})"
		role="timer"
		aria-label={t('Time left this turn')}
		title={running ? t('Time left this turn') : t('Paused')}
	>
		<span class="time">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
		<span class="bar"
			><i style="transform:scaleX({Math.max(0, Math.min(1, left / total))})"></i></span
		>
	</div>
{/if}

<style>
	/*
	 * Tucked under the banner's bottom edge (the art is open at the top). Its height is what the
	 * HUD makes room for under the banner (`--clock-h` in Hud.svelte).
	 */
	.clock {
		position: absolute;
		/* Over the backdrop of a dialog too, so the time stays in sight while discarding or robbing. */
		z-index: 41;
		top: calc(var(--s) * 13);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		box-sizing: border-box;
		height: calc(var(--s) * 11);
		min-width: calc(var(--s) * 20);
		padding: 0 calc(var(--s) * 2);
		border-style: solid;
		border-width: var(--s) var(--s) calc(var(--s) * 2) calc(var(--s) * 2);
		border-image: var(--tab) 1 1 2 2 fill / var(--s) var(--s) calc(var(--s) * 2) calc(var(--s) * 2)
			stretch;
		pointer-events: auto;
		filter: drop-shadow(0 4px 5px rgba(0, 0, 0, 0.4));
	}
	.time {
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		line-height: 1;
		text-align: center;
		color: #fff6e0;
		text-shadow:
			2px 0 0 #1a0c05,
			-2px 0 0 #1a0c05,
			0 2px 0 #1a0c05,
			0 -2px 0 #1a0c05,
			2px 2px 0 #1a0c05,
			-2px 2px 0 #1a0c05,
			2px -2px 0 #1a0c05,
			-2px -2px 0 #1a0c05;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.bar {
		height: var(--s);
		background: rgba(10, 4, 2, 0.6);
	}
	/* It drains by shrinking from the right (a transform, so the page isn't laid out again ten times a second). */
	.bar i {
		display: block;
		height: 100%;
		background: linear-gradient(180deg, #ffe08a, #f2b431);
		transform-origin: left;
		transition: transform 0.1s linear;
	}
	.low .time {
		color: #ffb4a0;
	}
	.low .bar i {
		background: linear-gradient(180deg, #ff9a7a, #e04b35);
	}
	.clock.paused {
		filter: grayscale(0.8) drop-shadow(0 4px 5px rgba(0, 0, 0, 0.4));
	}
	@media (max-width: 900px) {
		.clock {
			height: calc(var(--s) * 13);
			min-width: calc(var(--s) * 18);
		}
		.time {
			font-size: 13px;
			text-shadow:
				1px 0 0 #1a0c05,
				-1px 0 0 #1a0c05,
				0 1px 0 #1a0c05,
				0 -1px 0 #1a0c05,
				1px 1px 0 #1a0c05,
				-1px 1px 0 #1a0c05,
				1px -1px 0 #1a0c05,
				-1px -1px 0 #1a0c05;
		}
	}
</style>
