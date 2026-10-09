<script lang="ts">
	/**
	 * A translated sentence with markup in it. `text` comes from t() with its {slots} left
	 * open; each slot is filled with a snippet (a name chip, a bold number, an icon) or text:
	 *
	 *   <Rich text={t('Pay {cost} to pave a road')} slots={{ cost }} />
	 *   {#snippet cost()}<b>2 cards</b>{/snippet}
	 */
	import type { Snippet } from 'svelte';

	let { text, slots = {} }: { text: string; slots?: Record<string, Snippet | string | number> } = $props();
	const pieces = $derived(text.split(/(\{\w+\})/).filter(Boolean));
</script>

{#each pieces as piece, i (i)}
	{@const m = /^\{(\w+)\}$/.exec(piece)}
	{@const slot = m ? slots[m[1]] : undefined}
	{#if slot === undefined}{piece}{:else if typeof slot === 'function'}{@render slot()}{:else}{slot}{/if}
{/each}
