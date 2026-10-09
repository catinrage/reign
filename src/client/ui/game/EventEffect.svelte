<script lang="ts">
	import { EVENT_EFFECT_MS, EVENT_INFO, type EventCard } from '../../../shared/rules/events';
	import type { GameEvent, GameView } from '../../../shared/rules/types';
	import { client } from '../../state/client.svelte';
	import { sceneRef } from '../sceneRef';
	import { sfx } from '../sound';
	import { EVENT_ART, TONE_COLOR } from './eventArt';

	/**
	 * Reign Extended: what an event card does, played out for everyone once it is put down, so
	 * nobody has to read the chronicle to find out. A headline says what happened, the island
	 * shows it (see GameScene.presentEvent), rats run off with the cards they ate, rain sweeps the
	 * screen in a storm, the table shakes in an earthquake, and each player's plaque shows what they
	 * lost or got. Play waits until it is over (`client.presented`).
	 */

	interface Shown {
		seq: number;
		card: EventCard;
		head: string;
		line: string;
		/** Cards each player lost (negative) or got, by seat. */
		change: { player: number; n: number; x: number; y: number }[];
	}
	let shown = $state<Shown | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let playedFor = -1;

	$effect(() => {
		const p = client.presenting;
		if (!p || p.phase !== 'effect' || p.seq === playedFor) return;
		playedFor = p.seq;
		// The newest state: what the card did is public, and the interface may still be holding an
		// older one for dice in the air.
		const view = client.latest ?? client.view;
		if (!view) return client.presented(p.seq);
		play(view, p.seq, p.card, p.by);
	});

	/** What the card did: the events it logged after it turned over, up to the next card. */
	function aftermath(view: GameView, seq: number): GameEvent[] {
		const out: GameEvent[] = [];
		for (const e of view.log) {
			if (e.seq <= seq) continue;
			if (e.type === 'eventDrawn') break;
			out.push(e);
		}
		return out;
	}

	function play(view: GameView, seq: number, card: EventCard, by?: number) {
		const after = aftermath(view, seq);
		const moved = after.find((e) => e.type === 'eventCards');
		const moves = moved?.type === 'eventCards' ? moved.moves : [];
		const name = (p: number) => (p === view.me ? 'you' : (view.players[p]?.name ?? 'someone'));
		const Name = (p: number) => (p === view.me ? 'You' : (view.players[p]?.name ?? 'Someone'));
		const cards = (n: number) => (n === 1 ? '1 card' : `${n} cards`);
		const losers = [...new Set(moves.flatMap((m) => (m.from !== null ? [m.from] : [])))];
		let line = '';
		switch (card) {
			case 'royalWedding':
				line = moves.length ? `${Name(moves[0].to!)} ${moves[0].to === view.me ? 'get' : 'gets'} ${cards(moves.length)} as wedding gifts` : 'Nobody had a gift to give';
				break;
			case 'royalDecree': {
				const chooser = view.events?.choice?.player;
				line = chooser === undefined ? 'The crown picks this round' : `${Name(chooser)} ${chooser === view.me ? 'pick' : 'picks'} this round's event`;
				break;
			}
			case 'tournament':
				line = moved?.type === 'eventCards' && moved.champion !== undefined ? `${Name(moved.champion)} ${moved.champion === view.me ? 'win' : 'wins'} and ${moved.champion === view.me ? 'take' : 'takes'} ${cards(moves.length)}` : 'Nobody leads the knights: no champion';
				break;
			case 'plagueOfRats':
				line = moves.length ? `Rats ate ${cards(moves.length)} from ${losers.map(name).join(', ')}` : 'The rats found nothing to eat';
				break;
			case 'taxCollector':
				line = moves.length ? `The Tax Collector took ${cards(moves.length)} from ${losers.map(name).join(', ')}` : 'No cities to tax';
				break;
			case 'banditUprising': {
				const hex = moved?.type === 'eventCards' ? moved.hex : undefined;
				const num = hex !== undefined ? view.board.hexes[hex]?.number : null;
				line = `Bandits raid the ${num ?? 'busiest tile'}${moves.length ? ` and take ${cards(moves.length)}` : ''}`;
				break;
			}
			case 'earthquake': {
				const quake = after.find((e) => e.type === 'earthquake');
				const [a, b] = quake?.type === 'earthquake' ? quake.hexes.map((h) => view.board.hexes[h]?.number) : [];
				line = a ? `The ${a} and the ${b} swap tiles for good` : 'The ground shakes';
				break;
			}
			case 'harvestFestival':
				line = 'Fields pay double this round';
				break;
			case 'bountifulYear':
				line = 'Everyone takes a free card from the bank';
				break;
			case 'travelingFair':
				line = 'Trade 2:1 with the bank this round';
				break;
			case 'migratingHerds':
				line = 'Pastures pay on a 7 this round';
				break;
			case 'comet':
				line = 'The next roll pays double';
				break;
			case 'stormAtSea':
				line = 'Harbors are closed this round';
				break;
		}
		// Each plaque says what its player lost or got.
		const net = new Map<number, number>();
		for (const m of moves) {
			if (m.from !== null) net.set(m.from, (net.get(m.from) ?? 0) - 1);
			if (m.to !== null) net.set(m.to, (net.get(m.to) ?? 0) + 1);
		}
		const change = [...net].flatMap(([player, n]) => {
			// Beside the plaque, on the side towards the middle of the screen.
			const r = document.querySelector(`[data-plaque="${player}"]`)?.getBoundingClientRect();
			if (!n || !r || !r.width) return [];
			const left = r.left + r.width / 2 > window.innerWidth / 2;
			const wide = r.height < r.width / 2;
			return [{ player, n, x: wide ? (left ? r.left - 34 : r.right + 34) : r.left + r.width / 2, y: wide ? r.top + r.height / 2 : r.bottom + 22 }];
		});
		const head = by !== undefined ? `${EVENT_INFO[card].name}, decreed by ${name(by)}` : EVENT_INFO[card].name;
		shown = { seq, card, head, line, change };
		sound(card, moves.length > 0);
		// The island plays its part once the scene has the new state.
		setTimeout(() => sceneRef.current?.presentEvent(card), 0);
		if (card === 'earthquake') shake();
		clearTimeout(timer);
		const ms = (window as { __effectMs?: number }).__effectMs ?? EVENT_EFFECT_MS;
		timer = setTimeout(() => {
			if (shown?.seq === seq) shown = null;
			client.presented(seq);
		}, ms);
	}

	function sound(card: EventCard, moved: boolean) {
		switch (card) {
			case 'earthquake':
			case 'banditUprising':
			case 'stormAtSea':
				return sfx.robber();
			case 'plagueOfRats':
			case 'taxCollector':
				return moved ? undefined : sfx.pop(); // the stolen cards make their own sound
			case 'royalWedding':
			case 'tournament':
			case 'royalDecree':
				return sfx.horn();
			case 'travelingFair':
				return sfx.trade();
			default:
				return sfx.coin();
		}
	}

	/** The whole table shakes in an earthquake. */
	function shake() {
		const el = document.querySelector('.hud');
		el?.animate(
			[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({
				transform: k === 8 ? 'none' : `translate(${(k % 2 ? -1 : 1) * (9 - k)}px, ${((k % 3) - 1) * (9 - k) * 0.5}px)`
			})),
			{ duration: 900, easing: 'linear' }
		);
	}

	/** Little things that run, fall or float across the screen for some cards. */
	const runners = Array.from({ length: 9 }, (_, i) => ({
		delay: (i * 0.23 + (i % 3) * 0.11).toFixed(2),
		y: 58 + ((i * 37) % 30),
		size: 46 + ((i * 13) % 22)
	}));
	const drops = Array.from({ length: 36 }, (_, i) => ({
		x: (i * 53) % 100,
		delay: ((i * 0.137) % 1.6).toFixed(2),
		spin: (i % 2 ? 1 : -1) * (180 + ((i * 67) % 360)),
		hue: ['#ffd75e', '#e04b35', '#5fb43b', '#6fd3ff', '#fff3b0', '#f08ad0'][i % 6]
	}));
</script>

{#if shown}
	{@const info = EVENT_INFO[shown.card]}
	{#key shown.seq}
		<div class="effect {shown.card}" aria-live="polite">
			{#if shown.card === 'stormAtSea'}
				<div class="rain"></div>
				<div class="bolt"></div>
			{:else if shown.card === 'banditUprising' || shown.card === 'earthquake'}
				<div class="red"></div>
			{:else if shown.card === 'comet'}
				<img class="comet" src={EVENT_ART.comet} alt="" />
				<div class="bolt white"></div>
			{/if}
			{#if shown.card === 'plagueOfRats' || shown.card === 'migratingHerds'}
				{#each runners as r, i (i)}
					<img
						class="runner"
						class:right={shown.card === 'migratingHerds'}
						src={EVENT_ART[shown.card]}
						alt=""
						style="--d:{r.delay}s; --y:{r.y}vh; --s:{r.size}px"
					/>
				{/each}
			{:else if shown.card === 'taxCollector' || shown.card === 'bountifulYear' || shown.card === 'harvestFestival' || shown.card === 'travelingFair' || shown.card === 'tournament' || shown.card === 'royalWedding'}
				{#each drops as d, i (i)}
					{#if shown.card === 'royalWedding' || shown.card === 'taxCollector'}
						<img class="drop sprite" src={EVENT_ART[shown.card]} alt="" style="--x:{d.x}vw; --d:{d.delay}s; --spin:{d.spin / 6}deg" />
					{:else}
						<span class="drop" style="--x:{d.x}vw; --d:{d.delay}s; --spin:{d.spin}deg; --c:{d.hue}"></span>
					{/if}
				{/each}
			{/if}
			<div class="headline plaque" style="--tone:{TONE_COLOR[info.tone]}">
				<img src={EVENT_ART[shown.card]} alt="" />
				<span class="words">
					<span class="name title">{shown.head}</span>
					<span class="line">{shown.line}</span>
				</span>
			</div>
			{#each shown.change as c (c.player)}
				<span class="delta" class:gain={c.n > 0} style="--x:{c.x}px; --y:{c.y}px">{c.n > 0 ? `+${c.n}` : c.n}</span>
			{/each}
		</div>
	{/key}
{/if}

<style>
	.effect {
		position: absolute;
		inset: 0;
		z-index: 38;
		pointer-events: none;
		overflow: hidden;
	}
	.headline {
		--tone: var(--gold);
		position: absolute;
		top: 22%;
		left: 50%;
		display: flex;
		align-items: center;
		gap: 14px;
		max-width: min(640px, calc(100vw - 24px));
		padding: 8px 20px 10px 12px;
		box-shadow:
			inset 0 0 0 3px var(--tone),
			0 10px 30px rgba(0, 0, 0, 0.6);
		transform: translateX(-50%);
		animation:
			headline-in 0.45s cubic-bezier(0.2, 1.3, 0.4, 1) both,
			headline-out 0.4s ease-in 2.4s forwards;
	}
	.headline img {
		width: 64px;
		height: 64px;
		flex: none;
		image-rendering: pixelated;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.5));
		animation: bob 0.6s ease-in-out infinite alternate;
	}
	.words {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 26px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.line {
		font-size: 17px;
		font-weight: 700;
		color: #f6e3bd;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	@keyframes headline-in {
		from {
			transform: translate(-50%, -40px) scale(0.7);
			opacity: 0;
		}
	}
	@keyframes headline-out {
		to {
			transform: translate(-50%, -20px);
			opacity: 0;
		}
	}
	@keyframes bob {
		to {
			transform: translateY(-5px) rotate(-4deg);
		}
	}

	/* What each player lost (red) or got (green), rising off their plaque. */
	.delta {
		position: fixed;
		left: var(--x);
		top: var(--y);
		font-family: var(--px);
		font-weight: 700;
		font-size: 30px;
		color: #ff8a6a;
		text-shadow: var(--outline-dark);
		transform: translate(-50%, -50%);
		animation: delta 2.6s ease-out 0.3s both;
	}
	.delta.gain {
		color: #9be36a;
	}
	@keyframes delta {
		0% {
			transform: translate(-50%, -50%) scale(0.4);
			opacity: 0;
		}
		15% {
			transform: translate(-50%, -70%) scale(1.25);
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		100% {
			transform: translate(-50%, -150%) scale(1);
			opacity: 0;
		}
	}

	/* Rats scurry across the bottom of the screen; sheep trot the other way. */
	.runner {
		position: absolute;
		left: 100%;
		top: var(--y);
		width: var(--s);
		height: var(--s);
		image-rendering: pixelated;
		filter: drop-shadow(0 4px 2px rgba(0, 0, 0, 0.5));
		animation:
			run-left 2.2s linear var(--d) both,
			hop 0.22s ease-in-out infinite alternate;
	}
	.runner.right {
		left: auto;
		right: 100%;
		animation:
			run-right 2.2s linear var(--d) both,
			hop 0.3s ease-in-out infinite alternate;
	}
	@keyframes run-left {
		from {
			translate: 0 0;
		}
		to {
			translate: calc(-100vw - 120px) 0;
		}
	}
	@keyframes run-right {
		from {
			translate: 0 0;
		}
		to {
			translate: calc(100vw + 120px) 0;
		}
	}
	@keyframes hop {
		to {
			transform: translateY(-8px);
		}
	}

	/* Confetti, coins or hearts fall from the top. */
	.drop {
		position: absolute;
		top: -40px;
		left: var(--x);
		width: 10px;
		height: 14px;
		background: var(--c);
		box-shadow: 0 0 0 2px rgba(42, 26, 16, 0.6);
		animation: fall 1.9s cubic-bezier(0.3, 0, 0.7, 1) var(--d) both;
	}
	.drop.sprite {
		width: 34px;
		height: 34px;
		background: none;
		box-shadow: none;
		image-rendering: pixelated;
	}
	@keyframes fall {
		from {
			translate: 0 0;
			rotate: 0deg;
			opacity: 1;
		}
		85% {
			opacity: 1;
		}
		to {
			translate: 0 calc(100vh + 80px);
			rotate: var(--spin);
			opacity: 0;
		}
	}

	/* A storm: slanted rain over everything and a flash of lightning. */
	.rain {
		position: absolute;
		inset: -20% -20%;
		background: repeating-linear-gradient(
			105deg,
			transparent 0 14px,
			rgba(170, 200, 235, 0.32) 14px 16px,
			transparent 16px 31px
		);
		background-size: 120px 120px;
		animation:
			pour 0.35s linear infinite,
			fade 2.8s ease-in-out both;
	}
	.stormAtSea::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at 50% 40%, rgba(20, 30, 50, 0.15), rgba(10, 16, 30, 0.6));
		animation: fade 2.8s ease-in-out both;
	}
	@keyframes pour {
		to {
			background-position: -32px 120px;
		}
	}
	@keyframes fade {
		0%,
		100% {
			opacity: 0;
		}
		15%,
		80% {
			opacity: 1;
		}
	}
	.bolt {
		position: absolute;
		inset: 0;
		background: rgba(220, 235, 255, 0.85);
		animation: bolt 1.2s ease-out 0.15s both;
	}
	.bolt.white {
		background: rgba(255, 252, 235, 0.7);
		animation-delay: 1.3s;
	}
	@keyframes bolt {
		0% {
			opacity: 0;
		}
		6% {
			opacity: 1;
		}
		14% {
			opacity: 0.1;
		}
		20% {
			opacity: 0.8;
		}
		100% {
			opacity: 0;
		}
	}
	/* The Comet streaks across the screen towards the island. */
	.comet {
		position: absolute;
		left: -160px;
		top: -160px;
		width: 150px;
		height: 150px;
		image-rendering: pixelated;
		filter: drop-shadow(0 0 18px #bfe8ff) drop-shadow(0 0 6px #ffffff);
		animation: streak 1.3s cubic-bezier(0.5, 0, 0.9, 0.6) both;
	}
	@keyframes streak {
		from {
			translate: 0 0;
			scale: 0.6;
		}
		to {
			translate: 55vw 52vh;
			scale: 1.1;
			opacity: 0.2;
		}
	}
	/* Bandits and earthquakes: the edges of the screen flush red. */
	.red {
		position: absolute;
		inset: 0;
		box-shadow: inset 0 0 160px 40px rgba(200, 40, 20, 0.55);
		animation: fade 2.6s ease-in-out both;
	}

	@media (max-width: 700px) {
		.headline {
			top: 30%;
			gap: 10px;
			padding: 6px 12px 8px 8px;
		}
		.headline img {
			width: 44px;
			height: 44px;
		}
		.name {
			font-size: 19px;
		}
		.line {
			font-size: 14px;
		}
	}
</style>
