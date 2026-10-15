<script lang="ts">
	import { attackDiceMax, canAttackFrom } from '../../../shared/conquest/queries';
	import type { Battle } from '../../../shared/conquest/types';
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { BATTLE_ROLL_FAST } from '../../scene/conquest/conquestScene';
	import { SIGIL_OF, sigilUrl } from '../../scene/conquest/sigils';
	import { dieFace } from '../art';
	import { CQ_PIXEL } from './icons';
	import { winChance } from './odds';
	import { cqPlay } from './play.svelte';
	import { cqColor, territoryName } from './text';

	/**
	 * The fight: the attacker's dice against the defender's, rolling as the arrow strikes on the
	 * board, then the losses. While it is your attack the panel keeps its buttons: roll again, roll
	 * till it's decided, how many dice, or stop. Other players' battles show here for a moment too.
	 */
	const p = cqPlay;
	const v = $derived(p.view!);
	const mine = $derived(p.attacking && p.selected !== null && p.target !== null && v.owner[p.target] !== v.me);
	/** The battle on show: the one rolling now, or (in your own fight) the last one rolled. */
	let shown = $state.raw<Battle | null>(null);
	let rolling = $state(false);
	let faces = $state<{ a: number[]; d: number[] }>({ a: [], d: [] });
	let lingering = $state(false);
	let lastId = 0;

	$effect(() => {
		const b = p.battle;
		if (!b || b.id === lastId) return;
		lastId = b.id;
		shown = b.b;
		rolling = true;
		lingering = true;
		const spin = setInterval(() => {
			faces = { a: b.b.attack.map(() => 1 + Math.floor(Math.random() * 6)), d: b.b.defend.map(() => 1 + Math.floor(Math.random() * 6)) };
		}, 70);
		const stop = setTimeout(
			() => {
				clearInterval(spin);
				rolling = false;
			},
			b.roll * 1000 - 40
		);
		// The throw stays up a while once the dice land (briefly, when the board is hurrying).
		const gone = setTimeout(() => (lingering = false), (b.roll + (b.roll <= BATTLE_ROLL_FAST ? 0.6 : 1.6)) * 1000);
		return () => {
			clearInterval(spin);
			clearTimeout(stop);
			clearTimeout(gone);
			rolling = false;
		};
	});

	// A new fight (another target or territory) starts with a clean slate.
	$effect(() => {
		void p.selected;
		void p.target;
		// (When the attack is simply over, its last throw stays up a moment.)
		if (p.selected === null || p.target === null) return;
		if (!rolling && shown && (shown.from !== p.selected || shown.to !== p.target) && shown.player === v.me) shown = null;
	});

	const open = $derived(mine || (lingering && !!shown));
	const from = $derived(mine ? p.selected! : (shown?.from ?? 0));
	const to = $derived(mine ? p.target! : (shown?.to ?? 0));
	const attacker = $derived(v.owner[from]);
	const defender = $derived(mine ? v.owner[to] : (shown?.defender ?? v.owner[to]));
	const most = $derived(Math.max(1, attackDiceMax(v, from, to)));
	const dice = $derived(Math.min(most, p.dice ?? most));
	const chance = $derived(winChance(v.armies[from], v.armies[to]));
	const canRoll = $derived(mine && canAttackFrom(v, v.me, from) && !rolling);
	const lostA = $derived(shown && !rolling ? shown.attackerLoss : 0);
	const lostD = $derived(shown && !rolling ? shown.defenderLoss : 0);
	const styleOf = (pl: number) => client.lobby?.seats[pl]?.dice ?? 'classic';
	/** Which of a side's dice lost its comparison (highest against highest). */
	function beaten(b: Battle, side: 'a' | 'd', i: number) {
		if (i >= Math.min(b.attack.length, b.defend.length)) return false;
		const aWins = b.attack[i] > b.defend[i] || (i < (b.tiesToAttacker ?? 0) && b.attack[i] === b.defend[i]);
		return side === 'a' ? !aWins : aWins;
	}
	function roll(blitz = false) {
		if (!canRoll) return;
		p.attack(to, blitz);
	}
	function onKey(e: KeyboardEvent) {
		if (!mine || (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			roll(e.shiftKey);
		} else if (e.key === 'b' || e.key === 'B') roll(true);
		else if (['1', '2', '3'].includes(e.key) && Number(e.key) <= most) p.dice = Number(e.key);
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="combat-wrap">
		<div class="combat panel" class:watching={!mine}>
			<div class="sides">
				<div class="side" style="--c:{cqColor(v, attacker)}">
					<img class="sigil" src={sigilUrl(SIGIL_OF[v.players[attacker]?.color ?? 'red'], cqColor(v, attacker), '#1a0c05', 40)} alt="" />
					<span class="where">{territoryName(v, from)}</span>
					<b class="armies">{v.armies[from]}{#if lostA}<i class="loss">−{lostA}</i>{/if}</b>
				</div>
				<div class="dice-col">
					{#if shown}
						<div class="row">
							{#each shown.attack as d, i (i)}
								<span
									class="die"
									class:spin={rolling}
									class:lost={!rolling && beaten(shown, 'a', i)}
									style="background-image:{dieFace(rolling ? (faces.a[i] ?? d) : d, styleOf(shown.player))}"
									>{#if !rolling && beaten(shown, 'a', i)}<img class="skull" src={CQ_PIXEL.skull} alt={t('lost')} />{/if}</span
								>
							{/each}
						</div>
						<span class="vs">{t('vs')}</span>
						<div class="row">
							{#each shown.defend as d, i (i)}
								<span
									class="die"
									class:spin={rolling}
									class:lost={!rolling && beaten(shown, 'd', i)}
									style="background-image:{dieFace(rolling ? (faces.d[i] ?? d) : d, styleOf(shown.defender))}"
									>{#if !rolling && beaten(shown, 'd', i)}<img class="skull" src={CQ_PIXEL.skull} alt={t('lost')} />{/if}</span
								>
							{/each}
						</div>
					{:else}
						<span class="odds" title={t('The chance of taking it if you attack until it is decided')}>
							{t('{n}% to take it', { n: Math.round(chance * 100) })}
						</span>
					{/if}
				</div>
				<div class="side right" style="--c:{cqColor(v, defender)}">
					<img class="sigil" src={sigilUrl(SIGIL_OF[v.players[defender]?.color ?? 'blue'], cqColor(v, defender), '#1a0c05', 40)} alt="" />
					<span class="where">{territoryName(v, to)}</span>
					<b class="armies">{v.armies[to]}{#if lostD}<i class="loss">−{lostD}</i>{/if}</b>
				</div>
			</div>
			{#if mine}
				<div class="controls">
					<div class="seg" role="group" aria-label={t('Dice to roll')}>
						{#each [1, 2, 3] as n (n)}
							<button
								class="btn small wood"
								class:on={dice === n}
								disabled={n > most}
								aria-pressed={dice === n}
								title={t('Roll {n, plural, one {# die} other {# dice}} ({n})', { n })}
								onclick={() => (p.dice = n)}><span class="mini-die" style="background-image:{dieFace(n)}"></span>{n}</button
							>
						{/each}
					</div>
					<button class="btn red shine" disabled={!canRoll} onclick={() => roll()} title={t('Roll once (Enter)')}>{t('Attack')}</button>
					<button class="btn" disabled={!canRoll} onclick={() => roll(true)} title={t('Keep rolling until the territory falls or you cannot attack any more (B)')}
						>{t('Blitz')}</button
					>
					<button
						class="btn small wood"
						onclick={() => {
							p.target = null;
							p.sync();
						}}
						title={t('Stop this attack (Esc)')}>{t('Stop')}</button
					>
				</div>
				{#if shown && !rolling}
					<p class="odds small">{t('{n}% to take it', { n: Math.round(chance * 100) })}</p>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.combat-wrap {
		position: absolute;
		left: 336px;
		right: 276px;
		bottom: 104px;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.combat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 4px 10px 6px;
		animation: pop-in 0.25s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	.combat.watching {
		pointer-events: none;
		transform: scale(0.85);
		transform-origin: bottom center;
	}
	.sides {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 92px;
		max-width: 120px;
		gap: 1px;
	}
	.sigil {
		width: 30px;
		height: 30px;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.6));
	}
	.where {
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: var(--c);
		text-shadow: var(--outline-dark);
		text-align: center;
		line-height: 1.1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.armies {
		position: relative;
		font-family: var(--body);
		font-weight: 900;
		font-size: 24px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.loss {
		position: absolute;
		left: 100%;
		top: -6px;
		margin-left: 4px;
		font-style: normal;
		font-size: 18px;
		color: #ff7a5c;
		animation: pop-in 0.3s ease-out both;
	}
	.dice-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 120px;
	}
	.row {
		display: flex;
		gap: 6px;
	}
	.die {
		position: relative;
		width: 36px;
		height: 36px;
		background-size: 100% 100%;
		image-rendering: pixelated;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.5));
		transition: filter 0.2s, opacity 0.2s;
	}
	.die.spin {
		animation: shake 0.14s linear infinite;
	}
	@keyframes shake {
		25% {
			transform: rotate(-12deg) translateY(-2px);
		}
		75% {
			transform: rotate(10deg) translateY(1px);
		}
	}
	.die.lost {
		filter: grayscale(0.8) brightness(0.55) drop-shadow(0 3px 0 rgba(0, 0, 0, 0.5));
	}
	.skull {
		position: absolute;
		inset: 6px;
		width: 24px;
		height: 24px;
		image-rendering: pixelated;
		animation: pop-in 0.25s ease-out both;
	}
	.vs {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: var(--muted);
		text-transform: uppercase;
	}
	.odds {
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.odds.small {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.seg {
		display: flex;
		gap: 2px;
	}
	.seg .btn {
		gap: 3px;
		min-width: 40px;
	}
	.mini-die {
		width: 14px;
		height: 14px;
		background-size: 100% 100%;
		image-rendering: pixelated;
	}
	.seg .btn.on {
		--art: var(--art-btn-gold);
		color: #3a1d04;
		text-shadow: 0 2px 0 rgba(255, 246, 200, 0.55);
	}
	@media (max-width: 900px) {
		.combat-wrap {
			left: 6px;
			right: 6px;
			bottom: 118px;
		}
		.side {
			min-width: 70px;
		}
		.where {
			font-size: 12px;
		}
		.die {
			width: 28px;
			height: 28px;
		}
		.skull {
			inset: 4px;
			width: 20px;
			height: 20px;
		}
		.controls {
			flex-wrap: wrap;
			justify-content: center;
		}
	}
</style>
