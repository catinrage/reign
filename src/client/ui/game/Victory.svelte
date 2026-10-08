<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { playerColor } from '../helpers';
	import { PIXEL } from '../pixel';

	const view = $derived(client.view!);
	let hidden = $state(false);
	const ranking = $derived(
		view.players
			.map((p, i) => ({ i, name: p.name, pts: p.totalPoints ?? p.publicPoints, vp: p.devCards?.filter((c) => c.type === 'victoryPoint').length ?? 0 }))
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
</script>

{#if show && !hidden && view.winner !== null}
	<div class="modal-backdrop">
		<div class="modal panel win">
			<img class="icon-px crown" src={PIXEL.victoryPoint} alt="" />
			<h2 style="color:{playerColor(view, view.winner)}">
				{view.winner === view.me ? 'Victory!' : `${view.players[view.winner].name} wins!`}
			</h2>
			<div class="ranks">
				{#each ranking as r, k}
					<div class="rank" class:first={k === 0}>
						<span class="pos title">{k + 1}</span>
						<span class="swatch" style="background:{playerColor(view, r.i)}"></span>
						<span class="nm">{r.name}</span>
						{#if r.vp}<span class="vpc">{r.vp} hidden VP</span>{/if}
						<span class="pts title">{r.pts}</span>
					</div>
				{/each}
			</div>
			<div class="foot">
				<button class="btn wood" onclick={() => (hidden = true)}>View board</button>
				{#if client.isHost}
					<button class="btn green" onclick={() => client.send({ t: 'start' })}>Play again</button>
				{:else}
					<button class="btn wood" onclick={() => client.leave()}>Leave</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.win {
		text-align: center;
		min-width: 360px;
	}
	.crown {
		width: 72px;
		height: 72px;
		animation: bob 1.4s ease-in-out infinite;
	}
	h2 {
		font-size: 40px !important;
		text-shadow: 0 3px 0 rgba(0, 0, 0, 0.5);
	}
	.ranks {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 14px 0;
	}
	.rank {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 12px;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.22);
	}
	.rank.first {
		background: linear-gradient(90deg, rgba(242, 193, 78, 0.35), rgba(0, 0, 0, 0.2));
	}
	.pos {
		width: 20px;
		color: var(--muted);
	}
	.nm {
		flex: 1;
		text-align: left;
		font-weight: 800;
	}
	.vpc {
		font-size: 12px;
		color: var(--muted);
	}
	.pts {
		font-size: 22px;
		color: var(--gold);
	}
	.foot {
		display: flex;
		justify-content: center;
		gap: 12px;
	}
</style>
