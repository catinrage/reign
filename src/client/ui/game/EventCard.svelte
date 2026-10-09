<script lang="ts">
	import { RESOURCE_LABEL, type Resource } from '../../../shared/rules/config';
	import { EVENT_INFO, roundOf, type EventCard } from '../../../shared/rules/events';
	import type { GameEvent } from '../../../shared/rules/types';
	import { client } from '../../state/client.svelte';
	import { RESOURCES } from '../helpers';
	import Modal from '../menu/Modal.svelte';
	import ResCard from '../ResCard.svelte';
	import { sfx } from '../sound';
	import { EVENT_ART, TONE_COLOR } from './eventArt';
	import EventFace from './EventFace.svelte';

	/**
	 * Reign Extended's Events deck at the table: the round's card in the corner, the big flip when
	 * a new one turns over, the Royal Decree's pick and the Bountiful Year's free card.
	 */

	const view = $derived(client.view!);
	const events = $derived(view.events);
	const me = $derived(view.me);
	const round = $derived(roundOf(view.turn, view.players.length));
	const choosing = $derived(view.step === 'eventChoice' ? (events?.choice ?? null) : null);
	const bounty = $derived(!client.spectating && me >= 0 && !!events?.bounty.includes(me) && view.phase === 'main');

	/** The card turning over in the middle of the table, and who picked it (a Royal Decree). */
	let flipping = $state<{ card: EventCard; by?: number; seq: number } | null>(null);
	let flipTimer: ReturnType<typeof setTimeout> | undefined;
	let bountyOpen = $state(false);
	let bountyDismissed = $state(false);

	// New events since the last look (none at first, so a rejoin doesn't replay old flips).
	let lastSeq = -1;
	$effect(() => {
		const log = view.log;
		const newest = log.length ? log[log.length - 1].seq : 0;
		const fresh = lastSeq >= 0 && newest >= lastSeq ? log.filter((e) => e.seq > lastSeq) : [];
		lastSeq = newest;
		for (const e of fresh) react(e);
	});

	function react(e: GameEvent) {
		if (e.type === 'eventDrawn') {
			sfx.card();
			flipping = { card: e.card, by: e.by, seq: e.seq };
			clearTimeout(flipTimer);
			// Dev scripts can hold the card up longer, for screenshots (`window.__flipMs`).
			flipTimer = setTimeout(() => (flipping = null), (window as { __flipMs?: number }).__flipMs ?? 3600);
			bountyDismissed = false;
		} else if (e.type === 'earthquake') {
			sfx.robber();
		} else if (e.type === 'eventCards') {
			const mine = e.moves.filter((m) => m.from === me || m.to === me);
			if (e.card === 'bountifulYear') {
				if (mine.length) sfx.coin();
				return;
			}
			if (e.moves.length) sfx.steal();
			const name = EVENT_INFO[e.card].name;
			const gave = mine.filter((m) => m.from === me);
			const got = mine.filter((m) => m.to === me);
			const what = (r: Resource | null) => (r ? RESOURCE_LABEL[r] : 'a card');
			if (got.length) client.toast(`${name}: you got ${got.map((m) => what(m.resource)).join(', ')}`, 'good');
			else if (gave.length) client.toast(`${name}: you lost ${gave.map((m) => what(m.resource)).join(', ')}`, 'error');
		}
	}

	// The Bountiful Year asks once its card has turned over; closing it leaves the corner button.
	$effect(() => {
		if (bounty && !flipping && !bountyDismissed) bountyOpen = true;
		if (!bounty) bountyOpen = false;
	});

	function claim(r: Resource) {
		client.act({ type: 'claimBounty', resource: r });
		bountyOpen = false;
	}
</script>

{#if events}
	<div class="corner" class:cheats={client.cheats}>
		{#if choosing}
			<div class="slot plaque" title={EVENT_INFO.royalDecree.text} data-tip-head="Royal Decree">
				<img class="art" src={EVENT_ART.royalDecree} alt="" />
				<span class="body">
					<span class="round">Round {round}</span>
					<span class="name title">Royal Decree</span>
					<span class="sub">{choosing.player === me ? 'You pick the event' : `${view.players[choosing.player]?.name} is picking`}</span>
				</span>
			</div>
		{:else if events.current}
			{@const info = EVENT_INFO[events.current]}
			<div
				class="slot plaque"
				style="--tone:{TONE_COLOR[info.tone]}"
				title={info.text}
				data-tip-head={info.name}
				data-tip-note={info.lasts ? 'Lasts until the next round starts.' : 'Happened when the card turned over.'}
			>
				<img class="art" src={EVENT_ART[events.current]} alt="" />
				<span class="body">
					<span class="round">Round {round} event</span>
					<span class="name title">{info.name}</span>
				</span>
			</div>
		{:else}
			<div class="slot plaque quiet" title={events.every === 2 ? 'Event cards turn over every other round.' : 'No event this round.'}>
				<span class="body">
					<span class="round">Round {round}</span>
					<span class="name title">No event</span>
				</span>
			</div>
		{/if}
		{#if bounty && !bountyOpen}
			<button class="btn small green take" onclick={() => (bountyOpen = true)}>Take your free card</button>
		{/if}
	</div>
{/if}

{#if flipping}
	<button class="flip-backdrop" onclick={() => (flipping = null)} aria-label="Close">
		<div class="flip">
			<div class="flip-head">
				{flipping.by !== undefined
					? `${flipping.by === me ? 'You' : view.players[flipping.by]?.name} decreed`
					: `Round ${round}`}
			</div>
			{#key flipping.seq}
				<div class="turn"><EventFace card={flipping.card} size={220} /></div>
			{/key}
		</div>
	</button>
{:else if choosing && choosing.player === me && !client.spectating}
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
{:else if bountyOpen}
	<Modal
		title="Bountiful Year"
		width={480}
		onclose={() => {
			bountyOpen = false;
			bountyDismissed = true;
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
	.corner {
		position: absolute;
		top: 74px;
		left: 14px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		pointer-events: auto;
	}
	/* Under the dev cheats' hammer too. */
	.corner.cheats {
		top: 128px;
	}
	.slot {
		--tone: var(--gold);
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px 6px 8px;
		box-shadow:
			inset 0 0 0 2px var(--tone),
			0 4px 10px rgba(0, 0, 0, 0.4);
		animation: drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.slot.quiet {
		opacity: 0.75;
	}
	.art {
		width: 44px;
		height: 44px;
		image-rendering: pixelated;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5));
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.round {
		font-family: var(--px);
		font-weight: 700;
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.name {
		font-size: 16px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.sub {
		font-size: 12px;
		color: #f1dfc2;
	}
	.take {
		animation: glow 1.8s ease-in-out infinite;
	}
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
	@media (max-width: 900px) {
		/* Phones: on the right, under the turn banner, clear of the menu buttons on the left. */
		.corner,
		.corner.cheats {
			top: 112px;
			left: auto;
			right: 8px;
			align-items: flex-end;
		}
		.slot {
			padding: 4px 8px 4px 6px;
			gap: 6px;
		}
		.art {
			width: 26px;
			height: 26px;
		}
		.name {
			font-size: 13px;
		}
		.round {
			font-size: 9px;
		}
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
