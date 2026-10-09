<script lang="ts">
	import { CHARACTERS, CHARACTER_INFO, POWER_INFO, traitText } from '../../../../shared/rules/characters';
	import Rich from '../../../i18n/Rich.svelte';
	import { t, tx } from '../../../i18n/index.svelte';
	import Portrait from '../../extended/Portrait.svelte';
	import { PIXEL } from '../../pixel';
</script>

{#snippet bTrait()}<b>{t('trait')}</b>{/snippet}
{#snippet bPower()}<b>{t('power')}</b>{/snippet}
{#snippet bPowerButton()}<b>{t('power button')}</b>{/snippet}

<p>
	<Rich
		text={t("In Reign Extended every player plays a character. A character's {trait} bends one rule for them for the whole game, so each seat at the table plays a little differently. Unless the host turned them off, each character also has a {power}: one big move to save for the right moment.")}
		slots={{ trait: bTrait, power: bPower }}
	/>
</p>

<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.house} alt="" /><span
			>{t('The host decides in the lobby: no characters, traits only, or traits and powers. The host can also leave any character out.')}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.crown} alt="" /><span
			>{t('When the game starts, everyone drafts one in turn, in the reverse of the settlement order: whoever places the first settlement picks last. Point at a character to read its trait.')}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.lock} alt="" /><span
			>{t('No two players can play the same character, unless the host sets picks to Can repeat: then a character someone drafted is still there for the players after them, and two Barons both take tolls. Bots draft too, and a pick that runs out of time is made for you.')}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.chat} alt="" /><span
			>{t("Everyone's character shows on their plaque, so you always know what your rivals can do.")}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.cards} alt="" /><span
			>{t('Some traits hand you a resource of your choice (the Seer, the Jester, a trade with the Bard). A card pops up: click the one you want. It never holds up the game.')}</span
		>
	</li>
</ul>

<h3>{t('Powers')}</h3>
<ul class="rows">
	<li>
		<span class="gem"></span><span
			><Rich
				text={t("On your turn, a violet {powerButton} appears above your actions while your power is ready. Click it to read what it does and use it. Most work before or after your roll; the Seer's replaces the roll, and some only work after it.")}
				slots={{ powerButton: bPowerButton }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.hourglass} alt="" /><span
			>{t("A power goes off once per game, unless the host lets powers come back every few rounds. The gem on each plaque glows while that player's power is ready.")}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.pointer} alt="" /><span
			>{t("Powers that pick a spot (the Mason's city, the Baron's corner, a tile for the Alchemist, the Abbess or the Cartographer) light up the spots you can pick on the board.")}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.eye} alt="" /><span
			>{t("Everyone sees a power go off. The Baron's claimed corners carry his flag, and a blessed tile wears a golden halo for each time it will still pay double.")}</span
		>
	</li>
</ul>

<h3>{t('The cast')}</h3>
<div class="cast">
	{#each CHARACTERS as c (c)}
		{@const info = CHARACTER_INFO[c]}
		<div class="who">
			<Portrait id={c} size={78} />
			<div class="text">
				<span class="name"
					><b class="title">{t(info.name)}</b> <span class="epithet">{t(info.title)}</span></span
				>
				<span class="trait">{t(info.trait)}</span>
				<span>{tx(traitText(c))}</span>
				<span class="trait power">{t(POWER_INFO[c].name)}</span>
				<span>{t(POWER_INFO[c].text)}</span>
			</div>
		</div>
	{/each}
</div>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t("Let your character shape your opening. The Mason wants ore for cities, the Merchant can live off the bank, the Explorer should race for the long road, and the Cartographer should run roads along the coast. Mind the others too: robbing the Hedge Witch costs you a card, and a road beside the Baron's pays him a toll. Save your power for when it swings the game: the Witch's Hex hurts most on the leader, and the Bard's Encore pays best right after a roll that paid you well.")}</span
	>
</p>

<style>
	.cast {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px 8px 8px;
		background: rgba(255, 250, 235, 0.55);
		box-shadow: inset 0 0 0 2px rgba(138, 98, 54, 0.3);
	}
	.text {
		display: flex;
		flex-direction: column;
		line-height: 1.32;
		font-size: 14.5px;
		min-width: 0;
	}
	.name b {
		font-size: 18px;
	}
	.epithet {
		color: var(--ink-soft);
		font-size: 14px;
	}
	.trait {
		font-family: var(--px);
		font-weight: 700;
		color: #b8740f;
	}
	.trait.power {
		margin-top: 3px;
		color: #6a4fc0;
	}
	.gem {
		flex: none;
		width: 12px;
		height: 12px;
		margin: 4px 5px;
		transform: rotate(45deg);
		background: #b7a3ff;
		box-shadow: 0 0 0 2px #2a1404;
	}
	@media (max-width: 760px) {
		.cast {
			grid-template-columns: 1fr;
		}
	}
</style>
