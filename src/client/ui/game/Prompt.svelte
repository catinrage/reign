<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { myTurn, promptText } from '../helpers';
	import { PIXEL } from '../pixel';
	import TurnClock from './TurnClock.svelte';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	const text = $derived(
		ui.build && view.step === 'main'
			? `Click a glowing spot to place your ${ui.build}`
			: promptText(view)
	);
	const mine = $derived(myTurn(view));
	const color = $derived(view.players[view.current]?.color ?? 'white');
	const ended = $derived(view.phase === 'ended');
</script>

<div class="wrap" class:timed={!!client.clock}>
	{#key text}
		<div class="prompt">
			<div class="ribbon" class:mine style="--rib: var(--art-ribbon-{ended ? 'gold' : color})">
				{#if !mine && !ended}<img class="icon-px" src={PIXEL.hourglass} alt="" />{/if}
				<span class="text">{text}</span>
			</div>
			{#if ui.build}
				<button class="btn small wood" onclick={() => (ui.build = null)}>Cancel</button>
			{/if}
		</div>
	{/key}
	<TurnClock />
</div>

<style>
	.wrap {
		position: absolute;
		top: 14px;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.prompt {
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: calc(100vw - 580px);
		animation: drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.ribbon {
		max-width: 100%;
		font-size: 19px;
		pointer-events: auto;
	}
	.ribbon.mine {
		animation: glow 1.8s ease-in-out infinite 0.4s;
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
	.prompt .btn {
		pointer-events: auto;
	}
	@media (min-width: 901px) {
		/* Leave room for the turn clock beside the ribbon. */
		.timed .prompt {
			max-width: calc(100vw - 720px);
		}
	}
	@media (max-width: 900px) {
		.wrap {
			top: 62px;
		}
		.prompt {
			max-width: calc(100vw - 32px);
		}
		.ribbon {
			font-size: 15px;
		}
	}
</style>
