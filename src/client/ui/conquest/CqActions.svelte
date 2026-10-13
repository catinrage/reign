<script lang="ts">
	import { bestSet, canAttackNow, reinforcementsFor } from '../../../shared/conquest/queries';
	import { t } from '../../i18n/index.svelte';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import { CQ_PIXEL } from './icons';
	import { cqPlay, type PlaceStep } from './play.svelte';
	import { playerName, regionName, territoryName } from './text';

	/**
	 * The bar along the bottom: where the turn is (reinforce, attack, fortify), what a click on the
	 * board does now, and the one button that moves play on. On a phone it spans the screen's
	 * foot, so that button is always in reach.
	 */
	const v = $derived(cqPlay.view!);
	const p = cqPlay;
	const me = $derived(v.me);
	const hand = $derived(v.players[me]?.cards ?? []);
	const setReady = $derived(me >= 0 && !!bestSet(hand, v, me));
	const income = $derived(me >= 0 ? reinforcementsFor(v, me) : null);
	const step = $derived(
		v.phase === 'deploy' ? 'deploy' : v.step === 'occupy' ? 'attack' : v.step === 'reinforce' && canAttackNow(v, v.current) ? 'attack' : v.step
	);
	const STEPS = [
		{ id: 'reinforce', label: 'Reinforce', icon: CQ_PIXEL.troops },
		{ id: 'attack', label: 'Attack', icon: PIXEL.sword },
		{ id: 'fortify', label: 'Fortify', icon: CQ_PIXEL.march }
	] as const;
	const STEP_LABEL = { reinforce: () => t('Reinforce'), attack: () => t('Attack'), fortify: () => t('Fortify') };
	const PLACE_STEPS: PlaceStep[] = [1, 5, 'all'];

	type Main = { label: string; run: () => void; tone: 'green' | 'red' | 'gold'; disabled?: boolean; tip?: string } | null;
	const main: Main = $derived.by(() => {
		if (!p.myTurn) return null;
		if (v.mustTrade) return { label: t('Trade cards'), run: () => (p.cardsOpen = true), tone: 'gold' };
		if (p.placing)
			return { label: t('Place {n} more', { n: p.reserve }), run: () => {}, tone: 'gold', disabled: true, tip: t('Click your glowing territories to place armies.') };
		if (p.occupying) return { label: t('Move in {n}', { n: p.move }), run: () => p.occupy(), tone: 'green' };
		if (p.attacking) return { label: t('End attacks'), run: () => p.endAttack(), tone: 'gold', tip: t('Stop attacking and move on to fortifying.') };
		if (p.fortifying) {
			if (p.selected !== null && p.target !== null)
				return { label: t('Move {n} and end turn', { n: p.move }), run: () => p.fortify(), tone: 'green' };
			return { label: t('End turn'), run: () => p.endTurn(), tone: 'red' };
		}
		return null;
	});

	function bump(d: number) {
		const o = v.occupy;
		if (p.occupying && o) p.move = Math.max(o.min, Math.min(o.max, p.move + d));
		else if (p.selected !== null) p.move = Math.max(1, Math.min(v.armies[p.selected] - 1, p.move + d));
		sfx.click();
		p.sync();
	}
	const range = $derived.by(() => {
		if (p.occupying && v.occupy) return { min: v.occupy.min, max: v.occupy.max };
		if (p.fortifying && p.selected !== null && p.target !== null) return { min: 1, max: v.armies[p.selected] - 1 };
		return null;
	});

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
		// While a fight is open, Enter rolls the dice (see CqCombat).
		const fighting = p.attacking && p.selected !== null && p.target !== null;
		if (e.key === 'Enter' && main && !main.disabled && !fighting) {
			e.preventDefault();
			main.run();
		} else if (range && (e.key === '+' || e.key === '=' || e.key === 'ArrowUp')) bump(1);
		else if (range && (e.key === '-' || e.key === 'ArrowDown')) bump(-1);
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="bar-wrap">
	<div class="bar panel">
		{#if v.phase === 'play'}
			<ol class="steps" aria-label={t('Turn steps')}>
				{#each STEPS as s (s.id)}
					<li class:on={step === s.id} class:done={STEPS.findIndex((x) => x.id === step) > STEPS.findIndex((x) => x.id === s.id)}>
						<img class="icon-px" src={s.icon} alt="" /><span>{STEP_LABEL[s.id]()}</span>
					</li>
				{/each}
			</ol>
		{/if}

		<div class="middle">
			{#if p.placing}
				<div class="reserve" title={income && v.phase === 'play' ? t('This turn: {n} for your territories', { n: income.base }) : undefined}>
					{#key p.reserve}<b class="big-n">{p.reserve}</b>{/key}
					<span class="lbl">{t('to place')}</span>
				</div>
				{#if v.phase === 'play' && income?.regions.length}
					<div class="bonus">
						{#each income.regions as g (g.region)}<span class="tag" title={t('+{n} for holding {region}', { n: g.bonus, region: regionName(v, g.region) })}>+{g.bonus} {regionName(v, g.region)}</span>{/each}
					</div>
				{/if}
				<div class="seg" role="group" aria-label={t('Armies per click')}>
					{#each PLACE_STEPS as s (s)}
						<button
							class="btn small wood"
							class:on={p.placeStep === s}
							aria-pressed={p.placeStep === s}
							title={t('Armies placed with each click')}
							onclick={() => (p.placeStep = s)}>{s === 'all' ? t('All') : `+${s}`}</button
						>
					{/each}
				</div>
				<button class="icon-btn undo" disabled={!p.canUndo} onclick={() => p.undo()} aria-label={t('Undo')} title={t('Take back the last army placed')}
					><img src={CQ_PIXEL.undo} alt="" /></button
				>
			{:else if range}
				<div class="count">
					<button class="btn small wood" disabled={p.move <= range.min} onclick={() => bump(-1)} aria-label={t('Fewer')}>−</button>
					<span class="n-box"
						><b class="big-n">{p.move}</b><span class="lbl">{p.occupying ? t('move in') : t('to move')}</span></span
					>
					<button class="btn small wood" disabled={p.move >= range.max} onclick={() => bump(1)} aria-label={t('More')}>+</button>
					<button class="btn small wood" disabled={p.move === range.max} onclick={() => ((p.move = range.max), p.sync())}>{t('All')}</button>
				</div>
				{#if p.occupying && v.occupy}
					<span class="hint">{t('{place} is yours!', { place: territoryName(v, v.occupy.to) })}</span>
				{/if}
			{:else if p.myTurn && p.attacking}
				<span class="hint"
					>{p.selected === null ? t('Click one of your armies, then an enemy next to it.') : t('Click a red territory to attack it, or drag onto it.')}</span
				>
			{:else if p.myTurn && p.fortifying}
				<span class="hint">{p.selected === null ? t('One move between connected territories ends your turn.') : t('Click or drag to a glowing territory.')}</span>
			{:else if v.phase === 'deploy'}
				<span class="hint wait"><img class="icon-px" src={PIXEL.hourglass} alt="" />{t('Waiting for everyone to place their armies')}</span>
			{:else if v.phase === 'play'}
				<span class="hint wait"><img class="icon-px" src={PIXEL.hourglass} alt="" />{t("{player}'s turn", { player: playerName(v, v.current) })}</span>
			{/if}
		</div>

		{#if me >= 0}
			<button
				class="btn wood cards-btn"
				class:ready={setReady}
				onclick={() => {
					sfx.open();
					p.cardsOpen = !p.cardsOpen;
				}}
				aria-expanded={p.cardsOpen}
				title={setReady ? t('Your cards: a set is ready to trade') : t('Your conquest cards')}
				><img src={PIXEL.cards} alt="" /><b>{hand.length}</b></button
			>
		{/if}
		{#if p.myTurn && p.attacking}
			<button class="btn small red end-turn" onclick={() => p.endTurn()} title={t('End your turn now, without fortifying')}>{t('End turn')}</button>
		{/if}
		{#if main}
			<button
				class="btn main shine"
				class:green={main.tone === 'green'}
				class:red={main.tone === 'red'}
				disabled={main.disabled}
				title={main.tip}
				onclick={() => main.run()}>{main.label}</button
			>
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
	.steps {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #b89874;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 0 4px;
		opacity: 0.6;
	}
	.steps li img {
		width: 14px;
		height: 14px;
	}
	.steps li.done {
		opacity: 0.45;
		text-decoration: line-through;
	}
	.steps li.on {
		opacity: 1;
		color: var(--gold);
		background: rgba(0, 0, 0, 0.28);
		box-shadow: inset 2px 0 0 var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.middle {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.reserve,
	.n-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		min-width: 44px;
	}
	.big-n {
		font-family: var(--body);
		font-weight: 900;
		font-size: 30px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
		display: inline-block;
		animation: bump 0.35s ease-out;
	}
	@keyframes bump {
		40% {
			transform: scale(1.3);
			color: var(--gold);
		}
	}
	.lbl {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: var(--muted);
		margin-top: 2px;
		white-space: nowrap;
	}
	.bonus {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tag {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: var(--gold);
		white-space: nowrap;
	}
	.seg {
		display: flex;
		gap: 3px;
	}
	.seg .btn {
		min-width: 40px;
	}
	.seg .btn.on {
		--art: var(--art-btn-gold);
		color: #3a1d04;
		text-shadow: 0 2px 0 rgba(255, 246, 200, 0.55);
	}
	.undo:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.count {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.count .btn {
		min-width: 34px;
		font-size: 18px;
	}
	.hint {
		font-family: var(--body);
		font-weight: 700;
		font-size: 14px;
		color: #ead6b8;
		max-width: 300px;
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
	.cards-btn {
		flex: none;
		gap: 4px;
		font-size: 17px;
	}
	.cards-btn.ready {
		--art: var(--art-btn-gold);
		--art-down: var(--art-btn-gold-down);
		color: #3a1d04;
		animation: glow 1.6s ease-in-out infinite;
	}
	.end-turn {
		flex: none;
	}
	.main {
		flex: none;
		font-size: 20px;
		min-width: 150px;
		min-height: calc(var(--s) * 17);
	}
	@media (max-width: 1100px) {
		.steps span {
			display: none;
		}
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
		.steps {
			flex-direction: row;
			width: 100%;
			justify-content: center;
			font-size: 11px;
		}
		.steps span {
			display: inline;
		}
		.big-n {
			font-size: 24px;
		}
		.hint {
			font-size: 12px;
			max-width: 190px;
		}
		.bonus {
			display: none;
		}
		.main {
			font-size: 16px;
			min-width: 0;
			flex: 1 1 auto;
		}
		.seg .btn {
			min-width: 34px;
		}
	}
</style>
