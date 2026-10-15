<script lang="ts">
	import { gambitBoard } from '../../../shared/gambit/board';
	import { CROWN_CHOICES, ORDER_CHOICES, ROUND_CHOICES, TERRAIN_RULES, type GambitSettings, type TerrainRule } from '../../../shared/gambit/types';
	import { randomSeed } from '../../../shared/rng';
	import { msg, t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { PLAYER_CSS } from '../helpers';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import GbBoardPreview from './GbBoardPreview.svelte';

	/**
	 * A Gambit table's rules in the lobby: its board (a new one at a click), how many orders a
	 * round, the crowns that win, how many rounds at most, and how much forest, hill and lake.
	 */
	const s = $derived(client.lobby!.gambit);
	const host = $derived(client.isHost);
	const seats = $derived(client.lobby?.seats ?? []);
	const board = $derived(gambitBoard(Math.max(2, seats.length), s));

	const GROUND: Record<TerrainRule, { name: string; text: string }> = {
		none: { name: msg('Open field'), text: msg('Nothing but open ground: pure skill.') },
		light: { name: msg('Light'), text: msg('A few groves and hills.') },
		mixed: { name: msg('Mixed'), text: msg('Groves, hills and a lake or two.') },
		wild: { name: msg('Wild'), text: msg('Thick woods, many hills and lakes to go round.') }
	};
	function set(patch: Partial<GambitSettings>) {
		client.setGambit(patch);
	}
	function reroll() {
		sfx.click();
		set({ seed: randomSeed() | 0 });
	}
</script>

<div class="realm plaque">
	<GbBoardPreview {board} colors={seats.map((x) => PLAYER_CSS[x.color] ?? '#fff')} size={70} />
	<span class="body">
		<span class="label">{t('Gambit')}</span>
		<span class="name title">{t('A board for {n}', { n: Math.max(2, seats.length) })}</span>
		<small class="text">{t('{n} hexes, {s} shrines and the Throne', { n: board.cells.length, s: board.keeps.length })}</small>
	</span>
	{#if host}<button class="btn small change" onclick={reroll} title={t('Another board, with its ground laid out anew')}>{t('New board')}</button>{/if}
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.letter} alt="" />{t('Orders a round')}</span>
	</div>
	<div class="seg three">
		{#each ORDER_CHOICES as n (n)}
			<button class="btn small" class:on={s.orders === n} disabled={!host} onclick={() => set({ orders: n })}>{n}</button>
		{/each}
	</div>
	<p class="note">{t('Each round everyone orders {n, plural, one {# piece} other {# pieces}} in secret; then all the orders play out at once.', { n: s.orders })}</p>
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.crown} alt="" />{t('Crowns to win')}</span>
		<span class="chosen">{t('{n} rounds at most', { n: s.rounds })}</span>
	</div>
	<div class="seg three">
		{#each CROWN_CHOICES as n (n)}
			<button class="btn small" class:on={s.crowns === n} disabled={!host} onclick={() => set({ crowns: n })}>{n}</button>
		{/each}
	</div>
	<div class="seg three">
		{#each ROUND_CHOICES as n (n)}
			<button class="btn small" class:on={s.rounds === n} disabled={!host} title={t('{n} rounds at most', { n })} onclick={() => set({ rounds: n })}
				>{t('{n} rounds', { n })}</button
			>
		{/each}
	</div>
	<p class="note">{t('Shrines bring a crown a round, the Throne two; taking a piece brings its worth. First to the crowns wins, or the most when the rounds run out.')}</p>
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.clover} alt="" />{t('Ground')}</span>
	</div>
	<div class="seg four">
		{#each TERRAIN_RULES as r (r)}
			<button class="btn small" class:on={s.terrain === r} disabled={!host} title={t(GROUND[r].text)} onclick={() => set({ terrain: r })}>{t(GROUND[r].name)}</button>
		{/each}
	</div>
	<p class="note">{t(GROUND[s.terrain].text)}</p>
</div>

<style>
	.realm {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px 6px 8px;
	}
	.realm .change {
		margin-left: auto;
		flex: none;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.text {
		font-size: 13px;
		line-height: 1.3;
		color: #e2cba8;
	}
	.rule {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.rule-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.label img {
		width: 16px;
		height: 16px;
	}
	.chosen {
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: var(--gold);
	}
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 4px;
	}
	.seg.four {
		grid-template-columns: repeat(4, 1fr);
	}
	.seg .btn:disabled:not(.on) {
		filter: grayscale(0.6) brightness(0.65);
	}
	.seg .btn:disabled.on {
		filter: none;
		cursor: default;
	}
	.note {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.3;
		color: var(--muted);
	}
</style>
