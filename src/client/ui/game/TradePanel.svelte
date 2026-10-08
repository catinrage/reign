<script lang="ts">
	import { emptyResources, type Resource } from '../../../shared/rules/config';
	import { tradeRatios } from '../../../shared/rules/queries';
	import { client } from '../../state/client.svelte';
	import { RESOURCES } from '../helpers';
	import ResCard from '../ResCard.svelte';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	const mine = $derived(view.players[view.me].resources!);
	const ratios = $derived(tradeRatios(view, view.me));
	let tab = $state<'bank' | 'players'>('bank');
	let give = $state<Resource | null>(null);
	let get = $state<Resource | null>(null);
	let offerGive = $state(emptyResources());
	let offerWant = $state(emptyResources());

	const canBank = $derived(!!give && !!get && give !== get && mine[give] >= ratios[give] && view.bank[get] > 0);
	const giveTotal = $derived(RESOURCES.reduce((n, r) => n + offerGive[r], 0));
	const wantTotal = $derived(RESOURCES.reduce((n, r) => n + offerWant[r], 0));

	function bankTrade() {
		if (!give || !get) return;
		client.act({ type: 'bankTrade', give, get });
	}
	function offer() {
		client.act({ type: 'offerTrade', give: { ...offerGive }, want: { ...offerWant } });
		ui.trade = false;
	}
	function bump(side: 'give' | 'want', r: Resource, d: number) {
		if (side === 'give') {
			offerGive[r] = Math.max(0, Math.min(mine[r], offerGive[r] + d));
			if (offerGive[r] > 0) offerWant[r] = 0;
		} else {
			offerWant[r] = Math.max(0, Math.min(9, offerWant[r] + d));
			if (offerWant[r] > 0) offerGive[r] = 0;
		}
	}
</script>

<div class="trade panel">
	<div class="tabs">
		<button class="tab title" class:on={tab === 'bank'} onclick={() => (tab = 'bank')}>Bank & harbors</button>
		<button class="tab title" class:on={tab === 'players'} onclick={() => (tab = 'players')}>Players</button>
		<button class="x" onclick={() => (ui.trade = false)} aria-label="Close">✕</button>
	</div>

	{#if tab === 'bank'}
		<div class="sec">
			<div class="lbl">Give</div>
			<div class="row">
				{#each RESOURCES as r}
					<div class="pick" class:sel={give === r}>
						<ResCard res={r} size={46} dim={mine[r] < ratios[r]} onclick={() => (give = r)} />
						<span class="ratio">{ratios[r]}:1</span>
					</div>
				{/each}
			</div>
			<div class="lbl">Get</div>
			<div class="row">
				{#each RESOURCES as r}
					<div class="pick" class:sel={get === r}>
						<ResCard res={r} size={46} dim={view.bank[r] === 0 || r === give} onclick={() => (get = r)} />
						<span class="ratio">bank {view.bank[r]}</span>
					</div>
				{/each}
			</div>
			<button class="btn green" disabled={!canBank} onclick={bankTrade}>
				{#if give && get}Trade {ratios[give]} {give} for 1 {get}{:else}Pick what to give and get{/if}
			</button>
		</div>
	{:else}
		<div class="sec">
			<div class="lbl">You give</div>
			<div class="row">
				{#each RESOURCES as r}
					<div class="step">
						<ResCard res={r} size={42} count={offerGive[r] || undefined} dim={mine[r] === 0} onclick={() => bump('give', r, 1)} />
						<button class="minus" disabled={offerGive[r] === 0} onclick={() => bump('give', r, -1)}>−</button>
					</div>
				{/each}
			</div>
			<div class="lbl">You want</div>
			<div class="row">
				{#each RESOURCES as r}
					<div class="step">
						<ResCard res={r} size={42} count={offerWant[r] || undefined} onclick={() => bump('want', r, 1)} />
						<button class="minus" disabled={offerWant[r] === 0} onclick={() => bump('want', r, -1)}>−</button>
					</div>
				{/each}
			</div>
			<button class="btn green" disabled={giveTotal === 0 || wantTotal === 0} onclick={offer}>Offer to everyone</button>
		</div>
	{/if}
</div>

<style>
	.trade {
		position: absolute;
		right: 14px;
		bottom: 200px;
		width: 340px;
		padding: 10px 14px 14px;
		pointer-events: auto;
		animation: pop-in 0.25s ease-out;
		z-index: 25;
	}
	.tabs {
		display: flex;
		gap: 6px;
		margin-bottom: 8px;
	}
	.tab {
		all: unset;
		cursor: pointer;
		padding: 5px 10px;
		border-radius: 6px;
		font-size: 15px;
		color: var(--muted);
	}
	.tab.on {
		background: rgba(0, 0, 0, 0.3);
		color: var(--gold);
	}
	.x {
		all: unset;
		cursor: pointer;
		margin-left: auto;
		padding: 4px 8px;
		color: var(--muted);
	}
	.sec {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.lbl {
		font-size: 12px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}
	.row {
		display: flex;
		gap: 8px;
		justify-content: space-between;
		padding-top: 6px;
	}
	.pick,
	.step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		border-radius: 8px;
		padding: 2px;
	}
	.pick.sel {
		outline: 3px solid var(--gold);
		background: rgba(242, 193, 78, 0.15);
	}
	.ratio {
		font-family: var(--px);
		font-size: 12px;
		color: #f1dcc0;
	}
	.minus {
		all: unset;
		cursor: pointer;
		width: 22px;
		height: 18px;
		text-align: center;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.3);
		color: var(--text);
		font-weight: 900;
	}
	.minus:disabled {
		opacity: 0.25;
		cursor: default;
	}
	@media (max-width: 900px) {
		.trade {
			left: 8px;
			right: 8px;
			width: auto;
			bottom: 150px;
		}
	}
</style>
