<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { sceneRef } from '../sceneRef';
	import { settings } from '../settings.svelte';
	import { GB_PIXEL } from './icons';
	import { gbPlay } from './play.svelte';
	import { boardOf, gbColor, PIECE_TEXT, pieceName, pieceStats, playerName, TERRAIN_NAME, TERRAIN_TEXT } from './text';

	/**
	 * What is on a hex: the piece standing there (whose, how it moves, how hard it fights, what it
	 * is worth, and the order it has from you), and the ground (a shrine's crowns, a keep, a forest
	 * or hill's ways). It follows the mouse once it rests on the board.
	 */
	const p = gbPlay;
	const v = $derived(p.view!);
	let mouse = $state({ x: 0, y: 0, touch: false });
	let rested = $state(false);
	let restTimer: ReturnType<typeof setTimeout> | undefined;
	function moved(e: PointerEvent) {
		mouse = { x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
		rested = false;
		clearTimeout(restTimer);
		restTimer = setTimeout(() => (rested = true), 300);
	}
	const at = $derived(mouse.touch || !rested || p.note || p.resolving ? null : p.hover);
	const info = $derived.by(() => {
		if (at === null) return null;
		const cell = boardOf(v).cells[at];
		if (!cell) return null;
		const piece = p.pieceAt(at);
		const order = piece ? p.drafts.find((o) => o.piece === piece.id) : undefined;
		const ground = cell.shrine
			? cell.shrine > 1
				? t('The Throne: {n} crowns a round to whoever holds it.', { n: cell.shrine })
				: t('A shrine: 1 crown a round to whoever holds it.')
			: cell.keep >= 0
				? t("{player}'s keep: their monarch comes home here, and a guard musters here every third round.", { player: playerName(v, cell.keep) })
				: t(TERRAIN_TEXT[cell.terrain]);
		return { cell, piece, order, ground };
	});
</script>

<svelte:window onpointermove={moved} onpointerdown={moved} />

{#if info && sceneRef.current?.gambit}
	{@const flipX = mouse.x / settings.hudSize > window.innerWidth / settings.hudSize - 300}
	{@const flipY = mouse.y / settings.hudSize > window.innerHeight / settings.hudSize - 220}
	<div class="tip" class:flip-x={flipX} class:flip-y={flipY} style:left="{mouse.x / settings.hudSize}px" style:top="{mouse.y / settings.hudSize}px" role="tooltip">
		{#if info.piece}
			<div class="head">
				<img class="icon-px" src={GB_PIXEL[info.piece.kind]} alt="" />
				<span class="name">{pieceName(info.piece.kind)}</span>
				<b class="owner" style="--c:{gbColor(v, info.piece.owner)}">{playerName(v, info.piece.owner)}</b>
			</div>
			<div class="text">{t(PIECE_TEXT[info.piece.kind])}</div>
			<div class="stats">{pieceStats(info.piece.kind)}</div>
			{#if info.order}
				<div class="hint">
					{info.order.type === 'move' ? t('Ordered to move.') : info.order.type === 'shoot' ? t('Ordered to shoot.') : t('Ordered to brace.')}
				</div>
			{/if}
		{:else}
			<div class="name">{info.cell.shrine ? (info.cell.shrine > 1 ? t('The Throne') : t('Shrine')) : t(TERRAIN_NAME[info.cell.terrain])}</div>
		{/if}
		<div class="ground">{info.ground}</div>
	</div>
{/if}

<style>
	.tip {
		position: absolute;
		z-index: 30;
		transform: translate(18px, 14px);
		min-width: 180px;
		max-width: 270px;
		padding: 7px 10px 8px;
		background: rgba(30, 16, 8, 0.94);
		border: 2px solid #c99a2e;
		box-shadow:
			0 0 0 2px #1a0c05,
			0 8px 16px rgba(0, 0, 0, 0.5);
		color: #fbeedb;
		font-size: 13px;
		pointer-events: none;
		animation: fade-in 0.15s;
	}
	.tip.flip-x {
		transform: translate(calc(-100% - 18px), 14px);
	}
	.tip.flip-y {
		transform: translate(18px, calc(-100% - 14px));
	}
	.tip.flip-x.flip-y {
		transform: translate(calc(-100% - 18px), calc(-100% - 14px));
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.head img {
		width: 22px;
		height: 22px;
	}
	.name {
		font-family: var(--px);
		font-weight: 700;
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.owner {
		margin-left: auto;
		color: var(--c);
		text-shadow:
			1px 0 0 #1a0c05,
			-1px 0 0 #1a0c05,
			0 1px 0 #1a0c05,
			0 -1px 0 #1a0c05;
	}
	.text {
		margin-top: 3px;
		line-height: 1.3;
		color: #ead6b8;
	}
	.stats {
		margin-top: 3px;
		font-size: 12px;
		font-weight: 800;
		color: var(--gold);
	}
	.ground {
		margin-top: 4px;
		font-size: 12px;
		color: #d8c3a2;
	}
	.hint {
		margin-top: 5px;
		padding-top: 4px;
		border-top: 1px solid rgba(201, 154, 46, 0.4);
		font-weight: 800;
		color: #ffe08a;
	}
</style>
