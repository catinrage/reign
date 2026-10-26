<script lang="ts">
	import { onMount } from 'svelte';
	import type { RoomSummary } from '../../../shared/protocol';
	import { MODE_INFO } from '../../../shared/rules/modes';
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { fetchRooms } from '../../state/rooms';
	import Avatar from '../account/Avatar.svelte';
	import { ACCOUNT_ICONS } from '../account/icons';
	import { PIXEL } from '../pixel';
	import CodeTiles from './CodeTiles.svelte';
	import { gamePick } from './gamePick.svelte';
	import { GAMES, gameInfo } from './games';

	/**
	 * The rooms browser: public tables waiting for players as a table you can search, filter and
	 * sort, a new room of your own (listed here for anyone to join, or unlisted, for friends with
	 * the code), and joining by code. A guest sees the list too, with sign-in in place of joining.
	 */
	let {
		guest = false,
		onsignin = undefined
	}: {
		guest?: boolean;
		/** A guest wants to sign in ('in') or make an account ('up') to play online. */
		onsignin?: (mode: 'in' | 'up') => void;
	} = $props();

	/** How often the list asks the server again while it's open. */
	const REFRESH_MS = 5000;

	let rooms = $state<RoomSummary[] | null>(null);
	let failed = $state(false);
	let loading = $state(false);
	let listed = $state(true);
	let code = $state('');
	/** Ticks every few seconds so "opened … ago" stays true. */
	let now = $state(Date.now());

	// Filters and order.
	let search = $state('');
	let mode = $state<'all' | 'classic' | 'extended'>('all');
	let timer = $state<'any' | 'timed' | 'untimed'>('any');
	let extras = $state({ characters: false, events: false, noBots: false, standard: false });
	let sort = $state<'players' | 'newest' | 'points' | 'seats'>('players');

	const busy = $derived(client.pendingJoin || client.launching || client.status !== 'online');

	async function refresh() {
		if (loading) return;
		loading = true;
		try {
			rooms = await fetchRooms();
			failed = false;
		} catch {
			failed = true;
		} finally {
			loading = false;
			now = Date.now();
		}
	}

	onMount(() => {
		void refresh();
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh();
		}, REFRESH_MS);
		return () => clearInterval(timer);
	});

	const shown = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = (rooms ?? []).filter((r) => {
			if (mode !== 'all' && r.mode !== mode) return false;
			if (timer === 'timed' && !r.turnTime) return false;
			if (timer === 'untimed' && r.turnTime) return false;
			if (extras.characters && !r.characters) return false;
			if (extras.events && !r.events) return false;
			if (extras.noBots && r.bots) return false;
			if (extras.standard && (r.houseRules || r.handLimit !== 7 || r.pointsToWin !== 10)) return false;
			if (!q) return true;
			return [r.code, r.host, r.map, ...r.seats.map((s) => s.name)].some((v) => v.toLowerCase().includes(q));
		});
		const free = (r: RoomSummary) => r.maxPlayers - r.seats.length;
		const by: Record<typeof sort, (a: RoomSummary, b: RoomSummary) => number> = {
			players: (a, b) => b.players - a.players || b.createdAt - a.createdAt,
			newest: (a, b) => b.createdAt - a.createdAt,
			points: (a, b) => a.pointsToWin - b.pointsToWin || b.players - a.players,
			seats: (a, b) => free(a) - free(b) || b.createdAt - a.createdAt
		};
		return list.sort(by[sort]);
	});
	const waiting = $derived((rooms ?? []).reduce((n, r) => n + r.players, 0));
	const filtered = $derived(
		search.trim() !== '' || mode !== 'all' || timer !== 'any' || Object.values(extras).some(Boolean)
	);

	function clearFilters() {
		search = '';
		mode = 'all';
		timer = 'any';
		extras = { characters: false, events: false, noBots: false, standard: false };
	}

	function create() {
		if (busy) return;
		client.create(gamePick.game, listed);
	}
	function join(c: string) {
		if (busy || c.length !== 5) return;
		client.join(c);
	}

	function turnTime(secs: number): string {
		if (!secs) return t('No limit');
		return secs < 60 ? t('{n}s turns', { n: secs }) : t('{n} min turns', { n: secs / 60 });
	}
	function age(at: number): string {
		const mins = Math.max(0, Math.floor((now - at) / 60_000));
		if (mins < 1) return t('just now');
		if (mins < 60) return t('{n} min ago', { n: mins });
		return t('{n} h ago', { n: Math.floor(mins / 60) });
	}
</script>

<div class="rooms">
	{#if guest}
		<div class="cta parch">
			<img class="icon-px big" src={ACCOUNT_ICONS.friends} alt="" />
			<div class="cta-text">
				<b class="title">{t('Sign in to play online')}</b>
				<span>{t('A free account lets you join these tables, open your own and invite friends.')}</span>
			</div>
			<div class="cta-btns">
				<button class="btn small shine" onclick={() => onsignin?.('up')}>{t('Create account')}</button>
				<button class="btn small wood" onclick={() => onsignin?.('in')}>{t('Sign in')}</button>
			</div>
		</div>
	{:else}
		<section class="top">
			<div class="new plaque">
				<span class="label">{t('Open a new room')}</span>
				<div class="vis" role="radiogroup" aria-label={t('Who can find it')}>
					<button class="opt" class:on={listed} role="radio" aria-checked={listed} onclick={() => (listed = true)}>
						<img class="icon-px" src={PIXEL.eye} alt="" />
						<span class="opt-text"><b>{t('Public')}</b><small>{t('Listed here: anyone can join')}</small></span>
					</button>
					<button class="opt" class:on={!listed} role="radio" aria-checked={!listed} onclick={() => (listed = false)}>
						<img class="icon-px" src={PIXEL.lock} alt="" />
						<span class="opt-text"><b>{t('Private')}</b><small>{t('Unlisted: friends join with the code')}</small></span>
					</button>
					<button class="btn green create" onclick={create} disabled={busy}>
						<img src={PIXEL.house} alt="" />
						<span class="stack"
							>{t('Create a room')}<span class="sub"
								>{listed ? t('Public room') : t('Private room')} · {t('You pick the mode and map next')}</span
							></span
						>
					</button>
				</div>
			</div>
			<div class="code plaque">
				<span class="label">{t('Join with a code')}</span>
				<div class="join">
					<CodeTiles bind:value={code} editable onenter={() => join(code)} />
					<button class="btn wood" onclick={() => join(code)} disabled={code.length !== 5 || busy}>{t('Join')}</button>
				</div>
			</div>
		</section>
	{/if}

	<!-- Filters -->
	<div class="filters">
		<label class="search">
			<img class="icon-px" src={PIXEL.eye} alt="" />
			<input class="input" bind:value={search} placeholder={t('Search host, player, island or code')} spellcheck="false" />
		</label>
		<div class="seg">
			<button class="btn small" class:on={mode === 'all'} onclick={() => (mode = 'all')}>{t('All modes')}</button>
			<button class="btn small" class:on={mode === 'classic'} onclick={() => (mode = 'classic')}>{t(MODE_INFO.classic.name)}</button>
			<button class="btn small" class:on={mode === 'extended'} onclick={() => (mode = 'extended')}>{t(MODE_INFO.extended.name)}</button>
		</div>
		<div class="seg">
			<button class="btn small" class:on={timer === 'any'} onclick={() => (timer = 'any')}>{t('Any timer')}</button>
			<button class="btn small" class:on={timer === 'timed'} onclick={() => (timer = 'timed')}
				><img class="icon-px" src={PIXEL.watch} alt="" />{t('Timed')}</button
			>
			<button class="btn small" class:on={timer === 'untimed'} onclick={() => (timer = 'untimed')}>{t('No limit')}</button>
		</div>
		<div class="chips">
			<button class="chip" class:on={extras.characters} onclick={() => (extras.characters = !extras.characters)}>{t('Characters')}</button>
			<button class="chip" class:on={extras.events} onclick={() => (extras.events = !extras.events)}>{t('Events')}</button>
			<button class="chip" class:on={extras.noBots} onclick={() => (extras.noBots = !extras.noBots)}>{t('No bots')}</button>
			<button class="chip" class:on={extras.standard} onclick={() => (extras.standard = !extras.standard)}>{t('Standard rules')}</button>
		</div>
		<label class="sort">
			<span class="label">{t('Sort')}</span>
			<select class="input" bind:value={sort}>
				<option value="players">{t('Most players')}</option>
				<option value="newest">{t('Newest')}</option>
				<option value="seats">{t('Fewest seats left')}</option>
				<option value="points">{t('Shortest game')}</option>
			</select>
		</label>
	</div>

	<div class="list-head">
		<span class="label"
			>{t('Open rooms')}{#if rooms?.length}<span class="n">{rooms.length}</span>{/if}
			{#if waiting}<span class="waiting">{t('{n, plural, one {# player waiting} other {# players waiting}}', { n: waiting })}</span>{/if}
		</span>
		<span class="head-right">
			{#if filtered && rooms?.length}
				<span class="showing">{t('Showing {shown} of {total}', { shown: shown.length, total: rooms.length })}</span>
				<button class="btn small wood" onclick={clearFilters}>{t('Clear filters')}</button>
			{/if}
			<button class="btn small wood" onclick={refresh} disabled={loading} title={t('Refresh')}>
				<img class="icon-px" class:spin={loading} src={PIXEL.hourglass} alt="" />{t('Refresh')}
			</button>
		</span>
	</div>

	<div class="table well" role="table" aria-label={t('Open rooms')}>
		<div class="row head" role="row">
			<span role="columnheader">{t('Table')}</span>
			<span role="columnheader">{t('Island')}</span>
			<span role="columnheader">{t('Rules')}</span>
			<span role="columnheader">{t('Players')}</span>
			<span role="columnheader">{t('Opened')}</span>
			<span role="columnheader"></span>
		</div>
		{#if rooms === null && !failed}
			<p class="empty">{t('Looking for tables…')}</p>
		{:else if failed && !rooms?.length}
			<p class="empty">{t("Can't reach the server. Check your connection.")}</p>
		{:else if !rooms?.length}
			<div class="empty">
				<img class="icon-px" src={PIXEL.tankard} alt="" />
				<p>
					{guest ? t('No open tables right now.') : t('No open tables right now. Open a public room and others can join you here.')}
				</p>
			</div>
		{:else if !shown.length}
			<div class="empty">
				<p>{t('No tables match these filters.')}</p>
				<button class="btn small wood" onclick={clearFilters}>{t('Clear filters')}</button>
			</div>
		{:else}
			{#each shown as r (r.code)}
				{@const free = r.maxPlayers - r.seats.length}
				<div class="row room" role="row">
					<span class="cell host" role="cell">
						<span class="face">
							{#if r.avatar}<Avatar id={r.avatar} size={40} />{:else}<img class="icon-px" src={PIXEL.house} alt="" />{/if}
						</span>
						<span class="stack-cell">
							<b class="title">{t("{name}'s table", { name: r.host })}</b>
							<small class="code-tag">{GAMES.length > 1 ? t(gameInfo(r.game).name) + ' · ' : ''}{r.code}</small>
						</span>
					</span>
					<span class="cell" role="cell">
						<span class="stack-cell">
							<b class="mode" class:ext={r.mode === 'extended'}>{t(MODE_INFO[r.mode].name)}</b>
							<small>{r.mode === 'classic' ? t('Classic Isle') : t(r.map)} · {t('{n} tiles', { n: r.tiles })}</small>
						</span>
					</span>
					<span class="cell rules" role="cell">
						<span class="facts">
							<span title={t('Points to win')}><img class="icon-px" src={PIXEL.crown} alt="" />{r.pointsToWin}</span>
							<span title={t('Hand limit on a 7')}><img class="icon-px" src={PIXEL.cards} alt="" />{r.handLimit}</span>
							<span title={t('Turn timer')}><img class="icon-px" src={PIXEL.watch} alt="" />{turnTime(r.turnTime)}</span>
						</span>
						{#if r.characters || r.events || r.buildings || r.houseRules}
							<span class="tags">
								{#if r.characters}<i class="tag gold">{r.powers ? t('Characters + powers') : t('Characters')}</i>{/if}
								{#if r.events}<i class="tag purple">{t('Events')}</i>{/if}
								{#if r.buildings}<i class="tag green">{t('{n, plural, one {# building} other {# buildings}}', { n: r.buildings })}</i>{/if}
								{#if r.houseRules}<i class="tag red">{t('House rules')}</i>{/if}
							</span>
						{/if}
					</span>
					<span class="cell players" role="cell">
						<span class="faces" class:crowd={r.maxPlayers > 5}>
							{#each r.seats as s, i (i)}
								<span class="mini" title={s.isBot ? t('{name} (bot)', { name: s.name }) : s.name} style:border-color={s.color}>
									{#if s.avatar}<Avatar id={s.avatar} size={24} />{:else if s.isBot}<img class="icon-px" src={PIXEL.bot} alt="" />{:else}{s.name.slice(0, 1).toUpperCase()}{/if}
								</span>
							{/each}
							{#each Array(free) as _, i (i)}<span class="mini open"></span>{/each}
						</span>
						<small
							>{r.seats.length}/{r.maxPlayers}
							{#if r.bots}· {t('{n, plural, one {# bot} other {# bots}}', { n: r.bots })}{/if}
							<span class:last={free === 1}>· {t('{n, plural, one {# seat left} other {# seats left}}', { n: free })}</span></small
						>
					</span>
					<span class="cell when" role="cell">{age(r.createdAt)}</span>
					<span class="cell act" role="cell">
						{#if guest}
							<button class="btn small" onclick={() => onsignin?.('in')}>
								<img class="icon-px" src={ACCOUNT_ICONS.key} alt="" />{t('Sign in')}
							</button>
						{:else}
							<button class="btn small green" onclick={() => join(r.code)} disabled={busy}>
								<img class="icon-px" src={PIXEL.door} alt="" />{t('Join')}
							</button>
						{/if}
					</span>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.rooms {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* ---------------------------------------------------------------- guest call to action */
	.cta {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
	}
	.cta .big {
		width: 40px;
		height: 40px;
		flex: none;
	}
	.cta-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-weight: 700;
		font-size: 13px;
		line-height: 1.25;
	}
	.cta-text b {
		font-size: 17px;
	}
	.cta-btns {
		display: flex;
		gap: 6px;
	}
	/* ---------------------------------------------------------------- new room and code */
	.top {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 10px;
	}
	.new,
	.code {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 4px 8px 6px;
	}
	.vis {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr);
		gap: 8px;
	}
	.opt {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px;
		border: 2px solid rgba(255, 220, 160, 0.18);
		background: rgba(0, 0, 0, 0.22);
		color: var(--text);
		opacity: 0.72;
		transition:
			opacity 0.12s,
			background 0.12s;
	}
	.opt:hover {
		opacity: 1;
	}
	.opt.on {
		opacity: 1;
		background: rgba(255, 200, 80, 0.14);
		border-color: var(--gold);
		box-shadow: 0 0 8px rgba(255, 210, 90, 0.45);
	}
	.opt:focus-visible {
		outline: 2px solid #ffd86b;
	}
	.opt img {
		width: 22px;
		height: 22px;
		flex: none;
	}
	.opt-text {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
		min-width: 0;
	}
	.opt-text b {
		font-family: var(--px);
		font-size: 15px;
		color: #fff2d2;
	}
	.opt.on .opt-text b {
		color: var(--gold);
	}
	.opt-text small {
		font-size: 11px;
		font-weight: 700;
		color: var(--muted);
	}
	.create {
		justify-content: flex-start;
		gap: 10px;
		padding-left: calc(var(--s) * 3);
		min-width: 0;
	}
	.create img {
		height: calc(var(--s) * 8);
	}
	.create .stack {
		min-width: 0;
		overflow: hidden;
	}
	.create .sub {
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.join {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.join .btn {
		min-height: calc(var(--s) * 13);
		padding: 0 calc(var(--s) * 4);
	}
	/* ---------------------------------------------------------------- filters */
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
	}
	.search {
		position: relative;
		flex: 1 1 220px;
		min-width: 180px;
	}
	.search img {
		position: absolute;
		left: 10px;
		top: 50%;
		width: 16px;
		height: 16px;
		transform: translateY(-50%);
		opacity: 0.6;
		pointer-events: none;
	}
	.search .input {
		width: 100%;
		box-sizing: border-box;
		padding-left: 32px;
		min-height: 32px;
		font-size: 14px;
	}
	.seg .btn img {
		height: 12px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.chip {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		padding: 3px 9px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: var(--muted);
		border: 2px solid rgba(255, 220, 160, 0.25);
		background: rgba(0, 0, 0, 0.25);
		transition:
			color 0.1s,
			border-color 0.1s;
	}
	.chip:hover {
		color: #fff2d2;
	}
	.chip.on {
		color: #2a1604;
		background: var(--gold);
		border-color: #1e0e06;
	}
	.chip:focus-visible {
		outline: 2px solid #ffd86b;
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}
	.sort .input {
		min-height: 30px;
		padding: 2px 6px;
		font-size: 14px;
	}
	/* ---------------------------------------------------------------- the table */
	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 6px;
	}
	.list-head .label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.waiting {
		letter-spacing: 0.02em;
		text-transform: none;
		color: #9fe07a;
	}
	.head-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.showing {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
	}
	.n {
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		box-sizing: border-box;
		display: inline-grid;
		place-items: center;
		font-size: 12px;
		letter-spacing: 0;
		color: #fff;
		background: #3f9a2e;
		border: 2px solid #1e0e06;
	}
	.list-head .btn img {
		height: 14px;
	}
	.spin {
		animation: flip 1.2s ease-in-out infinite;
	}
	@keyframes flip {
		50% {
			transform: rotate(180deg);
		}
	}
	.table {
		display: flex;
		flex-direction: column;
		padding: 4px 6px 6px;
		min-height: 200px;
		max-height: max(200px, calc(100dvh / var(--ui-zoom, 1) - 420px));
		overflow-y: auto;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(150px, 1.3fr) minmax(120px, 1fr) minmax(170px, 1.5fr) minmax(130px, 1.1fr) 70px 86px;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
	}
	.row.head {
		position: sticky;
		top: -4px;
		z-index: 1;
		padding-top: 4px;
		padding-bottom: 4px;
		background: #2a160a;
		border-bottom: 2px solid rgba(255, 220, 160, 0.15);
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.room {
		border-bottom: 1px solid rgba(255, 220, 160, 0.08);
		animation: fade-in 0.25s ease-out;
		transition: background 0.12s;
	}
	.room:nth-child(odd) {
		background: rgba(255, 220, 160, 0.03);
	}
	.room:hover {
		background: rgba(255, 210, 120, 0.09);
	}
	.cell {
		min-width: 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
	}
	.host {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.face {
		flex: none;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
	}
	.face img {
		width: 28px;
		height: 28px;
	}
	.stack-cell {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.25;
	}
	.stack-cell b,
	.stack-cell small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stack-cell b {
		font-size: 15px;
		color: #fff2d2;
	}
	.stack-cell small,
	.players small {
		font-size: 12px;
		color: var(--muted);
	}
	.code-tag {
		font-family: var(--px);
		letter-spacing: 0.12em;
	}
	.mode {
		font-family: var(--px);
	}
	.mode.ext {
		color: var(--gold) !important;
	}
	.rules {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-family: var(--px);
		color: #fff2d2;
	}
	.facts span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}
	.facts img {
		width: 14px;
		height: 14px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}
	.tag {
		font-style: normal;
		font-size: 11px;
		padding: 0 5px;
		line-height: 16px;
		border: 1px solid currentColor;
		white-space: nowrap;
	}
	.tag.gold {
		color: var(--gold);
	}
	.tag.purple {
		color: #d6a8ff;
	}
	.tag.green {
		color: #9fe07a;
	}
	.tag.red {
		color: #ff9a80;
	}
	.players {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.faces {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}
	.mini {
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		overflow: hidden;
		font-family: var(--px);
		font-size: 13px;
		color: #fff;
		background: rgba(0, 0, 0, 0.35);
		box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.25);
		border: 2px solid #1e0e06;
	}
	.mini img {
		width: 16px;
		height: 16px;
	}
	/* Big islands seat up to eight: smaller faces keep them on one line. */
	.crowd {
		flex-wrap: nowrap;
		gap: 2px;
	}
	.crowd .mini {
		width: 18px;
		height: 18px;
		font-size: 11px;
	}
	.crowd .mini img {
		width: 12px;
		height: 12px;
	}
	.mini.open {
		background: none;
		box-shadow: none;
		border: 2px dashed rgba(255, 220, 160, 0.3);
	}
	.last {
		color: #ffb35a;
	}
	.when {
		font-size: 12px;
		color: var(--muted);
	}
	.act {
		display: flex;
		justify-content: flex-end;
	}
	.act .btn img {
		height: 16px;
	}
	.empty {
		margin: auto;
		padding: 24px 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		max-width: 360px;
		text-align: center;
		font-weight: 700;
		color: var(--muted);
	}
	.empty p {
		margin: 0;
	}
	.empty img {
		width: 32px;
		height: 32px;
		opacity: 0.8;
	}
	/* ---------------------------------------------------------------- narrower screens */
	@media (max-width: 900px) {
		.top {
			grid-template-columns: 1fr;
		}
		/* The code row goes on one line under the new room. */
		.code {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
		.sort {
			margin-left: 0;
		}
		/* The window scrolls as a whole instead of the list scrolling inside it. */
		.table {
			max-height: none;
		}
		/* Each room becomes a card: the table header goes, the cells wrap. */
		.row.head {
			display: none;
		}
		.row.room {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'host act'
				'island players'
				'rules rules';
			row-gap: 6px;
		}
		.row.room > :nth-child(1) {
			grid-area: host;
		}
		.row.room > :nth-child(2) {
			grid-area: island;
		}
		.row.room > :nth-child(3) {
			grid-area: rules;
		}
		.row.room > :nth-child(4) {
			grid-area: players;
		}
		.row.room > :nth-child(5) {
			display: none;
		}
		.row.room > :nth-child(6) {
			grid-area: act;
		}
	}
	@media (max-width: 640px) {
		.vis {
			grid-template-columns: 1fr 1fr;
		}
		.create {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 520px) {
		.vis {
			grid-template-columns: 1fr;
		}
		.code {
			flex-direction: column;
			align-items: stretch;
		}
		.cta {
			flex-wrap: wrap;
		}
		.cta-btns {
			width: 100%;
		}
		.cta-btns .btn {
			flex: 1;
		}
	}
</style>
