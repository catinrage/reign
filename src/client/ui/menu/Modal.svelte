<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PIXEL } from '../pixel';

	let {
		title,
		ribbon = 'gold',
		frame = 'panel',
		width = 440,
		onclose = undefined,
		children
	}: {
		title: string;
		/** Ribbon color: gold, crimson, wood or a player color. */
		ribbon?: string;
		frame?: 'panel' | 'parch';
		width?: number;
		onclose?: () => void;
		children: Snippet;
	} = $props();
</script>

<div
	class="modal-backdrop"
	role="presentation"
	onclick={(e) => onclose && e.target === e.currentTarget && onclose()}
>
	<div class="modal" role="dialog" aria-label={title} style="--w:{width}px">
		<div class="ribbon" style="--rib: var(--art-ribbon-{ribbon})">{title}</div>
		{#if onclose}
			<button class="icon-btn close" onclick={onclose} aria-label="Close"
				><img src={PIXEL.close} alt="" /></button
			>
		{/if}
		<div class="frame {frame}">
			<div class="body">{@render children()}</div>
		</div>
	</div>
</div>
