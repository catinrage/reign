<script lang="ts">
	import { PIGEON } from '../pigeon';
	import { sfx } from '../sound';
	import { loft } from './pigeons.svelte';
	import { t } from '../../i18n/index.svelte';

	/** The pigeon loft: opens the pigeon post. Only shown when there is someone to write to. */
	const unread = $derived(loft.unread);

	function toggle() {
		(loft.open ? sfx.close : sfx.open)();
		loft.open = !loft.open;
	}
</script>

{#if loft.people.length}
	<button
		class="icon-btn loft-btn"
		class:on={loft.open}
		bind:this={loft.button}
		onclick={toggle}
		aria-label={unread ? t('{n, plural, one {Pigeon post, # unread} other {Pigeon post, # unread}}', { n: unread }) : t('Pigeon post')}
		aria-expanded={loft.open}
		title={t('Pigeon post: private notes only the reader sees')}
		><img src={PIGEON.perched} alt="" />{#if unread}<span class="badge">{unread}</span>{/if}</button
	>
{/if}

<style>
	.loft-btn {
		position: relative;
	}
	.loft-btn img {
		width: calc(var(--s) * 10);
		height: auto;
	}
	.loft-btn.on {
		filter: brightness(1.25) sepia(0.3);
	}
	.badge {
		position: absolute;
		top: calc(var(--s) * -4);
		right: calc(var(--s) * -4);
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: #c2372b;
		box-shadow:
			0 0 0 2px #2a1a10,
			0 2px 0 2px rgba(0, 0, 0, 0.4);
		color: #fff;
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		line-height: 1;
		animation: pop-in 0.3s;
	}
</style>
