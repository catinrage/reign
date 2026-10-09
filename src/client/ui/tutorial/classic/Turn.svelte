<script lang="ts">
	import { BANK_PER_RESOURCE } from '../../../../shared/rules/config';
	import { msg, t } from '../../../i18n/index.svelte';
	import Rich from '../../../i18n/Rich.svelte';
	import { getIcons } from '../../../scene/icons';
	import { PIXEL } from '../../pixel';
	import HexTile from '../bits/HexTile.svelte';

	const icons = getIcons().urls;
	// name and text are marked with msg() and shown through t().
	const steps = [
		{
			icon: PIXEL.die,
			name: msg('Roll'),
			text: msg('Roll both dice. Every tile showing that number pays out.')
		},
		{ icon: PIXEL.trade, name: msg('Trade'), text: msg('Swap cards with players, the bank or a harbor.') },
		{ icon: PIXEL.hammer, name: msg('Build'), text: msg('Spend cards on roads, towns, cities and cards.') },
		{ icon: PIXEL.hourglass, name: msg('End turn'), text: msg('The dice pass to the next player.') }
	];
</script>

{#snippet settlementPiece()}<img src={icons['settlement:blue']} alt="" />{/snippet}
{#snippet cityPiece()}<img src={icons['city:red']} alt="" />{/snippet}
{#snippet oneWheat()}<span class="res"><img src={icons.wheat} alt="" /></span>{/snippet}
{#snippet twoWheat()}<span class="res"><img src={icons.wheat} alt="" /><img src={icons.wheat} alt="" /></span
	>{/snippet}
{#snippet settlement()}<b>{t('settlement')}</b>{/snippet}
{#snippet city()}<b>{t('city')}</b>{/snippet}
{#snippet knight()}<b>{t('Knight')}</b>{/snippet}

<div class="figure track">
	{#each steps as s, i (s.name)}
		<div class="step">
			<span class="badge"><img class="icon-px" src={s.icon} alt="" /></span>
			<b>{i + 1}. {t(s.name)}</b>
			<span class="caption">{t(s.text)}</span>
		</div>
		{#if i < steps.length - 1}<span class="arrow">›</span>{/if}
	{/each}
</div>
<p>
	{t('After rolling, you may trade and build as often as you like and in any order, then end your turn.')}
</p>

<h3>{t('Collecting resources')}</h3>
<div class="spread">
	<div class="example">
		<HexTile terrain="fields" n={9} size={92} />
		<div class="gets">
			<span><Rich text={t('{piece} takes {cards}')} slots={{ piece: settlementPiece, cards: oneWheat }} /></span>
			<span><Rich text={t('{piece} takes {cards}')} slots={{ piece: cityPiece, cards: twoWheat }} /></span>
		</div>
	</div>
	<ul class="rows">
		<li>
			<img class="piece" src={icons['settlement:red']} alt="" /><span
				><Rich
					text={t('A {settlement} takes one card from each touching tile that was rolled.')}
					slots={{ settlement }}
				/></span
			>
		</li>
		<li>
			<img class="piece" src={icons['city:red']} alt="" /><span
				><Rich text={t('A {city} takes two.')} slots={{ city }} /></span
			>
		</li>
		<li>
			<img class="icon-px" src={PIXEL.chat} alt="" /><span
				>{t('Everyone collects on every roll, not only the player who rolled. It pays to own towns on many numbers.')}</span
			>
		</li>
	</ul>
</div>
<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t(
			"The bank holds {n, plural, one {# card} other {# cards}} of each resource. If it can't pay everyone what a roll owes in one resource, nobody gets that resource, unless only one player is owed it: they take what is left.",
			{ n: BANK_PER_RESOURCE }
		)}</span
	>
</p>

<h3>{t('Before you roll')}</h3>
<p>
	<Rich
		text={t(
			'You may play a {knight} before rolling, to chase the robber off one of your tiles first. Everything else waits until the dice have landed.'
		)}
		slots={{ knight }}
	/>
</p>

<h3>{t('The turn timer')}</h3>
<p>
	{t(
		'The host can give each turn a time limit. When the sand runs out, anything the game still needs from you (a discard, a robber move, a placement) is done for you, and your turn ends.'
	)}
</p>

<style>
	.track {
		gap: 6px;
		align-items: flex-start;
	}
	.step {
		align-self: flex-start;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		width: 128px;
		gap: 2px;
	}
	.badge {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		margin-bottom: 4px;
		border-style: solid;
		border-width: calc(var(--s) * 3);
		border-image: var(--art-well) 3 fill / calc(var(--s) * 3) stretch;
	}
	.badge img {
		width: 32px;
		height: 32px;
	}
	.step .caption {
		margin-top: 0;
		font-weight: 400;
		line-height: 1.3;
	}
	.arrow {
		align-self: center;
		margin-top: -30px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 28px;
		color: #8a6236;
	}
	.spread {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 18px;
		align-items: center;
	}
	.example {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.gets {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
		font-weight: 700;
	}
	.gets span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.gets > span > img {
		width: 50px;
		height: 50px;
		margin: -8px -4px;
		object-fit: contain;
	}
	@media (max-width: 760px) {
		.spread {
			grid-template-columns: 1fr;
		}
		.arrow {
			display: none;
		}
		.step {
			width: 46%;
		}
	}
</style>
