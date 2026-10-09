<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	/** A room code as five wooden letter tiles. Editable on the main menu, read-only in the lobby. */
	let {
		value = $bindable(''),
		editable = false,
		onenter = undefined,
		size = 'normal'
	}: {
		value?: string;
		editable?: boolean;
		onenter?: () => void;
		size?: 'normal' | 'big';
	} = $props();

	let focused = $state(false);
	const LEN = 5;
</script>

<label class="tiles {size}" class:editable class:focused>
	{#if editable}
		<input
			bind:value
			maxlength={LEN}
			autocomplete="off"
			autocapitalize="characters"
			spellcheck="false"
			aria-label={t('Room code')}
			oninput={() =>
				(value = value
					.toUpperCase()
					.replace(/[^A-Z]/g, '')
					.slice(0, LEN))}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			onkeydown={(e) => e.key === 'Enter' && onenter?.()}
		/>
	{/if}
	{#each Array(LEN) as _, i (i)}
		<span
			class="tile"
			class:filled={!!value[i]}
			class:cursor={editable && focused && i === Math.min(value.length, LEN - 1)}
		>
			{#key value[i]}<b>{value[i] ?? ''}</b>{/key}
		</span>
	{/each}
</label>

<style>
	.tiles {
		--t: calc(var(--s) * 12);
		position: relative;
		display: inline-flex;
		gap: calc(var(--s) * 1.5);
		pointer-events: auto;
	}
	.tiles.big {
		--t: calc(var(--s) * 15);
	}
	input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		border: none;
		padding: 0;
		margin: 0;
		font-size: 16px;
		caret-color: transparent;
		cursor: text;
		z-index: 2;
	}
	.tile {
		position: relative;
		width: var(--t);
		height: calc(var(--t) * 1.1);
		box-sizing: border-box;
		display: grid;
		place-items: center;
		border-style: solid;
		border-width: calc(var(--s) * 4) calc(var(--s) * 3);
		border-image: var(--art-btn-wood) 5 4 fill / calc(var(--s) * 4) calc(var(--s) * 3) stretch;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.35));
		transition: transform 0.12s;
	}
	.tile.filled {
		border-image-source: var(--art-btn-gold);
	}
	.tile b {
		font-family: var(--px);
		font-weight: 700;
		font-size: calc(var(--t) * 0.52);
		line-height: 1;
		color: #3a1d04;
		text-shadow: 0 2px 0 rgba(255, 246, 200, 0.6);
		animation: pop-in 0.18s ease-out;
	}
	.editable .tile:not(.filled) {
		opacity: 0.85;
	}
	.tile.cursor {
		transform: translateY(-3px);
	}
	.tile.cursor::after {
		content: '';
		position: absolute;
		left: 18%;
		right: 18%;
		bottom: 14%;
		height: var(--s);
		background: #ffe08a;
		box-shadow: 0 0 6px #ffcc55;
		animation: blink 1s steps(2) infinite;
	}
	.tile.filled.cursor::after {
		background: #6a3a10;
		box-shadow: none;
	}
	.focused .tile {
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.35)) drop-shadow(0 0 5px rgba(255, 210, 90, 0.55));
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
