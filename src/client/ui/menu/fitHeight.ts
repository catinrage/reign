import type { Action } from 'svelte/action';

export interface FitOptions {
	/** Pixels of the box kept free round the content (padding, a ribbon over the top edge). */
	margin?: number;
	/** Rather than shrink further than this, the content keeps its size and scrolls (a phone on its side). */
	min?: number;
}

/**
 * Shrinks a menu column to fit the height of the box it would scroll in, so a short window shows
 * it whole instead of scrolled. It zooms the column, as the interface's own size setting zooms
 * the interface. The column must be positioned and a direct child of that box: its children's
 * offsets are its own, unzoomed, untouched by their animations, so one measure finds the fit.
 */
export const fitHeight: Action<HTMLElement, FitOptions | undefined> = (node, options) => {
	let margin = options?.margin ?? 40;
	let min = options?.min ?? 0.6;
	let zoom = 1;
	const box = node.parentElement;
	if (!box) return;

	const measure = () => {
		const kids = [...node.children].filter((k): k is HTMLElement => k instanceof HTMLElement && k.offsetHeight > 0);
		if (!kids.length) return;
		const top = Math.min(...kids.map((k) => k.offsetTop));
		const bottom = Math.max(...kids.map((k) => k.offsetTop + k.offsetHeight));
		const fit = (box.clientHeight - margin) / (bottom - top);
		const next = fit >= 1 || fit < min ? 1 : fit;
		if (Math.abs(next - zoom) < 0.005) return;
		zoom = next;
		node.style.zoom = zoom === 1 ? '' : String(zoom);
	};
	const watch = new ResizeObserver(measure);
	watch.observe(box);
	for (const k of node.children) watch.observe(k);

	return {
		update(next) {
			margin = next?.margin ?? 40;
			min = next?.min ?? 0.6;
			measure();
		},
		destroy() {
			watch.disconnect();
			node.style.zoom = '';
		}
	};
};
