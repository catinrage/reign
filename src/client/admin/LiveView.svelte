<script lang="ts">
	import { onMount } from 'svelte';
	import type { Live } from '../../shared/admin';
	import { ago, duration, get } from './api';

	let data = $state<Live | null>(null);
	let error = $state('');

	async function load() {
		try {
			data = await get<Live>('live');
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	onMount(() => {
		void load();
		const timer = setInterval(() => document.visibilityState === 'visible' && load(), 5000);
		return () => clearInterval(timer);
	});

	const SITES: Record<string, string> = { web: 'Own site', itch: 'itch.io', crazygames: 'CrazyGames' };
	const WHERE: Record<string, string> = { menu: 'In the menu', lobby: 'In a lobby', game: 'Playing', offline: 'Offline' };
	const guests = $derived(data?.clients.filter((c) => c.guest) ?? []);
</script>

{#if error}<p class="warn">{error}</p>{/if}
{#if !data}
	<p class="muted">Loading…</p>
{:else}
	<section class="card">
		<h2>Tables on the server ({data.rooms.length})</h2>
		<div class="scroll">
			<table>
				<thead>
					<tr><th>Code</th><th>State</th><th>Mode</th><th>Players</th><th class="num">Turn</th><th class="num">Watching</th><th>Open for</th></tr>
				</thead>
				<tbody>
					{#each data.rooms as r (r.code)}
						<tr>
							<td><code>{r.code}</code></td>
							<td>
								<span class="pill" class:good={r.state === 'playing'}>{r.state}</span>
								{#if r.listed}<span class="pill">public</span>{/if}
								{#if r.mission}<span class="pill">campaign: {r.mission}</span>{/if}
							</td>
							<td>{r.mode === 'extended' ? 'Extended' : 'Classic'}</td>
							<td>
								{#each r.seats as s, i (i)}
									<span class="seat" class:away={!s.connected}>
										{s.isBot ? '🤖 ' : ''}{s.name}{s.points !== null ? ` (${s.points})` : ''}{!s.connected ? ' · away' : ''}
									</span>
								{/each}
							</td>
							<td class="num">{r.turn || '—'}</td>
							<td class="num">{r.spectators || ''}</td>
							<td>{duration(r.createdAt, null)}</td>
						</tr>
					{:else}
						<tr><td colspan="7" class="muted">No tables right now.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<div class="two">
		<section class="card">
			<h2>Signed-in players online ({data.online.length})</h2>
			<table>
				<thead><tr><th>Player</th><th>Where</th><th>Table</th></tr></thead>
				<tbody>
					{#each data.online as o (o.user.id)}
						<tr>
							<td>{o.user.nickname} <span class="muted">@{o.user.username}</span></td>
							<td><span class="pill" class:good={o.where === 'game'}>{WHERE[o.where]}</span></td>
							<td>{#if o.room}<code>{o.room}</code>{/if}</td>
						</tr>
					{:else}
						<tr><td colspan="3" class="muted">Nobody signed in is online.</td></tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="card">
			<h2>Guests with the game open ({guests.length})</h2>
			<table>
				<thead><tr><th>Site</th><th>Doing</th><th>Open since</th></tr></thead>
				<tbody>
					{#each guests as c, i (i)}
						<tr>
							<td>{SITES[c.platform]}</td>
							<td>
								{#if c.game}
									<span class="pill good">Playing</span>
									{c.game.mission ? `campaign ${c.game.mission}` : `${c.game.mode === 'extended' ? 'Extended' : 'Classic'} vs ${c.game.bots} bots`}
								{:else if c.where === 'game'}
									<span class="pill good">Playing</span>
								{:else}
									<span class="pill">In the menu</span>
								{/if}
							</td>
							<td>{ago(c.since)}</td>
						</tr>
					{:else}
						<tr><td colspan="3" class="muted">No guests right now.</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	</div>
	<p class="muted">Refreshes every 5 seconds. A guest counts as here when their page pinged in the last 2½ minutes; a hidden tab stops pinging.</p>
{/if}

<style>
	section {
		margin-bottom: 12px;
	}
	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 12px;
	}
	.seat {
		display: inline-block;
		margin-right: 10px;
		white-space: nowrap;
	}
	.away {
		color: var(--muted);
	}
	code {
		font-weight: 600;
		letter-spacing: 0.05em;
	}
</style>
