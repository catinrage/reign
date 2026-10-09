<script lang="ts">
	import {
		EVENT_CARDS,
		EVENT_INFO,
		TONE_LABEL,
		cleanEventRules,
		eventPool,
		inDeckKind,
		type EventCard,
		type EventRules
	} from '../../../shared/rules/events';
	import { client } from '../../state/client.svelte';
	import { EVENT_ART, TONE_COLOR } from '../game/eventArt';
	import Modal from '../menu/Modal.svelte';
	import { t } from '../../i18n/index.svelte';

	/**
	 * Reign Extended's Events deck in the lobby: a plaque saying how it's set, and a panel where the
	 * host turns it on or off, picks how often a card turns over, gentle or wild, and pulls cards.
	 */

	const lobby = $derived(client.lobby!);
	const rules = $derived(cleanEventRules(lobby.settings.events));
	const pool = $derived(eventPool(rules));
	let open = $state(false);

	const summary = $derived(!rules.on || !pool.length ? t('Off') : rules.every === 1 ? t('Every round') : t('Every other'));
	const detail = $derived(
		!rules.on
			? t('No event cards.')
			: !pool.length
				? t('Every card is pulled.')
				: rules.wild
					? t('{n, plural, one {Wild deck, # card} other {Wild deck, # cards}}', { n: pool.length })
					: t('{n, plural, one {Gentle deck, # card} other {Gentle deck, # cards}}', { n: pool.length })
	);

	function set(change: Partial<EventRules>) {
		client.send({ t: 'setEvents', events: { ...rules, ...change } });
	}
	function toggle(c: EventCard) {
		set({ pulled: rules.pulled.includes(c) ? rules.pulled.filter((x) => x !== c) : [...rules.pulled, c] });
	}
</script>

<button class="pick plaque" title={client.isHost ? t('Choose events') : t('See the deck')} onclick={() => (open = true)}>
	<span class="face well"><img src={EVENT_ART.comet} alt="" class:dim={!rules.on || !pool.length} /></span>
	<span class="pick-body">
		<span class="label">{t('Events')}</span>
		<span class="pick-name title">{summary}</span>
		<span class="trait">{detail}</span>
		<span class="change">{client.isHost ? t('Choose events') : t('See the deck')}</span>
	</span>
</button>

{#if open}
	<Modal title={t('Events deck')} width={640} onclose={() => (open = false)}>
		<p>
			{t('A card turns over as each round starts and bends the rules until the next one. Bots play every card.')}{#if !client.isHost}
				{' '}{t('The host sets up the deck.')}{/if}
		</p>
		{#if client.isHost}
			<div class="controls">
				<div class="seg" role="radiogroup" aria-label={t('Events')}>
					<button class="btn small" class:on={rules.on} role="radio" aria-checked={rules.on} onclick={() => set({ on: true })}>{t('On')}</button>
					<button class="btn small" class:on={!rules.on} role="radio" aria-checked={!rules.on} onclick={() => set({ on: false })}>{t('Off')}</button>
				</div>
				<div class="seg" role="radiogroup" aria-label={t('How often')}>
					<button class="btn small" class:on={rules.every === 1} disabled={!rules.on} onclick={() => set({ every: 1 })}>{t('Every round')}</button>
					<button class="btn small" class:on={rules.every === 2} disabled={!rules.on} onclick={() => set({ every: 2 })}>{t('Every other')}</button>
				</div>
				<div class="seg" role="radiogroup" aria-label={t('Kind of deck')}>
					<button
						class="btn small"
						class:on={!rules.wild}
						disabled={!rules.on}
						title={t('Only cards that help, catch players up or shake things up. Nothing takes your cards.')}
						onclick={() => set({ wild: false })}>{t('Gentle')}</button
					>
					<button class="btn small" class:on={rules.wild} disabled={!rules.on} title={t('Every card, hardships too.')} onclick={() => set({ wild: true })}
						>{t('Wild')}</button
					>
				</div>
			</div>
		{:else}
			<p class="state title">{summary}{rules.on && pool.length ? ` · ${rules.wild ? t('Wild') : t('Gentle')}` : ''}</p>
		{/if}
		<div class="list" class:off={!rules.on}>
			{#each EVENT_CARDS as c (c)}
				{@const info = EVENT_INFO[c]}
				{@const kind = inDeckKind(c, rules.wild)}
				{@const inDeck = kind && !rules.pulled.includes(c)}
				<div class="row plaque" class:out={!inDeck} style="--tone:{TONE_COLOR[info.tone]}">
					<img class="art" src={EVENT_ART[c]} alt="" />
					<div class="body">
						<span class="name title">{t(info.name)} <small>{t(TONE_LABEL[info.tone])}</small></span>
						<span class="text">{t(info.text)}</span>
					</div>
					{#if !kind}
						<span class="note">{t('Wild only')}</span>
					{:else if client.isHost}
						<button
							class="btn small toggle"
							class:on={inDeck}
							disabled={!rules.on}
							aria-pressed={inDeck}
							title={inDeck ? t('Take this card out of the deck') : t('Put this card back in the deck')}
							onclick={() => toggle(c)}>{inDeck ? t('In') : t('Out')}</button
						>
					{:else}
						<span class="note">{inDeck ? t('In') : t('Out')}</span>
					{/if}
				</div>
			{/each}
		</div>
	</Modal>
{/if}

<style>
	.pick {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.pick:hover {
		transform: translateY(-2px);
	}
	.face {
		display: grid;
		place-items: center;
		flex: none;
		width: 78px;
		height: 70px;
		background: radial-gradient(ellipse, #3c3a6a, #1c1a3a);
		background-clip: padding-box;
	}
	.face img {
		width: 48px;
		height: 48px;
		image-rendering: pixelated;
		filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
	}
	.face img.dim {
		filter: grayscale(1) brightness(0.7);
	}
	.pick-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.pick-name {
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.trait {
		font-size: 13px;
		line-height: 1.3;
		color: #f1dfc2;
	}
	.change {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: var(--gold);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		padding-top: 6px;
	}
	.state {
		color: var(--gold);
		font-size: 16px;
	}
	.list {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		padding-top: 10px;
		max-height: min(calc(56vh / var(--ui-zoom)), 520px);
		overflow-y: auto;
	}
	.list.off {
		filter: grayscale(0.7) brightness(0.8);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		box-shadow: inset 3px 0 0 var(--tone);
		transition: filter 0.15s;
	}
	.row.out {
		filter: grayscale(0.8) brightness(0.75);
	}
	.art {
		flex: none;
		width: 34px;
		height: 34px;
		image-rendering: pixelated;
	}
	.body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.name {
		font-size: 14px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.name small {
		font-family: var(--px);
		font-size: 10px;
		color: var(--tone);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		text-shadow: none;
	}
	.text {
		font-size: 12px;
		line-height: 1.25;
		color: #f1dfc2;
	}
	.toggle {
		flex: none;
		min-width: 46px;
	}
	.note {
		flex: none;
		font-family: var(--px);
		font-size: 11px;
		font-weight: 700;
		color: var(--muted);
	}
	@media (max-width: 620px) {
		.list {
			grid-template-columns: 1fr;
		}
	}
</style>
