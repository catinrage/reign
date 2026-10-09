<script lang="ts" module>
	import { getIcons } from '../../scene/icons';

	type Point = { x: number; y: number };

	interface Flyer {
		id: number;
		src: string;
		x: number;
		y: number;
		tx: number;
		ty: number;
		/** Scale the icon shrinks to as it lands. */
		end: number;
	}
	let list = $state<Flyer[]>([]);
	let nextId = 0;
	/** How long a card takes to fly to its hand (the `fly` animation below). */
	const FLIGHT_MS = 850;

	/** The middle of the first of these elements that is on screen. */
	function centerOf(...selectors: string[]): Point | null {
		for (const sel of selectors) {
			const r = document.querySelector(sel)?.getBoundingClientRect();
			if (r && r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		}
		return null;
	}

	function launch(resource: string, from: Point, to: Point, end: number, onArrive?: () => void) {
		const id = ++nextId;
		list = [...list, { id, src: getIcons().urls[resource], x: from.x, y: from.y, tx: to.x, ty: to.y, end }];
		setTimeout(() => onArrive?.(), FLIGHT_MS);
		setTimeout(() => (list = list.filter((f) => f.id !== id)), FLIGHT_MS + 50);
	}

	/** Resource icons that fly from the board to the player who got them. */
	export const flyers = {
		/** Into your hand. `onArrive` runs as the card reaches its slot. */
		add(resource: string, from: Point, onArrive?: () => void) {
			const to = centerOf(`[data-hand="${resource}"]`) ?? { x: window.innerWidth / 2, y: window.innerHeight - 60 };
			launch(resource, from, to, 0.6, onArrive);
		},
		/**
		 * Onto another player's plaque, landing on their card count (or on the plaque, where a
		 * narrow screen hides the count). `onArrive` runs as it lands.
		 */
		toPlayer(player: number, resource: string, from: Point, onArrive?: () => void) {
			const to = centerOf(`[data-plaque-cards="${player}"]`, `[data-plaque="${player}"]`);
			if (to) launch(resource, from, to, 0.34, onArrive);
			else onArrive?.();
		}
	};
</script>

{#each list as f (f.id)}
	<img
		class="flyer icon-px"
		src={f.src}
		alt=""
		style="--x:{f.x}px; --y:{f.y}px; --tx:{f.tx}px; --ty:{f.ty}px; --end:{f.end}"
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
			transform: translate(var(--tx), var(--ty)) scale(var(--end));
			opacity: 0.9;
		}
	}
</style>
