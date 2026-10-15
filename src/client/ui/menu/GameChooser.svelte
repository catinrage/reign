<script lang="ts">
	import type { GameKind } from '../../../shared/games';
	import { t } from '../../i18n/index.svelte';
	import { PIXEL } from '../pixel';
	import Modal from './Modal.svelte';
	import { GAMES, gameTheme } from './games';

	/**
	 * The game shelf: every game as a box with its picture, what it is and who plays it. Picking
	 * one sets what the menu's buttons start and puts its board on the table.
	 */
	let { current, onpick, onclose }: { current: GameKind; onpick: (g: GameKind) => void; onclose: () => void } = $props();

	let boxes: HTMLButtonElement[] = $state([]);

	$effect(() => {
		// Start on the game picked, so Enter keeps it and the arrows move from there.
		boxes[Math.max(0, GAMES.findIndex((g) => g.id === current))]?.focus();
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}
		const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
		if (!step) return;
		const at = boxes.indexOf(document.activeElement as HTMLButtonElement);
		if (at < 0) return;
		e.preventDefault();
		boxes[(at + step + boxes.length) % boxes.length]?.focus();
	}
</script>

<svelte:window onkeydown={onKey} />

<Modal title={t('Choose a game')} width={860} {onclose}>
	<p class="intro">{t('Each game has its own board, rules and rooms. The one you pick is what Play and Create start.')}</p>
	<div class="shelf">
		{#each GAMES as g, i (g.id)}
			{@const on = g.id === current}
			<button class="box" class:on style={gameTheme(g)} bind:this={boxes[i]} onclick={() => onpick(g.id)} aria-pressed={on}>
				<span class="cover">
					<span class="art" aria-hidden="true">
						<img class="icon-px side" src={g.cover[0]} alt="" />
						<img class="icon-px main" src={g.cover[1]} alt="" />
						<img class="icon-px side" src={g.cover[2]} alt="" />
					</span>
					<b class="name">{t(g.name)}</b>
					<span class="motto">{t(g.motto[0])} <i>·</i> {t(g.motto[1])} <i>·</i> {t(g.motto[2])}</span>
					{#if on}<span class="picked"><img src={PIXEL.check} alt="" />{t('Picked')}</span>{/if}
				</span>
				<span class="about">
					<span class="blurb">{t(g.blurb)}</span>
					<span class="chips">
						<span class="chip players">{t('{min}–{max} players', { min: g.players[0], max: g.players[1] })}</span>
						{#each g.features as f (f)}<span class="chip">{t(f)}</span>{/each}
					</span>
				</span>
				<span class="go">{on ? t('Keep playing {game}', { game: t(g.name) }) : t('Play {game}', { game: t(g.name) })}</span>
			</button>
		{/each}
	</div>
</Modal>

<style>
	.intro {
		margin: 0 auto 14px !important;
		max-width: 560px;
	}
	/* Boxes side by side, as many as fit; more games make more rows. */
	.shelf {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 16px;
		padding: 4px 4px 10px;
	}
	.box {
		all: unset;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		cursor: pointer;
		background: #2a170b;
		box-shadow:
			inset 0 0 0 2px #1e0e06,
			inset 0 0 0 4px rgba(255, 220, 160, 0.16),
			0 6px 0 rgba(0, 0, 0, 0.45),
			0 10px 18px rgba(0, 0, 0, 0.35);
		transition:
			transform 0.16s cubic-bezier(0.2, 1.3, 0.4, 1),
			box-shadow 0.16s;
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.box:nth-child(2) {
		animation-delay: 0.05s;
	}
	.box:nth-child(3) {
		animation-delay: 0.1s;
	}
	.box:hover,
	.box:focus-visible {
		transform: translateY(-5px) rotate(-0.6deg);
		box-shadow:
			inset 0 0 0 2px #1e0e06,
			inset 0 0 0 4px color-mix(in srgb, var(--glow) 70%, transparent),
			0 10px 0 rgba(0, 0, 0, 0.4),
			0 16px 26px rgba(0, 0, 0, 0.4),
			0 0 22px color-mix(in srgb, var(--glow) 35%, transparent);
	}
	.box:focus-visible {
		outline: 3px solid var(--gold);
		outline-offset: 3px;
	}
	.box.on {
		box-shadow:
			inset 0 0 0 2px #1e0e06,
			inset 0 0 0 4px var(--gold),
			0 6px 0 rgba(0, 0, 0, 0.45),
			0 0 26px rgba(255, 212, 90, 0.35);
	}
	/* The box's lid: the game's colors, a glow behind its pieces, its title over them. */
	.cover {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		margin: 4px 4px 0;
		padding: 14px 8px 12px;
		background:
			radial-gradient(ellipse 60% 55% at 50% 38%, color-mix(in srgb, var(--glow) 50%, transparent), transparent 70%),
			repeating-linear-gradient(45deg, transparent 0 10px, rgba(255, 255, 255, 0.05) 10px 12px),
			repeating-linear-gradient(-45deg, transparent 0 10px, rgba(0, 0, 0, 0.08) 10px 12px),
			linear-gradient(170deg, var(--top), var(--bottom));
		box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.25);
	}
	.art {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 4px;
		height: 72px;
	}
	.art img {
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.45));
		transition: transform 0.2s cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	.art .main {
		width: 64px;
		height: 64px;
	}
	.art .side {
		width: 40px;
		height: 40px;
		margin-bottom: 2px;
	}
	.box:hover .art .main,
	.box:focus-visible .art .main {
		transform: translateY(-4px) scale(1.06);
	}
	.box:hover .art .side:first-child {
		transform: translateX(-3px) rotate(-6deg);
	}
	.box:hover .art .side:last-child {
		transform: translateX(3px) rotate(6deg);
	}
	.name {
		font-family: var(--px);
		font-size: 30px;
		line-height: 1;
		color: #fff2d2;
		text-shadow:
			0 3px 0 rgba(0, 0, 0, 0.55),
			0 0 14px color-mix(in srgb, var(--glow) 45%, transparent);
	}
	.motto {
		font-family: var(--px);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: rgba(255, 242, 210, 0.9);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
	}
	.motto i {
		font-style: normal;
		color: var(--gold);
	}
	.picked {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 7px 2px 5px;
		font-family: var(--px);
		font-size: 12px;
		font-weight: 700;
		color: #3a1d04;
		background: linear-gradient(var(--gold), var(--gold-2));
		box-shadow:
			0 0 0 2px #1e0e06,
			0 2px 0 2px rgba(0, 0, 0, 0.35);
	}
	.picked img {
		width: 12px;
		height: 12px;
		image-rendering: pixelated;
	}
	.about {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px 12px 12px;
	}
	.blurb {
		font-size: 14px;
		line-height: 1.35;
		color: var(--text);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: auto;
	}
	.chip {
		padding: 2px 7px;
		font-size: 11px;
		font-weight: 800;
		color: var(--muted);
		background: rgba(0, 0, 0, 0.3);
		box-shadow: inset 0 0 0 1px rgba(255, 220, 160, 0.16);
	}
	.chip.players {
		color: #fff2d2;
		background: color-mix(in srgb, var(--top) 45%, rgba(0, 0, 0, 0.4));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--glow) 50%, transparent);
	}
	.go {
		margin: 0 4px 4px;
		padding: 9px 8px;
		text-align: center;
		font-family: var(--px);
		font-size: 15px;
		font-weight: 700;
		color: #fff2d2;
		background: rgba(0, 0, 0, 0.32);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		transition: background 0.15s;
	}
	.box:hover .go,
	.box:focus-visible .go {
		color: #3a1d04;
		text-shadow: 0 1px 0 rgba(255, 246, 200, 0.5);
		background: linear-gradient(var(--gold), var(--gold-2));
	}
	.box.on .go {
		color: var(--gold);
	}
	.box.on:hover .go {
		color: #3a1d04;
	}
	@media (prefers-reduced-motion: reduce) {
		.box,
		.art img {
			transition: none;
			animation: none;
		}
	}
</style>
