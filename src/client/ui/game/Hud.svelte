<script lang="ts">
	import { getTopology } from '../../../shared/board/topology';
	import { roadSpots, settlementSpots, citySpots } from '../../../shared/rules/queries';
	import type { GameEvent } from '../../../shared/rules/types';
	import type { PickKind } from '../../scene/gameScene';
	import { client } from '../../state/client.svelte';
	import { myTurn } from '../helpers';
	import { sceneRef } from '../sceneRef';
	import { sfx } from '../sound';
	import Actions from './Actions.svelte';
	import Dialogs from './Dialogs.svelte';
	import DiceBadge from './DiceBadge.svelte';
	import Flyers, { flyers } from './Flyers.svelte';
	import Hand from './Hand.svelte';
	import Log from './Log.svelte';
	import GameMenu from './GameMenu.svelte';
	import OfferCard from './OfferCard.svelte';
	import Players from './Players.svelte';
	import Prompt from './Prompt.svelte';
	import TimeWarning from './TimeWarning.svelte';
	import TradePanel from './TradePanel.svelte';
	import Victory from './Victory.svelte';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);

	// Feed every new state to the 3D scene.
	$effect(() => {
		sceneRef.current?.setView(view);
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
		if (myTurn(view)) {
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
				else client.act({ type: 'buildCity', vertex: id });
				if (view.step === 'main') ui.build = null;
			}
		});
	});

	// Sounds, toasts and flying cards for new events.
	let lastSeq = -1;
	$effect(() => {
		const log = view.log;
		const newest = log.length ? log[log.length - 1].seq : 0;
		if (lastSeq < 0) {
			lastSeq = newest;
			return;
		}
		const fresh = log.filter((e) => e.seq > lastSeq);
		lastSeq = newest;
		for (const e of fresh) react(e);
	});

	function react(e: GameEvent) {
		const me = view.me;
		switch (e.type) {
			case 'diceRolled':
				sfx.dice();
				ui.rolling = true;
				break;
			case 'built':
				sfx.build();
				break;
			case 'turnStarted':
				if (e.player === me && e.turn > 0) {
					sfx.turn();
					ui.flash = true;
					setTimeout(() => (ui.flash = false), 1600);
				}
				break;
			case 'turnTimedOut':
				if (e.player === me) client.toast("Time's up! Your turn is over.", 'error');
				else client.toast(`${view.players[e.player].name} ran out of time`);
				break;
			case 'robberMoved':
				sfx.robber();
				break;
			case 'stole':
				sfx.steal();
				if (e.victim === me) client.toast(`${view.players[e.thief].name} stole ${e.resource ? 'your ' + e.resource : 'a card'}!`, 'error');
				if (e.thief === me && e.resource) client.toast(`You stole ${e.resource} from ${view.players[e.victim].name}`, 'good');
				break;
			case 'monopoly':
				if (e.player !== me && e.taken[me]) client.toast(`${view.players[e.player].name} took all your ${e.resource}!`, 'error');
				break;
			case 'longestRoad':
				if (e.player === me) client.toast('You hold the Longest Road! +2', 'good');
				break;
			case 'largestArmy':
				if (e.player === me) client.toast('You command the Largest Army! +2', 'good');
				break;
			case 'tradeCompleted':
				sfx.card();
				if (e.to === me) client.toast(`Trade with ${view.players[e.from].name} done`, 'good');
				break;
			case 'gameOver':
				sfx.win();
				break;
			case 'devCardBought':
				sfx.card();
				break;
		}
	}

	$effect(() => {
		const scene = sceneRef.current;
		scene?.setCallbacks({
			onDiceSettled: () => (ui.rolling = false),
			onResourcePopped: (player, resource, screen) => {
				if (player === client.view?.me) {
					sfx.coin();
					flyers.add(resource, screen);
				} else sfx.pop();
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

<div class="hud" class:flash={ui.flash}>
	<Prompt />
	<Players />
	<DiceBadge />
	<Log />
	<Hand />
	<Actions />
	<OfferCard />
	{#if ui.trade}<TradePanel />{/if}
	<Dialogs />
	<Victory />
	<Flyers />
	<GameMenu />
	<TimeWarning />
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
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
