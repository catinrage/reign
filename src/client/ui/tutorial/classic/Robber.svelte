<script lang="ts">
	import { DISCARD_THRESHOLD } from '../../../../shared/rules/config';
	import { msg, t } from '../../../i18n/index.svelte';
	import Rich from '../../../i18n/Rich.svelte';
	import { PIXEL } from '../../pixel';
	import HexTile from '../bits/HexTile.svelte';
	import { TUT_ICON } from '../icons';

	// name and text are marked with msg() and shown through t(); `n` fills the text's slot.
	const steps = [
		{
			icon: PIXEL.cards,
			name: msg('Too many cards?'),
			text: msg(
				'Everyone holding more than {n, plural, one {# resource card} other {# resource cards}} gives half of them back to the bank, rounded down.'
			),
			n: DISCARD_THRESHOLD
		},
		{
			icon: TUT_ICON.robber,
			name: msg('Move the robber'),
			text: msg('The roller must move the robber to a different tile.')
		},
		{
			icon: PIXEL.sword,
			name: msg('Steal a card'),
			text: msg('The roller takes one random card from a player with a settlement or city on that tile.')
		}
	];
</script>

{#snippet seven()}<b>7</b>{/snippet}
{#snippet nothing()}<b>{t('pays nothing')}</b>{/snippet}

<p><Rich text={t('A roll of {seven} pays nothing to anyone. Instead:')} slots={{ seven }} /></p>

<div class="figure steps">
	{#each steps as s, i (s.name)}
		<div class="step">
			<span class="n">{i + 1}</span>
			<img class="icon-px" src={s.icon} alt="" />
			<b>{t(s.name)}</b>
			<span class="caption">{t(s.text, s.n === undefined ? undefined : { n: s.n })}</span>
		</div>
	{/each}
</div>

<h3>{t('A robbed tile')}</h3>
<div class="spread">
	<div class="pair">
		<div><HexTile terrain="hills" n={6} size={86} /><span class="caption">{t('Before')}</span></div>
		<span class="arrow">›</span>
		<div class="robbed">
			<HexTile terrain="hills" n={6} size={86} gray />
			<img class="icon-px thief" src={TUT_ICON.robber} alt="" />
			<span class="caption">{t('Robbed')}</span>
		</div>
	</div>
	<p>
		<Rich
			text={t(
				'The tile under the robber turns gray and {nothing} when its number is rolled, until someone moves the robber away with another 7 or a Knight.'
			)}
			slots={{ nothing }}
		/>
	</p>
</div>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t(
			'Holding a big hand is risky: spend or trade cards down to {n} or fewer before you end your turn.',
			{ n: DISCARD_THRESHOLD }
		)}</span
	>
</p>

<style>
	.steps {
		align-items: stretch;
		gap: 10px;
	}
	.step {
		position: relative;
		flex: 1 1 160px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 4px;
		padding: 12px 10px;
		background: rgba(255, 250, 235, 0.6);
		box-shadow: inset 0 0 0 2px rgba(138, 98, 54, 0.3);
	}
	.step img {
		width: 34px;
		height: 34px;
	}
	.step .caption {
		margin-top: 0;
		font-weight: 400;
		line-height: 1.35;
	}
	.n {
		position: absolute;
		top: 4px;
		left: 8px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		color: #b8740f;
	}
	.spread {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 20px;
		align-items: center;
	}
	.pair {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.pair > div {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.thief {
		position: absolute;
		top: 4px;
		right: -6px;
		width: 36px;
		height: 38px;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.35));
	}
	.arrow {
		font-family: var(--px);
		font-weight: 700;
		font-size: 28px;
		color: #8a6236;
	}
	@media (max-width: 760px) {
		.spread {
			grid-template-columns: 1fr;
			justify-items: center;
		}
	}
</style>
