<script lang="ts">
	import { hasResources } from '../../../shared/rules/config';
	import { client } from '../../state/client.svelte';
	import { countsList } from '../helpers';
	import { PIXEL } from '../pixel';
	import ResCard from '../ResCard.svelte';

	const view = $derived(client.view!);
	const offer = $derived(view.trade);
	const me = $derived(view.me);
	const mine = $derived(offer?.from === me);
	const answer = $derived(offer ? offer.responses[me] : undefined);
	const canAccept = $derived(
		!!offer &&
			!!view.players[me]?.resources &&
			hasResources(view.players[me].resources!, offer.want as any)
	);
	const from = $derived(offer ? view.players[offer.from] : null);
</script>

{#if offer && from && me >= 0}
	<div class="wrap">
		<div class="letter parch">
			<span class="seal shield" style="--shield: var(--art-shield-{from.color})"
				>{from.name.slice(0, 1).toUpperCase()}</span
			>
			<div class="who title">{mine ? 'Your offer' : `${from.name} offers a trade`}</div>
			<div class="swap">
				<div class="side">
					<span class="label">{mine ? 'You give' : 'You get'}</span>
					<div class="cards">
						{#each countsList(offer.give) as c (c.res)}<ResCard
								res={c.res}
								count={c.n}
								size={42}
							/>{/each}
					</div>
				</div>
				<img class="arrow icon-px" src={PIXEL.trade} alt="for" />
				<div class="side">
					<span class="label">{mine ? 'You get' : 'You give'}</span>
					<div class="cards">
						{#each countsList(offer.want) as c (c.res)}<ResCard
								res={c.res}
								count={c.n}
								size={42}
							/>{/each}
					</div>
				</div>
			</div>
			{#if mine}
				<div class="responses">
					{#each view.players as p, i (i)}
						{#if i !== me}
							{@const r = offer.responses[i]}
							<div class="resp">
								<span class="mini shield" style="--shield: var(--art-shield-{p.color})"></span>
								<span class="pn">{p.name}</span>
								{#if r === 'accept'}
									<button
										class="btn small green"
										onclick={() => client.act({ type: 'confirmTrade', offerId: offer.id, with: i })}
										>Trade</button
									>
								{:else if r === 'decline'}
									<span class="no">declined</span>
								{:else}
									<span class="wait">thinking…</span>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
				<button class="btn small wood" onclick={() => client.act({ type: 'cancelTrade' })}
					>Withdraw offer</button
				>
			{:else if answer === undefined}
				<div class="btns">
					<button
						class="btn small red"
						onclick={() => client.act({ type: 'respondTrade', offerId: offer.id, accept: false })}
						>Decline</button
					>
					<button
						class="btn small green"
						disabled={!canAccept}
						onclick={() => client.act({ type: 'respondTrade', offerId: offer.id, accept: true })}
					>
						{canAccept ? 'Accept' : 'Not enough cards'}
					</button>
				</div>
			{:else}
				<div class="status">
					{answer === 'accept' ? 'You accepted. Waiting for them to confirm.' : 'You declined.'}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.wrap {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 172px;
		display: flex;
		justify-content: center;
		pointer-events: none;
		z-index: 20;
	}
	.letter {
		position: relative;
		padding: 6px 12px 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		pointer-events: auto;
		animation: drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
		transform: rotate(-0.6deg);
	}
	/* A wax seal in the sender's colors, pressed onto the top edge. */
	.seal {
		position: absolute;
		top: -26px;
		left: 50%;
		margin-left: -21px;
		--s: 3px;
		font-size: 18px;
		filter: drop-shadow(0 3px 0 rgba(60, 20, 10, 0.45));
	}
	.who {
		margin-top: 12px;
		font-size: 17px;
		color: var(--ink);
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
		gap: 4px;
	}
	.cards {
		display: flex;
		gap: 12px;
		padding: 8px 6px 2px;
	}
	.arrow {
		width: 28px;
		height: 28px;
	}
	.responses {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		min-width: 240px;
	}
	.resp {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--ink);
	}
	.mini {
		--s: 1.5px;
	}
	.pn {
		flex: 1;
		font-weight: 800;
	}
	.no {
		color: #a03020;
		font-weight: 800;
	}
	.wait {
		color: #8a6a4a;
		font-style: italic;
		font-weight: 700;
	}
	.btns {
		display: flex;
		gap: 10px;
	}
	.status {
		color: var(--ink-soft);
		font-weight: 800;
	}
	@media (max-width: 900px) {
		.wrap {
			bottom: 250px;
		}
	}
</style>
