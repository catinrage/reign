<script lang="ts">
	import { COSTS, VICTORY_POINTS_TO_WIN, type BuildKind } from '../../../shared/rules/config';
	import { getIcons } from '../../scene/icons';
	import { countsList } from '../helpers';
	import { PIXEL } from '../pixel';

	const icons = getIcons().urls;
	const builds: { kind: BuildKind; name: string; note: string; icon: string }[] = [
		{
			kind: 'road',
			name: 'Road',
			note: 'Links your buildings. Five in a row can win Longest Road.',
			icon: icons['road:red']
		},
		{
			kind: 'settlement',
			name: 'Settlement',
			note: '1 point. Needs a road and an empty corner two steps from any town.',
			icon: icons['settlement:red']
		},
		{
			kind: 'city',
			name: 'City',
			note: '2 points. Upgrades a settlement and doubles what it gathers.',
			icon: icons['city:red']
		},
		{
			kind: 'devCard',
			name: 'Development card',
			note: 'A face-down card with a special power.',
			icon: PIXEL.dev
		}
	];
	const cards: { icon: string; name: string; text: string }[] = [
		{
			icon: PIXEL.knight,
			name: 'Knight',
			text: 'Move the robber and steal a card. Three knights and the most played win Largest Army.'
		},
		{ icon: PIXEL.roadBuilding, name: 'Road Building', text: 'Place two roads for free.' },
		{
			icon: PIXEL.yearOfPlenty,
			name: 'Year of Plenty',
			text: 'Take any two resources from the bank.'
		},
		{
			icon: PIXEL.monopoly,
			name: 'Monopoly',
			text: 'Name a resource: everyone hands you all of theirs.'
		},
		{ icon: PIXEL.victoryPoint, name: 'Victory Point', text: 'Kept secret, worth 1 point.' }
	];
</script>

<div class="howto">
	<section class="goal">
		<img class="icon-px big" src={PIXEL.crown} alt="" />
		<div>
			<h3 class="title">The goal</h3>
			<p>
				Grow your towns across the island. The first to reach <b
					>{VICTORY_POINTS_TO_WIN} victory points</b
				> on their turn wins.
			</p>
		</div>
	</section>

	<section>
		<h3 class="title">Your turn</h3>
		<ol class="steps">
			<li>
				<img class="icon-px" src={PIXEL.die} alt="" /><span
					><b>Roll the dice.</b> Every tile with that number pays its resource to the towns on its corners.
					Cities take two.</span
				>
			</li>
			<li>
				<img class="icon-px" src={PIXEL.trade} alt="" /><span
					><b>Trade</b> with other players, or with the bank at 4 for 1. Harbors give better rates.</span
				>
			</li>
			<li>
				<img class="icon-px" src={PIXEL.house} alt="" /><span
					><b>Build</b> roads, settlements and cities, or buy a development card.</span
				>
			</li>
			<li>
				<img class="icon-px" src={PIXEL.hourglass} alt="" /><span
					><b>End your turn</b> and the dice pass to the next player.</span
				>
			</li>
		</ol>
	</section>

	<section>
		<h3 class="title">Building costs</h3>
		<div class="costs">
			{#each builds as b (b.kind)}
				<div class="cost">
					<img class="piece" class:icon-px={b.kind === 'devCard'} src={b.icon} alt="" />
					<div class="what">
						<div class="row">
							<b>{b.name}</b>
							<span class="res">
								{#each countsList(COSTS[b.kind]) as c (c.res)}
									{#each Array(c.n) as _, k (k)}<img src={icons[c.res]} alt={c.res} />{/each}
								{/each}
							</span>
						</div>
						<span class="note">{b.note}</span>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h3 class="title">The robber</h3>
		<p>
			A roll of <b>7</b> pays nothing. Anyone holding more than 7 cards gives half back. The roller then
			moves the robber onto a tile, which stops paying until the robber moves on, and steals one card
			from a player with a town there.
		</p>
	</section>

	<section>
		<h3 class="title">Development cards</h3>
		<div class="cards">
			{#each cards as c (c.name)}
				<div class="card">
					<img class="icon-px" src={c.icon} alt="" /><span><b>{c.name}.</b> {c.text}</span>
				</div>
			{/each}
		</div>
		<p class="small">You may play one per turn, but not on the turn you bought it.</p>
	</section>

	<section>
		<h3 class="title">Bonus points</h3>
		<div class="cards">
			<div class="card">
				<img class="icon-px" src={PIXEL.road} alt="" /><span
					><b>Longest Road, +2.</b> The first to build 5 connected roads, until someone builds longer.</span
				>
			</div>
			<div class="card">
				<img class="icon-px" src={PIXEL.army} alt="" /><span
					><b>Largest Army, +2.</b> The first to play 3 knights, until someone plays more.</span
				>
			</div>
		</div>
	</section>

	<section>
		<h3 class="title">Controls</h3>
		<ul class="controls">
			<li><kbd>Drag</kbd> turn the table</li>
			<li><kbd>Right drag</kbd> or two fingers: pan</li>
			<li><kbd>Wheel</kbd> or pinch: zoom</li>
			<li><kbd>Esc</kbd> cancel or open the menu</li>
		</ul>
	</section>
</div>

<style>
	.howto {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px 22px;
		color: var(--ink);
		font-size: 15px;
		line-height: 1.42;
		padding: 2px 4px 4px;
	}
	section {
		min-width: 0;
	}
	.goal {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: 14px;
		padding-bottom: 12px;
		border-bottom: 3px solid rgba(138, 98, 54, 0.35);
	}
	.goal p {
		margin: 0;
	}
	.big {
		width: 54px;
		height: 54px;
		flex: none;
		filter: drop-shadow(0 3px 0 rgba(90, 50, 20, 0.35));
	}
	h3 {
		margin: 0 0 6px;
		font-size: 19px;
		color: #6b3a14;
		text-shadow: 0 2px 0 rgba(255, 245, 220, 0.8);
	}
	p {
		margin: 0;
		text-align: left !important;
		text-wrap: pretty;
		color: var(--ink) !important;
	}
	b {
		color: #3a1a08;
	}
	.small {
		margin-top: 6px;
		font-size: 13px;
		color: var(--ink-soft) !important;
	}
	.steps,
	.controls {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.steps li,
	.card {
		display: flex;
		align-items: flex-start;
		gap: 9px;
	}
	.steps img,
	.card img {
		width: 24px;
		height: 24px;
		flex: none;
		margin-top: 1px;
	}
	.costs {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.cost {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.piece {
		width: 44px;
		height: 44px;
		object-fit: contain;
		flex: none;
		filter: drop-shadow(0 3px 2px rgba(60, 30, 10, 0.35));
	}
	.what {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.what .row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.res {
		display: inline-flex;
		gap: 1px;
	}
	.res img {
		width: 22px;
		height: 22px;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
	}
	.note {
		font-size: 13px;
		color: var(--ink-soft);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.controls {
		font-size: 14px;
	}
	kbd {
		display: inline-block;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		padding: 1px 7px 2px;
		margin-right: 4px;
		color: #fff2d2;
		background: #6b3a14;
		box-shadow:
			inset 0 -3px 0 #3a1a08,
			inset 0 2px 0 #9a6238;
	}
	@media (max-width: 720px) {
		.howto {
			grid-template-columns: 1fr;
		}
	}
</style>
