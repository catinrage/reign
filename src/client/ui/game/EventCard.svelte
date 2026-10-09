<script lang="ts">
	import { RESOURCE_LABEL, type Resource } from '../../../shared/rules/config';
	import { EVENT_FLIP_MS, EVENT_INFO } from '../../../shared/rules/events';
	import type { GameEvent } from '../../../shared/rules/types';
	import { client } from '../../state/client.svelte';
	import { RESOURCES } from '../helpers';
	import { sceneRef } from '../sceneRef';
	import { FLIGHT_MS, flyers } from './Flyers.svelte';
	import Modal from '../menu/Modal.svelte';
	import ResCard from '../ResCard.svelte';
	import { sfx } from '../sound';
	import EventFace from './EventFace.svelte';
	import { eventUi } from './eventUi.svelte';

	/**
	 * Reign Extended's Events deck at the table: the big flip when a new card turns over, the cards
	 * an event moves flying between the hands and the bank, the Royal Decree's pick and the
	 * Bountiful Year's free card. The round's card sits in the corner chip; what each card does
	 * to the table is played out by EventEffect.
	 */

	const view = $derived(client.view!);
	const events = $derived(view.events);
	const me = $derived(view.me);
	const choosing = $derived(view.step === 'eventChoice' ? (events?.choice ?? null) : null);
	const bounty = $derived(!client.spectating && me >= 0 && !!events?.bounty.includes(me) && view.phase === 'main');
	// Play waits while a card plays out, so its dialogs do too.
	const waiting = $derived(!!client.presenting);

	const shown = $derived(eventUi.shown);
	let flipTimer: ReturnType<typeof setTimeout> | undefined;

	// A card that just turned over is held up in the middle of the table for everyone, then put
	// down so what it does plays out (`client.reveal`).
	let flipFor = -1;
	$effect(() => {
		const p = client.presenting;
		if (!p || p.phase !== 'flip' || p.seq === flipFor) return;
		flipFor = p.seq;
		sfx.card();
		eventUi.shown = { card: p.card, by: p.by, round: p.round, seq: p.seq, flip: true };
		clearTimeout(flipTimer);
		// Dev scripts can hold the card up longer, for screenshots (`window.__flipMs`).
		flipTimer = setTimeout(close, (window as { __flipMs?: number }).__flipMs ?? EVENT_FLIP_MS);
		eventUi.bountyDismissed = false;
	});

	// New events since the last look (none at first, so a rejoin doesn't replay old ones).
	let lastSeq = -1;
	$effect(() => {
		const log = view.log;
		const newest = log.length ? log[log.length - 1].seq : 0;
		const fresh = lastSeq >= 0 && newest >= lastSeq ? log.filter((e) => e.seq > lastSeq) : [];
		lastSeq = newest;
		for (const e of fresh) if (e.type === 'eventCards') moved(e);
	});

	/** Time between the cards an event moves, as they fly off one after another. */
	const CARD_GAP_MS = 140;

	/**
	 * The cards an event moved fly for everyone: from each hand they left to the bank's pile, or
	 * to the player they went to (a card you can't see flies face down); a Bountiful Year's card
	 * rises off the bank's pile. Whoever gets cards counts them as they land.
	 */
	function moved(e: Extract<GameEvent, { type: 'eventCards' }>) {
		const scene = sceneRef.current;
		const mine = e.moves.filter((m) => m.from === me || m.to === me);
		const name = EVENT_INFO[e.card].name;
		const what = (r: Resource | null) => (r ? RESOURCE_LABEL[r] : 'a card');
		const gave = mine.filter((m) => m.from === me);
		const got = mine.filter((m) => m.to === me);
		if (e.card === 'bountifulYear') {
			if (got.length) sfx.coin();
		} else {
			if (e.moves.length) sfx.steal();
			if (got.length) client.toast(`${name}: you got ${got.map((m) => what(m.resource)).join(', ')}`, 'good');
			else if (gave.length) client.toast(`${name}: you lost ${gave.map((m) => what(m.resource)).join(', ')}`, 'error');
		}
		e.moves.forEach((m, k) =>
			setTimeout(() => {
				const at = client.view?.me ?? me;
				const counted = () => m.to !== null && m.resource && client.arrived(m.to, m.resource);
				if (m.from === null) {
					if (m.to !== null && m.resource && scene) scene.tradeOut(m.resource, -1, m.to);
					else counted();
				} else if (m.to === null) {
					if (!scene) return;
					const r = m.resource ?? 'wheat';
					flyers.away(m.resource ?? 'back', m.from, at, scene.tradeTarget(r, -1), () => scene.tradeLanded(r, -1));
				} else {
					flyers.pass(m.resource ?? 'back', m.from, m.to, at, counted);
				}
			}, 250 + k * Math.min(CARD_GAP_MS, (EVENT_FLIP_MS - FLIGHT_MS) / Math.max(1, e.moves.length)))
		);
	}

	function close() {
		clearTimeout(flipTimer);
		const was = eventUi.shown;
		eventUi.shown = null;
		if (was?.flip) client.reveal(was.seq);
	}

	// The Bountiful Year asks once its card has turned over; closing it leaves the chip glowing.
	$effect(() => {
		if (bounty && !shown && !waiting && !eventUi.bountyDismissed) eventUi.bountyOpen = true;
		if (!bounty) eventUi.bountyOpen = false;
	});

	function claim(r: Resource) {
		client.act({ type: 'claimBounty', resource: r });
		eventUi.bountyOpen = false;
	}
</script>

{#if shown}
	<button class="flip-backdrop" onclick={close} aria-label="Close">
		<div class="flip">
			<div class="flip-head">
				{shown.by !== undefined
					? `${shown.by === me ? 'You' : view.players[shown.by]?.name} decreed`
					: `Round ${shown.round} event`}
			</div>
			{#key shown.seq}
				<div class:turn={shown.flip} class:lift={!shown.flip}><EventFace card={shown.card} size={220} /></div>
			{/key}
		</div>
	</button>
{:else if choosing && choosing.player === me && !client.spectating && !waiting}
	<Modal title="Royal Decree" width={620}>
		<p>You're behind, so the crown lets you pick this round's event.</p>
		<div class="choices">
			{#each choosing.cards as c (c)}
				<button
					class="choice"
					title={EVENT_INFO[c].text}
					data-tip-head={EVENT_INFO[c].name}
					onclick={() => client.act({ type: 'chooseEvent', card: c })}
				>
					<EventFace card={c} size={170} />
				</button>
			{/each}
		</div>
	</Modal>
{:else if eventUi.bountyOpen && !waiting}
	<Modal
		title="Bountiful Year"
		width={480}
		onclose={() => {
			eventUi.bountyOpen = false;
			eventUi.bountyDismissed = true;
		}}
	>
		<p>Take any one resource from the bank.</p>
		<div class="row">
			{#each RESOURCES as r (r)}
				<ResCard res={r} size={58} dim={view.bank[r] === 0} onclick={() => view.bank[r] > 0 && claim(r)} />
			{/each}
		</div>
	</Modal>
{/if}

<style>
	.flip-backdrop {
		all: unset;
		position: absolute;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		background: radial-gradient(ellipse at center, rgba(10, 5, 0, 0.55), transparent 70%);
		pointer-events: auto;
		cursor: pointer;
		animation: fade-in 0.3s ease-out;
	}
	.flip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		perspective: 900px;
	}
	.flip-head {
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		color: var(--gold);
		text-shadow: 0 2px 0 #000;
		animation: drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.turn {
		animation: turn-over 0.9s cubic-bezier(0.2, 1.1, 0.4, 1);
		transform-style: preserve-3d;
	}
	.lift {
		animation: drop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	@keyframes turn-over {
		0% {
			transform: translateY(-40px) rotateY(180deg) scale(0.6);
			filter: brightness(0.2);
		}
		55% {
			filter: brightness(0.2);
		}
		56% {
			filter: brightness(1.4);
		}
		100% {
			transform: none;
			filter: none;
		}
	}
	.choices {
		display: flex;
		align-items: stretch;
		gap: 12px;
		justify-content: center;
		flex-wrap: wrap;
		padding-top: 8px;
	}
	.choice {
		all: unset;
		display: flex;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.choice:hover {
		transform: translateY(-6px) rotate(-1deg);
	}
	.row {
		display: flex;
		gap: 10px;
		justify-content: center;
		padding-top: 12px;
		flex-wrap: wrap;
	}
	@media (max-width: 480px) {
		.choices :global(.ecard) {
			--w: 104px !important;
		}
		.choices :global(.ecard .text) {
			display: none;
		}
	}
</style>
