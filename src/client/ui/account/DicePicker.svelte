<script lang="ts">
	import { DICE_BLURBS, DICE_NAMES, DICE_STYLES, type DiceStyleId } from '../../../shared/accounts';
	import { t } from '../../i18n/index.svelte';
	import { dieFace } from '../art';

	/** The dice a player throws: each style as a pair of faces, the 1 and the 5. */
	let { value = $bindable() }: { value: DiceStyleId } = $props();
</script>

<div class="picker" role="radiogroup" aria-label={t('Dice')}>
	{#each DICE_STYLES as d (d)}
		<button
			type="button"
			class="pick"
			class:on={value === d}
			role="radio"
			aria-checked={value === d}
			aria-label={t(DICE_NAMES[d])}
			title={t(DICE_BLURBS[d])}
			data-tip-head={t(DICE_NAMES[d])}
			onclick={() => (value = d)}
		>
			<span class="die" style="background-image: {dieFace(1, d)}; --r:-6deg"></span>
			<span class="die" style="background-image: {dieFace(5, d)}; --r:8deg"></span>
		</button>
	{/each}
</div>

<style>
	.picker {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		justify-items: center;
	}
	.pick {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		position: relative;
		display: flex;
		gap: 3px;
		padding: 5px 4px;
		transition:
			transform 0.1s,
			filter 0.12s;
		filter: saturate(0.75) brightness(0.88);
	}
	.pick:hover {
		filter: none;
		transform: translateY(-2px);
	}
	.pick.on {
		filter: drop-shadow(0 0 6px rgba(255, 210, 90, 0.95));
		transform: translateY(-2px) scale(1.06);
	}
	.pick.on::after {
		content: '';
		position: absolute;
		inset: -2px;
		border: calc(var(--s) * 1) solid #ffd86b;
		pointer-events: none;
	}
	.pick:focus-visible {
		outline: 2px solid #ffd86b;
	}
	.die {
		width: 26px;
		height: 26px;
		background: center / 100% 100% no-repeat;
		transform: rotate(var(--r));
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45));
	}
</style>
