<script lang="ts">
	import {
		COSTS,
		DEV_CARD_LABEL,
		DEV_CARD_TEXT,
		DEV_CARDS,
		DEV_DECK,
		LARGEST_ARMY_MIN
	} from '../../../../shared/rules/config';
	import { getIcons } from '../../../scene/icons';
	import DevCard from '../../DevCard.svelte';
	import { countsList } from '../../helpers';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
	const deckSize = DEV_CARDS.reduce((n, c) => n + DEV_DECK[c], 0);
	const more: Partial<Record<(typeof DEV_CARDS)[number], string>> = {
		knight: `It stays in front of you afterwards: play ${LARGEST_ARMY_MIN} or more and you can claim Largest Army.`,
		victoryPoint:
			'You never play it. It counts toward your total, hidden from everyone else, and is revealed when you win.'
	};
</script>

<p>
	Buy a development card for
	<span class="res">
		{#each countsList(COSTS.devCard) as c (c.res)}<img src={icons[c.res]} alt={c.res} />{/each}
	</span>. It comes off the top of a shuffled deck of {deckSize}, and nobody else sees what you
	drew.
</p>

<div class="deck">
	{#each DEV_CARDS as c (c)}
		<div class="kind">
			<DevCard type={c} count={DEV_DECK[c]} size={64} />
			<div class="text">
				<b>{DEV_CARD_LABEL[c]}</b>
				<span>{DEV_CARD_TEXT[c]}</span>
				{#if more[c]}<span class="more">{more[c]}</span>{/if}
			</div>
		</div>
	{/each}
</div>
<span class="caption">The number on each card is how many are in the deck.</span>

<h3>Playing them</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.hourglass} alt="" /><span
			>Not on the turn you bought it: a new card waits until your next turn.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.dev} alt="" /><span
			>At most <b>one</b> development card per turn.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			>You may play it before or after rolling.</span
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
