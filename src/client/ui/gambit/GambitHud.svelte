<script lang="ts">
	import type { GbEvent } from '../../../shared/gambit/types';
	import { PLAYER_RGB } from '../../scene/layout';
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import GameMenu from '../game/GameMenu.svelte';
	import PigeonLoft from '../game/PigeonLoft.svelte';
	import SpectatorBar from '../game/SpectatorBar.svelte';
	import TimeWarning from '../game/TimeWarning.svelte';
	import { ui } from '../game/ui.svelte';
	import { sceneRef } from '../sceneRef';
	import { sfx } from '../sound';
	import GbCheatPanel from './GbCheatPanel.svelte';
	import GbLog from './GbLog.svelte';
	import GbNote from './GbNote.svelte';
	import GbOrders from './GbOrders.svelte';
	import GbPlayers from './GbPlayers.svelte';
	import GbPrompt from './GbPrompt.svelte';
	import GbTip from './GbTip.svelte';
	import GbVictory from './GbVictory.svelte';
	import { gbPlay } from './play.svelte';
	import { playerName } from './text';

	/**
	 * A game of Gambit on screen: the board plays out each round as it comes in, and the interface
	 * follows once it has. Orders are given on the board itself: clicks come in through the scene's
	 * callbacks and `gbPlay` decides what they mean.
	 */

	const timed = $derived(!!client.lobby?.turnTime && client.gb?.phase !== 'ended');

	// The board's callbacks are in place before the board is made.
	$effect.pre(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		scene.gambitCallbacks = {
			onHover: (cell) => gbPlay.hovered(cell),
			onClick: (cell, touch) => gbPlay.clicked(cell, touch),
			onRound: () => gbPlay.roundShown(),
			onSettled: (v) => gbPlay.settle(v),
			// Alt+click (a long press on touch) on the board: a beacon there for the whole table.
			onBeacon: (x, z) => client.beacon(x, z)
		};
		if (scene.gambit) scene.gambit.callbacks = scene.gambitCallbacks;
	});

	// Beacons lit on the board, this player's own and everyone else's, each shown once in its player's color.
	let beaconsShown = 0;
	$effect(() => {
		const scene = sceneRef.current;
		const players = client.gb?.players;
		for (const b of client.beacons) {
			if (b.id <= beaconsShown) continue;
			beaconsShown = b.id;
			const color = players?.[b.player]?.color;
			if (!scene || !color) continue;
			scene.beacon(b.x, b.z, color);
			sfx.beacon();
		}
	});

	// Each state from the server goes to the board, which plays it out and then settles it here.
	$effect(() => {
		const v = client.gb;
		if (v) sceneRef.current?.showGambit(v, v.players.map((p) => PLAYER_RGB[p.color] ?? 0xffffff));
	});

	// A fresh table: nothing picked.
	$effect(() => () => gbPlay.reset());

	/** Events new since the last call: none at first, nor when a new game starts the log over. */
	let last = -1;
	function fresh(log: GbEvent[]) {
		const newest = log.length ? log[log.length - 1].seq : 0;
		const out = last >= 0 && newest >= last ? log.filter((e) => e.seq > last) : [];
		last = newest;
		return out;
	}

	// Sounds and toasts for what the board has shown.
	$effect(() => {
		const v = gbPlay.view;
		if (!v) return;
		const me = v.me;
		for (const e of fresh(v.log)) {
			switch (e.type) {
				case 'roundPlayed': {
					const mine = e.play.losses.filter((l) => l.piece.owner === me);
					const taken = e.play.losses.filter((l) => l.by === me && l.piece.owner !== me);
					if (taken.length) sfx.horn();
					else if (mine.length) sfx.steal();
					else sfx.build();
					if (mine.some((l) => l.piece.kind === 'monarch')) client.toast(t('Your monarch was taken: it goes home, and you give an order fewer this round.'), 'error');
					break;
				}
				case 'roundStarted':
					if (me >= 0) {
						sfx.turn();
						ui.flash = true;
						setTimeout(() => (ui.flash = false), 1200);
					}
					break;
				case 'turnTimedOut':
					if (e.player === me) client.toast(t("Time's up! Your orders went as they were."), 'error');
					else client.toast(t('{player} ran out of time', { player: playerName(v, e.player) }));
					break;
				case 'gameOver':
					sfx.win();
					break;
			}
		}
	});

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'Escape') {
			if (ui.menu) ui.menu = false;
			else if (gbPlay.selected !== null) gbPlay.clear();
			else ui.menu = true;
		} else if (e.key === 'b' || e.key === 'B') gbPlay.brace();
		else if (e.key === 'Enter' && gbPlay.ordering) gbPlay.setReady(!gbPlay.ready);
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="hud" class:flash={ui.flash} class:timed>
	{#if gbPlay.view}
		<GbPrompt />
		<GbPlayers />
		<GbLog />
		{#if client.spectating}
			<SpectatorBar />
		{:else if !client.replaying}
			<GbOrders />
		{/if}
		<GbTip />
		<GbNote />
		<GbVictory />
	{/if}
	<GameMenu />
	{#if client.cheats && gbPlay.view && !client.spectating && !client.replaying}<GbCheatPanel />{/if}
	{#if !client.spectating}
		<PigeonLoft />
		<TimeWarning />
	{/if}
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
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
