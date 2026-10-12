<script lang="ts">
	import { CHARACTER_INFO, STEWARD_EXTRA } from '../../../shared/rules/characters';
	import { DEV_CARDS, DEV_CARD_LABEL, DISCARD_THRESHOLD, RESOURCES, type DevCardType } from '../../../shared/rules/config';
	import {
		BANK_MAX,
		BANK_MIN,
		DECK_MAX,
		STANDARD_HOUSE_RULES,
		deckSize,
		isStandard,
		standardBank,
		standardDeck,
		type DevDeck,
		type HouseRules
	} from '../../../shared/rules/house';
	import { HAND_LIMIT_MAX, HAND_LIMIT_MIN, characterPool } from '../../../shared/rules/modes';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { RESOURCE_LABEL } from '../helpers';
	import Modal from '../menu/Modal.svelte';
	import { PIXEL } from '../pixel';
	import Stepper from './Stepper.svelte';
	import { t } from '../../i18n/index.svelte';

	/**
	 * House rules in the lobby, for both modes: a row saying what differs from the standard game,
	 * and a panel where the host sets the hand limit, the bank and the development deck. A bank or
	 * deck left standard grows with the table; one the host set stays as set.
	 */

	const lobby = $derived(client.lobby!);
	const settings = $derived(lobby.settings);
	const house = $derived<HouseRules>(settings.house ?? STANDARD_HOUSE_RULES);
	const players = $derived(lobby.seats.length);
	const bank = $derived(house.bank ?? standardBank(players));
	const deck = $derived(house.deck ?? standardDeck(players));
	const cards = $derived(deckSize(deck));
	const host = $derived(client.isHost);
	const steward = $derived(settings.mode === 'extended' && settings.characters && characterPool(settings).includes('steward'));
	const standard = $derived(isStandard(house) && settings.handLimit === DISCARD_THRESHOLD);
	let open = $state(false);

	/** What differs from the standard game, in a few words, or that nothing does. */
	const summary = $derived.by(() => {
		const parts: string[] = [];
		if (settings.handLimit !== DISCARD_THRESHOLD) parts.push(t('Hand limit {cards}', { cards: settings.handLimit }));
		if (house.bank !== null) parts.push(t('Bank {n}', { n: house.bank }));
		if (house.deck !== null) parts.push(t('{n, plural, one {# development card} other {# development cards}}', { n: cards }));
		return parts.length ? parts.join(' · ') : t('Standard rules');
	});

	function send(change: Partial<HouseRules>) {
		const next = { ...house, ...change };
		// The standard numbers for this table are sent as standard, so they keep following the table.
		if (next.bank === standardBank(players)) next.bank = null;
		if (next.deck && DEV_CARDS.every((c) => next.deck![c] === standardDeck(players)[c])) next.deck = null;
		client.send({ t: 'setHouseRules', house: next });
	}
	function setCard(c: DevCardType, n: number) {
		send({ deck: { ...deck, [c]: n } as DevDeck });
	}
	function reset() {
		client.send({ t: 'setHouseRules', house: STANDARD_HOUSE_RULES });
		if (settings.handLimit !== DISCARD_THRESHOLD) client.send({ t: 'setHandLimit', cards: DISCARD_THRESHOLD });
	}
</script>

<div class="house">
	<span class="head">
		<span class="label">{t('House rules')}</span>
		<span class="summary" class:changed={!standard}>{summary}</span>
	</span>
	<button class="btn small" title={t('Hand limit, bank and development cards')} onclick={() => (open = true)}
		><img class="icon-px" src={PIXEL.book} alt="" />{host ? t('Change') : t('See them')}</button
	>
</div>

{#if open}
	<Modal title={t('House rules')} width={560} onclose={() => (open = false)}>
		<p class="intro">
			{t('Play by your own numbers. Bots play by them too.')}{#if !host}
				{' '}{t('The host sets the house rules.')}{/if}
		</p>

		<section>
			<div class="row">
				<span class="what">
					<span class="name title">{t('Hand limit on a 7')}</span>
					<span class="note"
						>{steward
							? t('{name} {title}: {limit}', {
								name: t(CHARACTER_INFO.steward.name),
								title: t(CHARACTER_INFO.steward.title),
								limit: settings.handLimit + STEWARD_EXTRA
							})
							: t('More cards than this: discard half')}</span
					>
				</span>
				<Stepper
					value={settings.handLimit}
					min={HAND_LIMIT_MIN}
					max={HAND_LIMIT_MAX}
					label={t('Hand limit on a 7')}
					readonly={!host}
					onset={(cards) => client.send({ t: 'setHandLimit', cards })}
				/>
			</div>
		</section>

		<section>
			<div class="row">
				<span class="what">
					<span class="name title">{t('Bank')}</span>
					<span class="note"
						>{house.bank === null
							? t('Standard for {players, plural, one {# player} other {# players}}', { players })
							: t('Standard for {players, plural, one {# player} other {# players}}: {n}', { players, n: standardBank(players) })}</span
					>
				</span>
				<span class="res" aria-hidden="true">
					{#each RESOURCES as r (r)}<img src={getIcons().urls[r]} alt="" title={t(RESOURCE_LABEL[r])} />{/each}
				</span>
				<Stepper value={bank} min={BANK_MIN} max={BANK_MAX} label={t('Cards of each resource in the bank')} readonly={!host} onset={(n) => send({ bank: n })} />
			</div>
		</section>

		<section>
			<div class="row sub">
				<span class="what">
					<span class="name title">{t('Development cards')} <small>{t('{cards, plural, one {# card} other {# cards}}', { cards })}</small></span>
					<span class="note"
						>{house.deck === null
							? t('Standard for {players, plural, one {# player} other {# players}}', { players })
							: t('Standard for {players, plural, one {# player} other {# players}}: {n}', { players, n: deckSize(standardDeck(players)) })}</span
					>
				</span>
			</div>
			<div class="deck">
				{#each DEV_CARDS as c (c)}
					<div class="card-row plaque">
						<img class="art" src={PIXEL[c]} alt="" />
						<span class="card-name">{t(DEV_CARD_LABEL[c])}</span>
						<Stepper
							value={deck[c]}
							min={0}
							max={DECK_MAX[c]}
							floor={cards <= 1 ? deck[c] : 0}
							label={t(DEV_CARD_LABEL[c])}
							readonly={!host}
							onset={(n) => setCard(c, n)}
						/>
					</div>
				{/each}
			</div>
		</section>

		<div class="foot">
			{#if host}
				<button class="btn small wood" disabled={standard} onclick={reset}>{t('Reset to standard')}</button>
			{/if}
			<button class="btn small green" onclick={() => (open = false)}>{t('Close')}</button>
		</div>
	</Modal>
{/if}

<style>
	.house {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.summary {
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.summary.changed {
		color: var(--gold);
	}
	.house .btn {
		flex: none;
		gap: 6px;
	}
	.house .btn img {
		height: 16px;
	}
	.intro {
		margin: 0 0 4px;
	}
	section {
		padding: 8px 0;
		border-top: 2px solid rgba(255, 220, 170, 0.14);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.what {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.name small {
		font-family: var(--px);
		font-size: 12px;
		color: var(--gold);
		text-shadow: none;
	}
	.note {
		font-size: 12.5px;
		color: var(--muted);
	}
	.res {
		display: flex;
		gap: 2px;
	}
	.res img {
		width: 22px;
		height: 22px;
		image-rendering: pixelated;
	}
	.deck {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 8px;
	}
	.card-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 6px;
		min-width: 0;
	}
	.art {
		flex: none;
		width: 28px;
		height: 28px;
		image-rendering: pixelated;
	}
	.card-name {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		line-height: 1.2;
		color: #f1dfc2;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 10px;
		border-top: 2px solid rgba(255, 220, 170, 0.14);
	}
	@media (max-width: 620px) {
		.res {
			display: none;
		}
	}
</style>
