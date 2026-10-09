<script lang="ts">
	import {
		COSTS,
		DEV_CARD_LABEL,
		DEV_CARD_TEXT,
		DEV_CARDS,
		DEV_DECK,
		LARGEST_ARMY_MIN,
		RESOURCE_LABEL
	} from '../../../../shared/rules/config';
	import { msg, t } from '../../../i18n/index.svelte';
	import Rich from '../../../i18n/Rich.svelte';
	import { getIcons } from '../../../scene/icons';
	import DevCard from '../../DevCard.svelte';
	import { countsList } from '../../helpers';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
	const deckSize = DEV_CARDS.reduce((n, c) => n + DEV_DECK[c], 0);
	// Marked with msg() and shown through t(); {n} is LARGEST_ARMY_MIN.
	const more: Partial<Record<(typeof DEV_CARDS)[number], string>> = {
		knight: msg('It stays in front of you afterwards: play {n} or more and you can claim Largest Army.'),
		victoryPoint: msg(
			'You never play it. It counts toward your total, hidden from everyone else, and is revealed when you win.'
		)
	};
</script>

{#snippet cost()}<span class="res">
		{#each countsList(COSTS.devCard) as c (c.res)}<img src={icons[c.res]} alt={t(RESOURCE_LABEL[c.res])} />{/each}
	</span>{/snippet}
{#snippet one()}<b>{t('one')}</b>{/snippet}

<p>
	<Rich
		text={t(
			'Buy a development card for {cost}. It comes off the top of a shuffled deck of {n}, and nobody else sees what you drew.',
			{ n: deckSize }
		)}
		slots={{ cost }}
	/>
</p>

<div class="deck">
	{#each DEV_CARDS as c (c)}
		<div class="kind">
			<DevCard type={c} count={DEV_DECK[c]} size={64} />
			<div class="text">
				<b>{t(DEV_CARD_LABEL[c])}</b>
				<span>{t(DEV_CARD_TEXT[c])}</span>
				{#if more[c]}<span class="more">{t(more[c], { n: LARGEST_ARMY_MIN })}</span>{/if}
			</div>
		</div>
	{/each}
</div>
<span class="caption">{t('The number on each card is how many are in the deck.')}</span>

<h3>{t('Playing them')}</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.hourglass} alt="" /><span
			>{t('Not on the turn you bought it: a new card waits until your next turn.')}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.dev} alt="" /><span
			><Rich text={t('At most {one} development card per turn.')} slots={{ one }} /></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			>{t('You may play it before or after rolling.')}</span
		>
	</li>
</ul>

<style>
	.deck {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px 20px;
	}
	.kind {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.kind :global(.card) {
		flex: none;
		cursor: default;
	}
	.text {
		display: flex;
		flex-direction: column;
		line-height: 1.35;
	}
	.text b {
		font-size: 17px;
	}
	.more {
		margin-top: 3px;
		font-size: 13.5px;
		color: var(--ink-soft);
	}
	.deck + .caption {
		text-align: left;
		margin-top: 8px;
	}
	@media (max-width: 760px) {
		.deck {
			grid-template-columns: 1fr;
		}
	}
</style>
