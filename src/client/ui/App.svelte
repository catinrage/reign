<script lang="ts">
	import { client } from '../state/client.svelte';
	import Hud from './game/Hud.svelte';
	import Home from './Home.svelte';
	import Lobby from './Lobby.svelte';
	import Toasts from './Toasts.svelte';
	import { sceneRef } from './sceneRef';

	const screen = $derived(
		client.view && client.lobby?.started ? 'game' : client.lobby ? 'lobby' : 'home'
	);

	$effect(() => {
		if (screen !== 'game') {
			sceneRef.current?.setPick(null);
		}
	});

	let wasGame = false;
	$effect(() => {
		if (screen === 'game') wasGame = true;
		else if (wasGame) {
			wasGame = false;
			sceneRef.current?.showMenuBoard();
		}
	});
</script>

{#if screen === 'home'}
	<Home />
{:else if screen === 'lobby'}
	<Lobby />
{:else}
	<Hud />
{/if}

{#if client.status !== 'online'}
	<div class="conn">{client.status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</div>
{/if}
<Toasts />

<style>
	.conn {
		position: fixed;
		bottom: 14px;
		left: 50%;
		transform: translateX(-50%);
		font-family: var(--px);
		padding: 6px 14px;
		border-radius: 8px;
		background: rgba(30, 16, 8, 0.9);
		border: 2px solid #ff8a55;
		color: #ffe2c8;
		z-index: 70;
	}
</style>
