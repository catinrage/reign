<script lang="ts">
	import { DEV_CARDS, type DevCardType } from '../../../shared/rules/config';
	import { discardLimit, roadSpots, safeCards } from '../../../shared/rules/queries';
	import { client } from '../../state/client.svelte';
	import DevCard from '../DevCard.svelte';
	import { RESOURCES, myTurn } from '../helpers';
	import { PIXEL } from '../pixel';
	import ResCard from '../ResCard.svelte';
	import { dialogs } from './dialogs.svelte';
	import { msg, t } from '../../i18n/index.svelte';

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
	/** Cards my storehouse keeps safe, which a 7 doesn't count. */
	const safe = $derived(safeCards(view, view.me));
	// One card per kind you hold, with a count, in the deck's order.
	const groups = $derived(
		DEV_CARDS.map((type) => ({
			type,
			total: dev.filter((c) => c.type === type).length,
			ready: dev.filter((c) => c.type === type && c.boughtTurn < view.turn).length
		}))
			.filter((g) => g.total > 0)
			.map((g) => ({ ...g, blocked: blocked(g.type, g.ready) }))
	);
	// Why a card can't be played right now, or null when it can. The same checks the rules make,
	// in the order a player would want to hear them.
	const STEP_WAIT: Partial<Record<string, string>> = {
		setupSettlement: msg('Place your starting pieces first.'),
		setupRoad: msg('Place your starting pieces first.'),
		discard: msg('Wait until everyone has discarded.'),
		moveRobber: msg('Move the robber first.'),
		steal: msg('Pick someone to rob first.'),
		roadBuilding: msg('Place your free roads first.')
	};
	function blocked(type: DevCardType, ready: number): string | null {
		if (type === 'victoryPoint') return null;
		if (view.phase === 'ended') return t('The game is over.');
		if (!myTurn(view)) return t('Wait for your turn to play it.');
		if (client.lobby?.pausedBy) return t('The game is paused.');
		if (client.tossing) return t('Wait for the dice to land.');
		if (client.presenting) return t('Wait for the event to play out.');
		if (ready === 0) return t('Bought this turn: play it from your next turn.');
		if (view.devCardPlayedThisTurn)
			return t('You already played a development card this turn. Only one per turn.');
		if (view.step !== 'roll' && view.step !== 'main') {
			const wait = STEP_WAIT[view.step];
			return wait ? t(wait) : t("You can't play a card right now.");
		}
		if (type === 'roadBuilding') {
			if (me.piecesLeft.road <= 0) return t('You have no roads left to place.');
			if (roadSpots(view, view.me).length === 0) return t('There is nowhere left to build a road.');
		}
		if (type === 'yearOfPlenty' && RESOURCES.reduce((n, r) => n + view.bank[r], 0) < 2)
			return t('The bank is out of resources.');
		return null;
	}

	function play(type: DevCardType) {
		if (type === 'knight') client.act({ type: 'playKnight' });
		else if (type === 'roadBuilding') client.act({ type: 'playRoadBuilding' });
		else if (type === 'yearOfPlenty') dialogs.open = 'yearOfPlenty';
		else if (type === 'monopoly') dialogs.open = 'monopoly';
	}
</script>

{#if res}
	<div class="hand">
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
					? safe
						? t('More than {limit} cards: on a 7 you will discard half of those beyond the {safe} your storehouse keeps safe', { limit, safe })
						: t('More than {limit} cards: you will discard half on a 7', { limit })
					: safe
						? t('Cards in hand (your storehouse keeps {safe} safe)', { safe })
						: t('Cards in hand')}
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
									playable={g.type !== 'victoryPoint' && !g.blocked}
									reason={g.blocked ?? undefined}
									onclick={() => play(g.type)}
								/>
							</div>
						{/key}
					</div>
				{:else}
					<DevCard count={0} />
				{/each}
			</div>
			<div class="total" title={t('Development cards in hand')}>
				<img class="icon-px" src={PIXEL.dev} alt="" />{dev.length}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Resources, then development cards, centered in the room left between the chronicle and the
	   build panel. When both trays do not fit side by side, the development cards go on top. */
	.hand {
		position: absolute;
		bottom: 10px;
		left: 326px;
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
	/* With room to spare, they center on the screen. */
	@media (min-width: 1700px) {
		.hand {
			left: 450px;
		}
	}
	/* Laptop widths: smaller cards and slimmer trays, so both still fit side by side. */
	@media (min-width: 901px) and (max-width: 1440px) {
		.tray {
			--s: 2.6px;
			padding: 13px 8px 3px;
		}
		.cards {
			gap: 5px;
		}
		.cards :global(.card) {
			--w: 50px !important;
			--cp: 2px !important;
		}
	}
	/* Too narrow to keep clear of the build panel: center on the screen as before. */
	@media (max-width: 1240px) {
		.hand {
			left: 12px;
			right: 12px;
		}
	}
	@media (max-width: 900px) {
		.hand {
			left: 6px;
			right: 6px;
			/* On phones the build deck and its buttons sit under the hand, so the hand stands on them. */
			bottom: max(64px, calc(var(--actions-h, 0px) + 16px));
			gap: 30px 6px;
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
