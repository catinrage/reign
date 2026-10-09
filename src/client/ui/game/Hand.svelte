<script lang="ts">
	import {
		DEV_CARDS,
		DEV_CARD_LABEL,
		DEV_CARD_TEXT,
		type DevCardType
	} from '../../../shared/rules/config';
	import { client } from '../../state/client.svelte';
	import { RESOURCES, myTurn } from '../helpers';
	import { PIXEL } from '../pixel';
	import ResCard from '../ResCard.svelte';
	import { dialogs } from './dialogs.svelte';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	const me = $derived(view.players[view.me]);
	const res = $derived.by(() => {
		const held = me?.resources;
		if (!held) return undefined;
		// Cards dealt on the board count once they have flown into the hand.
		const shown = { ...held };
		for (const r of RESOURCES) shown[r] = Math.max(0, held[r] - client.onTheWay(view.me, r));
		return shown;
	});
	const dev = $derived(me?.devCards ?? []);
	const total = $derived(res ? RESOURCES.reduce((n, r) => n + res[r], 0) : 0);
	const groups = $derived(
		DEV_CARDS.map((type) => ({
			type,
			total: dev.filter((c) => c.type === type).length,
			ready: dev.filter((c) => c.type === type && c.boughtTurn < view.turn).length
		})).filter((g) => g.total > 0)
	);
	// On phones the build bar sits under the hand, so the hand moves up while it shows.
	const raised = $derived(myTurn(view) && view.step === 'main' && !ui.trade);
	const canPlay = $derived(
		myTurn(view) &&
			!client.tossing &&
			(view.step === 'roll' || view.step === 'main') &&
			!view.devCardPlayedThisTurn
	);

	function play(type: DevCardType) {
		if (type === 'knight') client.act({ type: 'playKnight' });
		else if (type === 'roadBuilding') client.act({ type: 'playRoadBuilding' });
		else if (type === 'yearOfPlenty') dialogs.open = 'yearOfPlenty';
		else if (type === 'monopoly') dialogs.open = 'monopoly';
	}
</script>

{#if res}
	<div class="hand" class:raised>
		<div class="tray panel">
			<div class="cards">
				{#each RESOURCES as r, i (r)}
					<div class="slot" data-hand={r} style="--i:{i - 2}">
						{#key res[r]}
							<div class="bump">
								<ResCard res={r} count={res[r]} dim={res[r] === 0} size={58} />
							</div>
						{/key}
					</div>
				{/each}
			</div>
			<div
				class="total"
				class:warn={total > 7}
				title={total > 7 ? 'More than 7 cards: you will discard half on a 7' : 'Cards in hand'}
			>
				<img class="icon-px" src={PIXEL.cards} alt="" />{total}
			</div>
		</div>
		{#if groups.length}
			<div class="dev">
				{#each groups as g (g.type)}
					{@const playable = canPlay && g.type !== 'victoryPoint' && g.ready > 0}
					<button
						class="devcard"
						class:playable
						disabled={!playable}
						onclick={() => play(g.type)}
						title="{DEV_CARD_LABEL[g.type]}: {DEV_CARD_TEXT[g.type]}{g.ready < g.total &&
						g.type !== 'victoryPoint'
							? ' (new cards can be played next turn)'
							: ''}"
					>
						<img class="icon-px" src={PIXEL[g.type]} alt="" />
						<span class="dname">{DEV_CARD_LABEL[g.type]}</span>
						{#if g.total > 1}<span class="n">{g.total}</span>{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.hand {
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: flex-end;
		gap: 12px;
		pointer-events: none;
	}
	.tray {
		position: relative;
		padding: 16px 12px 4px;
		pointer-events: auto;
	}
	.cards {
		display: flex;
		gap: 6px;
	}
	.slot {
		transform: rotate(calc(var(--i) * 2.5deg)) translateY(calc(var(--i) * var(--i) * 1.5px));
		transition: transform 0.15s;
	}
	.slot:hover {
		transform: rotate(0deg) translateY(-8px);
		z-index: 2;
	}
	.bump {
		animation: bump 0.35s ease-out;
	}
	@keyframes bump {
		40% {
			transform: translateY(-12px) scale(1.1);
		}
	}
	/* On the tray's top edge, clear of the cards and their counts. */
	.total {
		position: absolute;
		top: -29px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 10px 3px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		border-style: solid;
		border-width: calc(var(--s) * 3);
		border-image: var(--art-plaque) 4 fill / calc(var(--s) * 3) round;
		white-space: nowrap;
	}
	.total img {
		width: 16px;
		height: 16px;
	}
	.total.warn {
		color: #ffb09a;
	}
	.dev {
		display: flex;
		flex-direction: column-reverse;
		gap: 6px;
		pointer-events: auto;
	}
	.devcard {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 150px;
		padding: 0 10px 0 4px;
		height: 44px;
		box-sizing: border-box;
		border-style: solid;
		border-width: 6px;
		border-image: var(--art-card-dev) 3 fill / 6px stretch;
		background: none;
		font-family: var(--px);
		font-size: 14px;
		font-weight: 700;
		color: #fff3ff;
		text-shadow: 0 2px 0 rgba(30, 10, 60, 0.8);
		cursor: default;
		opacity: 0.7;
		filter: drop-shadow(0 3px 0 rgba(20, 8, 40, 0.6));
		transition: transform 0.15s;
	}
	.devcard img {
		width: 26px;
		height: 26px;
	}
	.devcard.playable {
		opacity: 1;
		cursor: pointer;
		animation: bob 1.6s ease-in-out infinite;
	}
	.devcard.playable:hover {
		transform: translateX(-4px);
		filter: brightness(1.15) drop-shadow(0 0 6px rgba(190, 150, 255, 0.9));
	}
	.n {
		position: absolute;
		top: -14px;
		right: -14px;
		width: 24px;
		height: 24px;
		background: var(--art-badge) center / 100% 100%;
		display: grid;
		place-items: center;
		font-size: 13px;
		color: #fff3d6;
	}
	@media (max-width: 900px) {
		.hand {
			bottom: 64px;
			gap: 6px;
		}
		.hand.raised {
			bottom: 156px;
		}
		.tray {
			padding: 12px 6px 2px;
		}
		.cards {
			gap: 3px;
		}
		.cards :global(.card) {
			--w: 44px !important;
			--cp: 2px !important;
		}
		.devcard {
			min-width: 0;
			height: 40px;
			padding-right: 4px;
		}
		.dname {
			display: none;
		}
	}
</style>
