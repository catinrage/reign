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
	 * The rooms browser: public tables waiting for players, a new room of your own (listed here for
	 * anyone to join, or unlisted, for friends with the code), and joining by code. A guest sees
	 * the list too, with sign-in in place of joining.
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
		}
	}

	onMount(() => {
		void refresh();
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh();
		}, REFRESH_MS);
		return () => clearInterval(timer);
	});

	function create() {
		if (busy) return;
		client.create(gamePick.game, listed);
	}
	function join(c: string) {
		if (busy || c.length !== 5) return;
		client.join(c);
	}

	function details(r: RoomSummary): string {
		const parts = [r.mode === 'classic' ? t(MODE_INFO.classic.name) : t(r.map)];
		parts.push(t('{n} points', { n: r.pointsToWin }));
		if (r.turnTime) parts.push(r.turnTime < 60 ? t('{n}s turns', { n: r.turnTime }) : t('{n} min turns', { n: r.turnTime / 60 }));
		return parts.join(' · ');
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
		<section class="new">
			<span class="label">{t('Open a new room')}</span>
			<div class="vis" role="radiogroup" aria-label={t('Who can find it')}>
				<button class="opt plaque" class:on={listed} role="radio" aria-checked={listed} onclick={() => (listed = true)}>
					<img class="icon-px" src={PIXEL.eye} alt="" />
					<span class="opt-text"
						><b>{t('Public')}</b><small>{t('Listed here: anyone can join')}</small></span
					>
				</button>
				<button class="opt plaque" class:on={!listed} role="radio" aria-checked={!listed} onclick={() => (listed = false)}>
					<img class="icon-px" src={PIXEL.lock} alt="" />
					<span class="opt-text"
						><b>{t('Private')}</b><small>{t('Unlisted: friends join with the code')}</small></span
					>
				</button>
			</div>
			<button class="btn green block create" onclick={create} disabled={busy}>
				<img src={PIXEL.house} alt="" />
				<span class="stack"
					>{listed ? t('Create public room') : t('Create private room')}<span class="sub"
						>{GAMES.length > 1 ? t(gameInfo(gamePick.game).name) + ' · ' : ''}{t('You pick the mode and map next')}</span
					></span
				>
			</button>
		</section>
	{/if}

	<div class="list-head">
		<span class="label">{t('Open rooms')}{#if rooms?.length}<span class="n">{rooms.length}</span>{/if}</span>
		<button class="btn small wood" onclick={refresh} disabled={loading} title={t('Refresh')}>
			<img class="icon-px" class:spin={loading} src={PIXEL.hourglass} alt="" />{t('Refresh')}
		</button>
	</div>

	<div class="list well">
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
		{:else}
			{#each rooms as r (r.code)}
				<div class="room plaque">
					<span class="face">
						{#if r.avatar}<Avatar id={r.avatar} size={40} />{:else}<img class="icon-px" src={PIXEL.house} alt="" />{/if}
					</span>
					<span class="info">
						<b class="title">{t("{name}'s table", { name: r.host })}</b>
						<small>{GAMES.length > 1 ? t(gameInfo(r.game).name) + ' · ' : ''}{details(r)}</small>
					</span>
					<span class="seats" title={t('{count} of {max} seats taken', { count: r.players + r.bots, max: r.maxPlayers })}>
						<span class="pips">
							{#each Array(r.maxPlayers) as _, i (i)}
								<i class:p={i < r.players} class:b={i >= r.players && i < r.players + r.bots}></i>
							{/each}
						</span>
						<small>{r.players + r.bots}/{r.maxPlayers}</small>
					</span>
					{#if guest}
						<button class="btn small" onclick={() => onsignin?.('in')}>
							<img class="icon-px" src={ACCOUNT_ICONS.key} alt="" />{t('Sign in')}
						</button>
					{:else}
						<button class="btn small green" onclick={() => join(r.code)} disabled={busy}>
							<img class="icon-px" src={PIXEL.door} alt="" />{t('Join')}
						</button>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	{#if !guest}
		<div class="divider"><i></i><span>{t('or join with a code')}</span><i></i></div>
		<div class="join">
			<CodeTiles bind:value={code} editable onenter={() => join(code)} />
			<button class="btn wood" onclick={() => join(code)} disabled={code.length !== 5 || busy}>{t('Join')}</button>
		</div>
	{/if}
</div>

<style>
	.rooms {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
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
		flex-direction: column;
		gap: 6px;
	}
	.new {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.vis {
		display: grid;
		grid-template-columns: 1fr 1fr;
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
		border-style: solid;
		border-width: calc(var(--s) * 4);
		border-image: var(--art-plaque) 4 / calc(var(--s) * 4) round;
		background: #4d2b16;
		background-clip: padding-box;
		color: var(--text);
		opacity: 0.72;
		transition:
			opacity 0.12s,
			filter 0.12s,
			transform 0.1s;
	}
	.opt:hover {
		opacity: 1;
	}
	.opt.on {
		opacity: 1;
		background-color: #6a3d1c;
		filter: drop-shadow(0 0 5px rgba(255, 210, 90, 0.8));
	}
	.opt:focus-visible {
		outline: 2px solid #ffd86b;
	}
	.opt img {
		width: 24px;
		height: 24px;
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
		font-size: 16px;
		color: #fff2d2;
	}
	.opt.on .opt-text b {
		color: var(--gold);
	}
	.opt-text small {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
	}
	.create {
		justify-content: flex-start;
		gap: 12px;
		padding-left: calc(var(--s) * 4);
	}
	.create img {
		height: calc(var(--s) * 9);
	}
	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 2px;
	}
	.list-head .label {
		display: flex;
		align-items: center;
		gap: 6px;
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
	.list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		min-height: 120px;
		max-height: min(300px, calc(46vh / var(--ui-zoom, 1)));
		overflow-y: auto;
	}
	.empty {
		margin: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		max-width: 320px;
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
	.room {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 2px 6px 2px 4px;
		min-height: 48px;
		animation: pop-in 0.25s ease-out;
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
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}
	.info b {
		font-size: 16px;
		color: #fff2d2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.info small {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.seats {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.seats small {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: #fff2d2;
	}
	.pips {
		display: flex;
		gap: 2px;
	}
	.pips i {
		width: 7px;
		height: 7px;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 230, 180, 0.35);
	}
	.pips i.p {
		background: var(--gold);
		border-color: #1e0e06;
	}
	.pips i.b {
		background: #9a8a78;
		border-color: #1e0e06;
	}
	.room .btn img {
		height: 16px;
	}
	.join {
		display: flex;
		gap: 10px;
		align-items: center;
		justify-content: space-between;
	}
	.join .btn {
		flex: 1;
		min-height: calc(var(--s) * 13);
	}
	@media (max-width: 520px) {
		.vis {
			grid-template-columns: 1fr;
		}
		.cta {
			flex-wrap: wrap;
		}
		.cta-btns {
			flex-direction: row;
			width: 100%;
		}
		.cta-btns .btn {
			flex: 1;
		}
		.seats .pips {
			display: none;
		}
	}
</style>
