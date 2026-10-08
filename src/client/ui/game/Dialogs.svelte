<script lang="ts">
	import { RESOURCE_LABEL, emptyResources, type Resource } from '../../../shared/rules/config';
	import { client } from '../../state/client.svelte';
	import { RESOURCES, myTurn, playerColor } from '../helpers';
	import ResCard from '../ResCard.svelte';
	import { dialogs } from './dialogs.svelte';

	const view = $derived(client.view!);
	const me = $derived(view.me);
	const res = $derived(view.players[me]?.resources);
	const mustDiscard = $derived(view.step === 'discard' ? (view.pendingDiscards[me] ?? 0) : 0);
	const choosingVictim = $derived(myTurn(view) && view.step === 'steal');

	let discard = $state(emptyResources());
	const picked = $derived(RESOURCES.reduce((n, r) => n + discard[r], 0));
	$effect(() => {
		if (!mustDiscard) discard = emptyResources();
	});

	let yop = $state<Resource[]>([]);
	$effect(() => {
		if (dialogs.open !== 'yearOfPlenty') yop = [];
	});

	function addDiscard(r: Resource) {
		if (!res || picked >= mustDiscard || discard[r] >= res[r]) return;
		discard[r]++;
	}
</script>

{#if mustDiscard && res}
	<div class="modal-backdrop">
		<div class="modal panel">
			<h2>The robber strikes!</h2>
			<p>You have more than 7 cards. Choose {mustDiscard} to give back to the bank.</p>
			<div class="row">
				{#each RESOURCES as r}
					<div class="col">
						<ResCard res={r} count={res[r] - discard[r]} size={54} dim={res[r] - discard[r] === 0} onclick={() => addDiscard(r)} />
						{#if discard[r]}<button class="chip" onclick={() => discard[r]--}>−{discard[r]}</button>{/if}
					</div>
				{/each}
			</div>
			<div class="foot">
				<span class="count title">{picked} / {mustDiscard}</span>
				<button class="btn red" disabled={picked !== mustDiscard} onclick={() => client.act({ type: 'discard', resources: { ...discard } })}>Discard</button>
			</div>
		</div>
	</div>
{/if}

{#if choosingVictim}
	<div class="modal-backdrop">
		<div class="modal panel">
			<h2>Rob someone</h2>
			<p>Take a random card from one player next to the robber.</p>
			<div class="victims">
				{#each view.stealCandidates as v}
					<button class="btn wood victim" onclick={() => client.act({ type: 'steal', victim: v })}>
						<span class="swatch" style="background:{playerColor(view, v)}"></span>
						{view.players[v].name}
						<small>{view.players[v].resourceCount} cards</small>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

{#if dialogs.open === 'yearOfPlenty'}
	<div class="modal-backdrop" onclick={(e) => e.target === e.currentTarget && (dialogs.open = null)} role="presentation">
		<div class="modal panel">
			<h2>Year of Plenty</h2>
			<p>Take any two resources from the bank.</p>
			<div class="row">
				{#each RESOURCES as r}
					<ResCard res={r} size={54} count={yop.filter((x) => x === r).length || undefined} dim={view.bank[r] === 0} onclick={() => yop.length < 2 && view.bank[r] > yop.filter((x) => x === r).length && (yop = [...yop, r])} />
				{/each}
			</div>
			<div class="foot">
				<button class="btn wood" onclick={() => (yop.length ? (yop = []) : (dialogs.open = null))}>{yop.length ? 'Reset' : 'Cancel'}</button>
				<button class="btn green" disabled={yop.length !== 2} onclick={() => { client.act({ type: 'playYearOfPlenty', resources: [yop[0], yop[1]] }); dialogs.open = null; }}>Take them</button>
			</div>
		</div>
	</div>
{/if}

{#if dialogs.open === 'monopoly'}
	<div class="modal-backdrop" onclick={(e) => e.target === e.currentTarget && (dialogs.open = null)} role="presentation">
		<div class="modal panel">
			<h2>Monopoly</h2>
			<p>Name a resource. Every other player hands you all of theirs.</p>
			<div class="row">
				{#each RESOURCES as r}
					<div class="col">
						<ResCard res={r} size={54} onclick={() => { client.act({ type: 'playMonopoly', resource: r }); dialogs.open = null; }} />
						<span class="nm">{RESOURCE_LABEL[r]}</span>
					</div>
				{/each}
			</div>
			<div class="foot"><button class="btn wood" onclick={() => (dialogs.open = null)}>Cancel</button></div>
		</div>
	</div>
{/if}

<style>
	.row {
		display: flex;
		gap: 10px;
		justify-content: center;
		padding-top: 10px;
	}
	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.chip {
		all: unset;
		cursor: pointer;
		font-family: var(--px);
		font-size: 13px;
		padding: 1px 7px;
		border-radius: 6px;
		background: #8a2a1a;
		color: #ffe1d6;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 18px;
		gap: 10px;
	}
	.count {
		font-size: 22px;
		color: var(--gold);
	}
	.victims {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.victim {
		justify-content: flex-start;
		font-size: 19px;
	}
	.victim small {
		margin-left: auto;
		font-size: 13px;
		color: var(--muted);
	}
	.nm {
		font-size: 12px;
		color: var(--muted);
		font-weight: 700;
	}
</style>
