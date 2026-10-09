<script lang="ts">
	import { DISCARD_THRESHOLD } from '../../../../shared/rules/config';
	import { PIXEL } from '../../pixel';
	import HexTile from '../bits/HexTile.svelte';
	import { TUT_ICON } from '../icons';

	const steps = [
		{
			icon: PIXEL.cards,
			name: 'Too many cards?',
			text: `Everyone holding more than ${DISCARD_THRESHOLD} resource cards gives half of them back to the bank, rounded down.`
		},
		{
			icon: TUT_ICON.robber,
			name: 'Move the robber',
			text: 'The roller must move the robber to a different tile.'
		},
		{
			icon: PIXEL.sword,
			name: 'Steal a card',
			text: 'The roller takes one random card from a player with a settlement or city on that tile.'
		}
	];
</script>

<p>A roll of <b>7</b> pays nothing to anyone. Instead:</p>

<div class="figure steps">
	{#each steps as s, i (s.name)}
		<div class="step">
			<span class="n">{i + 1}</span>
			<img class="icon-px" src={s.icon} alt="" />
			<b>{s.name}</b>
			<span class="caption">{s.text}</span>
		</div>
	{/each}
</div>

<h3>A robbed tile</h3>
<div class="spread">
	<div class="pair">
		<div><HexTile terrain="hills" n={6} size={86} /><span class="caption">Before</span></div>
		<span class="arrow">›</span>
		<div class="robbed">
			<HexTile terrain="hills" n={6} size={86} gray />
			<img class="icon-px thief" src={TUT_ICON.robber} alt="" />
			<span class="caption">Robbed</span>
		</div>
	</div>
	<p>
		The tile under the robber turns gray and <b>pays nothing</b> when its number is rolled, until someone
		moves the robber away with another 7 or a Knight.
	</p>
</div>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>Holding a big hand is risky: spend or trade cards down to {DISCARD_THRESHOLD} or fewer before you
		end your turn.</span
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
