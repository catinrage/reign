<script lang="ts">
	import { getIcons } from '../../../scene/icons';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
	const rates = [
		{
			give: 4,
			any: true,
			name: 'The bank',
			text: 'Always open: four of one resource for one of any other.'
		},
		{
			give: 3,
			any: true,
			name: 'A 3:1 harbor',
			text: 'Three of any one resource for one of any other.'
		},
		{
			give: 2,
			any: false,
			name: 'A 2:1 harbor',
			text: 'Two of the harbor’s own resource for one of any other.'
		}
	];
</script>

<p>You can trade on your own turn, after rolling. There are two ways to do it.</p>

<h3>With other players</h3>
<div class="figure offer">
	<div class="side">
		<span class="label">You give</span>
		<span class="res"><img src={icons.wood} alt="" /><img src={icons.wood} alt="" /></span>
	</div>
	<img class="icon-px swap" src={PIXEL.trade} alt="" />
	<div class="side">
		<span class="label">You get</span>
		<span class="res"><img src={icons.ore} alt="" /></span>
	</div>
</div>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.trade} alt="" /><span
			>Open the trade panel, choose what you give and what you want, and send the offer to the
			table.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			>Each player accepts or declines. Bots answer too.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.chat} alt="" /><span
			>You pick which of the players who accepted to trade with. Any deal is fine, even an uneven
			one.</span
		>
	</li>
</ul>

<h3>With the bank</h3>
<div class="rates">
	{#each rates as r (r.give)}
		<div class="rate">
			<span class="ratio">{r.give}:1</span>
			<span class="res">
				{#each Array(r.give) as _, k (k)}<img
						src={r.any ? icons.sheep : icons.brick}
						alt=""
					/>{/each}
				<span class="eq">›</span>
				<img src={icons.wheat} alt="" />
			</span>
			<b>{r.name}</b>
			<span class="caption">{r.text}</span>
		</div>
	{/each}
</div>
<p>
	To use a harbor, build a settlement or city on one of the two corners its pier touches. Your best
	rate for each resource is used automatically when you trade with the bank.
</p>

<style>
	.offer {
		gap: 20px;
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.offer .res img {
		width: 40px;
		height: 40px;
	}
	.swap {
		width: 34px;
		height: 34px;
	}
	.rates {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-bottom: 10px;
	}
	.rate {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 3px;
		padding: 10px 8px;
		background: rgba(255, 250, 235, 0.5);
		box-shadow: inset 0 0 0 2px rgba(138, 98, 54, 0.3);
	}
	.ratio {
		font-family: var(--px);
		font-weight: 700;
		font-size: 26px;
		line-height: 1;
		color: #2c3a52;
	}
	.rate .res {
		align-items: center;
	}
	.eq {
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		margin: 0 4px;
		color: #8a6236;
	}
	.rate .caption {
		margin-top: 0;
		font-weight: 400;
		line-height: 1.3;
	}
	@media (max-width: 760px) {
		.rates {
			grid-template-columns: 1fr;
		}
	}
</style>
