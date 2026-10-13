<script lang="ts">
	import type { CqEvent } from '../../../shared/conquest/types';
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import GameMenu from '../game/GameMenu.svelte';
	import PigeonLoft from '../game/PigeonLoft.svelte';
	import SpectatorBar from '../game/SpectatorBar.svelte';
	import TimeWarning from '../game/TimeWarning.svelte';
	import { ui } from '../game/ui.svelte';
	import { sceneRef } from '../sceneRef';
	import { sfx } from '../sound';
	import CqActions from './CqActions.svelte';
	import CqCards from './CqCards.svelte';
	import CqCombat from './CqCombat.svelte';
	import CqLog from './CqLog.svelte';
	import CqNote from './CqNote.svelte';
	import CqPlayers from './CqPlayers.svelte';
	import CqPrompt from './CqPrompt.svelte';
	import CqReplayBar from './CqReplayBar.svelte';
	import CqTip from './CqTip.svelte';
	import CqVictory from './CqVictory.svelte';
	import { cqPlay } from './play.svelte';
	import { boardNames, playerName } from './text';

	/**
	 * A game of Conquest on screen: the board plays out each new state (battles, captures) and the
	 * interface follows once it has. Everything is done on the board itself: clicks and drags come
	 * in through the scene's callbacks and `cqPlay` decides what they mean.
	 */

	const timed = $derived(!!client.lobby?.turnTime && client.cq?.phase !== 'ended');

	// The board's callbacks and names are in place before the board is made.
	$effect.pre(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		scene.conquestNames = boardNames();
		scene.conquestCallbacks = {
			onHover: (tr) => cqPlay.hovered(tr),
			onClick: (tr, touch) => cqPlay.clicked(tr, touch),
			onDragStart: (from) => cqPlay.dragStart(from),
			onDrop: (from, to) => cqPlay.dropped(from, to),
			onBattle: (b, fast) => cqPlay.fought(b, fast),
			onCaptured: (e) => cqPlay.captured(e),
			onSettled: (v) => cqPlay.settle(v)
		};
		if (scene.conquest) scene.conquest.callbacks = scene.conquestCallbacks;
	});

	// Each state from the server goes to the board, which plays it out and then settles it here.
	$effect(() => {
		const v = client.cq;
		if (v) sceneRef.current?.showConquest(v);
	});

	// A fresh table: nothing picked.
	$effect(() => () => {
		cqPlay.view = null;
		cqPlay.clear();
		cqPlay.info = null;
		cqPlay.hover = null;
		cqPlay.battle = null;
		cqPlay.lastBattle = null;
		cqPlay.cardsOpen = false;
	});

	/** Events new since the last call: none at first, nor when a new game starts the log over. */
	let last = -1;
	function fresh(log: CqEvent[]) {
		const newest = log.length ? log[log.length - 1].seq : 0;
		const out = last >= 0 && newest >= last ? log.filter((e) => e.seq > last) : [];
		last = newest;
		return out;
	}

	// Sounds and toasts for what the board has shown.
	$effect(() => {
		const v = cqPlay.view;
		if (!v) return;
		const me = v.me;
		for (const e of fresh(v.log)) {
			switch (e.type) {
				case 'turnStarted':
					if (e.player === me) {
						sfx.turn();
						ui.flash = true;
						setTimeout(() => (ui.flash = false), 1600);
					}
					break;
				case 'cardsTraded':
				case 'cardDrawn':
					if (e.player === me) sfx.card();
					break;
				case 'fortified':
					sfx.build();
					break;
				case 'eliminated':
					sfx.seven();
					if (e.player === me) client.toast(t('{player} knocked you out of the war.', { player: playerName(v, e.by) }), 'error');
					else if (e.by === me) client.toast(t('You knocked {player} out of the war!', { player: playerName(v, e.player) }), 'good');
					else client.toast(t('{by} knocked {player} out of the war.', { by: playerName(v, e.by), player: playerName(v, e.player) }));
					break;
				case 'turnTimedOut':
					if (e.player === me) client.toast(t("Time's up! Your turn is over."), 'error');
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
			// Esc backs out a step at a time: the cards, the target, the selection, then the menu.
			if (ui.menu) ui.menu = false;
			else if (cqPlay.cardsOpen && !cqPlay.view?.mustTrade) cqPlay.cardsOpen = false;
			else if (cqPlay.info !== null) cqPlay.info = null;
			else if (cqPlay.target !== null && !cqPlay.occupying) {
				cqPlay.target = null;
				cqPlay.sync();
			} else if (cqPlay.selected !== null && !cqPlay.occupying) cqPlay.clear();
			else ui.menu = true;
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="hud" class:flash={ui.flash} class:timed>
	{#if cqPlay.view}
		<CqPrompt />
		<CqPlayers />
		<CqLog />
		{#if client.replaying}
			<CqReplayBar />
		{:else if client.spectating}
			<SpectatorBar />
		{:else if !client.replaying}
			<CqCombat />
			<CqCards />
			<CqActions />
		{/if}
		<CqTip />
		<CqNote />
		<CqVictory />
	{/if}
	<GameMenu />
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
