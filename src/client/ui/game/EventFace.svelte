<script lang="ts">
	import { EVENT_INFO, TONE_LABEL, type EventCard } from '../../../shared/rules/events';
	import { EVENT_ART, TONE_COLOR } from './eventArt';

	/** An event card's face: its picture, tone, name and what it does. */
	let { card, size = 180, text = true }: { card: EventCard; size?: number; text?: boolean } = $props();
	const info = $derived(EVENT_INFO[card]);
</script>

<div class="ecard" style="--tone:{TONE_COLOR[info.tone]}; --w:{size}px">
	<span class="tone">{TONE_LABEL[info.tone]}</span>
	<span class="art"><img src={EVENT_ART[card]} alt="" /></span>
	<span class="name title">{info.name}</span>
	{#if text}<span class="text">{info.text}</span>{/if}
</div>

<style>
	.ecard {
		width: var(--w);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--w) * 0.035);
		padding: calc(var(--w) * 0.07) calc(var(--w) * 0.07) calc(var(--w) * 0.09);
		background: linear-gradient(#f6e3bd, #e6c995);
		border: 4px solid var(--tone);
		box-shadow:
			0 0 0 3px #2a1a10,
			inset 0 0 0 3px rgba(255, 255, 255, 0.35),
			0 10px 24px rgba(0, 0, 0, 0.55);
		color: #3a2416;
		text-align: center;
	}
	/* Side by side (the Royal Decree's pick), cards grow to the tallest one. */
	:global(.choice) > .ecard {
		height: 100%;
	}
	.tone {
		font-family: var(--px);
		font-weight: 700;
		font-size: max(8px, calc(var(--w) * 0.065));
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #fff;
		background: var(--tone);
		padding: 1px 8px;
		box-shadow: 0 2px 0 #2a1a10;
	}
	.art {
		display: grid;
		place-items: center;
		width: 72%;
		aspect-ratio: 1.25;
		background: radial-gradient(ellipse, #fff6e0, #d9b98a);
		box-shadow: inset 0 0 0 2px #2a1a10;
	}
	.art img {
		width: 70%;
		image-rendering: pixelated;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.35));
	}
	.name {
		font-size: max(12px, calc(var(--w) * 0.1));
		line-height: 1.1;
		color: #2a1a10;
		text-shadow: none;
	}
	.text {
		font-size: calc(max(12px, var(--w) * 0.068));
		line-height: 1.3;
	}
</style>
