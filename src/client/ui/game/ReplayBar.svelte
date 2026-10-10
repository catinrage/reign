<script lang="ts">
	import { EVENT_INFO, type EventCard } from '../../../shared/rules/events';
	import { MODE_INFO } from '../../../shared/rules/modes';
	import { client } from '../../state/client.svelte';
	import { SPEEDS, replay, type ReplayMark } from '../../state/replay.svelte';
	import { i18n, t, tx } from '../../i18n/index.svelte';
	import { PLAYER_CSS } from '../helpers';
	import { PIXEL } from '../pixel';
	import { ui } from './ui.svelte';

	/**
	 * In place of a hand while a recorded game plays back: play and pause, speed, skipping a turn
	 * at a time, and a timeline of the whole game to scrub through, with its big moments marked.
	 */

	let { statsOpen = $bindable(true) }: { statsOpen?: boolean } = $props();

	const view = $derived(client.view!);
	const match = $derived(replay.match);
	const total = $derived(replay.last + 1);
	const turn = $derived(replay.turn);
	const at = (i: number) => (i / total) * 100;

	function clock(ms: number) {
		const s = Math.max(0, Math.floor(ms / 1000));
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = String(s % 60).padStart(2, '0');
		return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
	}
	const elapsed = $derived(clock(replay.times[replay.index] ?? 0));
	const length = $derived(clock(replay.times[replay.last] ?? 0));

	function turnLabel(tn: typeof turn): string {
		if (!tn) return '';
		if (tn.phase === 'draft') return t('Draft');
		if (tn.phase === 'setup') return t('Setup');
		return t('Turn {turn}', { turn: tn.turn });
	}

	const when = $derived(
		match
			? new Date(match.startedAt).toLocaleDateString(i18n.lang, {
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: ''
	);

	const MARK_ICON: Record<ReplayMark['kind'], string> = {
		seven: PIXEL.robber,
		army: PIXEL.army,
		road: PIXEL.road,
		event: PIXEL.star,
		win: PIXEL.crown
	};
	function markText(m: ReplayMark): string {
		const player = m.player !== null ? (view.players[m.player]?.name ?? '') : '';
		switch (m.kind) {
			case 'seven':
				return t('{player} rolled a 7', { player });
			case 'army':
				return t('{player} took Largest Army', { player });
			case 'road':
				return t('{player} took Longest Road', { player });
			case 'event': {
				const info = m.detail ? EVENT_INFO[m.detail as EventCard] : null;
				return info ? t('Event: {card}', { card: t(info.name) }) : t('Event');
			}
			case 'win':
				return t('{player} won the game', { player });
		}
	}

	// ------------------------------------------------------------ scrubbing

	let track = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);
	let resume = false;
	let hover = $state<{ x: number; index: number } | null>(null);

	function indexAt(clientX: number) {
		const r = track!.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
		return { x: x * 100, index: Math.min(replay.last, Math.floor(x * total)) };
	}
	function down(e: PointerEvent) {
		if (!track || e.button !== 0) return;
		track.setPointerCapture(e.pointerId);
		dragging = true;
		resume = replay.playing;
		replay.pause();
		replay.seek(indexAt(e.clientX).index);
	}
	let frame = 0;
	function move(e: PointerEvent) {
		if (!track) return;
		const at = indexAt(e.clientX);
		hover = at;
		if (!dragging) return;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			if (at.index !== replay.index) replay.seek(at.index);
		});
	}
	function up() {
		if (!dragging) return;
		dragging = false;
		if (resume) replay.play();
	}
	const hoverTurn = $derived(hover ? replay.turnAt(hover.index) : null);

	function onKey(e: KeyboardEvent) {
		if (ui.menu || e.ctrlKey || e.metaKey || e.altKey) return;
		if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]'))
			return;
		// Space on a focused button presses that button instead.
		if (e.key === ' ' && (e.target as HTMLElement | null)?.closest?.('button')) return;
		switch (e.key) {
			case ' ':
				replay.toggle();
				break;
			case 'ArrowRight':
				replay.pause();
				if (e.shiftKey) replay.nextTurn();
				else replay.stepOn();
				break;
			case 'ArrowLeft':
				replay.pause();
				if (e.shiftKey) replay.prevTurn();
				else replay.seek(replay.index - 1);
				break;
			case 'Home':
				replay.seek(0);
				break;
			case 'End':
				replay.seek(replay.last);
				break;
			default:
				return;
		}
		e.preventDefault();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="dock">
	<div class="bar panel">
		<div class="ribbon tag"><img class="icon-px" src={PIXEL.play} alt="" />{t('Replay')}</div>
		<div class="row">
			<div class="about">
				<span class="what title"
					>{match && MODE_INFO[match.mode] ? t(MODE_INFO[match.mode].name) : ''}{match?.mode ===
					'extended'
						? ` · ${tx(match.mapName)}`
						: ''}</span
				>
				<span class="when">{when}</span>
			</div>
			<div class="transport">
				<button
					class="icon-btn"
					onclick={() => replay.seek(0)}
					title={t('To the start (Home)')}
					aria-label={t('To the start')}><img src={PIXEL.toStart} alt="" /></button
				>
				<button
					class="icon-btn"
					onclick={() => replay.prevTurn()}
					title={t('Previous turn (Shift+←)')}
					aria-label={t('Previous turn')}><img src={PIXEL.turnBack} alt="" /></button
				>
				<button
					class="icon-btn big"
					class:on={replay.playing}
					onclick={() => replay.toggle()}
					title={replay.playing ? t('Pause (Space)') : t('Play (Space)')}
					aria-label={replay.playing ? t('Pause') : t('Play')}
					><img src={replay.playing ? PIXEL.pause : PIXEL.play} alt="" /></button
				>
				<button
					class="icon-btn"
					onclick={() => replay.nextTurn()}
					title={t('Next turn (Shift+→)')}
					aria-label={t('Next turn')}><img src={PIXEL.turnOn} alt="" /></button
				>
				<button
					class="icon-btn"
					onclick={() => replay.seek(replay.last)}
					title={t('To the end (End)')}
					aria-label={t('To the end')}><img src={PIXEL.toEnd} alt="" /></button
				>
			</div>
			<div class="seg speed" role="group" aria-label={t('Speed')}>
				{#each SPEEDS as s (s)}
					<button
						class="btn small"
						class:on={replay.speed === s}
						aria-pressed={replay.speed === s}
						onclick={() => replay.setSpeed(s)}>{s === 0.5 ? '½' : s}×</button
					>
				{/each}
			</div>
			<div class="where">
				{#if turn}
					<span class="turn title"
						><i
							class="swatch"
							style="background:{PLAYER_CSS[view.players[turn.player]?.color ?? 'white']}"
						></i>{turnLabel(turn)}
						· {view.players[turn.player]?.name}</span
					>
				{/if}
				<span class="time">{elapsed} / {length}</span>
			</div>
			<div class="tools">
				<button
					class="btn small wood cycle"
					onclick={() =>
						replay.setSpeed(SPEEDS[(SPEEDS.indexOf(replay.speed) + 1) % SPEEDS.length])}
					title={t('Speed')}
					aria-label={t('Speed')}>{replay.speed === 0.5 ? '½' : replay.speed}×</button
				>
				<button
					class="icon-btn"
					class:on={statsOpen}
					aria-pressed={statsOpen}
					onclick={() => (statsOpen = !statsOpen)}
					title={t('Game data')}
					aria-label={t('Game data')}><img src={PIXEL.chart} alt="" /></button
				>
				<button
					class="icon-btn"
					onclick={() => replay.close()}
					title={t('Close replay')}
					aria-label={t('Close replay')}><img src={PIXEL.close} alt="" /></button
				>
			</div>
		</div>

		<div
			class="timeline"
			bind:this={track}
			class:dragging
			role="slider"
			tabindex="0"
			aria-label={t('Timeline')}
			aria-valuemin={0}
			aria-valuemax={replay.last}
			aria-valuenow={replay.index}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onpointerleave={() => (hover = null)}
		>
			<div class="marks">
				{#each replay.marks as m, k (k)}
					<button
						class="mark {m.kind}"
						class:past={m.index <= replay.index}
						style="left:{at(m.index + 0.5)}%; --c:{m.player !== null
							? PLAYER_CSS[view.players[m.player]?.color ?? 'white']
							: '#f2c14e'}"
						title={markText(m)}
						aria-label={markText(m)}
						onpointerdown={(e) => e.stopPropagation()}
						onclick={() => replay.seek(m.index)}
						><img class="icon-px" src={MARK_ICON[m.kind]} alt="" /></button
					>
				{/each}
			</div>
			<div class="track well">
				{#each replay.turns as tn, k (k)}
					<span
						class="seg-turn"
						class:setup={tn.phase !== 'main' && tn.phase !== 'ended'}
						style="left:{at(tn.from)}%; width:{at(tn.to + 1) - at(tn.from)}%; --c:{PLAYER_CSS[
							view.players[tn.player]?.color ?? 'white'
						]}"
					></span>
				{/each}
				<span class="future" style="left:{at(replay.index + 1)}%"></span>
				<span class="knob" style="left:{at(replay.index + 0.5)}%"></span>
			</div>
			{#if hover && !dragging}
				<span class="hover-tip" style="left:{hover.x}%"
					>{turnLabel(hoverTurn)}{hoverTurn
						? ` · ${view.players[hoverTurn.player]?.name ?? ''}`
						: ''}</span
				>
			{/if}
		</div>
		{#if replay.cut}
			<p class="cut">{t('This recording stops before the game ended.')}</p>
		{/if}
	</div>
</div>

<style>
	.dock {
		position: absolute;
		bottom: 12px;
		left: 334px;
		right: 12px;
		display: flex;
		justify-content: center;
		pointer-events: none;
		z-index: 6;
	}
	.bar {
		position: relative;
		width: 100%;
		max-width: 980px;
		padding: 12px 10px 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.tag {
		--rib: var(--art-ribbon-crimson);
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -78%);
		font-size: 16px;
		min-width: 0;
		height: calc(var(--s) * 12);
		gap: 6px;
	}
	.tag img {
		width: 12px;
		height: 12px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		justify-content: space-between;
	}
	.about {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1 1 120px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.what {
		font-size: 15px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.when {
		font-size: 12px;
		color: #d9bf98;
	}
	.transport {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.transport .icon-btn {
		width: calc(var(--s) * 14);
		height: calc(var(--s) * 14);
	}
	.transport .icon-btn img {
		width: calc(var(--s) * 6);
		height: calc(var(--s) * 6);
	}
	.transport .icon-btn.big {
		width: calc(var(--s) * 18);
		height: calc(var(--s) * 18);
		border-image-source: var(--art-btn-gold);
	}
	.transport .icon-btn.big img {
		width: calc(var(--s) * 8);
		height: calc(var(--s) * 8);
	}
	.icon-btn.on {
		border-image-source: var(--art-btn-gold);
	}
	.speed .btn {
		min-width: 34px;
	}
	.where {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		min-width: 0;
		flex: 1 1 120px;
	}
	.turn {
		font-size: 15px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.swatch {
		display: inline-block;
		width: 10px;
		height: 10px;
		margin-right: 6px;
		box-shadow: 0 0 0 2px #1a0c05;
	}
	.time {
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #d9bf98;
		font-variant-numeric: tabular-nums;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	/* On a phone the speeds take turns on one button. */
	.cycle {
		display: none;
		min-width: 38px;
	}
	.tools .icon-btn {
		width: calc(var(--s) * 13);
		height: calc(var(--s) * 13);
	}
	.tools .icon-btn img {
		width: calc(var(--s) * 6);
		height: calc(var(--s) * 6);
	}

	/* ------------------------------------------------ timeline */
	.timeline {
		position: relative;
		pointer-events: auto;
		padding-top: 22px;
		cursor: pointer;
		touch-action: none;
		outline: none;
	}
	.track {
		position: relative;
		height: 16px;
		box-sizing: content-box;
		overflow: hidden;
	}
	.seg-turn {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--c);
		box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.45);
	}
	.seg-turn.setup {
		background: repeating-linear-gradient(
			135deg,
			var(--c) 0 4px,
			color-mix(in srgb, var(--c) 55%, #000) 4px 8px
		);
	}
	/* What hasn't happened yet is dimmed. */
	.future {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 0;
		background: rgba(20, 10, 4, 0.66);
		pointer-events: none;
	}
	.knob {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 6px;
		transform: translateX(-50%);
		background: #fff3b8;
		box-shadow:
			0 0 0 2px #1a0c05,
			0 0 8px 2px rgba(255, 230, 140, 0.8);
		pointer-events: none;
	}
	.marks {
		position: absolute;
		left: calc(var(--s) * 3);
		right: calc(var(--s) * 3);
		top: 0;
		height: 22px;
	}
	.mark {
		all: unset;
		position: absolute;
		bottom: 2px;
		transform: translateX(-50%);
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		cursor: pointer;
		background: color-mix(in srgb, var(--c) 70%, #2a1608);
		box-shadow:
			0 0 0 2px #1a0c05,
			0 2px 0 2px rgba(0, 0, 0, 0.35);
		opacity: 0.55;
		transition:
			opacity 0.2s,
			transform 0.12s;
	}
	.mark.past {
		opacity: 1;
	}
	.mark:hover {
		opacity: 1;
		transform: translateX(-50%) translateY(-2px) scale(1.15);
		z-index: 2;
	}
	.mark img {
		width: 12px;
		height: 12px;
	}
	.mark.win {
		width: 20px;
		height: 20px;
	}
	.hover-tip {
		position: absolute;
		bottom: 26px;
		transform: translateX(-50%);
		padding: 2px 6px;
		background: #1a0c05;
		color: #fff2d2;
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		white-space: nowrap;
		pointer-events: none;
		z-index: 3;
	}
	.cut {
		margin: 2px 0 0;
		font-size: 12px;
		color: #ffb58a;
		text-align: center;
	}
	@media (max-width: 900px) {
		.dock {
			left: 6px;
			right: 6px;
			bottom: 6px;
		}
		.bar {
			padding: 10px 4px 4px;
		}
		.row {
			gap: 6px;
		}
		.about,
		.speed {
			display: none;
		}
		.cycle {
			display: inline-flex;
		}
		.where {
			align-items: flex-start;
			order: -1;
			flex-basis: 100%;
		}
	}
</style>
