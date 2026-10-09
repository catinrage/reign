<script lang="ts">
	import { LARGEST_ARMY_MIN, LONGEST_ROAD_MIN } from '../../../../shared/rules/config';
	import { getIcons } from '../../../scene/icons';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
</script>

<p>
	Two titles are worth <b>2 points</b> each to whoever holds them. They can be lost as well as won, so
	a lead can change hands late in the game.
</p>

<div class="titles">
	<section class="title-card">
		<img class="icon-px big" src={PIXEL.road} alt="" />
		<h3>Longest Road</h3>
		<div class="road">
			{#each Array(LONGEST_ROAD_MIN) as _, i (i)}<img src={icons['road:red']} alt="" />{/each}
		</div>
		<p>
			The first player with an unbroken road of <b>{LONGEST_ROAD_MIN} or more</b> pieces claims it. Branches
			don't add up: only the longest single path counts.
		</p>
		<p>
			Someone else takes it by building a <b>longer</b> road. Matching it is not enough. A rival's settlement
			built in the middle of your road cuts it in two.
		</p>
	</section>
	<section class="title-card">
		<img class="icon-px big" src={PIXEL.army} alt="" />
		<h3>Largest Army</h3>
		<div class="road">
			{#each Array(LARGEST_ARMY_MIN) as _, i (i)}<img
					class="icon-px knight"
					src={PIXEL.knight}
					alt=""
				/>{/each}
		</div>
		<p>
			The first player to have played <b>{LARGEST_ARMY_MIN} Knights</b> claims it.
		</p>
		<p>Someone else takes it by playing <b>more</b> Knights than the holder has.</p>
	</section>
</div>

<p class="tip">
	<img class="icon-px" src={PIXEL.crown} alt="" /><span
		>The scoreboard on the right shows who holds each title. Watch it: a title changing hands is
		often what decides the game.</span
	>
</p>

<style>
	.titles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	.title-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 12px 14px 4px;
		background: rgba(255, 250, 235, 0.55);
		box-shadow:
			inset 0 0 0 2px rgba(138, 98, 54, 0.35),
			0 3px 0 rgba(138, 98, 54, 0.25);
	}
	.title-card h3 {
		margin-top: 6px;
	}
	.big {
		width: 44px;
		height: 44px;
	}
	.road {
		display: flex;
		gap: 0;
		margin-bottom: 8px;
	}
	.road img {
		width: 40px;
		height: 40px;
		object-fit: contain;
		margin: 0 -4px;
	}
	.road img.knight {
		width: 30px;
		height: 30px;
		margin: 4px 3px;
	}
	@media (max-width: 760px) {
		.titles {
			grid-template-columns: 1fr;
		}
	}
</style>
