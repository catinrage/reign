<script lang="ts">
	import { t } from '../../i18n/index.svelte';

	/**
	 * A whole number the host steps down or up, or types. Anything out of range snaps to the
	 * nearest end; for everyone else it's just the number.
	 */
	let {
		value,
		min,
		max,
		label,
		readonly = false,
		/** The lowest a minus press can reach, if higher than `min` (e.g. the deck's last card). */
		floor = min,
		onset
	}: {
		value: number;
		min: number;
		max: number;
		label: string;
		readonly?: boolean;
		floor?: number;
		onset: (n: number) => void;
	} = $props();

	function typed(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const n = Math.round(Number(input.value));
		if (input.value.trim() && Number.isFinite(n)) {
			const clamped = Math.max(min, Math.min(max, n));
			if (clamped !== value) onset(clamped);
			input.value = String(clamped);
		} else input.value = String(value);
	}
</script>

{#if readonly}
	<span class="value">{value}</span>
{:else}
	<span class="stepper">
		<button
			class="btn small"
			aria-label={t('Fewer: {what}', { what: label })}
			disabled={value <= Math.max(min, floor)}
			onclick={() => onset(value - 1)}>−</button
		>
		<input
			class="input"
			type="number"
			inputmode="numeric"
			{min}
			{max}
			aria-label={label}
			title={t('{min} to {max}', { min, max })}
			{value}
			onchange={typed}
			onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
		/>
		<button class="btn small" aria-label={t('More: {what}', { what: label })} disabled={value >= max} onclick={() => onset(value + 1)}
			>+</button
		>
	</span>
{/if}

<style>
	.stepper {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: none;
	}
	.stepper .btn {
		min-width: 38px;
	}
	input {
		width: 52px;
		height: calc(var(--s) * 11);
		padding: 0 2px;
		box-sizing: border-box;
		text-align: center;
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	input::-webkit-inner-spin-button,
	input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.value {
		flex: none;
		min-width: 40px;
		text-align: right;
		font-family: var(--px);
		font-weight: 700;
		font-size: 17px;
		color: var(--gold);
	}
</style>
