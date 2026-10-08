<script lang="ts">
	import { client } from '../state/client.svelte';

	let code = $state(new URLSearchParams(location.search).get('room') ?? '');
	let name = $state(client.name);

	function commitName() {
		client.setName(name.trim().slice(0, 18));
	}
	function create() {
		commitName();
		client.create();
	}
	function join() {
		commitName();
		client.join(code);
	}
</script>

<div class="home">
	<div class="logo">
		<h1 class="title">REIGN</h1>
		<div class="sub title">settle · trade · build</div>
	</div>

	<div class="card panel">
		<label class="field">
			<span class="title">Your name</span>
			<input
				class="input"
				bind:value={name}
				maxlength="18"
				placeholder="Settler"
				onchange={commitName}
				onkeydown={(e) => e.key === 'Enter' && create()}
			/>
		</label>
		<button class="btn big green" onclick={create} disabled={client.pendingJoin || client.status !== 'online'}>
			Create a game
		</button>
		<button class="btn wood" onclick={() => { commitName(); client.quickPlay(3); }} disabled={client.pendingJoin || client.status !== 'online'}>
			Quick game vs 3 bots
		</button>
		<div class="or title"><span>or join a friend</span></div>
		<div class="join">
			<input
				class="input code"
				bind:value={code}
				maxlength="5"
				placeholder="CODE"
				oninput={() => (code = code.toUpperCase().replace(/[^A-Z]/g, ''))}
				onkeydown={(e) => e.key === 'Enter' && join()}
			/>
			<button class="btn" onclick={join} disabled={code.length !== 5 || client.pendingJoin || client.status !== 'online'}>Join</button>
		</div>
	</div>
	<p class="hint">Create a game, then send the link to your friends. Add bots to fill empty seats.</p>
</div>

<style>
	.home {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 22px;
		padding: 16px;
		background: radial-gradient(ellipse at 50% 55%, transparent 30%, rgba(10, 5, 2, 0.55) 100%);
	}
	.logo {
		text-align: center;
		pointer-events: none;
	}
	h1 {
		margin: 0;
		font-size: clamp(64px, 13vw, 132px);
		line-height: 0.9;
		color: #ffd86b;
		text-shadow:
			0 4px 0 #c9781a,
			0 8px 0 #8a4410,
			0 12px 0 #4a2008,
			0 18px 24px rgba(0, 0, 0, 0.6);
		letter-spacing: 0.08em;
	}
	.sub {
		margin-top: 18px;
		font-size: 20px;
		color: #fbe3b8;
		text-shadow: 0 2px 0 #3a1c0a;
		letter-spacing: 0.3em;
		text-transform: uppercase;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 22px;
		width: min(380px, 100%);
		box-sizing: border-box;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 15px;
		color: var(--muted);
	}
	.or {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--muted);
		font-size: 14px;
	}
	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 2px;
		background: rgba(255, 220, 170, 0.18);
	}
	.join {
		display: flex;
		gap: 10px;
	}
	.code {
		flex: 1;
		min-width: 0;
		text-transform: uppercase;
		letter-spacing: 0.3em;
		text-align: center;
	}
	.hint {
		margin: 0;
		color: #e9cfa8;
		font-size: 14px;
		text-shadow: 0 1px 2px #000;
		text-align: center;
	}
</style>
