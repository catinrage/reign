<script lang="ts">
	import { DEV_CARDS, type DevCardType } from '../../../shared/rules/config';
	import { discardLimit } from '../../../shared/rules/queries';
	import { client } from '../../state/client.svelte';
	import DevCard from '../DevCard.svelte';
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
	const limit = $derived(discardLimit(view, view.me));
	// One card per kind you hold, with a count, in the deck's order.
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
				class:warn={total > limit}
				title={total > limit
					? `More than ${limit} cards: you will discard half on a 7`
					: 'Cards in hand'}
			>
				<img class="icon-px" src={PIXEL.cards} alt="" />{total}
			</div>
		</div>
		<div class="tray panel">
			<div class="cards">
				{#each groups as g, i (g.type)}
					<div class="slot" style="--i:{i - (groups.length - 1) / 2}">
						{#key g.total}
							<div class="bump">
								<DevCard
									type={g.type}
									count={g.total}
									waiting={g.total - g.ready}
									playable={canPlay && g.type !== 'victoryPoint' && g.ready > 0}
									onclick={() => play(g.type)}
								/>
							</div>
						{/key}
					</div>
				{:else}
					<DevCard count={0} />
				{/each}
			</div>
			<div class="total" title="Development cards in hand">
				<img class="icon-px" src={PIXEL.dev} alt="" />{dev.length}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Resources, then development cards, centered in the space between the chronicle and the
	   build panel. When both trays do not fit side by side, the development cards go on top. */
	.hand {
		position: absolute;
		bottom: 10px;
		left: 330px;
		right: 450px;
		display: flex;
		flex-wrap: wrap-reverse;
		justify-content: center;
		align-items: flex-end;
		gap: 34px 12px;
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
	@media (max-width: 1180px) {
		.hand {
			left: 12px;
			right: 12px;
		}
	}
	@media (max-width: 900px) {
		.hand {
			left: 6px;
			right: 6px;
			bottom: 64px;
			gap: 30px 6px;
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
	}
</style>
