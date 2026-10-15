<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { PIXEL } from '../pixel';
	import { GB_PIXEL } from './icons';
	import { gbPlay } from './play.svelte';
	import { pieceName } from './text';

	/**
	 * The bar along the bottom: this round's orders, a slot each (what each piece does, and taking
	 * it back), what a click on the board does now, and Ready. On a phone it spans the screen's foot.
	 */
	const p = gbPlay;
	const v = $derived(p.view!);
	const slots = $derived(Array.from({ length: p.allowed }, (_, i) => p.drafts[i] ?? null));
	const picked = $derived(p.pieceById(p.selected));
	const VERB = { move: () => t('moves'), shoot: () => t('shoots'), brace: () => t('braces') };
	const hint = $derived.by(() => {
		if (!p.ordering) return null;
		if (p.ready) return t('Orders given. Change them until everyone is ready.');
		if (picked)
			return picked.kind === 'archer'
				? t('Click a lit hex to move there, or an orange one to shoot it.')
				: t('Click a lit hex to move there (red: take the piece on it), or brace.');
		return p.drafts.length >= p.allowed ? t('All your orders are given: Ready when you are.') : t('Click one of your pieces to give it an order.');
	});
</script>

<div class="bar-wrap">
	<div class="bar panel">
		{#if p.ordering}
			<div class="slots" aria-label={t('Your orders this round')}>
				{#each slots as o, i (i)}
					{@const piece = o ? p.pieceById(o.piece) : undefined}
					{#if o && piece}
						<span class="slot full" title={`${pieceName(piece.kind)} ${VERB[o.type]()}`}>
							<img class="icon-px" src={GB_PIXEL[piece.kind]} alt={pieceName(piece.kind)} />
							<span class="verb">{VERB[o.type]()}</span>
							{#if !p.ready}
								<button class="x" onclick={() => p.takeBack(o.piece)} aria-label={t('Take back')} title={t('Take back')}
									><img src={PIXEL.close} alt="" /></button
								>
							{/if}
						</span>
					{:else}
						<span class="slot" title={t('An order still to give')}>{i + 1}</span>
					{/if}
				{/each}
			</div>
			<span class="hint">{hint}</span>
			{#if picked && !p.ready}
				<button class="btn small wood" onclick={() => p.brace()} title={t('{piece} stands and fights whoever comes (B)', { piece: pieceName(picked.kind) })}
					><img class="icon-px" src={PIXEL.shieldIcon} alt="" />{t('Brace')}</button
				>
			{/if}
			<button
				class="btn main"
				class:green={!p.ready}
				class:shine={!p.ready}
				class:wood={p.ready}
				onclick={() => p.setReady(!p.ready)}
				title={p.ready ? t('Change your orders') : t('Done ordering (Enter)')}
			>
				{#if p.ready}{t('Change orders')}{:else}<img class="icon-px" src={PIXEL.check} alt="" />{t('Ready')}{/if}
			</button>
		{:else if v.phase === 'orders'}
			<span class="hint wait"><img class="icon-px" src={PIXEL.hourglass} alt="" />{p.resolving ? t('The round plays out…') : t('Waiting for the round')}</span>
		{/if}
	</div>
</div>

<style>
	.bar-wrap {
		position: absolute;
		left: 336px;
		right: 276px;
		bottom: 12px;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 70px;
		padding: 2px 8px;
		max-width: 100%;
		animation: pop-in 0.35s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	.slots {
		display: flex;
		gap: 6px;
	}
	.slot {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 54px;
		height: 54px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		color: rgba(255, 236, 200, 0.35);
		background: rgba(0, 0, 0, 0.28);
		box-shadow: inset 0 0 0 2px rgba(255, 220, 160, 0.18);
	}
	.slot.full {
		color: #fff2d2;
		background: rgba(255, 212, 90, 0.16);
		box-shadow: inset 0 0 0 2px var(--gold);
		animation: pop-in 0.25s ease-out both;
	}
	.slot img {
		width: 26px;
		height: 26px;
	}
	.verb {
		font-size: 11px;
		color: var(--gold);
	}
	.x {
		position: absolute;
		top: -7px;
		right: -7px;
		width: 18px;
		height: 18px;
		padding: 0;
		border: 0;
		background: #4a2414;
		box-shadow: 0 0 0 2px #1a0c05;
		cursor: pointer;
		display: grid;
		place-items: center;
	}
	.x img {
		width: 12px;
		height: 12px;
		image-rendering: pixelated;
	}
	.hint {
		font-family: var(--body);
		font-weight: 700;
		font-size: 14px;
		color: #ead6b8;
		max-width: 280px;
		line-height: 1.25;
	}
	.hint.wait {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--px);
		font-size: 15px;
		color: var(--muted);
	}
	.hint.wait img {
		width: 18px;
		height: 18px;
	}
	.btn img {
		width: 18px;
		height: 18px;
		margin-right: 4px;
	}
	.main {
		flex: none;
		font-size: 20px;
		min-width: 150px;
		min-height: calc(var(--s) * 17);
	}
	@media (max-width: 900px) {
		.bar-wrap {
			left: 6px;
			right: 6px;
			bottom: 6px;
		}
		.bar {
			width: 100%;
			gap: 6px;
			min-height: 0;
			padding: 0 2px;
			flex-wrap: wrap;
			justify-content: center;
		}
		.slot {
			width: 42px;
			height: 42px;
		}
		.hint {
			font-size: 12px;
			max-width: 190px;
		}
		.main {
			font-size: 16px;
			min-width: 0;
			flex: 1 1 auto;
		}
	}
</style>
