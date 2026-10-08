<script lang="ts">
	let { count = 26 }: { count?: number } = $props();

	// Stable pseudo-random spread, so the embers don't jump around between renders.
	const r = (i: number, n: number) => {
		const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
		return v - Math.floor(v);
	};
	const COLORS = ['#ffe08a', '#ffb347', '#ff8a2a', '#ff6a1e'];
	const embers = $derived(
		Array.from({ length: count }, (_, i) => ({
			x: r(i, 1) * 100,
			delay: -r(i, 2) * 16,
			dur: 10 + r(i, 3) * 10,
			size: 2 + Math.floor(r(i, 4) * 2.5),
			drift: (r(i, 5) - 0.5) * 160,
			color: COLORS[Math.floor(r(i, 6) * COLORS.length)],
			flicker: 0.8 + r(i, 7) * 1.2
		}))
	);
</script>

<div class="embers" aria-hidden="true">
	{#each embers as e, i (i)}
		<i
			style="left:{e.x}%; --d:{e.dur}s; --delay:{e.delay}s; --sz:{e.size *
				3}px; --drift:{e.drift}px; --c:{e.color}; --f:{e.flicker}s"
		></i>
	{/each}
</div>

<style>
	.embers {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	i {
		position: absolute;
		bottom: -12px;
		width: var(--sz);
		height: var(--sz);
		background: var(--c);
		box-shadow:
			0 0 6px 1px var(--c),
			0 0 16px 4px rgba(255, 120, 30, 0.35);
		opacity: 0;
		animation:
			rise var(--d) linear var(--delay) infinite,
			flicker var(--f) ease-in-out infinite alternate;
	}
	@keyframes rise {
		0% {
			transform: translate(0, 0) rotate(0deg);
			opacity: 0;
		}
		8% {
			opacity: 1;
		}
		70% {
			opacity: 0.85;
		}
		100% {
			transform: translate(var(--drift), -108vh) rotate(200deg);
			opacity: 0;
		}
	}
	@keyframes flicker {
		to {
			scale: 0.55;
		}
	}
	:global(body.reduce-motion) .embers {
		display: none;
	}
</style>
