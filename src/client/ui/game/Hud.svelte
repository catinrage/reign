<script lang="ts">
	import { getTopology } from '../../../shared/board/topology';
	import { isCityPath } from '../../../shared/rules/buildings';
	import { RESOURCES, RESOURCE_LABEL, type Resource, type ResourceCounts } from '../../../shared/rules/config';
	import {
		roadSpots,
		settlementSpots,
		citySpots,
		ownWorkshops,
		paveSpots,
		pathSpots,
		powerReady,
		storehouseSpots,
		tavernSpots,
		tradeHarbor,
		workshopSpots
	} from '../../../shared/rules/queries';
	import type { BuiltKind, GameEvent } from '../../../shared/rules/types';
	import type { PickKind } from '../../scene/gameScene';
	import { client } from '../../state/client.svelte';
	import { myTurn } from '../helpers';
	import { powerPick } from './power';
	import { POWER_INFO } from '../../../shared/rules/characters';
	import { t } from '../../i18n/index.svelte';
	import { sceneRef } from '../sceneRef';
	import { sfx } from '../sound';
	import Actions from './Actions.svelte';
	import BoardTip from './BoardTip.svelte';
	import CheatPanel from './CheatPanel.svelte';
	import Dialogs from './Dialogs.svelte';
	import { dialogs } from './dialogs.svelte';
	import PowerDialog from './PowerDialog.svelte';
	import DiceBadge from './DiceBadge.svelte';
	import DraftPanel from './DraftPanel.svelte';
	import EventCard from './EventCard.svelte';
	import EventEffect from './EventEffect.svelte';
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
	import ReplayBar from './ReplayBar.svelte';
	import ReplayData from './ReplayData.svelte';
	import TimeWarning from './TimeWarning.svelte';
	import TradePanel from './TradePanel.svelte';
	import Victory from './Victory.svelte';
	import MissionBrief from '../campaign/MissionBrief.svelte';
	import StoryLine from '../campaign/StoryLine.svelte';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	/** A replay's data panel: open from the start on a wide screen, behind a button on a phone. */
	let replayData = $state(window.innerWidth > 900);
	// A timed game hangs its clock under the turn banner (see the styles below).
	const timed = $derived(!!client.lobby?.turnTime && view.phase !== 'ended');

	// Each player rolls their own dice (picked in their profile), seen by everyone at the table.
	$effect(() => {
		sceneRef.current?.setDiceStyles(client.lobby?.seats.map((s) => s.dice) ?? []);
	});

	// Feed every new state to the 3D scene the moment it arrives. The interface renders from
	// `client.view`, which waits for the dice of a roll to land. While an event card that just
	// turned over is held up, the board waits too: what it does plays out once it is put down.
	$effect(() => {
		const live = client.latest;
		if (live && client.presenting?.phase !== 'flip') sceneRef.current?.setView(live);
	});

	// Leave build mode when it no longer applies, and a power half-used when the moment for it has passed.
	$effect(() => {
		if (!myTurn(view) || view.step !== 'main') {
			ui.build = null;
			ui.paths = false;
			dialogs.guildHall = null;
		}
		if (!myTurn(view) || (view.step !== 'main' && view.step !== 'roll') || !powerReady(view, view.me)) ui.power = null;
	});

	// What can be clicked on the board right now.
	$effect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		const me = view.me;
		const color = view.players[me]?.color ?? 'white';
		let kind: PickKind | null = null;
		let options: number[] = [];
		const power = ui.power?.stage === 'pick' ? powerPick(view, ui.power.first) : null;
		if (power && myTurn(view) && !client.tossing && !client.presenting) {
			const first = ui.power?.stage === 'pick' ? ui.power.first : undefined;
			const ch = view.players[me].character;
			return scene.setPick({
				kind: power.kind,
				options: power.options,
				color,
				onPick: (id) => {
					if (ch === 'alchemist') ui.power = { stage: 'terrain', hex: id };
					else if (ch === 'cartographer' && first === undefined) ui.power = { stage: 'pick', first: id };
					else {
						ui.power = null;
						if (ch === 'cartographer') client.act({ type: 'usePower', hex: first, hex2: id });
						else if (ch === 'abbess') client.act({ type: 'usePower', hex: id });
						else client.act({ type: 'usePower', vertex: id });
					}
				}
			});
		}
		if (myTurn(view) && !client.tossing && !client.presenting) {
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
					} else if (ui.build === 'storehouse') {
						kind = 'storehouse';
						options = storehouseSpots(view, me);
					} else if (ui.build === 'tavern') {
						kind = 'tavern';
						options = tavernSpots(view, me);
					} else if (ui.build === 'tearDown') {
						kind = 'tearDown';
						options = ownWorkshops(view, me);
					} else if (isCityPath(ui.build)) {
						kind = ui.build;
						options = pathSpots(view, me, ui.build);
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
				else if (k === 'storehouse') client.act({ type: 'buildStorehouse', vertex: id });
				else if (k === 'tavern') client.act({ type: 'buildTavern', vertex: id });
				else if (k === 'tearDown') client.act({ type: 'tearDownWorkshop', hex: id });
				// A guild hall asks for the goods it trades first (Dialogs builds it).
				else if (k === 'guildHall') dialogs.guildHall = id;
				else if (k === 'castle' || k === 'fortress') {
					client.act({ type: 'buildCityPath', vertex: id, path: k });
					ui.paths = false;
				} else client.act({ type: 'buildCity', vertex: id });
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

	// Beacons lit on the map, this player's own and everyone else's, each shown once in its player's color.
	let beaconsShown = 0;
	$effect(() => {
		const scene = sceneRef.current;
		const players = client.latest?.players;
		for (const b of client.beacons) {
			if (b.id <= beaconsShown) continue;
			beaconsShown = b.id;
			const color = players?.[b.player]?.color;
			if (!scene || !color) continue;
			scene.beacon(b.x, b.z, color);
			sfx.beacon();
		}
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
			else if (e.type === 'tornDown') sfx.tearDown();
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
				if (e.player === me) client.toast(t("Time's up! Your turn is over."), 'error');
				else client.toast(t('{player} ran out of time', { player: view.players[e.player].name }));
				break;
			case 'stole':
				// Once the robber has landed, the card flies from the victim's cards to the thief's.
				afterRobber(() => {
					sfx.steal();
					if (e.victim === me) {
						const thief = view.players[e.thief].name;
						if (e.resource) client.toast(t('{player} stole your {resource}!', { player: thief, resource: t(RESOURCE_LABEL[e.resource]) }), 'error');
						else client.toast(t('{player} stole a card!', { player: thief }), 'error');
					}
					if (e.thief === me && e.resource)
						client.toast(t('You stole {resource} from {player}', { resource: t(RESOURCE_LABEL[e.resource]), player: view.players[e.victim].name }), 'good');
					flyStolen(e.victim, e.thief, e.resource);
				});
				break;
			case 'traitToll':
				// The Witch's purse makes a thief pay her instead; the Baron takes a toll on roads.
				afterRobber(() => flyStolen(e.from, e.to, e.resource));
				break;
			case 'monopoly':
				if (e.player !== me && e.taken[me]) client.toast(t('{player} took all your {resource}!', { player: view.players[e.player].name, resource: t(RESOURCE_LABEL[e.resource]) }), 'error');
				flyTaken(e.player, e.resource, e.taken);
				break;
			case 'longestRoad':
				if (e.player === me) client.toast(t('You hold the Longest Road! +2'), 'good');
				break;
			case 'largestArmy':
				if (e.player === me) client.toast(t('You command the Largest Army! +2'), 'good');
				break;
			case 'built':
				flyToPiece(e.player, e.paid, e.kind, e.at);
				break;
			case 'discarded':
				if (e.player === me) sfx.card();
				flyToBank(e.player, e.resources);
				break;
			case 'bankTrade':
				if (e.player === me) sfx.card();
				flyBankTrade(e.player, e.give, e.giveCount, e.get);
				break;
			case 'tradeCompleted':
				sfx.card();
				if (e.to === me) client.toast(t('Trade with {player} done', { player: view.players[e.from].name }), 'good');
				flyTraded(e.from, e.to, e.give, e.want);
				break;
			case 'gameOver':
				// A campaign mission lost (to a rival, or to the clock) is no fanfare.
				if (!view.campaign || e.winner === view.campaign.hero) sfx.win();
				break;
			case 'tribute':
				// A card of tribute rises off the bank's pile and flies to the rival who took it.
				sceneRef.current?.tradeOut(e.resource, -1, e.player);
				break;
			case 'devCardBought':
				sfx.card();
				flyToBank(e.player, e.paid);
				break;
			case 'characterPicked':
				sfx.card();
				break;
			case 'powerUsed': {
				// Powers are rare, so everyone hears and reads each one.
				sfx.open();
				if (e.player === me) break;
				const power = t(POWER_INFO[e.character].name);
				const who = view.players[e.player].name;
				if (e.target === me) client.toast(t('{player} used {power} on you!', { player: who, power }), 'error');
				else client.toast(t('{player} used {power}', { player: who, power }));
				break;
			}
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

	/** Time between cards that fly off one after another in a trade or a payment, in ms. */
	const CARD_GAP_MS = 120;
	/** How long a stolen card waits at most for the robber to land (a hidden tab draws nothing). */
	const ROBBER_WAIT_MS = 3000;
	/** When the last stolen card set off (performance.now()), so the next one follows it. */
	let lastStolen = -Infinity;

	/**
	 * Show a stolen card once the robber has landed on its new tile, a moment after the card
	 * before it (the Rogue takes two).
	 */
	function afterRobber(show: () => void) {
		const landed = sceneRef.current?.robberLanded() ?? Promise.resolve();
		const timeout = new Promise((done) => setTimeout(done, ROBBER_WAIT_MS));
		Promise.race([landed, timeout]).then(() => {
			const now = performance.now();
			const at = Math.max(now, lastStolen + CARD_GAP_MS);
			lastStolen = at;
			setTimeout(show, at - now);
		});
	}

	/**
	 * A card that changes hands without a trade, stolen or paid as a toll: it flies from the
	 * giver's cards to the taker's, face down for anyone who doesn't know what it is, and counts as
	 * it lands.
	 */
	function flyStolen(from: number, to: number, resource: Resource | null) {
		const counted = () => client.arrived(to, resource);
		const me = client.view?.me;
		if (me === undefined) return counted();
		flyers.pass(resource ?? 'back', from, to, me, counted);
	}

	/** Each card in a set of cards, kind by kind. */
	function oneByOne(cards: Partial<ResourceCounts>): Resource[] {
		return RESOURCES.flatMap((r) => Array<Resource>(cards[r] ?? 0).fill(r));
	}

	/**
	 * Cards a player hands to the bank, for a development card or a trade, or thrown back on a 7:
	 * they fly one after another from the player's cards to the bank's pile of their kind on the
	 * table, or to `harbor` when a trade got its rate.
	 */
	function flyToBank(player: number, cards: Partial<ResourceCounts>, harbor = -1) {
		const scene = sceneRef.current;
		if (!scene) return;
		oneByOne(cards).forEach((resource, k) =>
			setTimeout(() => {
				const me = client.view?.me;
				if (me === undefined) return;
				const to = scene.tradeTarget(resource, harbor);
				flyers.away(resource, player, me, to, () => scene.tradeLanded(resource, harbor));
			}, k * CARD_GAP_MS)
		);
	}

	/**
	 * The cards paid for a build fly one after another from the player's cards to the piece it put
	 * up on the board, at everyone's table. Should the piece not be there, they go to the bank.
	 */
	function flyToPiece(player: number, cards: Partial<ResourceCounts>, kind: BuiltKind, at: number) {
		const scene = sceneRef.current;
		if (!scene) return;
		oneByOne(cards).forEach((resource, k) =>
			setTimeout(() => {
				const me = client.view?.me;
				if (me === undefined) return;
				const piece = scene.buildTarget(kind, at);
				const to = piece ?? scene.tradeTarget(resource, -1);
				flyers.away(resource, player, me, to, () =>
					piece ? scene.buildLanded(kind, at) : scene.tradeLanded(resource, -1)
				);
			}, k * CARD_GAP_MS)
		);
	}

	/**
	 * A trade with the bank: the cards paid fly to the bank's pile of their kind on the table, or to
	 * the harbor whose rate they got. As the last one lands, the card bought rises off its own pile
	 * (or the harbor) and flies back, counting as it lands.
	 */
	function flyBankTrade(player: number, give: Resource, count: number, get: Resource) {
		const scene = sceneRef.current;
		if (!scene) return client.arrived(player, get);
		const harbor = tradeHarbor(view, player, give, count);
		flyToBank(player, { [give]: count }, harbor);
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
			oneByOne(cards).forEach((resource, k) =>
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
			// Alt+click (a long press on touch) on the map: a beacon there for the whole table.
			onBeacon: (x, z) => client.beacon(x, z),
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
		// Esc backs out of whatever is open, a step at a time, and opens the menu when nothing is.
		if (ui.menu) ui.menu = false;
		else if (dialogs.guildHall !== null) dialogs.guildHall = null;
		else if (ui.build || ui.trade) {
			ui.build = null;
			ui.trade = false;
		} else if (ui.paths) ui.paths = false;
		else ui.menu = true;
	}
	void getTopology;
</script>

<!-- Alt is held to light beacons: letting go of it shouldn't open the browser's menu bar. -->
<svelte:window onkeydown={onKey} onkeyup={(e) => e.key === 'Alt' && e.preventDefault()} />

<div class="hud" class:flash={ui.flash} class:timed style:--actions-h="{ui.actionsHeight}px">
	<Prompt />
	<Players />
	<DiceBadge />
	<Log />
	{#if client.replaying}
		<ReplayBar bind:statsOpen={replayData} />
		{#if replayData}<ReplayData />{/if}
	{:else if client.spectating}
		<SpectatorBar />
	{:else}
		<Hand />
		<TileIncome />
		<Actions />
		<OfferCard />
		{#if ui.trade}<TradePanel />{/if}
		<Dialogs />
		<PowerDialog />
	{/if}
	{#if view.events}<EventCard /><EventEffect />{/if}
	{#if view.campaign}<StoryLine /><MissionBrief />{/if}
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
