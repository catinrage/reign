<script lang="ts">
	import type { PlayerColor } from '../../../shared/rules/config';
	import { PIXEL } from '../pixel';
	import { t } from '../../i18n/index.svelte';

	/**
	 * Built into the plaque of the player whose turn it is: a pennant in their color jutting from
	 * its side, pointing at it (a tab under it on phones). The time left hangs under the turn banner.
	 */
	let { color }: { color: PlayerColor } = $props();
</script>

<span
	class="tab"
	style="--pennant: var(--art-pennant-{color}); --tab: var(--art-tab-{color})"
	title={t('Current turn')}><img class="icon-px" src={PIXEL.pointer} alt="" /></span
>

<style>
	/* Lies over the outline of the frame's left side, so pennant and frame are one piece. */
	.tab {
		position: absolute;
		top: 50%;
		right: calc(100% + var(--s) * 3);
		transform: translateY(-50%);
		display: grid;
		place-items: center;
		box-sizing: border-box;
		height: calc(var(--s) * 9);
		min-width: calc(var(--s) * 11);
		padding: 0 calc(var(--s) * 2) 0 var(--s);
		border-style: solid;
		border-width: calc(var(--s) * 2) var(--s) calc(var(--s) * 2) calc(var(--s) * 4);
		border-image: var(--pennant) 2 1 2 4 fill / calc(var(--s) * 2) var(--s) calc(var(--s) * 2)
			calc(var(--s) * 4) stretch;
	}
	.tab img {
		width: 10px;
		height: 14px;
	}
	@media (max-width: 900px) {
		/* Phones: the plaques sit in a row, so the tab hangs under the plaque, over its outline. */
		.tab {
			top: calc(100% + var(--s) * 3);
			right: auto;
			left: 50%;
			transform: translateX(-50%);
			height: calc(var(--s) * 8);
			min-width: calc(var(--s) * 10);
			padding: 0;
			border-width: var(--s) var(--s) calc(var(--s) * 2) calc(var(--s) * 2);
			border-image: var(--tab) 1 1 2 2 fill / var(--s) var(--s) calc(var(--s) * 2)
				calc(var(--s) * 2) stretch;
		}
		.tab img {
			transform: rotate(-90deg);
		}
	}
</style>
