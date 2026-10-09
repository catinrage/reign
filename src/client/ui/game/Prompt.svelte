<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { myTurn, promptText } from '../helpers';
	import { PIXEL } from '../pixel';
	import TurnClock from './TurnClock.svelte';
	import { powerPick } from './power';
	import { ui } from './ui.svelte';

	/** What to click to build these (anything else goes on a glowing spot). */
	const BUILD_PROMPT: Partial<Record<NonNullable<typeof ui.build>, string>> = {
		workshop: 'Click a glowing tile to build your workshop',
		stoneRoad: 'Click one of your roads to pave it with stone',
		tearDown: 'Click one of your workshops to tear it down'
	};

	const view = $derived(client.view!);
	const power = $derived(ui.power?.stage === 'pick' ? powerPick(view, ui.power.first) : null);
	const text = $derived(
		power
			? power.prompt
			: ui.build && view.step === 'main'
				? (BUILD_PROMPT[ui.build] ?? `Click a glowing spot to place your ${ui.build}`)
				: promptText(view)
	);
	const mine = $derived(myTurn(view));
	const color = $derived(view.players[view.current]?.color ?? 'white');
	const ended = $derived(view.phase === 'ended');
</script>

<div class="wrap">
	<div class="prompt">
		<!-- The banner drops in anew with each prompt; the clock under it stays put. -->
		<div class="banner">
			{#key text}
				<div class="ribbon" class:mine style="--rib: var(--art-ribbon-{ended ? 'gold' : color})">
					{#if !mine && !ended}<img class="icon-px" src={PIXEL.hourglass} alt="" />{/if}
					<span class="text">{text}</span>
				</div>
			{/key}
			<TurnClock {color} />
		</div>
		{#if ui.build || power}
			<button
				class="btn small wood"
				onclick={() => {
					ui.build = null;
					ui.power = null;
				}}>Cancel</button
			>
		{/if}
	</div>
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
	}
	.banner {
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
	.prompt .btn {
		pointer-events: auto;
		animation: drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	@media (max-width: 900px) {
		/* Under the plaques, clear of the turn tab that hangs from one of them. */
		.wrap {
			top: 68px;
		}
		.prompt {
			max-width: calc(100vw - 32px);
		}
		.ribbon {
			font-size: 15px;
		}
	}
</style>
