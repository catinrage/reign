<script lang="ts">
	import { MAP_PRESETS, mapSeats } from '../../../../shared/board/maps';
	import { TERRAIN_CSS } from '../../extended/terrainColors';
	import MapPreview from '../../extended/MapPreview.svelte';
	import { PIXEL } from '../../pixel';
	import { TUT_ICON } from '../icons';

	// The smallest island that seats five, and six (see mapSeats).
	const seatsAt = (n: number) =>
		Array.from({ length: 100 }, (_, t) => t).find((t) => mapSeats(t) >= n);
</script>

<p>
	The host picks the island in the lobby. Every island plays by the same rules; what changes is the
	room to spread out, how many can sit at the table, and how fierce the race for good corners is.
</p>

<div class="isles">
	{#each MAP_PRESETS as m (m.id)}
		<div class="isle">
			<MapPreview tiles={m.tiles} width={128} height={100} />
			<div class="text">
				<b class="title">{m.name}</b>
				<span class="facts">{m.tiles.length} tiles · up to {mapSeats(m.tiles.length)} players</span>
				<span>{m.blurb}</span>
			</div>
		</div>
	{/each}
</div>

<h3>What is dealt each game</h3>
<ul class="rows">
	<li>
		<span class="swatch" style="background:{TERRAIN_CSS.random}"></span><span
			>Tiles marked <b>?</b> get a random terrain each game, in about the classic mix, with roughly one
			desert for every nineteen tiles. Colored tiles always keep their terrain.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			>Numbers are dealt fresh every game. Red 6s and 8s are never placed side by side.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.anchor} alt="" /><span
			>Harbors are spread round the outer coast. A longer coast gets more of them.</span
		>
	</li>
	<li>
		<img class="icon-px" src={TUT_ICON.robber} alt="" /><span>The robber starts on a desert.</span>
	</li>
</ul>

<h3>Random islands</h3>
<p>
	The host can also grow a random island: pick a size, a shape (round, long, ragged, or several
	islands joined by land bridges) and whether it has lakes, then press Generate until it looks
	right. Everyone in the lobby sees each new island, and Reroll grows another of the same kind.
</p>

<h3>Table size</h3>
<p>
	Every five tiles seat one more player: {seatsAt(5)} tiles seat five, {seatsAt(6)} six, {seatsAt(7)} seven
	and {seatsAt(8)} eight. With five or more players the bank and the development deck grow to match.
</p>
<p>
	The island and the table also limit the points to win, so a game can always end: at most two
	points per tile each player shares, plus two. Goals above 10 give everyone extra settlements,
	cities and roads to build them with.
</p>

<style>
	.isles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.isle {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px 8px 6px;
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
	.text b {
		font-size: 18px;
	}
	.facts {
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #b8740f;
	}
	.swatch {
		width: 22px;
		height: 22px;
		margin: 2px 3px 0;
		border-color: rgba(90, 60, 30, 0.6);
	}
	@media (max-width: 760px) {
		.isles {
			grid-template-columns: 1fr;
		}
	}
</style>
