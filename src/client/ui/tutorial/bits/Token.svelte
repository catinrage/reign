<script lang="ts">
	import { pips } from '../../../../shared/rules/config';
	import { t } from '../../../i18n/index.svelte';

	/** A number token as it sits on a tile: the number, and a dot for each way two dice can roll it. */
	let { n, size = 34 }: { n: number; size?: number } = $props();
	const hot = $derived(n === 6 || n === 8);
</script>

<span class="token" class:hot style="--size:{size}px" title={t('{ways} in 36 rolls', { ways: pips(n) })}>
	<span class="n">{n}</span>
	<span class="dots"
		>{#each Array(pips(n)) as _, i (i)}<i></i>{/each}</span
	>
</span>

<style>
	.token {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: var(--size);
		height: var(--size);
		flex: none;
		border-radius: 50%;
		background: radial-gradient(circle at 50% 35%, #fff6e2, #ecd3a0 70%);
		box-shadow:
			inset 0 -3px 0 rgba(120, 80, 40, 0.35),
			0 2px 0 #7a5232,
			0 3px 4px rgba(0, 0, 0, 0.35);
		color: #3a2214;
		font-family: var(--px);
		font-weight: 700;
		line-height: 1;
	}
	.n {
		font-size: calc(var(--size) * 0.5);
		margin-top: 2px;
	}
	.hot {
		color: #c2271d;
	}
	.dots {
		display: flex;
		gap: 1px;
		margin-top: 2px;
		height: 3px;
	}
	.dots i {
		width: 3px;
		height: 3px;
		background: currentColor;
	}
</style>
