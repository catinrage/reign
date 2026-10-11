<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { myTurn, pathsClosed, promptText } from '../helpers';
	import { PIXEL } from '../pixel';
	import TurnClock from './TurnClock.svelte';
	import { powerPick } from './power';
	import { ui } from './ui.svelte';

	/** What to click to build this. */
	function buildPrompt(build: NonNullable<typeof ui.build>): string {
		switch (build) {
			case 'workshop':
				return t('Click a glowing tile to build your workshop');
			case 'stoneRoad':
				return t('Click one of your roads to pave it with stone');
			case 'storehouse':
				return t('Click a glowing building to add your storehouse');
			case 'tavern':
				return t('Click a glowing building to add your tavern');
			case 'tearDown':
				return t('Click one of your workshops to tear it down');
			case 'road':
				return t('Click a glowing spot to place your road');
			case 'settlement':
				return t('Click a glowing spot to place your settlement');
			case 'city':
				return t('Click a glowing spot to place your city');
			case 'castle':
				return t('Click one of your cities to make it a castle');
			case 'guildHall':
				return t('Click one of your cities to make it a guild hall');
			case 'fortress':
				return t('Click one of your cities to make it your fortress');
		}
	}

	const view = $derived(client.view!);
	const power = $derived(ui.power?.stage === 'pick' ? powerPick(view, ui.power.first) : null);
	const text = $derived(
		power
			? power.prompt
			: ui.build && view.step === 'main'
				? buildPrompt(ui.build)
				: ui.paths && view.step === 'main'
					? pathsClosed(view) || t('Pick a path for one of your cities')
					: promptText(view)
	);
	const mine = $derived(myTurn(view));
	const color = $derived(view.players[view.current]?.color ?? 'white');
	const ended = $derived(view.phase === 'ended');
</script>

<div class="wrap" style:--corner="{ui.cornerWidth ? 14 + ui.cornerWidth + 12 : 290}px">
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
				}}>{t('Cancel')}</button
			>
		{/if}
	</div>
</div>

<style>
	/* The banner sits in the middle of the screen when it can. A long one beside a wide corner row
	   (the round's event card at 1366x768) moves right until it clears the row, and never under
	   the player list. */
	.wrap {
		position: absolute;
		top: 14px;
		left: 0;
		right: 0;
		display: grid;
		grid-template-columns: minmax(var(--corner), 1fr) auto minmax(290px, 1fr);
		pointer-events: none;
	}
	.prompt {
		grid-column: 2;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
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
			display: flex;
			justify-content: center;
		}
		.prompt {
			max-width: calc(100vw / var(--ui-zoom) - 32px);
		}
		.ribbon {
			font-size: 15px;
		}
	}
</style>
