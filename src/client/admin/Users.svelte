<script lang="ts">
	import { onMount } from 'svelte';
	import type { AdminUserDetail, AdminUsers } from '../../shared/admin';
	import { ago, get, when } from './api';
	import MatchTable from './MatchTable.svelte';

	const PAGE = 50;
	let data = $state<AdminUsers | null>(null);
	let q = $state('');
	let sort = $state<'new' | 'seen' | 'games'>('new');
	let offset = $state(0);
	let error = $state('');
	let detail = $state<AdminUserDetail | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function load() {
		try {
			data = await get<AdminUsers>(`users?offset=${offset}&sort=${sort}&q=${encodeURIComponent(q)}`);
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function search() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			offset = 0;
			void load();
		}, 250);
	}

	function page(by: number) {
		offset = Math.max(0, offset + by);
		void load();
	}

	async function open(id: string) {
		try {
			detail = await get<AdminUserDetail>(`users/${id}`);
			scrollTo({ top: 0, behavior: 'smooth' });
		} catch (e) {
			error = (e as Error).message;
		}
	}

	onMount(load);

	const WHERE: Record<string, string> = { menu: 'Online', lobby: 'In a lobby', game: 'Playing', offline: '' };
	const SITES: Record<string, string> = { web: 'own site', itch: 'itch.io', crazygames: 'CrazyGames' };
</script>

{#if detail}
	{@const u = detail.user}
	<section class="card detail">
		<div class="dhead">
			<div>
				<h2>{u.nickname} <span class="muted">@{u.username}</span></h2>
				<div class="muted">
					Joined {when(u.createdAt)} · last seen {ago(u.lastSeen)}
					{#if u.crazyGames}· CrazyGames account{/if}
					{#if u.platforms.length}· plays on {u.platforms.map((p) => SITES[p]).join(', ')}{/if}
				</div>
			</div>
			<button class="link" onclick={() => (detail = null)}>Close</button>
		</div>
		<div class="facts">
			<span><b>{u.played}</b> games</span>
			<span><b>{u.won}</b> won ({u.played ? Math.round((u.won / u.played) * 100) : 0}%)</span>
			<span><b>{u.friends}</b> friends</span>
			<span><b>{u.campaignStars}</b> campaign stars ({detail.campaign.length} missions)</span>
			<span><b>{detail.maps}</b> saved maps</span>
			<span><b>{detail.sessions}</b> sign-ins</span>
			{#if WHERE[u.where]}<span class="pill good">{WHERE[u.where]}</span>{/if}
		</div>
		<h2>Latest games</h2>
		<MatchTable matches={detail.matches} onuser={open} />
	</section>
{/if}

<div class="toolbar">
	<input placeholder="Search username or nickname" bind:value={q} oninput={search} />
	<select
		bind:value={sort}
		onchange={() => {
			offset = 0;
			void load();
		}}
	>
		<option value="new">Newest first</option>
		<option value="seen">Last seen</option>
		<option value="games">Most games</option>
	</select>
	{#if data}
		<span class="muted">{data.total ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} of ${data.total}` : 'None'}</span>
		<button disabled={offset === 0} onclick={() => page(-PAGE)}>← Prev</button>
		<button disabled={offset + PAGE >= data.total} onclick={() => page(PAGE)}>Next →</button>
	{/if}
</div>
{#if error}<p class="warn">{error}</p>{/if}
<div class="card scroll">
	{#if !data}
		<p class="muted">Loading…</p>
	{:else}
		<table>
			<thead>
				<tr><th>Player</th><th>Joined</th><th>Last seen</th><th class="num">Games</th><th class="num">Won</th><th class="num">Friends</th><th class="num">★</th><th>Sites</th><th></th></tr>
			</thead>
			<tbody>
				{#each data.users as u (u.id)}
					<tr>
						<td><button class="link" onclick={() => open(u.id)}>{u.nickname}</button> <span class="muted">@{u.username}</span></td>
						<td>{when(u.createdAt)}</td>
						<td>{ago(u.lastSeen)}</td>
						<td class="num">{u.played}</td>
						<td class="num">{u.won}</td>
						<td class="num">{u.friends}</td>
						<td class="num">{u.campaignStars}</td>
						<td>{u.platforms.map((p) => SITES[p]).join(', ')}{u.crazyGames && !u.platforms.includes('crazygames') ? 'CrazyGames' : ''}</td>
						<td>{#if WHERE[u.where]}<span class="pill good">{WHERE[u.where]}</span>{/if}</td>
					</tr>
				{:else}
					<tr><td colspan="9" class="muted">No players found.</td></tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.detail {
		margin-bottom: 16px;
	}
	.dhead {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	.dhead h2 {
		margin-bottom: 2px;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		margin: 8px 0 18px;
		color: var(--text-2);
	}
	.facts b {
		color: var(--text);
	}
	.toolbar input {
		min-width: 240px;
	}
</style>
