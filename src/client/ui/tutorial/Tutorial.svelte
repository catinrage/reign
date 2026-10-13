<script lang="ts">
		import { t } from '../../i18n/index.svelte';
	import { sfx } from '../sound';
	import { CHAPTERS, TUTORIAL_MODES, TUTORIAL_MODE_NAME, chaptersOf, type Chapter, type TutorialMode } from './chapters';

	/**
	 * The rules of both modes as a small book: chapters down the side, one page at a time.
	 * Used full screen from the main menu and inside the in-game menu.
	 */
	let { mode = undefined }: { mode?: TutorialMode } = $props();

	const KEY = 'reign:tutorial';
	function remembered(): Chapter | undefined {
		try {
			const id = localStorage.getItem(KEY);
			return CHAPTERS.find((c) => c.id === id);
		} catch {
			return undefined;
		}
	}
	// Opened from a game, start on that game's mode; otherwise where the reader left off.
	function first(): Chapter {
		const last = remembered();
		if (!mode) return last ?? CHAPTERS[0];
		return last?.mode === mode ? last : chaptersOf(mode)[0];
	}

	// Kept as an id: a chapter object in $state would be proxied and never equal the list's own.
	let currentId = $state(first().id);
	let page: HTMLElement | undefined = $state();
	const at = $derived(CHAPTERS.findIndex((c) => c.id === currentId));
	const current = $derived(CHAPTERS[at]);
	const list = $derived(chaptersOf(current.mode));
	const index = $derived(list.indexOf(current));
	const prev = $derived(CHAPTERS[at - 1] ?? null);
	const next = $derived(CHAPTERS[at + 1] ?? null);

	function open(c: Chapter) {
		if (c.id === currentId) return;
		sfx.open();
		currentId = c.id;
		try {
			localStorage.setItem(KEY, c.id);
		} catch {
			// Private windows can refuse storage; the tutorial just starts at the top next time.
		}
		page?.scrollTo({ top: 0 });
		document
			.querySelector(`[data-chapter="${c.id}"]`)
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
		if (e.key === 'ArrowRight' && next) open(next);
		else if (e.key === 'ArrowLeft' && prev) open(prev);
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="tutorial">
	<nav class="side">
		<div class="seg modes" role="tablist" aria-label={t('Game mode')}>
			{#each TUTORIAL_MODES as m (m)}
				<button
					class="btn small"
					class:on={current.mode === m}
					role="tab"
					aria-selected={current.mode === m}
					onclick={() => open(chaptersOf(m)[0])}>{t(TUTORIAL_MODE_NAME[m])}</button
				>
			{/each}
		</div>
		<ol class="chapters">
			{#each list as c, i (c.id)}
				<li>
					<button
						class="chapter"
						class:on={c === current}
						data-chapter={c.id}
						aria-current={c === current ? 'page' : undefined}
						onclick={() => open(c)}
					>
						<img class="icon-px" src={c.icon} alt="" />
						<span class="num">{i + 1}</span>
						<span class="name">{t(c.title)}</span>
					</button>
				</li>
			{/each}
		</ol>
	</nav>

	<article class="page parch" bind:this={page}>
		{#key current.id}
			<div class="leaf">
				<header>
					<span class="label"
						>{t('{mode} · Chapter {n} of {total}', {
							mode: t(TUTORIAL_MODE_NAME[current.mode]),
							n: index + 1,
							total: list.length
						})}</span
					>
					<h2 class="title"><img class="icon-px" src={current.icon} alt="" />{t(current.title)}</h2>
					<p class="lede">{t(current.lede)}</p>
				</header>
				<current.page />
				<footer>
					{#if prev}
						<button class="btn small wood" onclick={() => open(prev)}>‹ {t(prev.title)}</button>
					{:else}
						<span></span>
					{/if}
					{#if next}
						<button
							class="btn small"
							class:green={next.mode === current.mode}
							class:purple={next.mode !== current.mode}
							onclick={() => open(next)}
							>{next.mode !== current.mode ? t(TUTORIAL_MODE_NAME[next.mode]) : t(next.title)} ›</button
						>
					{/if}
				</footer>
			</div>
		{/key}
	</article>
</div>

<style>
	.tutorial {
		display: grid;
		grid-template-columns: 232px minmax(0, 1fr);
		gap: 14px;
		/* Fills whatever frame holds it; the chapter list and the page scroll on their own. */
		flex: 1 1 0;
		min-height: 0;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
	}
	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.modes .btn {
		font-size: 14px;
		padding-left: 4px;
		padding-right: 4px;
	}
	.chapters {
		list-style: none;
		margin: 0;
		/* Room on the right for the nudge on the picked and hovered chapter, so it never scrolls sideways. */
		padding: 0 8px 0 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #8a5a32 transparent;
	}
	.chapter {
		all: unset;
		box-sizing: border-box;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 6px 10px 6px 8px;
		cursor: pointer;
		color: var(--muted);
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		border-style: solid;
		border-width: calc(var(--s) * 3);
		border-image: var(--art-well) 3 fill / calc(var(--s) * 3) stretch;
		transition:
			transform 0.12s,
			color 0.12s;
	}
	.chapter:hover {
		color: var(--text);
		transform: translateX(3px);
	}
	.chapter:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 1px;
	}
	.chapter.on {
		color: #3a1d04;
		border-width: calc(var(--s) * 5) calc(var(--s) * 4);
		border-image: var(--art-btn-gold) 5 4 fill / calc(var(--s) * 5) calc(var(--s) * 4) stretch;
		padding-top: 3px;
		padding-bottom: 3px;
		text-shadow: 0 1px 0 rgba(255, 246, 200, 0.55);
		transform: translateX(6px);
	}
	.chapter img {
		width: 24px;
		height: 24px;
		flex: none;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.35));
	}
	.num {
		min-width: 1.1em;
		opacity: 0.7;
		font-size: 14px;
	}
	.name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.page {
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #8a5a32 transparent;
		padding: 10px 22px 14px;
		color: var(--ink);
		font-size: 15.5px;
		line-height: 1.5;
	}
	.leaf {
		max-width: 780px;
		margin: 0 auto;
		animation: turn 0.3s ease-out;
	}
	@keyframes turn {
		from {
			opacity: 0;
			transform: translateX(14px);
		}
	}
	header {
		padding-bottom: 10px;
		margin-bottom: 14px;
		border-bottom: 3px solid rgba(138, 98, 54, 0.35);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 2px 0 4px;
		font-size: 30px;
		color: #6b3a14;
		text-shadow: 0 2px 0 rgba(255, 245, 220, 0.8);
	}
	h2 img {
		width: 38px;
		height: 38px;
		filter: drop-shadow(0 3px 0 rgba(90, 50, 20, 0.35));
	}
	.lede {
		margin: 0;
		font-size: 17px;
		color: var(--ink-soft);
		text-wrap: pretty;
	}
	footer {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		margin-top: 22px;
		padding-top: 12px;
		border-top: 3px solid rgba(138, 98, 54, 0.35);
	}

	/* Shared bits every chapter page uses. */
	.page :global(h3) {
		margin: 18px 0 6px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		color: #6b3a14;
		text-shadow: 0 2px 0 rgba(255, 245, 220, 0.8);
	}
	.page :global(p) {
		margin: 0 0 10px;
		text-wrap: pretty;
	}
	.page :global(b) {
		color: #3a1a08;
	}
	.page :global(.rows) {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.page :global(.rows > li) {
		display: flex;
		align-items: flex-start;
		gap: 11px;
	}
	.page :global(.rows > li > img) {
		width: 28px;
		height: 28px;
		flex: none;
		object-fit: contain;
		filter: drop-shadow(0 2px 1px rgba(60, 30, 10, 0.3));
	}
	/* Voxel pieces have air round them in their icon; draw them larger in the same slot. */
	.page :global(.rows > li > img.piece) {
		width: 42px;
		height: 42px;
		margin: -8px -7px -6px;
	}
	.page :global(.figure) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 14px 18px;
		margin: 8px 0 14px;
		padding: 14px 12px;
		background: rgba(138, 98, 54, 0.1);
		border: 2px dashed rgba(138, 98, 54, 0.4);
	}
	.page :global(.caption) {
		display: block;
		margin-top: 4px;
		font-size: 13px;
		font-weight: 700;
		text-align: center;
		color: var(--ink-soft);
	}
	.page :global(.tip) {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin: 12px 0;
		padding: 9px 12px;
		background: rgba(242, 180, 49, 0.18);
		border-left: 5px solid var(--gold-3);
		font-size: 14.5px;
	}
	.page :global(.tip > img) {
		width: 22px;
		height: 22px;
		flex: none;
		margin-top: 1px;
	}
	.page :global(.cols) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px 24px;
	}
	.page :global(.res) {
		display: inline-flex;
		vertical-align: middle;
		gap: 1px;
	}
	.page :global(.res img) {
		width: 34px;
		height: 34px;
		margin: -6px -4px;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
	}
	.page :global(kbd) {
		display: inline-block;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		padding: 1px 7px 2px;
		margin-right: 2px;
		color: #fff2d2;
		background: #6b3a14;
		box-shadow:
			inset 0 -3px 0 #3a1a08,
			inset 0 2px 0 #9a6238;
	}

	@media (max-width: 760px) {
		.tutorial {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			gap: 8px;
		}
		.side {
			gap: 6px;
		}
		.chapters {
			flex-direction: row;
			overflow-x: auto;
			overflow-y: hidden;
			padding: 2px 0 4px;
			gap: 4px;
		}
		.chapter {
			width: auto;
			padding: 4px 8px 4px 6px;
			font-size: 14px;
		}
		.chapter.on,
		.chapter:hover {
			transform: none;
		}
		.num {
			display: none;
		}
		.page {
			padding: 6px 10px 10px;
			font-size: 15px;
		}
		h2 {
			font-size: 24px;
		}
		h2 img {
			width: 30px;
			height: 30px;
		}
		.lede {
			font-size: 15.5px;
		}
		.page :global(.cols) {
			grid-template-columns: 1fr;
		}
	}
</style>
