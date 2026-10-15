<script lang="ts">
	import { REALM_CELL, realmRaster, type RealmMap } from '../../../shared/conquest/realm';

	/** A map drawn flat from above: the sea, each territory in its region's color, its borders darker. */
	let { map, width = 260, height = 200 }: { map: RealmMap; width?: number; height?: number } = $props();
	let canvas = $state<HTMLCanvasElement | null>(null);

	const rgb = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

	$effect(() => {
		const c = canvas;
		if (!c) return;
		const r = realmRaster(map, REALM_CELL);
		const { nx, nz, ids } = r;
		c.width = nx;
		c.height = nz;
		const ctx = c.getContext('2d')!;
		const img = ctx.createImageData(nx, nz);
		const colors = map.regions.map((g) => rgb(g.color));
		for (let iz = 0; iz < nz; iz++)
			for (let ix = 0; ix < nx; ix++) {
				const i = ix + iz * nx;
				const t = ids[i];
				const o = i * 4;
				if (t < 0) {
					// Deeper further from land, as the board's sea is.
					img.data.set([60, 108, 156, 255], o);
					continue;
				}
				const edge = (ix + 1 < nx && ids[i + 1] !== t) || (iz + 1 < nz && ids[i + nx] !== t) || (ix > 0 && ids[i - 1] !== t) || (iz > 0 && ids[i - nx] !== t);
				const [cr, cg, cb] = colors[map.territories[t].region] ?? [200, 200, 200];
				const k = edge ? 0.55 : 0.92;
				img.data.set([cr * k, cg * k, cb * k, 255], o);
			}
		ctx.putImageData(img, 0, 0);
	});
</script>

<canvas bind:this={canvas} class="world" style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>

<style>
	.world {
		display: block;
		object-fit: contain;
		image-rendering: auto;
		border-radius: 6px;
		box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.4);
		background: #3c6c9c;
	}
</style>
