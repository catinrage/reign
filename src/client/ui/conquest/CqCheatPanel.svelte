<script lang="ts">
	import type { ConquestCheat } from '../../../shared/conquest/cheats';
	import { OMENS, OMEN_INFO } from '../../../shared/conquest/omens';
	import { CARD_SYMBOLS, type CardSymbol } from '../../../shared/conquest/types';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { CQ_PIXEL } from './icons';
	import { OMEN_TONE_STYLE } from './lore';
	import { cqPlay } from './play.svelte';
	import { cqColor, territoryName } from './text';

	/**
	 * Conquest's dev cheats, only shown when the server is the local dev server (`pnpm dev`), as
	 * Settlement's are (see game/CheatPanel.svelte). The ` key or the wrench button opens it.
	 */
	const v = $derived(cqPlay.view!);
	let open = $state(false);
	let target = $state<number | null>(null);
	let fast = $state(false);
	const who = $derived(target ?? Math.max(0, v.me));
	const ter = $derived(cqPlay.cheatTarget);
	const SYMBOLS: CardSymbol[] = [...CARD_SYMBOLS, 'wild'];

	function cheat(c: ConquestCheat) {
		client.cqCheat(c);
	}
	function toggleFast() {
		fast = !fast;
		cheat({ type: 'fastBots', on: fast });
	}
	function onKey(e: KeyboardEvent) {
		if (e.key !== '`' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		e.preventDefault();
		open = !open;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="toggle">
	<button class="icon-btn" class:on={open} onclick={() => (open = !open)} aria-label="Dev cheats" title="Dev cheats (`)"
		><img src={PIXEL.hammer} alt="" /></button
	>
</div>

{#if open}
	<div class="cheats panel">
		<div class="head">
			<span class="title">Dev cheats</span>
			<button class="x" onclick={() => (open = false)} aria-label="Close"><img src={PIXEL.close} alt="" /></button>
		</div>

		<div class="label">For</div>
		<div class="row">
			{#each v.players as p, i (i)}
				<button class="who" class:on={who === i} class:out={p.out} style="--c:{cqColor(v, i)}" onclick={() => (target = i)} title={p.name}
					>{i === v.me ? 'You' : p.name}</button
				>
			{/each}
		</div>

		<div class="label">Territory</div>
		<div class="row">
			<button class="btn small" class:green={cqPlay.cheatPick} class:wood={!cqPlay.cheatPick} onclick={() => (cqPlay.cheatPick = !cqPlay.cheatPick)}
				>{cqPlay.cheatPick ? 'Click one on the map…' : 'Pick on the map'}</button
			>
			<span class="picked">{ter !== null ? territoryName(v, ter) : 'none picked'}</span>
		</div>
		<div class="row">
			{#each [1, 5, 20] as n (n)}
				<button class="btn small wood" disabled={ter === null} onclick={() => ter !== null && cheat({ type: 'armies', territory: ter, count: n })}
					>+{n} armies</button
				>
			{/each}
		</div>

		{#if v.settings.cards !== 'none'}
			<div class="label">Card</div>
			<div class="row">
				{#each SYMBOLS as c (c)}
					<button class="tile" onclick={() => cheat({ type: 'card', player: who, symbol: c })} title="A {c} card"><img src={CQ_PIXEL[c]} alt={c} /></button>
				{/each}
			</div>
		{/if}

		<div class="label">Next battle</div>
		<div class="row">
			<button class="btn small green" onclick={() => cheat({ type: 'rigBattle', side: 'attacker' })}>Attacker wins</button>
			<button class="btn small red" onclick={() => cheat({ type: 'rigBattle', side: 'defender' })}>Defender wins</button>
		</div>

		{#if v.omens}
			<div class="label">Draw an omen now</div>
			<div class="row">
				{#each OMENS as o (o)}
					<button class="omen" disabled={v.phase !== 'play'} style="--tone:{OMEN_TONE_STYLE[OMEN_INFO[o].tone].color}" onclick={() => cheat({ type: 'omen', omen: o })}
						>{OMEN_INFO[o].name}</button
					>
				{/each}
			</div>
		{/if}

		<div class="label">Game</div>
		<div class="row">
			<button class="btn small wood" disabled={v.phase !== 'deploy'} onclick={() => cheat({ type: 'finishDeploy' })}>Finish deployment</button>
			<button class="btn small" class:green={fast} class:wood={!fast} onclick={toggleFast}>Fast bots{fast ? ': on' : ''}</button>
			<button class="btn small purple" disabled={v.phase !== 'play'} onclick={() => cheat({ type: 'win', player: who })}>Win</button>
		</div>
	</div>
{/if}

<style>
	.toggle {
		position: absolute;
		top: calc(14px + var(--s) * 16 + 8px);
		left: 14px;
		/* Above dialogs and the victory screen so cheats still work there; below the game menu. */
		z-index: 58;
		pointer-events: auto;
	}
	.toggle .on {
		filter: brightness(1.3) sepia(0.4);
	}
	.cheats {
		position: absolute;
		top: calc(14px + var(--s) * 32 + 16px);
		left: 14px;
		z-index: 58;
		width: 300px;
		max-height: calc(100% - 200px);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 6px;
		pointer-events: auto;
		animation: pop-in 0.18s ease-out;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.title {
		font-family: var(--px);
		font-weight: 700;
		font-size: 18px;
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.x {
		background: none;
		border: 0;
		padding: 2px;
		cursor: pointer;
	}
	.x img {
		width: 18px;
		height: 18px;
		image-rendering: pixelated;
	}
	.label {
		margin-top: 4px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px;
	}
	.who {
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: var(--text);
		background: rgba(0, 0, 0, 0.3);
		border: 2px solid var(--c);
		padding: 3px 8px;
		cursor: pointer;
		max-width: 88px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.who.on {
		background: var(--c);
		color: #1a0f08;
	}
	.who.out {
		opacity: 0.45;
	}
	.picked {
		font-size: 13px;
		color: #e2cba8;
	}
	.tile {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		background: rgba(0, 0, 0, 0.32);
		border: 2px solid rgba(255, 220, 160, 0.25);
		cursor: pointer;
		transition:
			transform 0.08s,
			border-color 0.12s;
	}
	.tile:hover,
	.omen:not(:disabled):hover {
		border-color: var(--gold);
		transform: translateY(-1px);
	}
	.tile:active,
	.omen:not(:disabled):active {
		transform: translateY(1px);
	}
	.tile img {
		width: 30px;
		height: 30px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.omen {
		font: inherit;
		font-size: 12px;
		color: var(--tone);
		background: rgba(0, 0, 0, 0.32);
		border: 2px solid color-mix(in srgb, var(--tone) 45%, transparent);
		padding: 3px 7px;
		cursor: pointer;
		transition:
			transform 0.08s,
			border-color 0.12s;
	}
	.omen:disabled {
		opacity: 0.45;
		cursor: default;
	}
	@media (max-width: 700px) {
		/* Under the menu, pause and night buttons and the turn. */
		.toggle {
			top: calc(104px + var(--clock-h, 0px) + var(--s) * 80 + 30px);
			left: 6px;
		}
		.cheats {
			top: 96px;
			left: calc(12px + var(--s) * 16);
			right: 8px;
			width: auto;
			max-height: calc(100% - 210px);
		}
	}
</style>
