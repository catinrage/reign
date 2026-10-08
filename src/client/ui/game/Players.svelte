<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { PLAYER_CSS } from '../helpers';
	import { PIXEL } from '../pixel';

	const view = $derived(client.view!);
	const seats = $derived(client.lobby?.seats ?? []);
</script>

<div class="players">
	{#each view.players as p, i}
		{@const current = i === view.current && view.phase !== 'ended'}
		{@const pts = p.totalPoints ?? p.publicPoints}
		{@const offline = seats[i] && !seats[i].connected}
		<div class="player panel" class:current class:me={i === view.me} style="--c:{PLAYER_CSS[p.color]}">
			<div class="band"></div>
			<div class="top">
				<span class="name title">
					{p.name}
					{#if p.isBot}<img class="icon-px mini" src={PIXEL.bot} alt="bot" />{/if}
				</span>
				<span class="vp title" title="Victory points{p.totalPoints !== undefined && p.totalPoints !== p.publicPoints ? ' (including hidden cards)' : ''}">
					{pts}<small>VP</small>
				</span>
			</div>
			<div class="stats">
				<span title="Resource cards"><img class="icon-px" src={PIXEL.cards} alt="" />{p.resourceCount}</span>
				<span title="Development cards"><img class="icon-px" src={PIXEL.dev} alt="" />{p.devCardCount}</span>
				<span title="Knights played" class:hot={view.largestArmyHolder === i}><img class="icon-px" src={PIXEL.army} alt="" />{p.knightsPlayed}</span>
				<span title="Longest road" class:hot={view.longestRoadHolder === i}><img class="icon-px" src={PIXEL.road} alt="" />{p.longestRoad}</span>
			</div>
			{#if view.longestRoadHolder === i || view.largestArmyHolder === i || offline || (p.resourceCount > 7 && i !== view.me)}
				<div class="badges">
					{#if view.longestRoadHolder === i}<span class="badge gold">Longest Road</span>{/if}
					{#if view.largestArmyHolder === i}<span class="badge gold">Largest Army</span>{/if}
					{#if p.resourceCount > 7 && i !== view.me}<span class="badge warn" title="Will discard on a 7">8+ cards</span>{/if}
					{#if offline}<span class="badge off">offline</span>{/if}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.players {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 230px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.player {
		position: relative;
		padding: 8px 10px 8px 16px;
		overflow: hidden;
		transition:
			transform 0.25s,
			box-shadow 0.25s;
	}
	.band {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 7px;
		background: var(--c);
		box-shadow:
			inset -2px 0 0 rgba(0, 0, 0, 0.3),
			inset 2px 0 0 rgba(255, 255, 255, 0.3);
	}
	.player.current {
		transform: translateX(-10px);
		border-color: var(--gold);
		animation: glow 1.8s ease-in-out infinite;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.name {
		font-size: 17px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.me .name {
		color: #ffe7a8;
	}
	.mini {
		width: 16px;
		height: 16px;
	}
	.vp {
		font-size: 22px;
		color: var(--gold);
		text-shadow: 0 2px 0 #5a3010;
	}
	.vp small {
		font-size: 11px;
		margin-left: 2px;
		color: var(--muted);
		text-shadow: none;
	}
	.stats {
		display: flex;
		gap: 10px;
		margin-top: 4px;
		font-family: var(--px);
		font-size: 14px;
		color: #f1dcc0;
	}
	.stats span {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.stats img {
		width: 15px;
		height: 15px;
	}
	.stats .hot {
		color: var(--gold);
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 6px;
	}
	.badge {
		font-size: 11px;
		font-weight: 800;
		padding: 2px 6px;
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.3);
	}
	.badge.gold {
		background: linear-gradient(180deg, #ffd86b, #d9951c);
		color: #3a1c06;
	}
	.badge.warn {
		background: #8a2a1a;
		color: #ffd9cc;
	}
	.badge.off {
		background: #444;
		color: #ddd;
	}
	@media (max-width: 900px) {
		.players {
			width: auto;
			top: 8px;
			right: 8px;
			left: 8px;
			flex-direction: row;
			overflow-x: auto;
			gap: 6px;
		}
		.player {
			flex: 1;
			min-width: 120px;
			padding: 5px 8px 5px 12px;
		}
		.player.current {
			transform: translateY(2px);
		}
		.name {
			font-size: 14px;
		}
		.vp {
			font-size: 17px;
		}
		.stats {
			gap: 6px;
			font-size: 12px;
		}
		.badges {
			display: none;
		}
	}
</style>
