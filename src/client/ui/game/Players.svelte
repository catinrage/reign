<script lang="ts">
	import { CHARACTER_INFO } from '../../../shared/rules/characters';
	import { discardLimit } from '../../../shared/rules/queries';
	import { client } from '../../state/client.svelte';
	import Portrait from '../extended/Portrait.svelte';
	import { PLAYER_CSS } from '../helpers';
	import { PIXEL } from '../pixel';
	import { sceneRef } from '../sceneRef';
	import TurnTab from './TurnTab.svelte';

	const view = $derived(client.view!);
	const seats = $derived(client.lobby?.seats ?? []);
	const playing = $derived(view.phase !== 'ended');
	// Spectators read the count on their own bar.
	const watchers = $derived(client.spectating ? 0 : (client.lobby?.spectators ?? 0));
	// Big tables shrink the list on desktop so it ends above the build panel in the corner.
	let innerWidth = $state(window.innerWidth);
	let innerHeight = $state(window.innerHeight);
	const zoom = $derived(
		innerWidth > 900 ? Math.max(0.6, Math.min(1, (innerHeight - 290) / (view.players.length * 82 - 8))) : 1
	);
	/** Resource cards in a hand. Cards dealt on the board count once they get there. */
	function cardsIn(i: number) {
		return Math.max(0, view.players[i].resourceCount - client.onTheWay(i));
	}
	/** While the mouse is on a plaque, that player's pieces light up on the board. */
	function highlight(seat: number | null) {
		sceneRef.current?.highlightPlayer(seat);
	}
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="players" style:zoom={zoom < 1 ? zoom.toFixed(3) : undefined}>
	{#each view.players as p, i (i)}
		{@const current = i === view.current && playing}
		{@const pts = p.totalPoints ?? p.publicPoints}
		{@const offline = seats[i] && !seats[i].connected}
		{@const road = view.longestRoadHolder === i}
		{@const army = view.largestArmyHolder === i}
		{@const limit = discardLimit(view, i)}
		{@const ch = p.character ? CHARACTER_INFO[p.character] : null}
		{@const cards = cardsIn(i)}
		<div
			class="player plaque"
			class:current
			class:waiting={playing && !current}
			class:me={i === view.me}
			class:offline
			style="--c:{PLAYER_CSS[p.color]}; --frame: var(--art-plaque-{p.color})"
			role="presentation"
			aria-current={current ? 'true' : undefined}
			data-plaque={i}
			onpointerenter={() => highlight(i)}
			onpointerleave={() => highlight(null)}
		>
			{#if current}<TurnTab color={p.color} />{/if}
			{#if ch}
				<span class="face" title="{ch.name} {ch.title}. {ch.trait}: {ch.text}">
					<Portrait id={p.character} size={44} />
					<span class="shield mini" style="--shield: var(--art-shield-{p.color})"></span>
				</span>
			{:else}
				<span class="shield" style="--shield: var(--art-shield-{p.color})">
					{#if p.isBot}<img class="icon-px" src={PIXEL.bot} alt="bot" />{:else}{p.name
							.slice(0, 1)
							.toUpperCase()}{/if}
				</span>
			{/if}
			<div class="info">
				<div class="name title">{i === view.me ? `${p.name} (you)` : p.name}</div>
				<div class="stats">
					<!-- Cards dealt on the board fly here and count as they land, with a bump. -->
					<span
						class:warn={cards > limit}
						title="Resource cards{cards > limit ? ': will discard on a 7' : ''}"
						data-plaque-cards={i}
						><img class="icon-px" src={PIXEL.cards} alt="" />{#key cards}<b class="bump">{cards}</b
						>{/key}</span
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
					{#if offline}<span
							class="away"
							title={seats[i].left
								? 'Left the table. A bot plays for them until they rejoin.'
								: 'Lost connection. A bot covers if they stay away.'}
							>{seats[i].left ? 'left' : 'away'}</span
						>{/if}
				</div>
			{/if}
		</div>
	{/each}
	{#if watchers}
		<div class="watchers" title="People watching without a seat. They never see a hand.">
			{watchers} watching
		</div>
	{/if}
</div>

<style>
	.watchers {
		align-self: flex-end;
		font-size: 12px;
		font-weight: 700;
		color: rgba(255, 236, 205, 0.75);
		text-shadow: 0 1px 2px #000;
		pointer-events: auto;
	}
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
		transition: filter 0.3s;
	}
	/* Whose turn it is: their plaque is framed in their color and its wood warmed with it. */
	.player.current {
		border-image-source: var(--frame);
		background-color: color-mix(in srgb, var(--c) 16%, #4d2b16);
	}
	/* Everyone else waits a shade darker. */
	.player.waiting {
		filter: brightness(0.74) saturate(0.7) drop-shadow(0 6px 8px rgba(0, 0, 0, 0.4));
	}
	.player.offline {
		opacity: 0.6;
	}
	.shield {
		--s: 2.6px;
		font-size: 17px;
	}
	.shield img {
		width: 20px;
		height: 20px;
	}
	.face {
		position: relative;
		flex: none;
	}
	.shield.mini {
		position: absolute;
		right: -5px;
		bottom: -4px;
		--s: 1.3px;
		width: 15px;
		height: 18px;
		padding: 0;
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
	.bump {
		display: inline-block;
		animation: bump 0.35s ease-out;
	}
	@keyframes bump {
		40% {
			transform: translateY(-4px) scale(1.4);
			color: #fff8e0;
		}
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
		.watchers {
			display: none;
		}
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
