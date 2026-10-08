<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { isMuted, setMuted } from '../sound';

	let open = $state(false);
	let muted = $state(isMuted());
	let copied = $state(false);
	const quality = (() => {
		try {
			return localStorage.getItem('reign:quality') ?? 'high';
		} catch {
			return 'high';
		}
	})();

	function toggleQuality() {
		try {
			localStorage.setItem('reign:quality', quality === 'high' ? 'low' : 'high');
		} catch {
			/* ignore */
		}
		location.reload();
	}
	async function copy() {
		await navigator.clipboard?.writeText(client.inviteLink).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="menu">
	<button class="btn small wood" onclick={() => (open = !open)} aria-label="Menu">☰ {client.code}</button>
	{#if open}
		<div class="drop panel">
			<button class="btn small wood" onclick={copy}>{copied ? 'Copied!' : 'Copy invite link'}</button>
			<button class="btn small wood" onclick={() => { muted = !muted; setMuted(muted); }}>{muted ? 'Sound: off' : 'Sound: on'}</button>
			<button class="btn small wood" onclick={toggleQuality}>Graphics: {quality}</button>
			<button class="btn small red" onclick={() => { if (confirm('Leave this game?')) client.leave(); }}>Leave game</button>
		</div>
	{/if}
</div>

<style>
	.menu {
		position: absolute;
		top: 14px;
		left: 14px;
		pointer-events: auto;
		z-index: 30;
	}
	.drop {
		margin-top: 8px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		animation: pop-in 0.2s ease-out;
	}
	@media (max-width: 900px) {
		.menu {
			top: auto;
			bottom: 160px;
			left: 8px;
		}
	}
</style>
