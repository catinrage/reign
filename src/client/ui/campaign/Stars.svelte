<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { PIXEL } from '../pixel';

	/** A row of stars, `n` of `of` lit. `pop` lights them one after another, as they are won. */
	let { n, of = 3, size = 16, pop = false }: { n: number; of?: number; size?: number; pop?: boolean } = $props();
</script>

<span class="stars" style="--size:{size}px" title={of > 1 ? t('{n, plural, one {# star} other {# stars}} of {of}', { n, of }) : undefined}>
	{#each Array(of) as _, i (i)}
		<img class="icon-px" class:lit={i < n} class:pop style="--i:{i}" src={PIXEL.star} alt="" />
	{/each}
</span>

<style>
	.stars {
		display: inline-flex;
		gap: 1px;
		flex: none;
	}
	img {
		width: var(--size);
		height: var(--size);
		filter: grayscale(1) brightness(0.55);
		opacity: 0.55;
	}
	img.lit {
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.45));
		opacity: 1;
	}
	img.lit.pop {
		animation: star-pop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) both;
		animation-delay: calc(0.5s + var(--i) * 0.35s);
	}
	@keyframes star-pop {
		from {
			transform: scale(0) rotate(-40deg);
			opacity: 0;
		}
	}
</style>
