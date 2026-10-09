<script lang="ts">
	import type { Match, MatchHistory } from '../../../shared/accounts';
	import { CHARACTER_INFO } from '../../../shared/rules/characters';
	import { MODE_INFO } from '../../../shared/rules/modes';
	import { account } from '../../state/account.svelte';
	import { PLAYER_CSS } from '../helpers';
	import { PIXEL } from '../pixel';
	import Avatar from './Avatar.svelte';
	import { ACCOUNT_ICONS } from './icons';

	/** A player's games: totals, then each game with how it went. Your own, or a friend's. */

	let { username = undefined }: { username?: string } = $props();

	let data = $state<MatchHistory | null>(null);
	let error = $state('');

	$effect(() => {
		const who = username;
		data = null;
		error = '';
		account
			.history(who)
			.then((h) => (data = h))
			.catch((e) => (error = (e as Error).message));
	});

	const winRate = $derived(data && data.stats.finished ? Math.round((data.stats.won / data.stats.finished) * 100) : null);

	function mine(m: Match) {
		return m.players.find((p) => p.user?.id === data?.user.id);
	}

	function result(m: Match): { text: string; kind: string } {
		if (m.status === 'playing') return { text: 'In progress', kind: 'live' };
		if (m.status === 'abandoned') return { text: 'Unfinished', kind: 'gone' };
		const place = mine(m)?.place;
		if (place === 1) return { text: 'Victory', kind: 'win' };
		return { text: place ? `${ordinal(place)} place` : 'Finished', kind: 'lose' };
	}

	function ordinal(n: number) {
		return n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
	}

	function when(iso: string) {
		const d = new Date(iso);
		const now = new Date();
		const day = 86400000;
		const startOf = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
		const days = Math.round((startOf(now) - startOf(d)) / day);
		const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		if (days === 0) return `Today ${time}`;
		if (days === 1) return `Yesterday ${time}`;
		return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
	}

	function length(m: Match) {
		if (!m.endedAt) return null;
		const min = Math.max(1, Math.round((Date.parse(m.endedAt) - Date.parse(m.startedAt)) / 60000));
		return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
	}
</script>

<div class="history">
	{#if error}
		<p class="error" role="alert">{error}</p>
	{:else if !data}
		<p class="loading"><img class="icon-px" src={PIXEL.hourglass} alt="" />Opening the chronicle…</p>
	{:else}
		{#if username}
			<div class="whose">
				<Avatar id={data.user.avatar} size={44} />
				<span class="title">{data.user.nickname}</span><small>@{data.user.username}</small>
			</div>
		{/if}
		<div class="stats">
			<div class="stat well"><b>{data.stats.played}</b><span>Played</span></div>
			<div class="stat well"><b>{data.stats.won}</b><span>Won</span></div>
			<div class="stat well"><b>{winRate === null ? '–' : `${winRate}%`}</b><span>Win rate</span></div>
		</div>

		{#if !data.matches.length}
			<p class="empty">No games yet. Every game played from now on is written down here.</p>
		{:else}
			<ul class="matches">
				{#each data.matches as m (m.id)}
					{@const r = result(m)}
					<li class="match plaque {r.kind}">
						<div class="top">
							<span class="result {r.kind}">
								{#if r.kind === 'win'}<img class="icon-px" src={ACCOUNT_ICONS.trophy} alt="" />{/if}{r.text}
							</span>
							<span class="what">
								{#if m.mode === 'extended'}<img class="icon-px" src={PIXEL.crown} alt="" />{/if}
								{MODE_INFO[m.mode]?.name ?? m.mode}{m.mode === 'extended' ? ` · ${m.mapName}` : ''}
							</span>
							<span class="when">{when(m.startedAt)}</span>
						</div>
						<div class="players">
							{#each [...m.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.points - a.points) as p, k (k)}
								<span class="player" class:me={p.user?.id === data.user.id} class:won={p.place === 1}>
									{#if p.isBot || !p.user}
										<span class="bot shield mini" style="--shield: var(--art-shield-{p.color})"
											><img class="icon-px" src={PIXEL.bot} alt="bot" /></span
										>
									{:else}
										<Avatar id={p.user.avatar} size={32} />
									{/if}
									<span class="pname">
										<span class="nm"><i class="swatch" style="background:{PLAYER_CSS[p.color]}"></i>{p.user?.nickname ?? p.name}{#if p.place === 1}<img
												class="icon-px crown"
												src={PIXEL.crown}
												alt="winner"
											/>{/if}</span>
										<small
											>{p.points} pts{#if p.character}
												· {CHARACTER_INFO[p.character]?.name}{/if}</small
										>
									</span>
								</span>
							{/each}
						</div>
						<div class="meta">
							{#if length(m)}<span>{length(m)}</span>{/if}
							{#if m.turns}<span>{m.turns} {m.turns === 1 ? 'turn' : 'turns'}</span>{/if}
							<span>to {m.pointsToWin} points</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	.history {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.loading img {
		height: 18px;
	}
	.whose {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.whose .title {
		font-size: 20px;
	}
	.whose small {
		font-weight: 700;
		color: var(--muted);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 6px 4px;
	}
	.stat b {
		font-family: var(--px);
		font-size: 28px;
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		line-height: 1;
	}
	.stat span {
		font-weight: 800;
		font-size: 13px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.matches {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.match {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
	}
	.match.win {
		box-shadow: inset 4px 0 0 #f2b431;
	}
	.match.gone {
		filter: saturate(0.6);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.result {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 18px;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.result img {
		height: 18px;
	}
	.result.win {
		color: var(--gold);
	}
	.result.lose {
		color: #f0dcc0;
	}
	.result.gone {
		color: #b8a898;
	}
	.result.live {
		color: #8ae070;
	}
	.what {
		flex: 1;
		min-width: 0;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 800;
		color: var(--muted);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.what img {
		height: 14px;
	}
	.when {
		font-weight: 700;
		font-size: 13px;
		color: var(--muted);
		white-space: nowrap;
	}
	.players {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 6px 10px;
	}
	.player {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		opacity: 0.85;
	}
	.player.me {
		opacity: 1;
	}
	.player.me .nm {
		color: #fff6d8;
		text-decoration: underline;
		text-decoration-color: rgba(255, 212, 90, 0.6);
		text-underline-offset: 3px;
	}
	.crown {
		height: 12px;
		flex: none;
	}
	.bot {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		flex: none;
	}
	.bot img {
		width: 16px;
		height: 16px;
	}
	.pname {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.15;
	}
	.nm {
		display: flex;
		align-items: center;
		gap: 4px;
		font-weight: 800;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.nm .swatch {
		width: 9px;
		height: 9px;
		border-width: 1px;
	}
	.pname small {
		font-weight: 700;
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.meta {
		display: flex;
		gap: 12px;
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
	}
	.error {
		color: #ffd2c4 !important;
	}
</style>
