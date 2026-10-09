<script lang="ts">
	import { EVENT_INFO, roundOf } from '../../../shared/rules/events';
	import { client } from '../../state/client.svelte';
	import { EVENT_ART, TONE_COLOR } from './eventArt';
	import { eventUi } from './eventUi.svelte';
	import { t } from '../../i18n/index.svelte';

	/**
	 * Reign Extended: this round's event card, in the corner beside the turn counter. Clicking it
	 * holds the card up again, or opens the Bountiful Year's free card while it waits for you.
	 */
	const view = $derived(client.view!);
	const events = $derived(view.events);
	const round = $derived(roundOf(view.turn, view.players.length));
	const choosing = $derived(view.step === 'eventChoice' ? (events?.choice ?? null) : null);
	const card = $derived(choosing ? 'royalDecree' : (events?.current ?? null));
	const bounty = $derived(!client.spectating && view.me >= 0 && !!events?.bounty.includes(view.me) && view.phase === 'main');
	const info = $derived(card ? EVENT_INFO[card] : null);
	const note = $derived(
		choosing
			? choosing.player === view.me
				? t('You pick the event.')
				: t('{player} is picking the event.', { player: view.players[choosing.player]?.name ?? '' })
			: bounty
				? t('Click to take your free card.')
				: info
					? info.lasts
						? t('Lasts until the next round starts.')
						: t('Happened when the card turned over.')
					: undefined
	);

	function click() {
		if (bounty) eventUi.bountyOpen = true;
		else if (card && !choosing) eventUi.shown = { card, round, seq: -1, flip: false };
	}
</script>

{#if events && view.phase === 'main'}
	<button
		class="event-chip plaque"
		class:quiet={!card}
		class:glow={bounty}
		style="--tone:{info ? TONE_COLOR[info.tone] : 'transparent'}"
		title={info ? t(info.text) : events.every === 2 ? t('Event cards turn over every other round.') : t('No event this round.')}
		data-tip-head={info ? t('Event: {event}', { event: t(info.name) }) : t('No event this round')}
		data-tip-note={note}
		data-tip-tone={bounty ? 'good' : undefined}
		onclick={click}
	>
		{#if card}
			<img src={EVENT_ART[card]} alt="" />
			<span class="name">{t(info!.name)}</span>
		{:else}
			<span class="name none">{t('No event')}</span>
		{/if}
	</button>
{/if}

<style>
	.event-chip {
		margin: 0;
		font: inherit;
		color: inherit;
		pointer-events: auto;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: calc(var(--s) * 16);
		min-width: calc(var(--s) * 16);
		box-sizing: border-box;
		padding: 0 calc(var(--s) * 3) 0 calc(var(--s) * 2);
		box-shadow: inset 0 -3px 0 var(--tone);
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.event-chip.quiet {
		opacity: 0.7;
	}
	.event-chip.glow {
		animation: glow 1.8s ease-in-out infinite;
	}
	img {
		width: 30px;
		height: 30px;
		image-rendering: pixelated;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5));
	}
	.name {
		font-family: var(--px);
		font-size: 15px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
		white-space: nowrap;
	}
	.none {
		color: var(--muted);
		font-size: 13px;
	}
	/* Narrow screens: the picture alone (the tooltip names the card). */
	@media (max-width: 1280px) {
		.event-chip {
			justify-content: center;
			padding: 0;
		}
		.event-chip:has(img) .name {
			display: none;
		}
		.none {
			font-size: 10px;
			white-space: normal;
			text-align: center;
			line-height: 1;
		}
	}
	@media (max-width: 900px) {
		img {
			width: 24px;
			height: 24px;
		}
	}
</style>
