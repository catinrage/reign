<script lang="ts">
	import { getTopology } from '../../../shared/board/topology';
	import { RESOURCES, type Resource, type ResourceCounts } from '../../../shared/rules/config';
	import {
		roadSpots,
		settlementSpots,
		citySpots,
		paveSpots,
		tradeHarbor,
		workshopSpots
	} from '../../../shared/rules/queries';
	import type { GameEvent } from '../../../shared/rules/types';
	import type { PickKind } from '../../scene/gameScene';
	import { client } from '../../state/client.svelte';
	import { myTurn } from '../helpers';
	import { sceneRef } from '../sceneRef';
	import { sfx } from '../sound';
	import Actions from './Actions.svelte';
	import BoardTip from './BoardTip.svelte';
	import CheatPanel from './CheatPanel.svelte';
	import Dialogs from './Dialogs.svelte';
	import DiceBadge from './DiceBadge.svelte';
	import DraftPanel from './DraftPanel.svelte';
	import Flyers, { FLIGHT_MS, flyers } from './Flyers.svelte';
	import Hand from './Hand.svelte';
	import Log from './Log.svelte';
	import GameMenu from './GameMenu.svelte';
	import OfferCard from './OfferCard.svelte';
	import PigeonLoft from './PigeonLoft.svelte';
	import Players from './Players.svelte';
	import Prompt from './Prompt.svelte';
	import TileIncome from './TileIncome.svelte';
	import SpectatorBar from './SpectatorBar.svelte';
	import TimeWarning from './TimeWarning.svelte';
	import TradePanel from './TradePanel.svelte';
	import Victory from './Victory.svelte';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	// A timed game hangs its clock under the turn banner (see the styles below).
	const timed = $derived(!!client.lobby?.turnTime && view.phase !== 'ended');

	// Feed every new state to the 3D scene the moment it arrives. The interface renders from
	// `client.view`, which waits for the dice of a roll to land.
	$effect(() => {
		const live = client.latest;
		if (live) sceneRef.current?.setView(live);
	});

	// Leave build mode when it no longer applies.
	$effect(() => {
		if (!myTurn(view) || view.step !== 'main') ui.build = null;
	});

	// What can be clicked on the board right now.
	$effect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		const me = view.me;
		const color = view.players[me]?.color ?? 'white';
		let kind: PickKind | null = null;
		let options: number[] = [];
		if (myTurn(view) && !client.tossing) {
			switch (view.step) {
				case 'setupSettlement':
					kind = 'settlement';
					options = settlementSpots(view, me, true);
					break;
				case 'setupRoad':
					kind = 'road';
					options = roadSpots(view, me, view.setupLastSettlement);
					break;
				case 'roadBuilding':
					kind = 'road';
					options = roadSpots(view, me);
					break;
				case 'moveRobber':
					kind = 'robber';
					options = view.board.hexes.map((_, i) => i).filter((h) => h !== view.robberHex);
					break;
				case 'main':
					if (ui.build === 'road') {
						kind = 'road';
						options = roadSpots(view, me);
					} else if (ui.build === 'settlement') {
						kind = 'settlement';
						options = settlementSpots(view, me, false);
					} else if (ui.build === 'city') {
						kind = 'city';
						options = citySpots(view, me);
					} else if (ui.build === 'workshop') {
						kind = 'workshop';
						options = workshopSpots(view, me);
					} else if (ui.build === 'stoneRoad') {
						kind = 'stoneRoad';
						options = paveSpots(view, me);
					}
					break;
			}
		}
		if (!kind) return scene.setPick(null);
		const k = kind;
		scene.setPick({
			kind: k,
			options,
			color,
			onPick: (id) => {
				if (k === 'robber') client.act({ type: 'moveRobber', hex: id });
				else if (k === 'road') client.act({ type: 'placeRoad', edge: id });
				else if (k === 'settlement') client.act({ type: 'placeSettlement', vertex: id });
				else if (k === 'workshop') client.act({ type: 'buildWorkshop', hex: id });
				else if (k === 'stoneRoad') client.act({ type: 'paveRoad', edge: id });
				else client.act({ type: 'buildCity', vertex: id });
				if (view.step === 'main') ui.build = null;
			}
		});
	});

	// The tile another player is about to move the robber to lights up here too, once the dice
	// that called for the robber have landed.
	$effect(() => {
		const live = client.latest;
		const aim = client.aim;
		let hex: number | null = null;
		let color = '';
		if (aim && live && !client.tossing && live.step === 'moveRobber' && live.current === aim.player && aim.player !== live.me) {
			hex = aim.hex;
			color = live.players[aim.player].color;
		}
		sceneRef.current?.setTheirAim(hex, color);
	});

	/** Events new since the last call: none at first, nor when a new game starts the log over. */
	function newEvents() {
		let last = -1;
		return (log: GameEvent[]) => {
			const newest = log.length ? log[log.length - 1].seq : 0;
			const fresh = last >= 0 && newest >= last ? log.filter((e) => e.seq > last) : [];
			last = newest;
			return fresh;
		};
	}
	const liveEvents = newEvents();
	const shownEvents = newEvents();

	// Sounds for what the scene plays as soon as a state arrives: the dice rattle with the toss.
	$effect(() => {
		const live = client.latest;
		if (!live) return;
		for (const e of liveEvents(live.log)) {
			if (e.type === 'diceRolled') sfx.dice();
			else if (e.type === 'built') sfx.build();
			else if (e.type === 'robberMoved') sfx.robber();
		}
	});

	// Sounds, toasts and flashes for what the interface shows.
	$effect(() => {
		for (const e of shownEvents(view.log)) react(e);
	});

	function react(e: GameEvent) {
		const me = view.me;
		switch (e.type) {
			case 'diceRolled':
				// A 7 lands with a sting of its own: the robber is coming.
				if (e.dice[0] + e.dice[1] === 7) sfx.seven();
				break;
			case 'turnStarted':
				if (e.player === me && e.turn > 0) {
					sfx.turn();
					ui.flash = true;
					setTimeout(() => (ui.flash = false), 1600);
				}
				break;
			case 'tradeOffered':
				// A bell for everyone at the table but the player who made the offer.
				if (e.offer.from !== me) sfx.trade();
				break;
			case 'turnTimedOut':
				if (e.player === me) client.toast("Time's up! Your turn is over.", 'error');
				else client.toast(`${view.players[e.player].name} ran out of time`);
				break;
			case 'stole':
				sfx.steal();
				if (e.victim === me) client.toast(`${view.players[e.thief].name} stole ${e.resource ? 'your ' + e.resource : 'a card'}!`, 'error');
				if (e.thief === me && e.resource) client.toast(`You stole ${e.resource} from ${view.players[e.victim].name}`, 'good');
				break;
			case 'monopoly':
				if (e.player !== me && e.taken[me]) client.toast(`${view.players[e.player].name} took all your ${e.resource}!`, 'error');
				flyTaken(e.player, e.resource, e.taken);
				break;
			case 'longestRoad':
				if (e.player === me) client.toast('You hold the Longest Road! +2', 'good');
				break;
			case 'largestArmy':
				if (e.player === me) client.toast('You command the Largest Army! +2', 'good');
				break;
			case 'bankTrade':
				if (e.player === me) sfx.card();
				flyBankTrade(e.player, e.give, e.giveCount, e.get);
				break;
			case 'tradeCompleted':
				sfx.card();
				if (e.to === me) client.toast(`Trade with ${view.players[e.from].name} done`, 'good');
				flyTraded(e.from, e.to, e.give, e.want);
				break;
			case 'gameOver':
				sfx.win();
				break;
			case 'devCardBought':
			case 'characterPicked':
				sfx.card();
				break;
		}
	}

	/**
	 * A Monopoly: the cards fly one after another from each hand they were taken from to the
	 * player who took them, and count there as they land, like cards dealt off the tiles.
	 */
	function flyTaken(taker: number, resource: Resource, taken: Record<number, number>) {
		const from = Object.entries(taken).flatMap(([p, n]) => Array<number>(n).fill(Number(p)));
		const gap = Math.min(0.12, 1.6 / from.length);
		from.forEach((giver, k) =>
			setTimeout(() => {
				const me = client.view?.me;
				if (me === undefined) return client.arrived(taker, resource);
				if (taker === me) sfx.coin();
				else sfx.pop();
				flyers.pass(resource, giver, taker, me, () => client.arrived(taker, resource));
			}, k * gap * 1000)
		);
	}

	/** Time between cards that fly off one after another in a trade, in ms. */
	const CARD_GAP_MS = 120;

	/**
	 * A trade with the bank: the cards paid fly one after another from the trader to the bank's
	 * pile of their kind on the table, or to the harbor whose rate they got. As the last one lands,
	 * the card bought rises off its own pile (or the harbor) and flies back, counting as it lands.
	 */
	function flyBankTrade(player: number, give: Resource, count: number, get: Resource) {
		const scene = sceneRef.current;
		if (!scene) return client.arrived(player, get);
		const harbor = tradeHarbor(view, player, give, count);
		const to = scene.tradeTarget(give, harbor);
		for (let k = 0; k < count; k++)
			setTimeout(() => {
				const me = client.view?.me;
				if (me !== undefined)
					flyers.away(give, player, me, to, () => scene.tradeLanded(give, harbor));
			}, k * CARD_GAP_MS);
		setTimeout(() => scene.tradeOut(get, harbor, player), (count - 1) * CARD_GAP_MS + FLIGHT_MS);
	}

	/**
	 * A trade between players: each side's cards fly one after another to the other (the answer a
	 * moment after the offer), and count as they land.
	 */
	function flyTraded(
		from: number,
		to: number,
		give: Partial<ResourceCounts>,
		want: Partial<ResourceCounts>
	) {
		const send = (cards: Partial<ResourceCounts>, giver: number, taker: number, after: number) =>
			RESOURCES.flatMap((r) => Array<Resource>(cards[r] ?? 0).fill(r)).forEach((resource, k) =>
				setTimeout(
					() => {
						const me = client.view?.me;
						if (me === undefined) return client.arrived(taker, resource);
						flyers.pass(resource, giver, taker, me, () => client.arrived(taker, resource));
					},
					after + k * CARD_GAP_MS
				)
			);
		send(give, from, to, 0);
		send(want, to, from, 300);
	}

	$effect(() => {
		const scene = sceneRef.current;
		scene?.setCallbacks({
			// The dice came to rest: the interface catches up with the roll.
			onDiceSettled: (_dice, seq) => client.landed(seq),
			// A piece on the board under the pointer (or tapped): its tooltip says what it is.
			onPieceHover: (spot, tap) => (ui.piece = spot ? { spot, tap } : null),
			// The robber's tile under this player's pointer: everyone else sees it light up.
			onAim: (hex) => {
				client.aimAt(hex);
				if (hex !== null) sfx.hover();
			},
			// A resource rose from its tile and flies to whoever got it: into your hand, or onto
			// another player's plaque. It counts as it gets there.
			onResourcePopped: (player, resource, screen) => {
				const arrived = () => client.arrived(player, resource);
				if (player === client.view?.me) {
					sfx.coin();
					flyers.add(resource, screen, arrived);
				} else {
					sfx.pop();
					flyers.toPlayer(player, resource, screen, arrived);
				}
			}
		});
	});

	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		// Esc backs out of whatever is open, and opens the menu when nothing is.
		if (ui.menu) ui.menu = false;
		else if (ui.build || ui.trade) {
			ui.build = null;
			ui.trade = false;
		} else ui.menu = true;
	}
	void getTopology;
</script>

<svelte:window onkeydown={onKey} />

<div class="hud" class:flash={ui.flash} class:timed>
	<Prompt />
	<Players />
	<DiceBadge />
	<Log />
	{#if client.spectating}
		<SpectatorBar />
	{:else}
		<Hand />
		<TileIncome />
		<Actions />
		<OfferCard />
		{#if ui.trade}<TradePanel />{/if}
		<Dialogs />
	{/if}
	<Victory />
	{#if view.phase === 'draft' && view.draft}<DraftPanel />{/if}
	<Flyers />
	<BoardTip />
	<GameMenu />
	{#if !client.spectating}
		<PigeonLoft />
		<TimeWarning />
		{#if client.cheats}<CheatPanel />{/if}
	{/if}
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	/* How far the turn clock hangs below the banner: what sits under the banner moves down by it. */
	.hud.timed {
		--clock-h: calc(var(--s) * 8);
	}
	@media (max-width: 900px) {
		.hud.timed {
			--clock-h: calc(var(--s) * 10);
		}
	}
	.hud.flash::after {
		content: '';
		position: absolute;
		inset: 0;
		box-shadow: inset 0 0 120px rgba(255, 200, 90, 0.45);
		animation: fade-in 0.4s ease-out reverse;
		pointer-events: none;
	}
</style>
