<script lang="ts">
	import { DEV_CARDS, DEV_CARD_LABEL, DEV_CARD_TEXT, type DevCardType } from '../../../shared/rules/config';
	import { client } from '../../state/client.svelte';
	import { RESOURCES, myTurn } from '../helpers';
	import { PIXEL } from '../pixel';
	import ResCard from '../ResCard.svelte';
	import { dialogs } from './dialogs.svelte';

	const view = $derived(client.view!);
	const me = $derived(view.players[view.me]);
	const res = $derived(me?.resources);
	const dev = $derived(me?.devCards ?? []);
	const groups = $derived(
		DEV_CARDS.map((type) => ({
			type,
			total: dev.filter((c) => c.type === type).length,
			ready: dev.filter((c) => c.type === type && c.boughtTurn < view.turn).length
		})).filter((g) => g.total > 0)
	);
	const canPlay = $derived(
		myTurn(view) && (view.step === 'roll' || view.step === 'main') && !view.devCardPlayedThisTurn
	);

	function play(type: DevCardType) {
		if (type === 'knight') client.act({ type: 'playKnight' });
		else if (type === 'roadBuilding') client.act({ type: 'playRoadBuilding' });
		else if (type === 'yearOfPlenty') dialogs.open = 'yearOfPlenty';
		else if (type === 'monopoly') dialogs.open = 'monopoly';
	}
</script>

{#if res}
	<div class="hand">
		<div class="res">
			{#each RESOURCES as r}
				<div class="slot" data-hand={r}>
					{#key res[r]}
						<div class="bump"><ResCard res={r} count={res[r]} dim={res[r] === 0} size={58} /></div>
					{/key}
				</div>
			{/each}
		</div>
		{#if groups.length}
			<div class="dev">
				{#each groups as g}
					{@const playable = canPlay && g.type !== 'victoryPoint' && g.ready > 0}
					<button
						class="devcard"
						class:playable
						disabled={!playable}
						onclick={() => play(g.type)}
						title="{DEV_CARD_LABEL[g.type]}: {DEV_CARD_TEXT[g.type]}{g.ready < g.total && g.type !== 'victoryPoint' ? ' (new cards can be played next turn)' : ''}"
					>
						<img class="icon-px" src={PIXEL[g.type]} alt="" />
						<span class="dname">{DEV_CARD_LABEL[g.type]}</span>
						{#if g.total > 1}<span class="n">{g.total}</span>{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.hand {
		position: absolute;
		bottom: 14px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: flex-end;
		gap: 16px;
		pointer-events: none;
	}
	.res {
		display: flex;
		gap: 8px;
		padding: 12px 12px 10px;
		border-radius: 12px;
		background: linear-gradient(180deg, rgba(40, 22, 12, 0.55), rgba(30, 16, 8, 0.85));
		border: 2px solid rgba(20, 10, 4, 0.8);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
	}
	.bump {
		animation: bump 0.35s ease-out;
	}
	@keyframes bump {
		40% {
			transform: translateY(-10px) scale(1.08);
		}
	}
	.dev {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.devcard {
		position: relative;
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px 6px 8px;
		font-family: var(--px);
		font-size: 14px;
		font-weight: 700;
		color: #fff3dc;
		background: linear-gradient(180deg, #7b55c4, #553296);
		border: 2px solid #261340;
		border-radius: 8px;
		box-shadow:
			inset 0 2px 0 rgba(255, 255, 255, 0.3),
			0 3px 0 #1a0c30;
		cursor: default;
		opacity: 0.75;
	}
	.devcard img {
		width: 24px;
		height: 24px;
	}
	.devcard.playable {
		opacity: 1;
		cursor: pointer;
		animation: bob 1.6s ease-in-out infinite;
	}
	.devcard.playable:hover {
		filter: brightness(1.15);
	}
	.n {
		position: absolute;
		top: -8px;
		right: -8px;
		background: #2a170d;
		border: 2px solid var(--gold);
		border-radius: 999px;
		padding: 0 6px;
		font-size: 12px;
	}
	@media (max-width: 900px) {
		.hand {
			bottom: 74px;
			gap: 8px;
		}
		.res {
			gap: 4px;
			padding: 8px;
		}
		.res :global(.card) {
			--w: 44px !important;
		}
		.dname {
			display: none;
		}
	}
</style>
