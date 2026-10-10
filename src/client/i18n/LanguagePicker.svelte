<script lang="ts">
	/** The language buttons, each written in its own language. */
	import { i18n, LANGUAGES, setLanguage, t } from './index.svelte';

	let { small = true }: { small?: boolean } = $props();
</script>

<div class="langs" role="group" aria-label={t('Language')}>
	{#each LANGUAGES as l (l.code)}
		<button class="btn" class:small class:on={i18n.lang === l.code} lang={l.code} onclick={() => setLanguage(l.code)}>{l.name}</button>
	{/each}
</div>

<style>
	/* Three to a row, the last row centred, so any number of languages lines up. */
	.langs {
		--gap: calc(var(--s) * 2);
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--gap);
	}
	.langs .btn {
		flex: 0 0 calc((100% - 2 * var(--gap)) / 3);
	}
</style>
