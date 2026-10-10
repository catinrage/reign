<script lang="ts">
	import {
		DEV_CARD_LABEL,
		RESOURCES,
		RESOURCE_LABEL,
		totalResources,
		type DevCardType
	} from '../../../shared/rules/config';
	import { client } from '../../state/client.svelte';
	import { replay } from '../../state/replay.svelte';
	import { getIcons } from '../../scene/icons';
	import { t } from '../../i18n/index.svelte';
	import { PLAYER_CSS, RES_BG } from '../helpers';
	import { PIXEL } from '../pixel';
	import { diceChart } from './postGame';
	import { sceneRef } from '../sceneRef';

	/**
	 * A replay's numbers as the game stood at the playhead: every hand, the race for points so far,
	 * the cards each player gathered, and the dice. Nothing from later in the game shows.
	 */

	const view = $derived(client.view!);
	const stats = $derived(view.stats);
	const icons = getIcons().urls;
	let tab = $state<'hands' | 'points' | 'cards' | 'dice'>('hands');
	const TABS = $derived([
		{ id: 'hands', label: t('Hands') },
		{ id: 'points', label: t('Points') },
		{ id: 'cards', label: t('Gathered') },
		{ id: 'dice', label: t('Dice') }
	] as const);

	const DEV_ICON: Record<DevCardType, string> = {
		knight: PIXEL.knight,
		roadBuilding: PIXEL.roadBuilding,
		yearOfPlenty: PIXEL.yearOfPlenty,
		monopoly: PIXEL.monopoly,
		victoryPoint: PIXEL.victoryPoint
	};
	/** A hand's development cards, one entry per kind. */
	function devGroups(cards: { type: DevCardType }[] | undefined) {
		const n = new Map<DevCardType, number>();
		for (const c of cards ?? []) n.set(c.type, (n.get(c.type) ?? 0) + 1);
		return [...n].map(([type, count]) => ({ type, count }));
	}
	const pointsOf = (i: number) => view.players[i].totalPoints ?? view.players[i].publicPoints;

	// ------------------------------------------------ points race
	const W = 280;
	const H = 116;
	const PAD = { l: 18, r: 6, t: 6, b: 14 };
	const series = $derived.by(() => {
		const now = replay.index;
		const known = replay.points.filter((p) => p.index < now);
		return [...known, { index: now, points: view.players.map((_, i) => pointsOf(i)) }];
	});
	const goal = $derived(Math.max(view.pointsToWin, ...series.flatMap((p) => p.points)));
	const px = (index: number) => PAD.l + (index / Math.max(1, replay.last)) * (W - PAD.l - PAD.r);
	const py = (pts: number) => H - PAD.b - (pts / goal) * (H - PAD.t - PAD.b);
	/** Players level on points would hide each other's lines: each is drawn a hair apart. */
	const nudge = (p: number) => (p - (view.players.length - 1) / 2) * 1.6;
	/** A stepped line: points only change when something happens. */
	function line(p: number) {
		let d = '';
		series.forEach((s, k) => {
			const x = px(s.index).toFixed(1);
			const y = (py(s.points[p]) + nudge(p)).toFixed(1);
			d += k === 0 ? `M${x},${y}` : `H${x}V${y}`;
		});
		return d;
	}
	const ticks = $derived(Array.from({ length: Math.floor(goal / 2) + 1 }, (_, k) => k * 2));

	// ------------------------------------------------ cards gathered
	const gatheredMax = $derived(
		stats ? Math.max(1, ...stats.players.map((p) => totalResources(p.gained))) : 1
	);

	// ------------------------------------------------ dice
	const chart = $derived(stats ? diceChart(stats) : []);
	const chartMax = $derived(Math.max(1, ...chart.map((c) => Math.max(c.count, c.expected))));
	const rolls = $derived(chart.reduce((n, c) => n + c.count, 0));

	function highlight(i: number | null) {
		sceneRef.current?.highlightPlayer(i);
	}
</script>

<div class="data panel">
	<div class="head">
		<img class="icon-px" src={PIXEL.chart} alt="" /><span class="title">{t('Game data')}</span>
	</div>
	<div class="tabs" role="tablist">
		{#each TABS as tb (tb.id)}
			<button
				class="tab"
				class:on={tab === tb.id}
				role="tab"
				aria-selected={tab === tb.id}
				onclick={() => (tab = tb.id)}>{tb.label}</button
			>
		{/each}
	</div>
	<div class="body well">
		{#if tab === 'hands'}
			{#each view.players as p, i (i)}
				{@const devs = devGroups(p.devCards)}
				<div
					class="hand"
					class:current={i === view.current && view.phase !== 'ended'}
					style="--c:{PLAYER_CSS[p.color]}"
					role="presentation"
					onpointerenter={() => highlight(i)}
					onpointerleave={() => highlight(null)}
				>
					<div class="who">
						<i class="swatch"></i><span class="nm">{p.name}</span>
						<span class="vp" title={t('Victory points')}>{pointsOf(i)}</span>
					</div>
					<div class="cards">
						{#each RESOURCES as r (r)}
							{@const n = p.resources?.[r] ?? 0}
							<span class="res" class:none={!n} title={t(RESOURCE_LABEL[r])}
								><img src={icons[r]} alt={t(RESOURCE_LABEL[r])} /><b>{n}</b></span
							>
						{/each}
						{#each devs as d (d.type)}
							<span class="dev" title={t(DEV_CARD_LABEL[d.type])}
								><img
									class="icon-px"
									src={DEV_ICON[d.type]}
									alt={t(DEV_CARD_LABEL[d.type])}
								/>{#if d.count > 1}<b>{d.count}</b>{/if}</span
							>
						{/each}
					</div>
				</div>
			{/each}
		{:else if tab === 'points'}
			<svg
				class="race"
				viewBox="0 0 {W} {H}"
				role="img"
				aria-label={t('Victory points over the game')}
			>
				{#each ticks as v (v)}
					<line class="grid" x1={PAD.l} x2={W - PAD.r} y1={py(v)} y2={py(v)} />
					<text class="tick" x={PAD.l - 4} y={py(v) + 3}>{v}</text>
				{/each}
				<line
					class="goal"
					x1={PAD.l}
					x2={W - PAD.r}
					y1={py(view.pointsToWin)}
					y2={py(view.pointsToWin)}
				/>
				<line class="now" x1={px(replay.index)} x2={px(replay.index)} y1={PAD.t} y2={H - PAD.b} />
				{#each view.players as p, i (i)}
					<path class="pl" d={line(i)} style="stroke:{PLAYER_CSS[p.color]}" />
					<circle
						class="dot"
						cx={px(replay.index)}
						cy={py(pointsOf(i)) + nudge(i)}
						r="3.4"
						style="fill:{PLAYER_CSS[p.color]}"
					/>
				{/each}
			</svg>
			<div class="legend">
				{#each view.players as p, i (i)}
					<span
						><i class="swatch" style="background:{PLAYER_CSS[p.color]}"></i>{p.name}
						<b>{pointsOf(i)}</b></span
					>
				{/each}
			</div>
		{:else if tab === 'cards'}
			{#if stats}
				{#each view.players as p, i (i)}
					{@const st = stats.players[i]}
					{@const sum = totalResources(st.gained)}
					<div class="gain" style="--c:{PLAYER_CSS[p.color]}">
						<div class="who">
							<i class="swatch"></i><span class="nm">{p.name}</span><b class="sum">{sum}</b>
						</div>
						<div
							class="stack"
							title={RESOURCES.map((r) => `${t(RESOURCE_LABEL[r])}: ${st.gained[r]}`).join(' · ')}
						>
							{#each RESOURCES as r (r)}
								{#if st.gained[r]}
									<span
										class="part"
										style="width:{(st.gained[r] / gatheredMax) *
											100}%; background:linear-gradient({RES_BG[r][0]}, {RES_BG[r][1]})"
									></span>
								{/if}
							{/each}
						</div>
						<small
							>{t('Dice paid {rolled} (about {expected} expected)', {
								rolled: st.rolled,
								expected: Math.round(st.expected)
							})}</small
						>
					</div>
				{/each}
				<div class="key">
					{#each RESOURCES as r (r)}
						<span
							><i class="swatch" style="background:{RES_BG[r][0]}"></i>{t(RESOURCE_LABEL[r])}</span
						>
					{/each}
				</div>
			{/if}
		{:else if stats}
			<div class="chart">
				{#each chart as c (c.total)}
					<div class="col" class:seven={c.total === 7}>
						<span class="n">{c.count}</span>
						<div class="track">
							<div class="bar" style="height:{(c.count / chartMax) * 100}%"></div>
							<div class="exp" style="bottom:{(c.expected / chartMax) * 100}%"></div>
						</div>
						<span class="tot" class:hot={c.total === 6 || c.total === 8}>{c.total}</span>
					</div>
				{/each}
			</div>
			<div class="legend center">
				<span>{t('{n, plural, one {# roll} other {# rolls}} so far', { n: rolls })}</span>
				<span><i class="swatch exp-sw"></i>{t('Expected')}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.data {
		position: absolute;
		left: 12px;
		top: calc(118px + var(--clock-h, 0px));
		width: 310px;
		max-height: calc(100vh / var(--ui-zoom, 1) - 400px - var(--clock-h, 0px));
		min-height: 160px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 2px 4px 4px;
		z-index: 4;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 4px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		font-size: 15px;
	}
	.head img {
		width: 16px;
		height: 16px;
	}
	.tabs {
		display: flex;
		gap: 4px;
	}
	.tab {
		all: unset;
		flex: 1;
		text-align: center;
		cursor: pointer;
		padding: 3px 4px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #e9d2b0;
		background: rgba(0, 0, 0, 0.22);
		box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.35);
	}
	.tab.on {
		color: #fff2d2;
		background: color-mix(in srgb, var(--gold) 26%, #5a3420);
		box-shadow: inset 0 0 0 2px var(--gold);
	}
	.tab:hover:not(.on) {
		filter: brightness(1.2);
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 5px 6px;
		color: #f3e2c4;
		font-size: 13px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.swatch {
		display: inline-block;
		width: 9px;
		height: 9px;
		margin-right: 5px;
		background: var(--c);
		box-shadow: 0 0 0 2px #1a0c05;
		flex: none;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 2px;
		font-weight: 800;
	}
	.nm {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ------------------------------------------------ hands */
	.hand {
		padding: 2px 4px 3px;
		background: rgba(255, 240, 210, 0.06);
		box-shadow: inset 3px 0 0 var(--c);
	}
	.hand.current {
		background: color-mix(in srgb, var(--c) 22%, rgba(255, 240, 210, 0.08));
	}
	.vp {
		display: grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		padding: 0 3px;
		box-sizing: border-box;
		background: var(--art-coin) center / 100% 100%;
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: #3a1d04;
		text-shadow: none;
	}
	.cards {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 6px;
		margin-top: 0;
	}
	.res,
	.dev {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
	}
	.res img {
		width: 20px;
		height: 20px;
	}
	.res.none {
		opacity: 0.35;
	}
	.dev img {
		width: 15px;
		height: 15px;
	}
	.dev:first-of-type {
		margin-left: 4px;
	}

	/* ------------------------------------------------ points race */
	.race {
		width: 100%;
		height: auto;
		display: block;
	}
	.grid {
		stroke: rgba(255, 240, 210, 0.1);
		stroke-width: 1;
	}
	.goal {
		stroke: #b8862c;
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.now {
		stroke: rgba(255, 240, 210, 0.45);
		stroke-width: 1;
	}
	.tick {
		font-size: 8px;
		font-weight: 800;
		fill: #c9a87e;
		text-anchor: end;
	}
	.pl {
		fill: none;
		stroke-width: 2.4;
		stroke-linejoin: round;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.55));
	}
	.dot {
		stroke: #1a0c05;
		stroke-width: 1.4;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-size: 12px;
	}
	.legend span {
		display: inline-flex;
		align-items: center;
	}
	.legend b {
		margin-left: 3px;
	}
	.legend.center {
		justify-content: center;
		color: #c9a87e;
	}

	/* ------------------------------------------------ gathered */
	.gain small {
		display: block;
		color: #c9a87e;
		font-size: 11px;
	}
	.sum {
		font-family: var(--px);
	}
	.stack {
		display: flex;
		height: 12px;
		margin: 2px 0;
		background: rgba(0, 0, 0, 0.3);
	}
	.part {
		height: 100%;
		box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.35);
	}
	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 8px;
		font-size: 11px;
		color: #c9a87e;
	}
	.key span {
		display: inline-flex;
		align-items: center;
	}
	.key .swatch {
		width: 8px;
		height: 8px;
	}

	/* ------------------------------------------------ dice */
	.chart {
		display: flex;
		align-items: stretch;
		gap: 3px;
		height: 110px;
	}
	.col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
	}
	.col .n {
		font-size: 11px;
		font-weight: 800;
		color: #c9a87e;
		line-height: 14px;
	}
	.track {
		position: relative;
		flex: 1;
		width: 100%;
		background: rgba(0, 0, 0, 0.3);
	}
	.bar {
		position: absolute;
		left: 2px;
		right: 2px;
		bottom: 0;
		background: linear-gradient(#ffd86b, #c8862c);
		box-shadow:
			inset 0 0 0 2px rgba(90, 48, 16, 0.6),
			inset 0 3px 0 rgba(255, 255, 255, 0.35);
		transition: height 0.25s ease-out;
	}
	.seven .bar {
		background: linear-gradient(#b4b8c0, #6d7079);
	}
	.exp {
		position: absolute;
		left: -1px;
		right: -1px;
		height: 0;
		border-top: 2px dashed #fff6e0;
	}
	.exp-sw {
		width: 12px;
		height: 0;
		background: none;
		box-shadow: none;
		border-top: 2px dashed #fff6e0;
	}
	.tot {
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #fff2d2;
		line-height: 16px;
	}
	.tot.hot {
		color: #ff8a6a;
	}

	@media (max-width: 900px) {
		.data {
			top: auto;
			bottom: 196px;
			left: 6px;
			right: 6px;
			width: auto;
			max-height: 46vh;
			min-height: 0;
		}
	}
</style>
