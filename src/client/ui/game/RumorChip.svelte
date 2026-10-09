<script lang="ts">
	import { EVENT_INFO, nextFlip, roundOf } from '../../../shared/rules/events';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { EVENT_ART, TONE_COLOR } from './eventArt';
	import { eventUi } from './eventUi.svelte';
	import { t } from '../../i18n/index.svelte';

	/**
	 * Reign Extended: the rumor at your tavern, beside this round's card in the corner. It is the
	 * next Event card to turn over; clicking it holds that card up.
	 */
	const view = $derived(client.view!);
	const rumor = $derived(view.events?.rumor ?? null);
	const info = $derived(rumor ? EVENT_INFO[rumor] : null);
	const round = $derived(roundOf(view.turn, view.players.length));
	/** The round the card turns over in. */
	const flips = $derived(view.events ? nextFlip(round, view.events.every) : round + 1);
	const when = $derived(
		flips === round + 1 ? t('It turns over when the next round starts.') : t('It turns over in {n} rounds.', { n: flips - round })
	);

	function click() {
		if (rumor) eventUi.shown = { card: rumor, round: flips, seq: -1, flip: false, rumor: true };
	}
</script>

{#if rumor && info && view.phase === 'main'}
	<button
		class="rumor-chip plaque"
		style="--tone:{TONE_COLOR[info.tone]}"
		title={t(info.text)}
		data-tip-head={t('Rumor at your tavern: {event}', { event: t(info.name) })}
		data-tip-note={when}
		data-tip-tone="time"
		onclick={click}
	>
		<span class="art">
			<img src={EVENT_ART[rumor]} alt="" />
			<img class="mug" src={PIXEL.tankard} alt="" />
		</span>
		<span class="name">{t(info.name)}</span>
	</button>
{/if}

<style>
	.rumor-chip {
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
	.art {
		position: relative;
		display: grid;
	}
	.art img {
		width: 30px;
		height: 30px;
		image-rendering: pixelated;
		/* Still to come: a little faded. */
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5)) saturate(0.6) brightness(0.9);
	}
	.art .mug {
		position: absolute;
		right: -7px;
		bottom: -5px;
		width: 17px;
		height: 16px;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.7));
	}
	.name {
		font-family: var(--px);
		font-size: 13px;
		color: var(--muted);
		text-shadow: var(--outline-dark);
		white-space: nowrap;
		margin-left: 4px;
	}
	/* Narrow screens: the picture alone (the tooltip names the card). */
	@media (max-width: 1280px) {
		.rumor-chip {
			justify-content: center;
			padding: 0;
		}
		.name {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.art img {
			width: 24px;
			height: 24px;
		}
	}
</style>
