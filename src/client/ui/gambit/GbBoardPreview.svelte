<script lang="ts">
	import { hexCorner } from '../../../shared/board/hex';
	import type { GambitBoard } from '../../../shared/gambit/types';

	/** A Gambit board drawn flat from above: its ground, shrines, the Throne and the keeps in their seats' colors. */
	let { board, colors = [], size = 80 }: { board: GambitBoard; colors?: string[]; size?: number } = $props();
	let canvas = $state<HTMLCanvasElement | null>(null);

	const FILL = { plain: '#c99f6c', forest: '#4c7d33', hill: '#a39784', water: '#4f8fb6' } as const;

	$effect(() => {
		const c = canvas;
		if (!c) return;
		const px = size * 2;
		c.width = c.height = px;
		const ctx = c.getContext('2d')!;
		ctx.clearRect(0, 0, px, px);
		const span = (board.radius + 1) * Math.sqrt(3);
		const scale = px / 2 / span;
		for (const cell of board.cells) {
			ctx.beginPath();
			for (let i = 0; i < 6; i++) {
				const p = hexCorner(cell, i);
				const x = px / 2 + p.x * scale;
				const y = px / 2 + p.z * scale;
				if (i) ctx.lineTo(x, y);
				else ctx.moveTo(x, y);
			}
			ctx.closePath();
			ctx.fillStyle = cell.keep >= 0 ? (colors[cell.keep] ?? '#e0b24a') : cell.shrine ? (cell.shrine > 1 ? '#f0c24e' : '#f4f1ea') : FILL[cell.terrain];
			ctx.fill();
			ctx.strokeStyle = 'rgba(42, 26, 16, 0.55)';
			ctx.lineWidth = 1;
			ctx.stroke();
		}
	});
</script>

<canvas bind:this={canvas} class="preview" style:width="{size}px" style:height="{size}px" aria-hidden="true"></canvas>

<style>
	.preview {
		display: block;
		flex: none;
	}
</style>
