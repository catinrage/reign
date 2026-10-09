<script lang="ts">
	import type { Cheat } from '../../../shared/rules/cheats';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { DEV_CARD_LABEL, PLAYER_CSS, RESOURCES, RESOURCE_LABEL } from '../helpers';
	import { PIXEL } from '../pixel';
	import { DEV_CARDS, type Resource } from '../../../shared/rules/config';

	/**
	 * Dev cheats, only shown when the server is the local dev server (`pnpm dev`).
	 * The ` key or the wrench button opens it.
	 */
	const view = $derived(client.view!);
	const icons = getIcons().urls;
	let open = $state(false);
	let target = $state<number | null>(null);
	let fast = $state(false);
	const who = $derived(target ?? view.me);

	function cheat(c: Cheat) {
		client.cheat(c);
	}
	function give(res: Resource, e: MouseEvent) {
		cheat({ type: 'resources', player: who, resources: { [res]: e.shiftKey ? 5 : 1 } });
	}
	function giveAll(n: number) {
		const resources = Object.fromEntries(RESOURCES.map((r) => [r, n]));
		cheat({ type: 'resources', player: who, resources });
	}
	function toggleFast() {
		fast = !fast;
		cheat({ type: 'fastBots', on: fast });
	}
	function onKey(e: KeyboardEvent) {
		if (e.key !== '`' || e.target instanceof HTMLInputElement) return;
		e.preventDefault();
		open = !open;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="toggle">
	<button
		class="icon-btn"
		class:on={open}
		onclick={() => (open = !open)}
		aria-label="Dev cheats"
		title="Dev cheats (`)"><img src={PIXEL.hammer} alt="" /></button
	>
</div>

{#if open}
	<div class="cheats panel">
		<div class="head">
			<span class="title">Dev cheats</span>
			<button class="x" onclick={() => (open = false)} aria-label="Close"
				><img src={PIXEL.close} alt="" /></button
			>
		</div>

		<div class="label">For</div>
		<div class="row">
			{#each view.players as p, i (i)}
				<button
					class="who"
					class:on={who === i}
					style="--c:{PLAYER_CSS[p.color]}"
					onclick={() => (target = i)}
					title={p.name}>{i === view.me ? 'You' : p.name}</button
				>
			{/each}
		</div>

		<div class="label">Cards <small>click +1, shift-click +5</small></div>
		<div class="row">
			{#each RESOURCES as r (r)}
				<button class="tile" onclick={(e) => give(r, e)} title="+1 {RESOURCE_LABEL[r]}"
					><img src={icons[r]} alt={RESOURCE_LABEL[r]} /></button
				>
			{/each}
		</div>
		<div class="row">
			<button class="btn small wood" onclick={() => giveAll(5)}>+5 of each</button>
			<button class="btn small wood" onclick={() => giveAll(20)}>+20 of each</button>
			<button class="btn small red" onclick={() => cheat({ type: 'clearHand', player: who })}
				>Empty</button
			>
		</div>

		<div class="label">Development card</div>
		<div class="row">
			{#each DEV_CARDS as c (c)}
				<button
					class="tile"
					onclick={() => cheat({ type: 'devCard', player: who, card: c })}
					title={DEV_CARD_LABEL[c]}><img src={PIXEL[c]} alt={DEV_CARD_LABEL[c]} /></button
				>
			{/each}
		</div>

		<div class="label">Next roll</div>
		<div class="row dice">
			{#each [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as n (n)}
				<button
					class="num"
					class:seven={n === 7}
					onclick={() => cheat({ type: 'rigDice', total: n })}>{n}</button
				>
			{/each}
		</div>

		<div class="label">Game</div>
		<div class="row">
			<button
				class="btn small wood"
				disabled={view.phase !== 'setup'}
				onclick={() => cheat({ type: 'finishSetup' })}>Finish setup</button
			>
			<button class="btn small" class:green={fast} class:wood={!fast} onclick={toggleFast}
				>Fast bots{fast ? ': on' : ''}</button
			>
			<button
				class="btn small purple"
				disabled={view.phase !== 'main'}
				onclick={() => cheat({ type: 'win', player: who })}>Win</button
			>
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
	.label small {
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--body);
		font-size: 11px;
		opacity: 0.8;
		margin-left: 4px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
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
	.tile,
	.num {
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
	.num:hover {
		border-color: var(--gold);
		transform: translateY(-1px);
	}
	.tile:active,
	.num:active {
		transform: translateY(1px);
	}
	.tile img {
		width: 30px;
		height: 30px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.dice {
		gap: 4px;
	}
	.num {
		width: 32px;
		height: 32px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		color: var(--text);
	}
	.num.seven {
		color: #ff8a6a;
		border-color: rgba(255, 110, 80, 0.5);
	}
	@media (max-width: 700px) {
		/* Under the menu, pigeon and pause buttons. */
		.toggle {
			top: calc(104px + var(--clock-h, 0px) + var(--s) * 48 + 18px);
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
