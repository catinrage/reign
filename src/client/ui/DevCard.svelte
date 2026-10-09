<script lang="ts">
	import { DEV_CARD_LABEL, DEV_CARD_TEXT, type DevCardType } from '../../shared/rules/config';
	import { PIXEL } from './pixel';

	/** Names short enough to fit under the art. */
	const SHORT: Record<DevCardType, string> = {
		knight: 'Knight',
		roadBuilding: 'Roads',
		yearOfPlenty: 'Plenty',
		monopoly: 'Monopoly',
		victoryPoint: '+1 Point'
	};

	let {
		type,
		count,
		size = 58,
		playable = false,
		waiting = 0,
		onclick = undefined
	}: {
		type: DevCardType;
		count: number;
		size?: number;
		/** It can be played right now: it glows and a click plays it. */
		playable?: boolean;
		/** How many were bought this turn, so they can only be played from the next. */
		waiting?: number;
		onclick?: () => void;
	} = $props();
	// One pixel of card art: whole device pixels keep the frame crisp.
	const px = $derived(size >= 56 ? 3 : 2);
	const secret = $derived(type === 'victoryPoint');
	const title = $derived(
		secret
			? 'Victory Point: secret. Only you can see it, and it counts toward your points.'
			: `${DEV_CARD_LABEL[type]}: ${DEV_CARD_TEXT[type]}` +
					(playable ? ' Click to play it.' : waiting ? ' Bought this turn: play it from your next.' : '')
	);
</script>

<button
	class="card"
	class:dim={count === 0}
	class:playable
	style="--w:{size}px; --cp:{px}px"
	disabled={!playable}
	{onclick}
	{title}
>
	<span class="art"><img src={PIXEL[type]} alt={DEV_CARD_LABEL[type]} draggable="false" /></span>
	<span class="name">{SHORT[type]}</span>
	{#if count > 0}<span class="count">{count}</span>{/if}
	{#if secret && count > 0}<span class="lock"><img src={PIXEL.lock} alt="Secret" /></span>{/if}
</button>

<style>
	/* Built like the resource cards, with a violet face for the development deck. */
	.card {
		position: relative;
		width: var(--w);
		height: calc(var(--w) * 1.36);
		box-sizing: border-box;
		padding: 0;
		margin: 0;
		border-style: solid;
		border-width: calc(var(--cp) * 3);
		border-image: var(--art-card) 3 fill / calc(var(--cp) * 3) stretch;
		background: none;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: calc(var(--cp) * 1);
		font: inherit;
		color: var(--ink);
		cursor: default;
		filter: drop-shadow(0 3px 0 rgba(40, 20, 8, 0.55)) drop-shadow(0 6px 8px rgba(0, 0, 0, 0.3));
		transition:
			transform 0.14s,
			filter 0.2s;
		pointer-events: auto;
	}
	.card:disabled {
		opacity: 1;
	}
	.art {
		flex: 1;
		min-height: 0;
		position: relative;
		background:
			radial-gradient(circle at 50% 40%, rgba(214, 190, 255, 0.45), transparent 70%),
			conic-gradient(from 45deg, #5b3a9a 25%, #4c2f86 0 50%, #5b3a9a 0 75%, #4c2f86 0) 0 0 /
				calc(var(--cp) * 4) calc(var(--cp) * 4);
		box-shadow:
			inset 0 0 0 var(--cp) rgba(26, 11, 48, 0.7),
			inset 0 calc(var(--cp) * 2) 0 rgba(255, 255, 255, 0.18),
			inset 0 calc(var(--cp) * -3) 0 rgba(0, 0, 0, 0.25);
		display: grid;
		place-items: center;
		overflow: hidden;
	}
	.art img {
		width: 82%;
		image-rendering: pixelated;
		filter: drop-shadow(0 calc(var(--cp) * 1) 0 rgba(0, 0, 0, 0.45));
	}
	.name {
		font-family: var(--px);
		font-size: calc(var(--w) * 0.17);
		font-weight: 700;
		text-align: center;
		line-height: 1;
		padding-bottom: 1px;
		white-space: nowrap;
	}
	.count {
		position: absolute;
		top: calc(var(--w) * -0.2);
		right: calc(var(--w) * -0.2);
		width: calc(var(--cp) * 12);
		height: calc(var(--cp) * 12);
		background: var(--art-badge) center / 100% 100%;
		color: #fff3d6;
		font-family: var(--px);
		font-weight: 700;
		font-size: calc(var(--cp) * 6.5);
		line-height: 1;
		display: grid;
		place-items: center;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	/* Victory points stay in your hand, face down to everyone else. */
	.lock {
		position: absolute;
		left: calc(var(--cp) * -2);
		bottom: calc(var(--cp) * 6);
		display: grid;
		place-items: center;
		width: calc(var(--cp) * 9);
		height: calc(var(--cp) * 10);
		background: var(--art-badge) center / 100% 100%;
	}
	.lock img {
		width: calc(var(--cp) * 4.2);
		image-rendering: pixelated;
	}
	.playable {
		cursor: pointer;
		animation: ready 1.6s ease-in-out infinite;
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 3px #ffd45a)
			drop-shadow(0 0 7px rgba(255, 200, 80, 0.9));
	}
	.playable:hover {
		animation: none;
		transform: translateY(-6px);
	}
	@keyframes ready {
		50% {
			transform: translateY(-4px);
		}
	}
	.dim {
		filter: grayscale(0.85) brightness(0.62) drop-shadow(0 3px 0 rgba(40, 20, 8, 0.55));
	}
</style>
