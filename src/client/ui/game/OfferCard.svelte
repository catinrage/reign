<script lang="ts">
	import { hasResources } from '../../../shared/rules/config';
	import { client } from '../../state/client.svelte';
	import { countsList, playerColor } from '../helpers';
	import ResCard from '../ResCard.svelte';

	const view = $derived(client.view!);
	const offer = $derived(view.trade);
	const me = $derived(view.me);
	const mine = $derived(offer?.from === me);
	const answer = $derived(offer ? offer.responses[me] : undefined);
	const canAccept = $derived(!!offer && !!view.players[me]?.resources && hasResources(view.players[me].resources!, offer.want as any));
</script>

{#if offer && me >= 0}
	<div class="wrap">
	<div class="offer parch">
		{#if mine}
			<div class="who title">Your offer</div>
		{:else}
			<div class="who title"><b style="color:{playerColor(view, offer.from)}">{view.players[offer.from].name}</b> offers a trade</div>
		{/if}
		<div class="swap">
			<div class="side">
				<span class="lbl">{mine ? 'You give' : 'You get'}</span>
				<div class="cards">{#each countsList(offer.give) as c}<ResCard res={c.res} count={c.n} size={40} />{/each}</div>
			</div>
			<span class="arrow">⇄</span>
			<div class="side">
				<span class="lbl">{mine ? 'You get' : 'You give'}</span>
				<div class="cards">{#each countsList(offer.want) as c}<ResCard res={c.res} count={c.n} size={40} />{/each}</div>
			</div>
		</div>
		{#if mine}
			<div class="responses">
				{#each view.players as p, i}
					{#if i !== me}
						{@const r = offer.responses[i]}
						<div class="resp">
							<span class="swatch" style="background:{playerColor(view, i)}"></span>
							<span class="pn">{p.name}</span>
							{#if r === 'accept'}
								<button class="btn small green" onclick={() => client.act({ type: 'confirmTrade', offerId: offer.id, with: i })}>Trade</button>
							{:else if r === 'decline'}
								<span class="no">declined</span>
							{:else}
								<span class="wait">thinking…</span>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
			<button class="btn small wood" onclick={() => client.act({ type: 'cancelTrade' })}>Cancel offer</button>
		{:else if answer === undefined}
			<div class="btns">
				<button class="btn small red" onclick={() => client.act({ type: 'respondTrade', offerId: offer.id, accept: false })}>Decline</button>
				<button class="btn small green" disabled={!canAccept} onclick={() => client.act({ type: 'respondTrade', offerId: offer.id, accept: true })}>Accept</button>
			</div>
		{:else}
			<div class="status">{answer === 'accept' ? 'You accepted. Waiting for them to confirm.' : 'You declined.'}</div>
		{/if}
	</div>
	</div>
{/if}

<style>
	.wrap {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 170px;
		display: flex;
		justify-content: center;
		pointer-events: none;
		z-index: 20;
	}
	.offer {
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		pointer-events: auto;
		animation: pop-in 0.3s ease-out;
	}
	.who {
		font-size: 17px;
	}
	.swap {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.lbl {
		font-size: 12px;
		font-weight: 800;
		color: #7a5a3a;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.cards {
		display: flex;
		gap: 10px;
		padding: 4px;
	}
	.arrow {
		font-size: 26px;
		color: #8a5a2a;
	}
	.responses {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
	}
	.resp {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.pn {
		flex: 1;
		font-weight: 800;
	}
	.no {
		color: #a03020;
		font-weight: 700;
	}
	.wait {
		color: #8a6a4a;
		font-style: italic;
	}
	.btns {
		display: flex;
		gap: 10px;
	}
	.status {
		color: #6a4a30;
		font-weight: 700;
	}
	@media (max-width: 900px) {
		.wrap {
			bottom: 190px;
		}
	}
</style>
