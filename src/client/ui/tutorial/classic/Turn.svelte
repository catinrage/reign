<script lang="ts">
	import { BANK_PER_RESOURCE } from '../../../../shared/rules/config';
	import { getIcons } from '../../../scene/icons';
	import { PIXEL } from '../../pixel';
	import HexTile from '../bits/HexTile.svelte';

	const icons = getIcons().urls;
	const steps = [
		{
			icon: PIXEL.die,
			name: 'Roll',
			text: 'Roll both dice. Every tile showing that number pays out.'
		},
		{ icon: PIXEL.trade, name: 'Trade', text: 'Swap cards with players, the bank or a harbor.' },
		{ icon: PIXEL.hammer, name: 'Build', text: 'Spend cards on roads, towns, cities and cards.' },
		{ icon: PIXEL.hourglass, name: 'End turn', text: 'The dice pass to the next player.' }
	];
</script>

<div class="figure track">
	{#each steps as s, i (s.name)}
		<div class="step">
			<span class="badge"><img class="icon-px" src={s.icon} alt="" /></span>
			<b>{i + 1}. {s.name}</b>
			<span class="caption">{s.text}</span>
		</div>
		{#if i < steps.length - 1}<span class="arrow">›</span>{/if}
	{/each}
</div>
<p>
	After rolling, you may trade and build as often as you like and in any order, then end your turn.
</p>

<h3>Collecting resources</h3>
<div class="spread">
	<div class="example">
		<HexTile terrain="fields" n={9} size={92} />
		<div class="gets">
			<span
				><img src={icons['settlement:blue']} alt="" /> takes
				<span class="res"><img src={icons.wheat} alt="" /></span></span
			>
			<span
				><img src={icons['city:red']} alt="" /> takes
				<span class="res"><img src={icons.wheat} alt="" /><img src={icons.wheat} alt="" /></span
				></span
			>
		</div>
	</div>
	<ul class="rows">
		<li>
			<img class="piece" src={icons['settlement:red']} alt="" /><span
				>A <b>settlement</b> takes one card from each touching tile that was rolled.</span
			>
		</li>
		<li>
			<img class="piece" src={icons['city:red']} alt="" /><span>A <b>city</b> takes two.</span>
		</li>
		<li>
			<img class="icon-px" src={PIXEL.chat} alt="" /><span
				>Everyone collects on every roll, not only the player who rolled. It pays to own towns on
				many numbers.</span
			>
		</li>
	</ul>
</div>
<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>The bank holds {BANK_PER_RESOURCE} cards of each resource. If it can't pay everyone what a roll owes
		in one resource, nobody gets that resource, unless only one player is owed it: they take what is left.</span
	>
</p>

<h3>Before you roll</h3>
<p>
	You may play a <b>Knight</b> before rolling, to chase the robber off one of your tiles first. Everything
	else waits until the dice have landed.
</p>

<h3>The turn timer</h3>
<p>
	The host can give each turn a time limit. When the sand runs out, anything the game still needs
	from you (a discard, a robber move, a placement) is done for you, and your turn ends.
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
