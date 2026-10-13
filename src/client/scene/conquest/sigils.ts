import type { PlayerColor } from '../../../shared/rules/config';

/**
 * Conquest's player sigils: each color has its own shape, drawn on its armies, in the player list
 * and on cards, so who holds what reads without telling colors apart.
 */
export const SIGILS = ['shield', 'star', 'crown', 'leaf', 'tower', 'sun', 'moon', 'flame'] as const;
export type Sigil = (typeof SIGILS)[number];

export const SIGIL_OF: Record<PlayerColor, Sigil> = {
	red: 'shield',
	blue: 'star',
	yellow: 'crown',
	green: 'leaf',
	white: 'tower',
	orange: 'sun',
	purple: 'moon',
	pink: 'flame'
};

/** Traces the sigil as a path centered on (cx, cy), `r` from the middle to its furthest point. */
export function sigilPath(ctx: CanvasRenderingContext2D | Path2D, sigil: Sigil, cx: number, cy: number, r: number) {
	const p = ctx as CanvasRenderingContext2D;
	const poly = (pts: [number, number][]) => {
		p.moveTo(cx + pts[0][0] * r, cy + pts[0][1] * r);
		for (const [x, y] of pts.slice(1)) p.lineTo(cx + x * r, cy + y * r);
		p.closePath();
	};
	switch (sigil) {
		case 'shield':
			p.moveTo(cx - 0.8 * r, cy - 0.85 * r);
			p.lineTo(cx + 0.8 * r, cy - 0.85 * r);
			p.lineTo(cx + 0.8 * r, cy - 0.1 * r);
			p.quadraticCurveTo(cx + 0.75 * r, cy + 0.6 * r, cx, cy + r);
			p.quadraticCurveTo(cx - 0.75 * r, cy + 0.6 * r, cx - 0.8 * r, cy - 0.1 * r);
			p.closePath();
			break;
		case 'star': {
			const pts: [number, number][] = [];
			for (let i = 0; i < 10; i++) {
				const a = -Math.PI / 2 + (i * Math.PI) / 5;
				const k = i % 2 ? 0.42 : 1;
				pts.push([Math.cos(a) * k, Math.sin(a) * k + 0.08]);
			}
			poly(pts);
			break;
		}
		case 'crown':
			poly([
				[-0.9, 0.7],
				[-0.9, -0.55],
				[-0.45, -0.05],
				[0, -0.8],
				[0.45, -0.05],
				[0.9, -0.55],
				[0.9, 0.7]
			]);
			break;
		case 'leaf':
			p.moveTo(cx, cy - r);
			p.quadraticCurveTo(cx + 0.95 * r, cy - 0.1 * r, cx, cy + 0.85 * r);
			p.quadraticCurveTo(cx - 0.95 * r, cy - 0.1 * r, cx, cy - r);
			p.closePath();
			p.moveTo(cx - 0.08 * r, cy + 0.7 * r);
			p.lineTo(cx + 0.08 * r, cy + 0.7 * r);
			p.lineTo(cx + 0.08 * r, cy + r);
			p.lineTo(cx - 0.08 * r, cy + r);
			p.closePath();
			break;
		case 'tower':
			poly([
				[-0.75, 0.9],
				[-0.75, -0.55],
				[-0.75, -0.95],
				[-0.42, -0.95],
				[-0.42, -0.65],
				[-0.17, -0.65],
				[-0.17, -0.95],
				[0.17, -0.95],
				[0.17, -0.65],
				[0.42, -0.65],
				[0.42, -0.95],
				[0.75, -0.95],
				[0.75, 0.9]
			]);
			break;
		case 'sun': {
			const pts: [number, number][] = [];
			for (let i = 0; i < 16; i++) {
				const a = (i * Math.PI) / 8;
				const k = i % 2 ? 0.62 : 1;
				pts.push([Math.cos(a) * k, Math.sin(a) * k]);
			}
			poly(pts);
			break;
		}
		case 'moon':
			p.moveTo(cx + 0.2 * r, cy - 0.95 * r);
			p.arc(cx, cy, 0.95 * r, -Math.PI / 2 + 0.2, Math.PI / 2 - 0.2, true);
			p.arc(cx + 0.38 * r, cy, 0.72 * r, Math.PI / 2 + 0.25, -Math.PI / 2 - 0.25, false);
			p.closePath();
			break;
		case 'flame':
			p.moveTo(cx, cy - r);
			p.bezierCurveTo(cx + 0.35 * r, cy - 0.4 * r, cx + 0.85 * r, cy - 0.1 * r, cx + 0.7 * r, cy + 0.45 * r);
			p.quadraticCurveTo(cx + 0.5 * r, cy + r, cx, cy + r);
			p.quadraticCurveTo(cx - 0.5 * r, cy + r, cx - 0.7 * r, cy + 0.45 * r);
			p.bezierCurveTo(cx - 0.8 * r, cy, cx - 0.3 * r, cy - 0.2 * r, cx, cy - r);
			p.closePath();
			break;
	}
}

/** Draws a sigil filled in `fill` with a `stroke` outline. */
export function drawSigil(ctx: CanvasRenderingContext2D, sigil: Sigil, cx: number, cy: number, r: number, fill: string, stroke?: string, line = r * 0.16) {
	ctx.beginPath();
	sigilPath(ctx, sigil, cx, cy, r);
	ctx.fillStyle = fill;
	ctx.fill('evenodd');
	if (stroke) {
		ctx.lineJoin = 'round';
		ctx.lineWidth = line;
		ctx.strokeStyle = stroke;
		ctx.stroke();
	}
}

const urls = new Map<string, string>();

/** A sigil as an image URL for the interface (cached). */
export function sigilUrl(sigil: Sigil, fill: string, stroke = '#2b1a10', size = 64): string {
	const key = `${sigil}:${fill}:${stroke}:${size}`;
	let url = urls.get(key);
	if (!url) {
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d')!;
		drawSigil(ctx, sigil, size / 2, size / 2, size * 0.4, fill, stroke, size * 0.07);
		url = c.toDataURL();
		urls.set(key, url);
	}
	return url;
}
