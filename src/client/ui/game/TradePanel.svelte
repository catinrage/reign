<script lang="ts">
	import { emptyResources, type Resource } from '../../../shared/rules/config';
	import { tradeRatios } from '../../../shared/rules/queries';
	import { client } from '../../state/client.svelte';
	import { RESOURCES, RESOURCE_LABEL } from '../helpers';
	import { PIXEL } from '../pixel';
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

	const canBank = $derived(
		!!give && !!get && give !== get && mine[give] >= ratios[give] && view.bank[get] > 0
	);
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

<div class="trade">
	<div class="ribbon" style="--rib: var(--art-ribbon-wood)">
		<img class="icon-px" src={PIXEL.trade} alt="" />Trade
	</div>
	<button class="icon-btn close" onclick={() => (ui.trade = false)} aria-label="Close"
		><img src={PIXEL.close} alt="" /></button
	>
	<div class="frame panel">
		<div class="seg tabs">
			<button class="btn small" class:on={tab === 'bank'} onclick={() => (tab = 'bank')}
				><img class="icon-px" src={PIXEL.anchor} alt="" />Bank & harbors</button
			>
			<button class="btn small" class:on={tab === 'players'} onclick={() => (tab = 'players')}
				><img class="icon-px" src={PIXEL.chat} alt="" />Players</button
			>
		</div>

		{#if tab === 'bank'}
			<div class="sec">
				<div class="label">Give</div>
				<div class="row">
					{#each RESOURCES as r (r)}
						<div class="pick">
							<ResCard
								res={r}
								size={48}
								selected={give === r}
								dim={mine[r] < ratios[r]}
								onclick={() => (give = r)}
							/>
							<span class="tag" class:good={ratios[r] < 4}>{ratios[r]}:1</span>
						</div>
					{/each}
				</div>
				<div class="label">Get</div>
				<div class="row">
					{#each RESOURCES as r (r)}
						<div class="pick">
							<ResCard
								res={r}
								size={48}
								selected={get === r}
								dim={view.bank[r] === 0 || r === give}
								onclick={() => (get = r)}
							/>
							<span class="tag" title="Left in the bank">{view.bank[r]} left</span>
						</div>
					{/each}
				</div>
				<button class="btn green block" disabled={!canBank} onclick={bankTrade}>
					{#if give && get}Trade {ratios[give]}
						{RESOURCE_LABEL[give].toLowerCase()} for 1 {RESOURCE_LABEL[
							get
						].toLowerCase()}{:else}Pick what to give and get{/if}
				</button>
			</div>
		{:else}
			<div class="sec">
				<div class="label">You give</div>
				<div class="row">
					{#each RESOURCES as r (r)}
						<div class="pick">
							<ResCard
								res={r}
								size={46}
								count={offerGive[r] || undefined}
								dim={mine[r] === 0}
								onclick={() => bump('give', r, 1)}
							/>
							<button
								class="minus"
								disabled={offerGive[r] === 0}
								onclick={() => bump('give', r, -1)}
								aria-label="One less">−</button
							>
						</div>
					{/each}
				</div>
				<div class="label">You want</div>
				<div class="row">
					{#each RESOURCES as r (r)}
						<div class="pick">
							<ResCard
								res={r}
								size={46}
								count={offerWant[r] || undefined}
								onclick={() => bump('want', r, 1)}
							/>
							<button
								class="minus"
								disabled={offerWant[r] === 0}
								onclick={() => bump('want', r, -1)}
								aria-label="One less">−</button
							>
						</div>
					{/each}
				</div>
				<button
					class="btn green block"
					disabled={giveTotal === 0 || wantTotal === 0}
					onclick={offer}>Offer to everyone</button
				>
			</div>
		{/if}
	</div>
</div>

<style>
	.trade {
		position: absolute;
		right: 12px;
		bottom: 84px;
		width: 360px;
		pointer-events: auto;
		animation: pop-in 0.25s ease-out;
		z-index: 25;
	}
	.trade > .ribbon {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -60%);
		z-index: 2;
		font-size: 18px;
	}
	.trade > .ribbon img {
		width: 20px;
		height: 20px;
	}
	.close {
		position: absolute;
		top: -10px;
		right: -10px;
		z-index: 3;
		width: calc(var(--s) * 12);
		height: calc(var(--s) * 12);
		border-image-source: var(--art-btn-red);
	}
	.close img {
		width: calc(var(--s) * 6);
		height: calc(var(--s) * 6);
	}
	.frame {
		padding: 22px 10px 10px;
	}
	.tabs {
		display: flex;
		margin-bottom: 8px;
	}
	.tabs .btn {
		flex: 1;
		gap: 6px;
	}
	.tabs img {
		height: 16px;
	}
	.sec {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		gap: 6px;
		justify-content: space-between;
		padding: 6px 2px 2px;
	}
	.pick {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.tag {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: #e9d2b0;
	}
	.tag.good {
		color: var(--gold);
	}
	.minus {
		all: unset;
		cursor: pointer;
		width: 26px;
		height: 18px;
		text-align: center;
		line-height: 16px;
		font-weight: 900;
		color: #fff2d2;
		background: #5a331a;
		box-shadow:
			inset 0 2px 0 #8a5a32,
			inset 0 -2px 0 #2e180b,
			0 0 0 2px #140904;
	}
	.minus:disabled {
		opacity: 0.25;
		cursor: default;
	}
	.sec .btn.block {
		margin-top: 6px;
		font-size: 16px;
	}
	@media (max-width: 900px) {
		.trade {
			left: 6px;
			right: 6px;
			width: auto;
			bottom: 64px;
		}
	}
</style>
