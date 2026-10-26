<script lang="ts">
	/** Bars per day, stacked when there's more than one series, with a tooltip on hover. */
	interface Series {
		label: string;
		color: string;
		values: number[];
	}
	let { title, days, series, height = 160 }: { title: string; days: string[]; series: Series[]; height?: number } = $props();

	let width = $state(600);
	let hover = $state<number | null>(null);

	const PAD = { top: 8, right: 8, bottom: 22, left: 34 };
	const totals = $derived(days.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0)));
	const max = $derived(niceMax(Math.max(1, ...totals)));
	const plotW = $derived(Math.max(10, width - PAD.left - PAD.right));
	const plotH = $derived(height - PAD.top - PAD.bottom);
	const step = $derived(plotW / Math.max(1, days.length));
	const barW = $derived(Math.max(2, step - 2));
	const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
	const ticks = $derived([0, max / 2, max]);
	const sum = $derived(totals.reduce((a, b) => a + b, 0));

	function niceMax(v: number) {
		const p = 10 ** Math.floor(Math.log10(v));
		for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
		return v;
	}

	function label(day: string) {
		const d = new Date(`${day}T00:00:00Z`);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
	}

	function move(e: PointerEvent) {
		const x = e.clientX - (e.currentTarget as SVGElement).getBoundingClientRect().left - PAD.left;
		const i = Math.floor(x / step);
		hover = i >= 0 && i < days.length ? i : null;
	}
</script>

<div class="chart card">
	<div class="head">
		<h2>{title}</h2>
		<span class="muted">{sum.toLocaleString()} in {days.length} days</span>
	</div>
	{#if series.length > 1}
		<div class="legend">
			{#each series as s (s.label)}
				<span><i style:background={s.color}></i>{s.label}</span>
			{/each}
		</div>
	{/if}
	<div class="plot" bind:clientWidth={width}>
		<svg {width} {height} role="img" aria-label={title} onpointermove={move} onpointerleave={() => (hover = null)}>
			{#each ticks as t (t)}
				<line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} class="grid" />
				<text x={PAD.left - 6} y={y(t) + 4} text-anchor="end" class="axis">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
			{/each}
			{#each days as day, i (day)}
				{@const x = PAD.left + i * step + 1}
				{#if hover === i}
					<rect {x} y={PAD.top} width={barW} height={plotH} class="hoverband" />
				{/if}
				{#each series as s, k (s.label)}
					{@const below = series.slice(0, k).reduce((a, x) => a + (x.values[i] ?? 0), 0)}
					{@const v = s.values[i] ?? 0}
					{#if v > 0}
						<rect {x} y={y(below + v) + (k ? 1 : 0)} width={barW} height={Math.max(1, y(below) - y(below + v) - (k ? 1 : 0))} rx="2" fill={s.color} />
					{/if}
				{/each}
				{#if i % Math.ceil(days.length / 6) === 0 || i === days.length - 1}
					<text x={x + barW / 2} y={height - 6} text-anchor="middle" class="axis">{label(day)}</text>
				{/if}
			{/each}
		</svg>
		{#if hover !== null}
			<div class="tip" style:left="{Math.min(width - 150, Math.max(0, PAD.left + hover * step - 40))}px">
				<strong>{label(days[hover])}</strong>
				{#each series as s (s.label)}
					<div><i style:background={s.color}></i>{s.label}: <b>{s.values[hover] ?? 0}</b></div>
				{/each}
				{#if series.length > 1}<div class="muted">Total: {totals[hover]}</div>{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: baseline;
	}
	.legend {
		display: flex;
		gap: 14px;
		font-size: 12px;
		color: var(--text-2);
		margin: -4px 0 6px;
	}
	i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 3px;
		margin-right: 5px;
		vertical-align: -1px;
	}
	.plot {
		position: relative;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.axis {
		fill: var(--muted);
		font-size: 11px;
	}
	.hoverband {
		fill: var(--surface-2);
	}
	.tip {
		position: absolute;
		top: 0;
		pointer-events: none;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 10px;
		font-size: 12px;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.15);
		min-width: 130px;
	}
</style>
