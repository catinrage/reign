<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { pieceTip } from '../helpers';
	import { sceneRef } from '../sceneRef';
	import { settings } from '../settings.svelte';
	import { tipFor } from '../tooltip';
	import { ui } from './ui.svelte';

	/**
	 * The tooltip of a piece on the board (its name, owner and the turn it went up on). The page
	 * never sees the pointer on a piece, so an invisible anchor is kept over the piece's top and
	 * the game's usual tooltip shows on it.
	 */
	let anchor: HTMLDivElement;
	const view = $derived(client.latest ?? client.view);
	const tip = $derived(ui.piece && view ? pieceTip(view, ui.piece.spot) : null);
	const has = $derived(!!tip);

	function follow(): boolean {
		const at = ui.piece && sceneRef.current?.pieceTipPoint(ui.piece.spot);
		if (!at) return false;
		// The point is in screen pixels; the HUD's own pixels are bigger or smaller by its size.
		const z = settings.hudSize;
		anchor.style.transform = `translate(${(Math.round(at.x) - 1) / z}px, ${(Math.round(at.y) - 2) / z}px)`;
		return true;
	}

	$effect(() => {
		const piece = ui.piece;
		if (!piece || !has || !follow()) return tipFor(null);
		tipFor(anchor, piece.tap ? { now: true, hideAfter: 2200 } : {});
		let frame = requestAnimationFrame(function loop() {
			if (!follow()) return tipFor(null);
			frame = requestAnimationFrame(loop);
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

<div
	class="board-tip"
	bind:this={anchor}
	aria-hidden="true"
	title={tip?.text ?? ''}
	data-tip-head={tip?.head ?? ''}
></div>

<style>
	.board-tip {
		position: fixed;
		left: 0;
		top: 0;
		width: 2px;
		height: 2px;
		pointer-events: none;
	}
</style>
