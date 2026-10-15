<script lang="ts">
	import type { GambitCheat } from '../../../shared/gambit/cheats';
	import { PIECE_KINDS } from '../../../shared/gambit/types';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { GB_PIXEL } from './icons';
	import { gbPlay } from './play.svelte';
	import { gbColor } from './text';

	/**
	 * Gambit's dev cheats, only shown when the server is the local dev server (`pnpm dev`), as the
	 * other games' are. The ` key or the wrench button opens it.
	 */
	const v = $derived(gbPlay.view!);
	let open = $state(false);
	let target = $state<number | null>(null);
	let fast = $state(false);
	const who = $derived(target ?? Math.max(0, v.me));
	const cell = $derived(gbPlay.cheatTarget);

	function cheat(c: GambitCheat) {
		client.gbCheat(c);
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
				<button class="who" class:on={who === i} style="--c:{gbColor(v, i)}" onclick={() => (target = i)} title={p.name}>{i === v.me ? 'You' : p.name}</button>
			{/each}
		</div>

		<div class="label">Crowns</div>
		<div class="row">
			{#each [1, 5, 10] as n (n)}
				<button class="btn small wood" onclick={() => cheat({ type: 'crowns', player: who, count: n })}>+{n}</button>
			{/each}
		</div>

		<div class="label">Hex</div>
		<div class="row">
			<button class="btn small" class:green={gbPlay.cheatPick} class:wood={!gbPlay.cheatPick} onclick={() => (gbPlay.cheatPick = !gbPlay.cheatPick)}
				>{gbPlay.cheatPick ? 'Click one on the board…' : 'Pick on the board'}</button
			>
			<span class="picked">{cell !== null ? `hex ${cell}` : 'none picked'}</span>
		</div>
		<div class="row">
			{#each PIECE_KINDS as k (k)}
				<button class="tile" disabled={cell === null} onclick={() => cell !== null && cheat({ type: 'piece', player: who, kind: k, cell })} title="A {k} there"
					><img src={GB_PIXEL[k]} alt={k} /></button
				>
			{/each}
		</div>
		<div class="row">
			<button class="btn small red" disabled={cell === null} onclick={() => cell !== null && cheat({ type: 'remove', cell })}>Remove the piece there</button>
		</div>

		<div class="label">Game</div>
		<div class="row">
			<button class="btn small wood" disabled={v.phase !== 'orders'} onclick={() => cheat({ type: 'playRound' })}>Play the round</button>
			<button class="btn small" class:green={fast} class:wood={!fast} onclick={toggleFast}>Fast bots{fast ? ': on' : ''}</button>
			<button class="btn small purple" disabled={v.phase !== 'orders'} onclick={() => cheat({ type: 'win', player: who })}>Win</button>
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
	.picked {
		font-size: 13px;
		color: #e2cba8;
	}
	.tile:disabled {
		opacity: 0.4;
		cursor: default;
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
	.tile:hover {
		border-color: var(--gold);
		transform: translateY(-1px);
	}
	.tile:active {
		transform: translateY(1px);
	}
	.tile img {
		width: 30px;
		height: 30px;
		object-fit: contain;
		image-rendering: pixelated;
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
