<script lang="ts">
	import { client } from '../../state/client.svelte';
	import Embers from '../menu/Embers.svelte';
	import { PIXEL } from '../pixel';

	const view = $derived(client.view!);
	let hidden = $state(false);
	const ranking = $derived(
		view.players
			.map((p, i) => ({
				i,
				name: p.name,
				color: p.color,
				pts: p.totalPoints ?? p.publicPoints,
				vp: p.devCards?.filter((c) => c.type === 'victoryPoint').length ?? 0
			}))
			.sort((a, b) => b.pts - a.pts)
	);
	let show = $state(false);
	$effect(() => {
		if (view.phase === 'ended') {
			const t = setTimeout(() => (show = true), 1200);
			return () => clearTimeout(t);
		}
		show = false;
		hidden = false;
	});
	const winner = $derived(view.winner !== null ? view.players[view.winner] : null);
	const MEDAL = ['gold', 'silver', 'bronze', 'iron'];
	// A rematch needs everyone ready again, just like the first game.
	const seats = $derived(client.lobby?.seats ?? []);
	const notReady = $derived(seats.filter((s) => !s.ready));
	const meReady = $derived(!!seats.find((s) => s.id === client.seat)?.ready);
</script>

{#if show && !hidden && winner}
	<div class="modal-backdrop victory">
		<Embers count={34} />
		<div class="stage">
			<div class="rays"></div>
			<img class="crown icon-px" src={PIXEL.crown} alt="" />
			<div class="ribbon big">{view.winner === view.me ? 'Victory!' : `${winner.name} wins!`}</div>
			<div class="board panel">
				<div class="ranks">
					{#each ranking as r, k (r.i)}
						<div
							class="rank plaque"
							class:first={k === 0}
							class:me={r.i === view.me}
							style="animation-delay:{0.25 + k * 0.12}s"
						>
							<span class="medal coin {MEDAL[k] ?? 'iron'}">{k + 1}</span>
							<span class="shield" style="--shield: var(--art-shield-{r.color})"
								>{r.name.slice(0, 1).toUpperCase()}</span
							>
							<span class="nm">{r.name}{r.i === view.me ? ' (you)' : ''}</span>
							{#if r.vp}<span class="vpc" title="Hidden victory point cards"
									><img class="icon-px" src={PIXEL.victoryPoint} alt="" />{r.vp}</span
								>{/if}
							<span class="pts title">{r.pts}<small>VP</small></span>
						</div>
					{/each}
				</div>
				<div class="foot">
					<button class="btn wood" onclick={() => (hidden = true)}>View board</button>
					{#if client.isHost}
						<button
							class="btn green shine"
							disabled={notReady.length > 0}
							onclick={() => client.send({ t: 'start' })}>Play again</button
						>
					{:else}
						<button class="btn red" onclick={() => client.leave()}>Leave</button>
						<button
							class="btn"
							class:green={meReady}
							class:shine={!meReady}
							aria-pressed={meReady}
							onclick={() => client.send({ t: 'setReady', ready: !meReady })}
							>{meReady ? 'Ready!' : 'Play again'}</button
						>
					{/if}
				</div>
				{#if client.isHost && notReady.length}
					<p class="again">Waiting for {notReady.map((s) => s.name).join(', ')} to be ready.</p>
				{:else if !client.isHost && meReady}
					<p class="again">Waiting for the host to start another game.</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.victory {
		z-index: 55;
	}
	.stage {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: min(460px, calc(100vw - 24px));
		animation: pop-in 0.5s cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	.rays {
		position: absolute;
		top: -150px;
		left: 50%;
		width: 520px;
		height: 520px;
		margin-left: -260px;
		background: repeating-conic-gradient(
			from 0deg,
			rgba(255, 214, 110, 0.32) 0deg 9deg,
			transparent 9deg 22.5deg
		);
		mask: radial-gradient(circle, #000 18%, transparent 62%);
		-webkit-mask: radial-gradient(circle, #000 18%, transparent 62%);
		animation: spin 24s linear infinite;
		pointer-events: none;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.crown {
		position: relative;
		width: 96px;
		height: 96px;
		filter: drop-shadow(0 0 14px rgba(255, 200, 80, 0.9)) drop-shadow(0 6px 0 rgba(60, 30, 4, 0.6));
		animation: bob 1.6s ease-in-out infinite;
	}
	.ribbon.big {
		position: relative;
		z-index: 2;
		font-size: 28px;
		margin: 6px 0 calc(var(--s) * -9);
		padding-left: calc(var(--s) * 7);
		padding-right: calc(var(--s) * 7);
	}
	.board {
		width: 100%;
		padding: calc(var(--s) * 9) 12px 12px;
	}
	.ranks {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 14px;
	}
	.rank {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 2px 8px 2px 4px;
		animation: pop-in 0.35s ease-out both;
	}
	.rank.first {
		filter: drop-shadow(0 0 6px rgba(255, 210, 90, 0.75));
	}
	.medal {
		--s: 2.2px;
		font-size: 15px;
	}
	.medal.silver {
		filter: grayscale(1) brightness(1.35);
	}
	.medal.bronze {
		filter: sepia(0.6) hue-rotate(-18deg) saturate(1.4) brightness(0.85);
	}
	.medal.iron {
		filter: grayscale(1) brightness(0.75);
	}
	.rank .shield {
		--s: 2.2px;
		font-size: 15px;
	}
	.nm {
		flex: 1;
		text-align: left;
		font-family: var(--px);
		font-weight: 700;
		font-size: 17px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.me .nm {
		color: #ffe08a;
	}
	.vpc {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 13px;
		font-weight: 800;
		color: var(--muted);
	}
	.vpc img {
		width: 16px;
		height: 16px;
	}
	.pts {
		font-size: 24px;
		color: var(--gold);
		text-shadow: 0 2px 0 #5a3010;
	}
	.pts small {
		font-size: 11px;
		margin-left: 2px;
		color: var(--muted);
		text-shadow: none;
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 12px;
	}
	.again {
		margin: 8px 0 0;
		text-align: center;
		color: var(--muted);
		font-size: 14px;
	}
</style>
