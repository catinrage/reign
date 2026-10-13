<script lang="ts">
	import { bestSet, conquestMap, isSet, nextSetValue, setValue } from '../../../shared/conquest/queries';
	import { t } from '../../i18n/index.svelte';
	import { sfx } from '../sound';
	import { SYMBOL_ICON } from './icons';
	import { cqPlay } from './play.svelte';
	import { SYMBOL_LABEL, territoryName } from './text';

	/**
	 * Your conquest cards, one for each turn you took a territory. Three alike, or one of each, or
	 * any two with a wild card, trade in for armies at the start of your turn; a card showing a
	 * territory you hold puts two more armies there.
	 */
	const p = cqPlay;
	const v = $derived(p.view!);
	const me = $derived(v.me);
	const hand = $derived(v.players[me]?.cards ?? []);
	const map = $derived(conquestMap(v.settings));
	let picked = $state<number[]>([]);
	const chosen = $derived(hand.filter((c) => picked.includes(c.id)));
	const canTrade = $derived(p.myTurn && (v.step === 'reinforce' || v.mustTrade) && v.step !== 'occupy');
	const valid = $derived(chosen.length === 3 && isSet(chosen));
	const worth = $derived(valid ? setValue(v, chosen) : 0);
	const bonus = $derived(chosen.find((c) => c.territory !== null && v.owner[c.territory] === me)?.territory ?? null);
	const next = $derived(nextSetValue(v));
	const best = $derived(me >= 0 ? bestSet(hand, v, me) : null);

	// Cards traded in (or gone) drop out of the pick.
	$effect(() => {
		const ids = new Set(hand.map((c) => c.id));
		if (picked.some((id) => !ids.has(id))) picked = picked.filter((id) => ids.has(id));
	});
	// Opened with a set in hand on your turn: the best one is picked already.
	$effect(() => {
		if (p.cardsOpen && canTrade && !picked.length && best) picked = best.cards.map((c) => c.id);
	});

	function toggle(id: number) {
		sfx.card();
		picked = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= 3 ? [...picked.slice(1), id] : [...picked, id];
	}
	function trade() {
		if (!valid || !canTrade) return;
		p.act({ type: 'trade', cards: chosen.map((c) => c.id) });
		picked = [];
		if (!v.mustTrade || hand.length - 3 < 5) p.cardsOpen = false;
	}
	const note = $derived(
		!hand.length
			? t('Take a territory on your turn to earn a card.')
			: canTrade
				? valid
					? bonus !== null
						? t('Trade for {n} armies, and 2 more on {place}.', { n: worth, place: territoryName(v, bonus) })
						: t('Trade for {n} armies.', { n: worth })
					: chosen.length === 3
						? t('Not a set: three alike, one of each, or any with a wild.')
						: t('Pick three cards: three alike, one of each, or any with a wild.')
				: t('Trade in sets at the start of your turn.')
	);
</script>

{#if p.cardsOpen && me >= 0}
	<div class="cards-wrap">
		<div class="cards parch">
			<div class="head">
				<span class="title">{t('Conquest cards')}</span>
				<span class="worth" title={t('What the next set traded in will bring')}
					>{next.min === next.max ? t('Next set: {n} armies', { n: next.min }) : t('A set: {min} to {max} armies', { min: next.min, max: next.max })}</span
				>
				{#if !v.mustTrade}
					<button class="x" onclick={() => (p.cardsOpen = false)} aria-label={t('Close')}>✕</button>
				{/if}
			</div>
			{#if v.mustTrade && p.myTurn}
				<p class="must">{t('Five cards or more: you must trade in a set before going on.')}</p>
			{/if}
			<div class="hand">
				{#each hand as c (c.id)}
					{@const held = c.territory !== null && v.owner[c.territory] === me}
					{@const region = c.territory !== null ? map.regions[map.territories[c.territory].region] : null}
					<button
						class="card"
						class:picked={picked.includes(c.id)}
						class:wild={c.symbol === 'wild'}
						style="--band:{region?.color ?? '#c99a2e'}"
						onclick={() => toggle(c.id)}
						aria-pressed={picked.includes(c.id)}
						title={c.territory === null ? t('Wild: stands in for any picture') : held ? t('You hold {place}: 2 more armies there when traded', { place: territoryName(v, c.territory) }) : territoryName(v, c.territory)}
					>
						<span class="band"></span>
						<img class="pic" src={SYMBOL_ICON[c.symbol]} alt="" />
						<span class="sym">{t(SYMBOL_LABEL[c.symbol])}</span>
						<span class="place">{c.territory === null ? '★' : territoryName(v, c.territory)}</span>
						{#if held}<span class="held" aria-hidden="true">+2</span>{/if}
					</button>
				{/each}
			</div>
			<div class="foot">
				<span class="note">{note}</span>
				{#if canTrade}
					{#if best && !valid}
						<button class="btn small wood" onclick={() => (picked = best.cards.map((c) => c.id))}>{t('Pick the best set')}</button>
					{/if}
					<button class="btn green shine" disabled={!valid} onclick={trade}>{t('Trade')}</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.cards-wrap {
		position: absolute;
		left: 336px;
		right: 276px;
		bottom: 104px;
		display: flex;
		justify-content: center;
		pointer-events: none;
		z-index: 6;
	}
	.cards {
		max-width: 640px;
		padding: 4px 8px 6px;
		animation: pop-in 0.25s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.title {
		font-size: 17px;
		color: var(--ink);
	}
	.worth {
		flex: 1;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #8a6236;
	}
	.x {
		all: unset;
		cursor: pointer;
		font-size: 16px;
		color: var(--ink-soft);
		padding: 0 4px;
	}
	.must {
		margin: 2px 0 0;
		font-weight: 800;
		font-size: 13px;
		color: #b23a22;
	}
	.hand {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 8px 0;
		justify-content: center;
	}
	.card {
		all: unset;
		position: relative;
		box-sizing: border-box;
		width: 84px;
		height: 112px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 2px;
		padding: 14px 4px 4px;
		background: #fbf0d6;
		border: 3px solid #3a2214;
		box-shadow:
			inset 0 0 0 2px #e8cd96,
			0 4px 0 rgba(0, 0, 0, 0.3);
		cursor: pointer;
		transition:
			transform 0.12s,
			box-shadow 0.12s;
	}
	.card:hover {
		transform: translateY(-3px);
	}
	.card.picked {
		transform: translateY(-8px);
		box-shadow:
			inset 0 0 0 2px #e8cd96,
			0 0 0 3px var(--gold),
			0 8px 10px rgba(0, 0, 0, 0.35);
	}
	.card.wild {
		background: linear-gradient(#fff3c4, #f2d68a);
	}
	.band {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 9px;
		background: var(--band);
		border-bottom: 2px solid #3a2214;
	}
	.pic {
		width: 40px;
		height: 40px;
		image-rendering: pixelated;
	}
	.sym {
		font-family: var(--px);
		font-weight: 700;
		font-size: 11px;
		color: #8a6236;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.place {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		line-height: 1.1;
		color: var(--ink);
		text-align: center;
	}
	.held {
		position: absolute;
		top: 12px;
		right: 3px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: #fff;
		background: #4d8a2e;
		padding: 0 3px;
		box-shadow: 0 0 0 2px #1d3a10;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.note {
		flex: 1;
		font-weight: 700;
		font-size: 13px;
		color: var(--ink-soft);
	}
	@media (max-width: 900px) {
		.cards-wrap {
			left: 6px;
			right: 6px;
			bottom: 118px;
		}
		.card {
			width: 66px;
			height: 92px;
			padding-top: 12px;
		}
		.pic {
			width: 30px;
			height: 30px;
		}
		.place {
			font-size: 10px;
		}
		.foot {
			flex-wrap: wrap;
		}
	}
</style>
