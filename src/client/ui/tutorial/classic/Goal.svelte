<script lang="ts">
	import { VICTORY_POINTS_TO_WIN } from '../../../../shared/rules/config';
	import { getIcons } from '../../../scene/icons';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
	const sources: { icon: string; pixel?: boolean; pts: string; name: string; text: string }[] = [
		{
			icon: icons['settlement:red'],
			pts: '1',
			name: 'Settlement',
			text: 'Each one on the island.'
		},
		{ icon: icons['city:red'], pts: '2', name: 'City', text: 'A settlement you upgraded.' },
		{
			icon: PIXEL.road,
			pixel: true,
			pts: '+2',
			name: 'Longest Road',
			text: 'The longest unbroken road, five or more.'
		},
		{
			icon: PIXEL.army,
			pixel: true,
			pts: '+2',
			name: 'Largest Army',
			text: 'The most knights played, three or more.'
		},
		{
			icon: PIXEL.victoryPoint,
			pixel: true,
			pts: '1',
			name: 'Victory Point card',
			text: 'Kept hidden until it wins you the game.'
		}
	];
</script>

<p>
	Reign is played on an island of hex tiles. Each player starts with two small settlements and grows
	them into a realm of roads, settlements and cities. The first player to reach
	<b>{VICTORY_POINTS_TO_WIN} victory points on their own turn</b> wins at once.
</p>

<h3>Where points come from</h3>
<div class="ledger">
	{#each sources as s (s.name)}
		<div class="entry">
			<img class:icon-px={s.pixel} class:pixel={s.pixel} src={s.icon} alt="" />
			<span class="pts">{s.pts}</span>
			<b>{s.name}</b>
			<span class="what">{s.text}</span>
		</div>
	{/each}
</div>

<h3>How a game flows</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.house} alt="" /><span
			>Everyone places two settlements to start. Where you put them decides what you will gather.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			>Each turn the dice decide which tiles pay out. Your towns collect from the tiles they touch.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.trade} alt="" /><span
			>No one gathers everything, so you trade for what you lack.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.hammer} alt="" /><span
			>You spend resources to build, and building earns points.</span
		>
	</li>
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.book} alt="" /><span
		>The chapters follow a game from start to finish. Use the arrow keys or the buttons below to
		turn the page.</span
	>
</p>

<style>
	.ledger {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
		gap: 10px;
		margin-bottom: 6px;
	}
	.entry {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 2px;
		padding: 10px 8px 12px;
		background: rgba(255, 250, 235, 0.55);
		box-shadow:
			inset 0 0 0 2px rgba(138, 98, 54, 0.35),
			0 3px 0 rgba(138, 98, 54, 0.25);
	}
	.entry img {
		width: 54px;
		height: 54px;
		object-fit: contain;
		filter: drop-shadow(0 3px 2px rgba(60, 30, 10, 0.35));
	}
	.entry img.pixel {
		width: 40px;
		height: 40px;
		margin: 7px 0;
	}
	.pts {
		font-family: var(--px);
		font-weight: 700;
		font-size: 26px;
		line-height: 1;
		color: #b8740f;
		text-shadow: 0 2px 0 #fff4d0;
	}
	.what {
		font-size: 13px;
		line-height: 1.3;
		color: var(--ink-soft);
	}
</style>
