<script lang="ts">
	import { onMount } from 'svelte';
	import type { Overview } from '../../shared/admin';
	import { get } from './api';
	import BarChart from './BarChart.svelte';

	let { onopen }: { onopen: (tab: 'live' | 'users' | 'games') => void } = $props();

	let data = $state<Overview | null>(null);
	let error = $state('');

	async function load() {
		try {
			data = await get<Overview>('overview');
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	onMount(() => {
		void load();
		const timer = setInterval(() => document.visibilityState === 'visible' && load(), 15_000);
		return () => clearInterval(timer);
	});

	const days = $derived(data?.days.map((d) => d.day) ?? []);
	const o = $derived(data?.guestOutcomes ?? { won: 0, lost: 0, quit: 0, playing: 0 });
	const all = $derived(o.won + o.lost + o.quit + o.playing);
	const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
	const SITES: Record<string, string> = { web: 'Own site', itch: 'itch.io', crazygames: 'CrazyGames' };
</script>

{#if error}<p class="warn">{error}</p>{/if}
{#if !data}
	<p class="muted">Loading…</p>
{:else}
	{@const l = data.live}
	<section class="tiles live">
		<button class="tile card" onclick={() => onopen('live')}>
			<span class="label">Playing right now</span>
			<span class="big">{l.usersInGame + l.guestsInGame}</span>
			<span class="muted">{l.usersInGame} signed in · {l.guestsInGame} guests</span>
		</button>
		<button class="tile card" onclick={() => onopen('live')}>
			<span class="label">Online now</span>
			<span class="big">{l.usersOnline + l.guestsOnline}</span>
			<span class="muted">{l.usersOnline} signed in · {l.guestsOnline} guests</span>
		</button>
		<button class="tile card" onclick={() => onopen('live')}>
			<span class="label">Tables on the server</span>
			<span class="big">{l.roomsPlaying + l.roomsLobby}</span>
			<span class="muted">{l.roomsPlaying} playing · {l.roomsLobby} in the lobby</span>
		</button>
	</section>

	<section class="tiles">
		<button class="tile card" onclick={() => onopen('users')}>
			<span class="label">Accounts</span>
			<span class="big">{data.totals.users.toLocaleString()}</span>
			<span class="muted">+{data.recent.newUsers24h} today · +{data.recent.newUsers7d} this week · {data.totals.usersCrazyGames} via CrazyGames</span>
		</button>
		<div class="tile card">
			<span class="label">Visitors</span>
			<span class="big">{data.recent.active24h.toLocaleString()}</span>
			<span class="muted">last 24 h · {data.recent.active7d} this week · {data.recent.active30d} this month</span>
		</div>
		<button class="tile card" onclick={() => onopen('games')}>
			<span class="label">Online games</span>
			<span class="big">{data.totals.games.toLocaleString()}</span>
			<span class="muted">{data.recent.games24h} today · {pct(data.totals.gamesFinished, data.totals.games)} finished · {data.totals.replays} replays</span>
		</button>
		<div class="tile card">
			<span class="label">Guest games vs bots</span>
			<span class="big">{data.totals.guestGames.toLocaleString()}</span>
			<span class="muted">{data.recent.guestGames24h} today</span>
		</div>
		<div class="tile card">
			<span class="label">Browsers ever seen</span>
			<span class="big">{data.totals.visitors.toLocaleString()}</span>
			<span class="muted">{pct(data.totals.guestVisitors, data.totals.visitors)} never signed in</span>
		</div>
	</section>

	<section class="charts">
		<BarChart
			title="Daily visitors"
			{days}
			series={[
				{ label: 'Signed in', color: 'var(--series-1)', values: data.days.map((d) => d.activeUsers) },
				{ label: 'Guests', color: 'var(--series-2)', values: data.days.map((d) => d.activeGuests) }
			]}
		/>
		<BarChart
			title="Games started"
			{days}
			series={[
				{ label: 'Online (server)', color: 'var(--series-1)', values: data.days.map((d) => d.games) },
				{ label: 'Guests vs bots', color: 'var(--series-2)', values: data.days.map((d) => d.guestGames) }
			]}
		/>
		<BarChart title="New accounts" {days} series={[{ label: 'New accounts', color: 'var(--series-1)', values: data.days.map((d) => d.newUsers) }]} />
	</section>

	<section class="grid3">
		<div class="card">
			<h2>Sites, last 7 days</h2>
			<table>
				<thead><tr><th>Site</th><th class="num">Signed in</th><th class="num">Guests</th></tr></thead>
				<tbody>
					{#each data.platforms as p (p.platform)}
						<tr><td>{SITES[p.platform] ?? p.platform}</td><td class="num">{p.users}</td><td class="num">{p.guests}</td></tr>
					{:else}
						<tr><td colspan="3" class="muted">No visits yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="card">
			<h2>Modes, last 30 days</h2>
			<table>
				<thead><tr><th>Mode</th><th class="num">Online</th><th class="num">Guests</th></tr></thead>
				<tbody>
					{#each data.modes as m (m.mode)}
						<tr><td>{m.mode === 'extended' ? 'Reign Extended' : 'Classic'}</td><td class="num">{m.games}</td><td class="num">{m.guestGames}</td></tr>
					{:else}
						<tr><td colspan="3" class="muted">No games yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="card">
			<h2>How guests' games ended, last 30 days</h2>
				<table>
					<tbody>
						<tr><td>Won</td><td class="num">{o.won}</td><td class="num muted">{pct(o.won, all)}</td></tr>
						<tr><td>Lost to bots</td><td class="num">{o.lost}</td><td class="num muted">{pct(o.lost, all)}</td></tr>
						<tr><td>Left mid-game</td><td class="num">{o.quit}</td><td class="num muted">{pct(o.quit, all)}</td></tr>
						<tr><td>Unfinished (tab closed, or still on)</td><td class="num">{o.playing}</td><td class="num muted">{pct(o.playing, all)}</td></tr>
					</tbody>
				</table>
		</div>
		{#if data.missions.length}
			<div class="card">
				<h2>Guests' campaign missions, last 30 days</h2>
				<table>
					<thead><tr><th>Mission</th><th class="num">Played</th><th class="num">Won</th></tr></thead>
					<tbody>
						{#each data.missions as m (m.mission)}
							<tr><td>{m.mission}</td><td class="num">{m.played}</td><td class="num">{m.won}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
	<p class="muted note">
		Guests play against bots inside their own page, so their numbers come from what each page reports (a ping a minute
		while the game is open). Visitors count browsers, not people. Days are UTC. Refreshes every 15 seconds.
	</p>
{/if}

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
		margin-bottom: 12px;
	}
	.tile {
		display: grid;
		gap: 2px;
		text-align: left;
		cursor: default;
	}
	button.tile {
		cursor: pointer;
	}
	button.tile:hover {
		border-color: var(--accent);
	}
	.label {
		color: var(--text-2);
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.big {
		font-size: 30px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.live .big {
		color: var(--accent);
	}
	.muted {
		font-size: 12px;
	}
	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 12px;
		margin: 18px 0 12px;
	}
	.grid3 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 12px;
	}
	.note {
		margin-top: 16px;
	}
</style>
