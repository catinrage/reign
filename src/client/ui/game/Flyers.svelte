<script lang="ts" module>
	import { getIcons } from '../../scene/icons';

	interface Flyer {
		id: number;
		src: string;
		x: number;
		y: number;
		tx: number;
		ty: number;
	}
	let list = $state<Flyer[]>([]);
	let nextId = 0;
	/** How long a card takes to fly to the hand (the `fly` animation below). */
	const FLIGHT_MS = 850;

	/** Resource icons that fly from the board into your hand. */
	export const flyers = {
		/** `onArrive` runs as the card reaches its slot in the hand. */
		add(resource: string, from: { x: number; y: number }, onArrive?: () => void) {
			const slot = document.querySelector(`[data-hand="${resource}"]`)?.getBoundingClientRect();
			const tx = slot ? slot.left + slot.width / 2 : window.innerWidth / 2;
			const ty = slot ? slot.top + slot.height / 2 : window.innerHeight - 60;
			const id = ++nextId;
			list = [...list, { id, src: getIcons().urls[resource], x: from.x, y: from.y, tx, ty }];
			setTimeout(() => onArrive?.(), FLIGHT_MS);
			setTimeout(() => (list = list.filter((f) => f.id !== id)), FLIGHT_MS + 50);
		}
	};
</script>

{#each list as f (f.id)}
	<img
		class="flyer icon-px"
		src={f.src}
		alt=""
		style="--x:{f.x}px; --y:{f.y}px; --tx:{f.tx}px; --ty:{f.ty}px"
	/>
{/each}

<style>
	.flyer {
		position: fixed;
		left: 0;
		top: 0;
		width: 54px;
		height: 54px;
		margin: -27px 0 0 -27px;
		z-index: 80;
		pointer-events: none;
		filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.5));
		animation: fly 0.85s cubic-bezier(0.5, 0, 0.7, 1) forwards;
	}
	@keyframes fly {
		0% {
			transform: translate(var(--x), var(--y)) scale(0.6);
			opacity: 0;
		}
		15% {
			transform: translate(var(--x), calc(var(--y) - 30px)) scale(1.2);
			opacity: 1;
		}
		100% {
			transform: translate(var(--tx), var(--ty)) scale(0.6);
			opacity: 0.9;
		}
	}
</style>
