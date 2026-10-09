<script lang="ts">
	import { EVENT_CARDS, EVENT_INFO, TONE_LABEL, inDeckKind, type EventTone } from '../../../../shared/rules/events';
	import { EVENT_ART, TONE_COLOR } from '../../game/eventArt';
	import { PIXEL } from '../../pixel';

	const TONES: EventTone[] = ['good', 'catchUp', 'chaos', 'rivalry', 'harsh'];
</script>

<p>
	With the <b>Events deck</b> on, a card turns over as each round starts, just before the first player
	rolls. It shows in the middle of the table, then waits in the top left corner. Most cards bend the rules
	until the next round starts; the rest happen once, the moment they turn over.
</p>

<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.gear} alt="" /><span
			>The host sets the deck up under <b>Events</b> in the lobby: on or off, a card every round or every
			other round, <b>gentle</b> (no card takes anyone's cards) or <b>wild</b> (every card), and any card
			can be taken out.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.crown} alt="" /><span
			><b>Last place</b> means the fewest points everyone can see; on a tie, the fewer cards in hand, then
			whoever comes later in the turn order.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.bot} alt="" /><span
			>Bots play every card: they pick a Royal Decree by what helps them most and take what they need from a
			Bountiful Year.</span
		>
	</li>
</ul>

{#each TONES as tone (tone)}
	{@const cards = EVENT_CARDS.filter((c) => EVENT_INFO[c].tone === tone)}
	<h3 style="--tone:{TONE_COLOR[tone]}">
		<i></i>{TONE_LABEL[tone]}{#if !inDeckKind(cards[0], false)}<small>wild deck only</small>{/if}
	</h3>
	<div class="cards">
		{#each cards as c (c)}
			<div class="card" style="--tone:{TONE_COLOR[tone]}">
				<img class="art" src={EVENT_ART[c]} alt="" />
				<div class="what">
					<b class="title">{EVENT_INFO[c].name}</b>
					<span>{EVENT_INFO[c].text}</span>
				</div>
			</div>
		{/each}
	</div>
{/each}

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>Cards in hand are what most events take or give, so a big hand is a risk in a wild deck: the rats and the
		tax man come for it.</span
	>
</p>

<style>
	h3 {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	h3 i {
		width: 12px;
		height: 12px;
		background: var(--tone);
		box-shadow: 0 0 0 2px #2a1a10;
	}
	h3 small {
		font-family: var(--px);
		font-size: 12px;
		color: var(--ink-soft);
		text-transform: uppercase;
	}
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-bottom: 4px;
	}
	.card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: rgba(255, 250, 235, 0.5);
		box-shadow:
			inset 4px 0 0 var(--tone),
			inset 0 0 0 2px rgba(138, 98, 54, 0.3);
	}
	.art {
		width: 44px;
		height: 44px;
		flex: none;
		image-rendering: pixelated;
	}
	.what {
		display: flex;
		flex-direction: column;
		line-height: 1.35;
		font-size: 14.5px;
	}
	.what .title {
		font-size: 16px;
	}
	@media (max-width: 760px) {
		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
