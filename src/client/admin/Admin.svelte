<script lang="ts">
	import { onMount } from 'svelte';
	import { NotAdmin, Unauthorized, get, signIn, signOut } from './api';
	import Overview from './Overview.svelte';
	import LiveView from './LiveView.svelte';
	import Users from './Users.svelte';
	import Matches from './Matches.svelte';

	type Tab = 'overview' | 'live' | 'users' | 'games';
	const TABS: { id: Tab; label: string }[] = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'live', label: 'Live' },
		{ id: 'users', label: 'Players' },
		{ id: 'games', label: 'Games' }
	];

	let status = $state<'loading' | 'out' | 'denied' | 'in'>('loading');
	let tab = $state<Tab>(readTab());
	let username = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	function readTab(): Tab {
		const h = location.hash.slice(1);
		return TABS.some((t) => t.id === h) ? (h as Tab) : 'overview';
	}

	function pick(t: Tab) {
		tab = t;
		history.replaceState(null, '', `#${t}`);
	}

	async function check() {
		try {
			await get('me');
			status = 'in';
		} catch (e) {
			status = e instanceof Unauthorized ? 'out' : e instanceof NotAdmin ? 'denied' : 'out';
			if (!(e instanceof Unauthorized) && !(e instanceof NotAdmin)) error = (e as Error).message;
		}
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			await signIn(username, password);
			password = '';
			await check();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function out() {
		await signOut();
		status = 'out';
	}

	onMount(check);
</script>

<div class="shell">
	<header>
		<div class="brand"><img src="/favicon.svg" alt="" width="24" height="24" /> Reign <span>admin</span></div>
		{#if status === 'in'}
			<nav>
				{#each TABS as t (t.id)}
					<button class:on={tab === t.id} onclick={() => pick(t.id)}>{t.label}</button>
				{/each}
			</nav>
			<button class="ghost" onclick={out}>Sign out</button>
		{/if}
	</header>

	<main>
		{#if status === 'loading'}
			<p class="muted">Loading…</p>
		{:else if status === 'out' || status === 'denied'}
			<form class="card signin" onsubmit={submit}>
				<h1>Sign in</h1>
				{#if status === 'denied'}
					<p class="warn">That account isn't an admin. Sign in with one named in the server's ADMIN_USERS.</p>
				{/if}
				<label>Username <input bind:value={username} autocomplete="username" required /></label>
				<label>Password <input type="password" bind:value={password} autocomplete="current-password" required /></label>
				{#if error}<p class="warn">{error}</p>{/if}
				<button class="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
			</form>
		{:else if tab === 'overview'}
			<Overview onopen={pick} />
		{:else if tab === 'live'}
			<LiveView />
		{:else if tab === 'users'}
			<Users />
		{:else}
			<Matches />
		{/if}
	</main>
</div>

<style>
	:global(:root) {
		color-scheme: light;
		--bg: #f6f3ee;
		--surface: #fffdf9;
		--surface-2: #f0ebe3;
		--line: #e2dacd;
		--text: #1d1712;
		--text-2: #5a5047;
		--muted: #8a7f74;
		--accent: #b5651d;
		--series-1: #2a78d6;
		--series-2: #eb6834;
		--good: #1f8a4c;
		--bad: #c0392b;
		--warn-bg: #fdf0e3;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) {
			color-scheme: dark;
			--bg: #15100c;
			--surface: #1f1813;
			--surface-2: #2a211a;
			--line: #3a2f26;
			--text: #f3ece3;
			--text-2: #c9bcae;
			--muted: #8f8274;
			--accent: #f0a050;
			--series-1: #3987e5;
			--series-2: #d95926;
			--good: #4cc27e;
			--bad: #ff7a6b;
			--warn-bg: #3a2616;
		}
	}
	:global(:root[data-theme='dark']) {
		color-scheme: dark;
		--bg: #15100c;
		--surface: #1f1813;
		--surface-2: #2a211a;
		--line: #3a2f26;
		--text: #f3ece3;
		--text-2: #c9bcae;
		--muted: #8f8274;
		--accent: #f0a050;
		--series-1: #3987e5;
		--series-2: #d95926;
		--good: #4cc27e;
		--bad: #ff7a6b;
		--warn-bg: #3a2616;
	}
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font:
			14px/1.45 system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}
	:global(button),
	:global(input),
	:global(select) {
		font: inherit;
		color: inherit;
	}
	:global(.card) {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 16px;
	}
	:global(.muted) {
		color: var(--muted);
	}
	:global(.warn) {
		background: var(--warn-bg);
		border-radius: 6px;
		padding: 8px 10px;
		margin: 0;
	}
	:global(h2) {
		font-size: 15px;
		margin: 0 0 12px;
	}
	:global(table) {
		width: 100%;
		border-collapse: collapse;
	}
	:global(th) {
		text-align: left;
		font-weight: 600;
		color: var(--text-2);
		font-size: 12px;
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	:global(td) {
		padding: 7px 8px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	:global(.num) {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	:global(.scroll) {
		overflow-x: auto;
	}
	:global(.pill) {
		display: inline-block;
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text-2);
		font-size: 12px;
		white-space: nowrap;
	}
	:global(.pill.good) {
		color: var(--good);
	}
	:global(.pill.bad) {
		color: var(--bad);
	}
	:global(a) {
		color: var(--accent);
	}
	:global(button.link) {
		background: none;
		border: 0;
		padding: 0;
		color: var(--accent);
		cursor: pointer;
		text-decoration: underline;
	}
	:global(.toolbar) {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 12px;
	}
	:global(.toolbar input),
	:global(.toolbar select),
	:global(.toolbar button) {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 6px 10px;
	}
	:global(.toolbar button) {
		cursor: pointer;
	}
	:global(.toolbar button:disabled) {
		opacity: 0.5;
		cursor: default;
	}
	.shell {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 16px 40px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		padding: 14px 0;
		border-bottom: 1px solid var(--line);
		margin-bottom: 18px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
		font-size: 16px;
	}
	.brand span {
		color: var(--muted);
		font-weight: 500;
	}
	nav {
		display: flex;
		gap: 4px;
		flex: 1;
		flex-wrap: wrap;
	}
	nav button,
	.ghost {
		background: none;
		border: 0;
		padding: 6px 12px;
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-2);
	}
	nav button.on {
		background: var(--surface-2);
		color: var(--text);
		font-weight: 600;
	}
	@media (max-width: 640px) {
		header {
			gap: 8px 16px;
		}
		header > .ghost {
			margin-left: auto;
		}
		nav {
			order: 3;
			flex: 1 0 100%;
			flex-wrap: nowrap;
			overflow-x: auto;
		}
	}
	.signin {
		max-width: 340px;
		margin: 60px auto;
		display: grid;
		gap: 12px;
	}
	.signin h1 {
		margin: 0;
		font-size: 20px;
	}
	.signin label {
		display: grid;
		gap: 4px;
		color: var(--text-2);
	}
	.signin input {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 8px 10px;
	}
	.primary {
		background: var(--accent);
		color: #fff;
		border: 0;
		border-radius: 6px;
		padding: 9px;
		font-weight: 600;
		cursor: pointer;
	}
</style>
