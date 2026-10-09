<script lang="ts">
	import { AVATARS, AVATAR_NAMES, type AvatarId } from '../../../shared/accounts';
	import { t } from '../../i18n/index.svelte';
	import Avatar from './Avatar.svelte';

	let { value = $bindable(), size = 58 }: { value: AvatarId; size?: number } = $props();
</script>

<div class="picker" role="radiogroup" aria-label={t('Avatar')}>
	{#each AVATARS as a (a)}
		<button
			type="button"
			class="pick"
			class:on={value === a}
			role="radio"
			aria-checked={value === a}
			title={t(AVATAR_NAMES[a])}
			onclick={() => (value = a)}
		>
			<Avatar id={a} {size} />
		</button>
	{/each}
</div>

<style>
	.picker {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
		gap: 6px;
		justify-items: center;
	}
	.pick {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		position: relative;
		padding: 2px;
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
</style>
