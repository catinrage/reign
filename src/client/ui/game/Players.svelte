<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { PLAYER_CSS } from '../helpers';
	import { PIXEL } from '../pixel';

	const view = $derived(client.view!);
	const seats = $derived(client.lobby?.seats ?? []);
</script>

<div class="players">
	{#each view.players as p, i (i)}
		{@const current = i === view.current && view.phase !== 'ended'}
		{@const pts = p.totalPoints ?? p.publicPoints}
		{@const offline = seats[i] && !seats[i].connected}
		{@const road = view.longestRoadHolder === i}
		{@const army = view.largestArmyHolder === i}
		<div
			class="player plaque"
			class:current
			class:me={i === view.me}
			class:offline
			style="--c:{PLAYER_CSS[p.color]}"
		>
			{#if current}<img class="turn icon-px" src={PIXEL.hourglass} alt="Current turn" />{/if}
			<span class="shield" style="--shield: var(--art-shield-{p.color})">
				{#if p.isBot}<img class="icon-px" src={PIXEL.bot} alt="bot" />{:else}{p.name
						.slice(0, 1)
						.toUpperCase()}{/if}
			</span>
			<div class="info">
				<div class="name title">{i === view.me ? `${p.name} (you)` : p.name}</div>
				<div class="stats">
					<span
						class:warn={p.resourceCount > 7}
						title="Resource cards{p.resourceCount > 7 ? ': will discard on a 7' : ''}"
						><img class="icon-px" src={PIXEL.cards} alt="" />{p.resourceCount}</span
					>
					<span title="Development cards"
						><img class="icon-px" src={PIXEL.dev} alt="" />{p.devCardCount}</span
					>
					<span class:hot={army} title="Knights played{army ? ' (Largest Army, +2)' : ''}"
						><img class="icon-px" src={PIXEL.army} alt="" />{p.knightsPlayed}</span
					>
					<span class:hot={road} title="Longest road{road ? ' (Longest Road, +2)' : ''}"
						><img class="icon-px" src={PIXEL.road} alt="" />{p.longestRoad}</span
					>
				</div>
			</div>
			<span
				class="coin vp"
				title="Victory points{p.totalPoints !== undefined && p.totalPoints !== p.publicPoints
					? ' (including your hidden cards)'
					: ''}">{pts}</span
			>
			{#if road || army || offline}
				<div class="medals">
					{#if road}<span class="medal" title="Longest Road (+2)"
							><img class="icon-px" src={PIXEL.road} alt="" /></span
						>{/if}
					{#if army}<span class="medal" title="Largest Army (+2)"
							><img class="icon-px" src={PIXEL.army} alt="" /></span
						>{/if}
					{#if offline}<span class="away">away</span>{/if}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.players {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 262px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.player {
		position: relative;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 3px 6px 3px 4px;
		pointer-events: auto;
		filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.4));
		transition:
			transform 0.3s cubic-bezier(0.2, 1.4, 0.4, 1),
			filter 0.3s;
	}
	.player.current {
		transform: translateX(-14px);
		animation: glow 1.8s ease-in-out infinite;
	}
	.player.offline {
		opacity: 0.6;
	}
	.turn {
		position: absolute;
		left: -34px;
		top: 50%;
		width: 24px;
		height: 24px;
		margin-top: -12px;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.6));
		animation: bob 1.2s ease-in-out infinite;
	}
	.shield {
		--s: 2.6px;
		font-size: 17px;
	}
	.shield img {
		width: 20px;
		height: 20px;
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.me .name {
		color: #ffe08a;
	}
	.stats {
		display: flex;
		gap: 9px;
		margin-top: 2px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #e9d2b0;
	}
	.stats span {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.stats img {
		width: 15px;
		height: 15px;
	}
	.stats .hot {
		color: var(--gold);
	}
	.stats .warn {
		color: #ff9a80;
	}
	.vp {
		--s: 2.4px;
		font-size: 17px;
	}
	.medals {
		position: absolute;
		left: 34px;
		bottom: -9px;
		display: flex;
		gap: 3px;
	}
	.medal {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		background: var(--art-coin) center / 100% 100%;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5));
	}
	.medal img {
		width: 12px;
		height: 12px;
	}
	.away {
		font-family: var(--px);
		font-weight: 700;
		font-size: 11px;
		padding: 1px 5px;
		background: #4a4440;
		color: #eee;
		box-shadow: 0 0 0 2px #1a1210;
	}
	@media (max-width: 900px) {
		.players {
			width: auto;
			top: 6px;
			right: 6px;
			left: 6px;
			flex-direction: row;
			gap: 5px;
			--s: 2px;
		}
		.player {
			flex: 1 1 0;
			min-width: 0;
			gap: 5px;
			padding: 1px 4px 1px 2px;
		}
		.player.current {
			transform: translateY(3px);
		}
		.turn {
			display: none;
		}
		.shield {
			--s: 1.8px;
			font-size: 13px;
		}
		.shield img {
			width: 14px;
			height: 14px;
		}
		.name {
			font-size: 13px;
		}
		.stats {
			gap: 5px;
			font-size: 11px;
		}
		.stats img {
			width: 12px;
			height: 12px;
		}
		.stats span:nth-child(2) {
			display: none;
		}
		.vp {
			--s: 1.8px;
			font-size: 13px;
		}
		.medals {
			display: none;
		}
	}
	@media (max-width: 520px) {
		.info {
			display: none;
		}
		.player {
			justify-content: space-between;
		}
	}
</style>
