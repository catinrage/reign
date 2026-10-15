<script lang="ts">
	import { account } from '../state/account.svelte';
	import { client } from '../state/client.svelte';
	import Auth from './account/Auth.svelte';
	import Invites from './account/Invites.svelte';
	import Hud from './game/Hud.svelte';
	import ConquestHud from './conquest/ConquestHud.svelte';
	import GambitHud from './gambit/GambitHud.svelte';
	import { showMenuGambit } from './gambit/menuTable';
	import { PLAYER_RGB } from '../scene/layout';
	import { boardNames } from './conquest/text';
	import { conquestMap } from '../../shared/conquest/queries';
	import Home from './Home.svelte';
	import Joining from './Joining.svelte';
	import Lobby from './Lobby.svelte';
	import { gamePick } from './menu/gamePick.svelte';
	import NetReadout from './NetReadout.svelte';
	import Toasts from './Toasts.svelte';
	import { PIXEL } from './pixel';
	import { setMusicMode, sfx } from './sound';
	import { sceneRef } from './sceneRef';
	import { settings } from './settings.svelte';
	import { t } from '../i18n/index.svelte';

	const screen = $derived(
		account.status !== 'in'
			? 'auth'
			: client.joining
				? 'joining'
			: (client.view || client.cq || client.gb) && client.lobby?.started
				? 'game'
				: client.launching
					? 'launching'
				: client.lobby
					? 'lobby'
					: 'home'
	);

	// Players pick how big the interface is drawn: the HUD in a game, the menus everywhere else.
	// The whole layer is zoomed, so `--ui-zoom` lets its styles size things from the screen
	// (100vw would grow with the zoom too).
	const size = $derived(screen === 'game' ? settings.hudSize : settings.menuSize);

	$effect(() => {
		if (screen !== 'game') {
			sceneRef.current?.setPick(null);
		}
	});

	// The tavern tune plays full in the menus and softly under a game.
	$effect(() => {
		setMusicMode(screen === 'game' ? 'game' : 'menu');
	});

	// Wooden taps for every button, and a faint tick when the mouse moves onto one.
	const PRESSABLE =
		'.btn, .icon-btn, .medal, .banner, .tile, .build, .card.playable, .card.clickable, .seg .btn';
	let hovered: Element | null = null;
	function onPointerDown(e: PointerEvent) {
		const el = (e.target as Element | null)?.closest?.(PRESSABLE);
		if (el && !(el as HTMLButtonElement).disabled) sfx.click();
	}
	function onPointerOver(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		const el = (e.target as Element | null)?.closest?.(PRESSABLE) ?? null;
		if (el !== hovered && el && !(el as HTMLButtonElement).disabled) sfx.hover();
		hovered = el;
	}

	// A horn call for everyone at the table as the lobby closes and the game begins, or as a bot
	// game or mission sets off from the menu (a rejoin comes in from the menu, so it stays quiet).
	let lastScreen: typeof screen | null = null;
	$effect(() => {
		if (screen === 'game' && (lastScreen === 'lobby' || lastScreen === 'launching')) sfx.horn();
		lastScreen = screen;
	});

	// The Realm's board names its territories in the player's language, from the menu's table on
	// (the board is often made there, before any game), and again when the language changes.
	$effect.pre(() => {
		sceneRef.current?.setConquestNames(boardNames());
	});

	let wasGame = false;
	$effect(() => {
		if (screen === 'game') wasGame = true;
		else if (wasGame) {
			wasGame = false;
			// Back to the table the menu (or the lobby) is about: the Realm for Conquest, the board for Gambit.
			const game = client.lobby ? client.lobby.game : gamePick.game;
			const lobby = client.lobby;
			if (game === 'conquest') sceneRef.current?.showConquestTable(lobby ? conquestMap(lobby.conquest) : undefined);
			else if (game === 'gambit') {
				if (lobby) sceneRef.current?.showGambitTable(lobby.seats.length, lobby.gambit, lobby.seats.map((x) => PLAYER_RGB[x.color] ?? 0xffffff));
				else showMenuGambit();
			} else sceneRef.current?.showMenuBoard();
		}
	});
</script>

<svelte:window onpointerdown={onPointerDown} onpointerover={onPointerOver} />

<NetReadout />
<div class="ui" style:zoom={size === 1 ? undefined : size} style:--ui-zoom={size}>
	{#if screen === 'auth'}
		{#if account.status === 'out'}<Auth />{/if}
	{:else if screen === 'home' || screen === 'launching'}
		<!-- Play vs bots and missions keep the menu up while their table is set up. -->
		<Home />
	{:else if screen === 'joining'}
		<Joining />
	{:else if screen === 'lobby'}
		<Lobby />
	{:else if client.lobby?.game === 'conquest'}
		<ConquestHud />
	{:else if client.lobby?.game === 'gambit'}
		<GambitHud />
	{:else}
		<Hud />
	{/if}

	{#if account.status === 'in'}<Invites />{/if}

	{#if account.status === 'loading' || (account.status === 'in' && client.status !== 'online' && screen !== 'joining')}
		<div class="conn plaque">
			<img class="icon-px" src={PIXEL.hourglass} alt="" />{client.status === 'connecting'
				? t('Connecting…')
				: t('Reconnecting…')}
		</div>
	{/if}
	<Toasts />
</div>

<style>
	.ui {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.conn {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 14px 6px 10px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.5));
		z-index: 80;
		animation: fade-in 0.4s ease-out 0.6s both;
	}
	.conn img {
		width: 24px;
		height: 24px;
		animation: flip 1.6s ease-in-out infinite;
	}
	@keyframes flip {
		50% {
			transform: rotate(180deg);
		}
	}
</style>
