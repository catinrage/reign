<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { myTurn } from '../helpers';
	import { PIXEL } from '../pixel';

	const view = $derived(client.view!);
	const total = $derived((client.lobby?.turnTime ?? 0) * 1000);
	const left = $derived(view.phase === 'ended' || !total ? null : client.timeLeft);
	const secs = $derived(Math.ceil((left ?? 0) / 1000));
	const running = $derived(!!client.clock?.running);
</script>

{#if left !== null}
	<div
		class="clock plaque"
		class:mine={myTurn(view)}
		class:low={secs <= 10}
		class:paused={!running}
		role="timer"
		aria-label="Time left this turn"
		title={running ? 'Time left this turn' : 'Paused'}
	>
		<img class="icon-px" src={PIXEL.watch} alt="" />
		<span class="time">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
		<span class="bar"><i style="width:{Math.min(100, (100 * left) / total)}%"></i></span>
	</div>
{/if}

<style>
	.clock {
		position: relative;
		/* Above dialog backdrops, so the time stays in sight while discarding or robbing. */
		z-index: 41;
		display: grid;
		grid-template-columns: auto auto;
		align-items: center;
		align-self: center;
		column-gap: 7px;
		row-gap: 3px;
		margin-left: 8px;
		padding: 1px 9px 2px 3px;
		pointer-events: auto;
		filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.45));
		animation: drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.clock.mine {
		animation:
			drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1),
			glow 1.8s ease-in-out 0.4s infinite;
	}
	img {
		grid-row: 1 / 3;
		width: 28px;
		height: 30px;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.6));
	}
	.time {
		font-family: var(--px);
		font-weight: 700;
		font-size: 21px;
		line-height: 1;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
		font-variant-numeric: tabular-nums;
	}
	/* The time left drains like the volume sliders fill. */
	.bar {
		width: 58px;
		height: calc(var(--s) * 2);
		border: calc(var(--s) * 1) solid #140904;
		background: #22120a;
	}
	.bar i {
		display: block;
		height: 100%;
		background: linear-gradient(180deg, #ffe08a, #f2b431 50%, #c47a12);
		transition: width 0.1s linear;
	}
	.low .time {
		color: #ff9a80;
	}
	.low .bar i {
		background: linear-gradient(180deg, #ff9a7a, #e04b35 50%, #a82c1c);
	}
	.clock.paused {
		filter: grayscale(0.8) drop-shadow(0 6px 8px rgba(0, 0, 0, 0.45));
		animation: none;
	}
	@media (max-width: 900px) {
		/* Phones: on the right, level with the menu and chronicle buttons under the ribbon. */
		.clock {
			position: absolute;
			top: 42px;
			right: 6px;
			margin: 0;
			column-gap: 5px;
			padding: 0 6px 1px 2px;
		}
		img {
			width: 20px;
			height: 22px;
		}
		.time {
			font-size: 17px;
		}
		.bar {
			width: 44px;
		}
	}
</style>
