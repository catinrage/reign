<script lang="ts">
	import { t } from '../../../i18n/index.svelte';
	import Rich from '../../../i18n/Rich.svelte';
	import { getIcons } from '../../../scene/icons';
	import { TERRAIN_CSS } from '../../extended/terrainColors';
	import { PIXEL } from '../../pixel';

	const icons = getIcons().urls;
	const order = ['red', 'blue', 'yellow', 'green'];

	// A patch of seven tiles to show the distance rule: a settlement, the corners it blocks and
	// the nearest corners still open.
	const R = 40;
	const centers = [
		[0, 0],
		[1, 0],
		[-1, 0],
		[0.5, -1],
		[-0.5, -1],
		[0.5, 1],
		[-0.5, 1]
	].map(([q, r]) => ({ x: q * R * Math.sqrt(3), y: r * R * 1.5 }));
	const lands = ['fields', 'forest', 'hills', 'pasture', 'mountains', 'pasture', 'forest'] as const;
	const cornerOf = (c: { x: number; y: number }, i: number) => {
		const a = ((60 * i - 90) * Math.PI) / 180;
		return { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) };
	};
	const poly = (c: { x: number; y: number }, k = 1) =>
		Array.from({ length: 6 }, (_, i) => {
			const p = cornerOf({ x: 0, y: 0 }, i);
			return `${(c.x + p.x * k).toFixed(1)},${(c.y + p.y * k).toFixed(1)}`;
		}).join(' ');
	const corners: { x: number; y: number }[] = [];
	for (const c of centers)
		for (let i = 0; i < 6; i++) {
			const p = cornerOf(c, i);
			if (!corners.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1)) corners.push(p);
		}
	// The settlement: the bottom corner of the middle tile.
	const home = cornerOf(centers[0], 3);
	const near = (d: number) =>
		corners.filter((p) => Math.abs(Math.hypot(p.x - home.x, p.y - home.y) - d) < 1);
	const blocked = near(R);
	const open = near(R * Math.sqrt(3));
	const road = blocked[0];
</script>

{#snippet pair()}<b>{t('one settlement and one road')}</b>{/snippet}
{#snippet reverse()}<b>{t('reverse order')}</b>{/snippet}
{#snippet second()}<b>{t('second settlement')}</b>{/snippet}
{#snippet gap()}<b>{t('one empty corner')}</b>{/snippet}

<p>
	<Rich
		text={t(
			'Before the first roll, every player places {pair} touching it, going round the table. Then everyone places a second pair in {reverse}, so the last player places twice in a row and the first player places last.'
		)}
		slots={{ pair, reverse }}
	/>
</p>

<div class="figure snake">
	<div class="round">
		<span class="label">{t('First round')}</span>
		<div class="seats">
			{#each order as c, i (c)}
				<span class="shield" style="--shield: var(--art-shield-{c})">{i + 1}</span>
				{#if i < order.length - 1}<span class="arrow">›</span>{/if}
			{/each}
		</div>
	</div>
	<span class="turnaround">↩</span>
	<div class="round">
		<span class="label">{t('Second round')}</span>
		<div class="seats">
			{#each [...order].reverse() as c, i (c)}
				<span class="shield" style="--shield: var(--art-shield-{c})">{order.length - i}</span>
				{#if i < order.length - 1}<span class="arrow">›</span>{/if}
			{/each}
		</div>
	</div>
</div>

<ul class="rows">
	<li>
		<img class="piece" src={icons['settlement:red']} alt="" /><span
			><Rich
				text={t(
					'Your {second} pays you at once: one card for each tile it touches. Pick a spot that covers resources your first one lacks.'
				)}
				slots={{ second }}
			/></span
		>
	</li>
	<li>
		<img class="piece" src={icons['road:red']} alt="" /><span
			>{t('Each road must touch the settlement you just placed. Point it where you want to grow.')}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			>{t('When everyone has placed both, the first player rolls and the game begins.')}</span
		>
	</li>
</ul>

<h3>{t('The distance rule')}</h3>
<div class="spread">
	<svg
		class="patch"
		viewBox="-114 -110 228 224"
		aria-label={t(
			'A settlement, the three corners next to it that are blocked, and corners two steps away that are open'
		)}
	>
		{#each centers as c, i (i)}
			<polygon points={poly(c)} fill="#f4d48e" />
			<polygon
				points={poly(c, 0.9)}
				fill={TERRAIN_CSS[lands[i]]}
				stroke="rgba(40,20,8,0.35)"
				stroke-width="2"
			/>
		{/each}
		<line
			x1={home.x}
			y1={home.y}
			x2={road.x}
			y2={road.y}
			stroke="#1a0c05"
			stroke-width="12"
			stroke-linecap="round"
		/>
		<line
			x1={home.x}
			y1={home.y}
			x2={road.x}
			y2={road.y}
			stroke="#e04b35"
			stroke-width="7"
			stroke-linecap="round"
		/>
		{#each blocked as p, i (i)}
			<g transform="translate({p.x} {p.y})">
				<circle r="9" fill="#c2271d" stroke="#3a1008" stroke-width="2" />
				<path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#fff" stroke-width="2.6" stroke-linecap="round" />
			</g>
		{/each}
		{#each open as p, i (i)}
			<g transform="translate({p.x} {p.y})">
				<circle r="9" fill="#4f9a2a" stroke="#14300a" stroke-width="2" />
				<path
					d="M-4.5 0 L-1 3.5 L4.5 -3.5"
					fill="none"
					stroke="#fff"
					stroke-width="2.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</g>
		{/each}
		<image href={icons['settlement:red']} x={home.x - 30} y={home.y - 40} width="60" height="60" />
	</svg>
	<div>
		<p>
			<Rich
				text={t(
					"A settlement may never sit on a corner right next to another settlement or city, yours or anyone else's. There must always be at least {gap} between two towns."
				)}
				slots={{ gap }}
			/>
		</p>
		<p>
			<span class="dot red"></span> {t('blocked corners, one step away')}<br />
			<span class="dot green"></span> {t('the closest corners still open')}
		</p>
		<p>{t('The rule holds all game long, not only during setup.')}</p>
	</div>
</div>

<style>
	.snake {
		gap: 10px 16px;
	}
	.round {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.round .label {
		color: #8a6236;
	}
	.seats {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.shield {
		--s: 3px;
	}
	.arrow,
	.turnaround {
		font-family: var(--px);
		font-weight: 700;
		font-size: 24px;
		color: #8a6236;
	}
	.spread {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 18px;
		align-items: center;
	}
	.patch {
		width: 100%;
		height: auto;
		filter: drop-shadow(0 3px 0 rgba(90, 50, 20, 0.3));
	}
	.dot {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		margin-right: 4px;
		vertical-align: -1px;
	}
	.dot.red {
		background: #c2271d;
	}
	.dot.green {
		background: #4f9a2a;
	}
	@media (max-width: 760px) {
		.spread {
			grid-template-columns: 1fr;
		}
		.patch {
			max-width: 280px;
			margin: 0 auto;
		}
		.turnaround {
			transform: rotate(90deg);
		}
		.shield {
			--s: 2px;
		}
	}
</style>
