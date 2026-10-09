<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { PIGEON_MAX_CHARS, type PigeonNote } from '../../../shared/protocol';
	import { client } from '../../state/client.svelte';
	import { PLAYER_CSS } from '../helpers';
	import { PIGEON } from '../pigeon';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import { loft } from './pigeons.svelte';

	/**
	 * The pigeon post. Notes go to one player only: the server hands them to the writer and the
	 * reader and nobody else, so the rest of the table never sees the pigeon or learns it flew.
	 * A sent note is carried off to the reader's plaque; a note for us flies in from the writer's
	 * plaque and lands on the loft button, and it can only be read once it has landed.
	 */

	interface Point {
		x: number;
		y: number;
	}
	interface Flight {
		note: PigeonNote;
		incoming: boolean;
		from: Point;
		to: Point;
	}

	const seats = $derived(client.lobby?.seats ?? []);
	const people = $derived(loft.people);
	const reader = $derived(people.find((s) => s.id === loft.to) ?? null);
	const notes = $derived(reader ? loft.notesWith(reader.id) : []);

	let flights = $state<Flight[]>([]);
	/** The newest landed note while the loft was shut: a peek at it hangs by the button. */
	let peek = $state<PigeonNote | null>(null);
	let peekTimer: ReturnType<typeof setTimeout> | undefined;
	/** Unsent notes, one per reader. */
	let drafts = $state<Record<string, string>>({});
	let box: HTMLDivElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	let sendBtn: HTMLButtonElement | undefined = $state();

	const name = (seat: string) => seats.find((s) => s.id === seat)?.name ?? 'Someone';
	const color = (seat: string) =>
		PLAYER_CSS[seats.find((s) => s.id === seat)?.color ?? 'white'] ?? '#fff';

	$effect(() => loft.sync(client.code, client.seat));

	// Opening the loft picks who to write to: whoever sent the newest unread note, or the first player.
	$effect(() => {
		if (!loft.open) return;
		untrack(() => {
			if (!people.some((s) => s.id === loft.to)) {
				loft.to = (people.find((s) => loft.unreadFrom(s.id)) ?? people[0])?.id ?? null;
			}
			peek = null;
			tick().then(() => input?.focus());
		});
	});
	// What the loft shows has been read.
	$effect(() => {
		if (loft.open && loft.to) loft.markRead(loft.to);
	});
	$effect(() => {
		void notes.length;
		void loft.to;
		tick().then(() => box && (box.scrollTop = box.scrollHeight));
	});

	// Pigeons that fly while we're here. Notes from before (history on joining) just sit in the loft.
	let seen = untrack(() => client.freshPigeon?.id ?? 0);
	$effect(() => {
		const note = client.freshPigeon;
		if (!note || note.id <= seen) return;
		seen = note.id;
		untrack(() => launch(note));
	});

	/** The middle of a player's plaque, where their pigeons take off and land. */
	function plaque(seat: string): Point | null {
		const i = seats.findIndex((s) => s.id === seat);
		const el = document.querySelectorAll<HTMLElement>('.players .player')[i];
		return el ? centre(el) : null;
	}
	function centre(el: Element): Point {
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}

	function launch(note: PigeonNote) {
		const incoming = note.to === client.seat;
		const button = loft.button && centre(loft.button);
		const offscreen = { x: innerWidth + 80, y: innerHeight * 0.3 };
		let from: Point;
		let to: Point;
		if (incoming) {
			loft.takeOff(note.id);
			from = plaque(note.from) ?? offscreen;
			to = button ?? { x: innerWidth / 2, y: innerHeight / 2 };
		} else {
			from = (loft.open && sendBtn && centre(sendBtn)) ||
				button || { x: innerWidth / 2, y: innerHeight / 2 };
			to = plaque(note.to) ?? offscreen;
		}
		sfx.flutter();
		flights = [...flights, { note, incoming, from, to }];
	}

	function arrived(f: Flight) {
		flights = flights.filter((x) => x !== f);
		if (!f.incoming) return;
		loft.land(f.note.id);
		sfx.coo();
		loft.button?.animate(
			[
				{ transform: 'translateY(0)' },
				{ transform: 'translateY(-7px) rotate(-4deg)' },
				{ transform: 'translateY(0)' },
				{ transform: 'translateY(-3px) rotate(3deg)' },
				{ transform: 'translateY(0)' }
			],
			{ duration: 520, easing: 'ease-out' }
		);
		if (!(loft.open && loft.to === f.note.from)) {
			peek = f.note;
			clearTimeout(peekTimer);
			peekTimer = setTimeout(() => (peek = null), 9000);
		}
	}

	/** Fly a pigeon along an arc from `from` to `to`, rising toward the viewer on the way. */
	function fly(node: HTMLElement, f: Flight) {
		const { from: a, to: b } = f;
		const dist = Math.hypot(b.x - a.x, b.y - a.y);
		// Arc up over the table, or down across it when going up would leave the screen.
		const lift = Math.min(220, 70 + dist * 0.3);
		const over = Math.min(a.y, b.y) - lift;
		const c = {
			x: (a.x + b.x) / 2,
			y: over > 40 ? over : Math.min(innerHeight - 40, Math.max(a.y, b.y) + lift)
		};
		const frames: Keyframe[] = [];
		const steps = 30;
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const u = 1 - t;
			const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
			const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y + Math.sin(t * Math.PI * 7) * 3;
			const scale = 0.9 + 0.7 * Math.sin(Math.PI * t);
			// A pigeon we sent fades out as it reaches its reader; one for us lands in full view.
			const opacity = Math.min(1, t / 0.1, f.incoming ? 1 : (1 - t) / 0.15);
			frames.push({ transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity });
		}
		const anim = node.animate(frames, {
			duration: Math.min(2300, Math.max(1300, dist * 1.7)),
			easing: 'ease-in-out',
			fill: 'forwards'
		});
		anim.onfinish = () => arrived(f);
		return { destroy: () => anim.cancel() };
	}

	function send() {
		const to = loft.to;
		const text = (to && drafts[to]?.trim()) || '';
		if (!to || !text) return;
		client.sendPigeon(to, text);
		drafts[to] = '';
	}

	function openTo(seat: string) {
		peek = null;
		loft.to = seat;
		if (!loft.open) sfx.open();
		loft.open = true;
	}

	function close() {
		sfx.close();
		loft.open = false;
	}

	// Esc closes the loft before anything else hears it (the game menu opens on Esc otherwise).
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !loft.open) return;
		e.stopPropagation();
		close();
	}
</script>

<svelte:window onkeydowncapture={onKey} />

{#if loft.open && reader}
	<div class="loft panel" role="dialog" aria-label="Pigeon post">
		<div class="head">
			<img class="icon-px" src={PIGEON.perched} alt="" />
			<span class="title">Pigeon Post</span>
			<button class="x" onclick={close} aria-label="Close"><img src={PIXEL.close} alt="" /></button>
		</div>
		{#if people.length > 1}
			<div class="tabs" role="tablist">
				{#each people as p (p.id)}
					{@const unread = loft.unreadFrom(p.id)}
					<button
						class="tab"
						class:on={p.id === loft.to}
						role="tab"
						aria-selected={p.id === loft.to}
						onclick={() => (loft.to = p.id)}
						style="--c:{PLAYER_CSS[p.color]}"
						><i></i>{p.name}{#if unread}<span class="dot">{unread}</span>{/if}</button
					>
				{/each}
			</div>
		{/if}
		<div class="notes well" bind:this={box}>
			{#each notes as n (n.id)}
				{@const mine = n.from === client.seat}
				<div class="slip" class:mine>
					<b style="--c:{color(n.from)}">{mine ? 'You' : name(n.from)}</b>
					<span>{n.text}</span>
				</div>
			{:else}
				<p class="empty">
					No pigeons yet. Whatever you write here flies to <b style="--c:{color(reader.id)}"
						>{reader.name}</b
					> alone; nobody else at the table sees it.
				</p>
			{/each}
		</div>
		<form
			class="write"
			onsubmit={(e) => {
				e.preventDefault();
				send();
			}}
		>
			<input
				class="input"
				bind:this={input}
				bind:value={() => drafts[reader.id] ?? '', (v) => (drafts[reader.id] = v)}
				maxlength={PIGEON_MAX_CHARS}
				placeholder="A secret note for {reader.name}…"
				aria-label="Note for {reader.name}"
			/>
			<button class="btn green small send" bind:this={sendBtn} disabled={!drafts[reader.id]?.trim()}
				>Send<img src={PIGEON.perched} alt="" /></button
			>
		</form>
		{#if !reader.connected}
			<p class="away">{reader.name} is away. The pigeon will wait for them.</p>
		{/if}
	</div>
{/if}

{#if peek && !loft.open}
	<button class="peek parch" onclick={() => peek && openTo(peek.from)}>
		<b style="--c:{color(peek.from)}">{name(peek.from)}</b>
		<span>{peek.text}</span>
	</button>
{/if}

<div class="sky" aria-hidden="true">
	{#each flights as f (f.note.id)}
		<div class="bird" use:fly={f}>
			<div class="sprite" class:west={f.to.x < f.from.x}>
				<img class="up" src={PIGEON.up} alt="" />
				<img class="down" src={PIGEON.down} alt="" />
			</div>
		</div>
	{/each}
</div>

<style>
	/* Hangs under the loft button, the second button in the top-left corner. */
	.loft {
		--left: calc(14px + var(--s) * 16 + 8px);
		position: absolute;
		top: calc(14px + var(--s) * 16 + 10px);
		left: var(--left);
		z-index: 32;
		width: 340px;
		max-width: calc(100vw - var(--left) - 8px);
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 2px 4px 6px;
		animation: pop-in 0.25s ease-out;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 2px 0;
	}
	.head img {
		width: 26px;
		height: auto;
	}
	.head .title {
		flex: 1;
		font-size: 18px;
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.7);
	}
	.x {
		all: unset;
		cursor: pointer;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
	}
	.x img {
		width: 16px;
		height: 16px;
		image-rendering: pixelated;
	}
	.x:hover {
		filter: brightness(1.3);
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.tab {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 2px 8px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #e9d2b0;
		background: rgba(0, 0, 0, 0.22);
		box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.35);
	}
	.tab i {
		width: 9px;
		height: 9px;
		background: var(--c);
		box-shadow: 0 0 0 2px #1a0c05;
	}
	.tab.on {
		color: #fff2d2;
		background: color-mix(in srgb, var(--c) 30%, #5a3420);
		box-shadow: inset 0 0 0 2px var(--c);
	}
	.tab:hover:not(.on) {
		filter: brightness(1.2);
	}
	.dot {
		min-width: 16px;
		height: 16px;
		padding: 0 3px;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		border-radius: 8px;
		background: #c2372b;
		color: #fff;
		font-size: 11px;
	}
	.notes {
		height: 190px;
		overflow-y: auto;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		scrollbar-width: thin;
		scrollbar-color: #7a4a2c transparent;
	}
	.slip {
		max-width: 82%;
		align-self: flex-start;
		padding: 4px 8px 5px;
		background: #f4e1b8;
		color: var(--ink);
		box-shadow:
			0 0 0 2px #2a1a10,
			0 3px 0 2px rgba(0, 0, 0, 0.35);
		font-size: 13.5px;
		line-height: 1.35;
		overflow-wrap: anywhere;
		animation: pop-in 0.3s ease-out;
		transform: rotate(-0.6deg);
	}
	.slip.mine {
		align-self: flex-end;
		background: #e8d3a6;
		transform: rotate(0.6deg);
	}
	.slip b,
	.empty b,
	.peek b {
		display: block;
		font-family: var(--px);
		font-size: 12px;
		color: var(--c);
		text-shadow:
			1px 0 0 #1a0c05,
			-1px 0 0 #1a0c05,
			0 1px 0 #1a0c05,
			0 -1px 0 #1a0c05;
	}
	.empty {
		margin: auto 6px;
		text-align: center;
		color: #d9c1a0;
		font-size: 13.5px;
		line-height: 1.4;
	}
	.empty b {
		display: inline;
		font-size: 14px;
	}
	.write {
		display: flex;
		gap: 6px;
		align-items: stretch;
	}
	.write .input {
		flex: 1;
		min-width: 0;
		font-family: var(--body);
		font-size: 14px;
		min-height: 0;
		padding: 2px 6px;
	}
	.send img {
		height: calc(var(--s) * 9);
	}
	.away {
		margin: 0 4px;
		font-size: 12.5px;
		color: #d9c1a0;
	}
	.peek {
		display: block;
		position: absolute;
		top: calc(14px + var(--s) * 16 + 10px);
		left: calc(14px + var(--s) * 16 + 8px);
		z-index: 32;
		max-width: 260px;
		padding: 2px 6px 3px;
		cursor: pointer;
		font-family: var(--body);
		font-size: 13.5px;
		line-height: 1.35;
		text-align: left;
		color: var(--ink);
		overflow-wrap: anywhere;
		animation: pop-in 0.3s ease-out;
	}
	.peek span {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.sky {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 45;
	}
	.bird {
		position: absolute;
		top: 0;
		left: 0;
		opacity: 0;
		will-change: transform;
	}
	.sprite {
		/* The bird is centred on its path point. */
		position: absolute;
		width: calc(var(--s) * 25);
		height: calc(var(--s) * 19);
		translate: -50% -50%;
		filter: drop-shadow(0 10px 6px rgba(0, 0, 0, 0.35));
	}
	.sprite.west {
		scale: -1 1;
	}
	.sprite img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		image-rendering: pixelated;
	}
	.up {
		animation: flap 0.24s steps(1) infinite;
	}
	.down {
		animation: flap 0.24s steps(1) -0.12s infinite;
	}
	@keyframes flap {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}
	@media (max-width: 900px) {
		/* Beside the corner buttons, which stand in a column here. */
		.loft {
			--left: calc(12px + var(--s) * 16);
			top: calc(104px + var(--clock-h, 0px));
		}
		.peek {
			top: calc(104px + var(--clock-h, 0px) + var(--s) * 16 + 6px);
			left: calc(12px + var(--s) * 16);
		}
		.notes {
			height: 140px;
		}
	}
</style>
