<script lang="ts">
	import { onMount } from 'svelte';
	import { LogoView } from '../scene/logo';
	import { account } from '../state/account.svelte';
	import { OFFLINE } from '../offline/flag';
	import { client } from '../state/client.svelte';
	import Avatar from './account/Avatar.svelte';
	import Friends from './account/Friends.svelte';
	import History from './account/History.svelte';
	import Profile from './account/Profile.svelte';
	import { ACCOUNT_ICONS } from './account/icons';
	import CodeTiles from './menu/CodeTiles.svelte';
	import Embers from './menu/Embers.svelte';
	import Modal from './menu/Modal.svelte';
	import Settings from './menu/Settings.svelte';
	import { sideLayout } from './menu/sideLayout';
	import { settings } from './settings.svelte';
	import { PIXEL } from './pixel';
	import { isMuted, setMuted, sfx } from './sound';
	import Tutorial from './tutorial/Tutorial.svelte';
	import Campaign from './campaign/Campaign.svelte';
	import { campaign } from '../state/campaign.svelte';
	import { t } from '../i18n/index.svelte';
	import { gamePick } from './menu/gamePick.svelte';
	import { sceneRef } from './sceneRef';
	import { CQ_PIXEL } from './conquest/icons';
	import { GB_PIXEL } from './gambit/icons';
	import { PLAYER_COLORS } from '../../shared/rules/config';
	import { PLAYER_RGB } from '../scene/layout';

	let code = $state(new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
	let muted = $state(isMuted());
	let sheet = $state<'settings' | 'profile' | 'friends' | 'history' | null>(null);
	let reading = $state(false);
	/** Whose games the history sheet shows: a friend's username, or yours when unset. */
	let historyOf = $state<string | undefined>(undefined);
	const me = $derived(account.me!);
	let canvas: HTMLCanvasElement | undefined = $state();
	let logoOk = $state(true);
	const busy = $derived(client.pendingJoin || client.launching || client.status !== 'online');

	// A bigger menu column pushes the island further over.
	$effect(() => {
		const size = settings.menuSize;
		return sideLayout(Math.min(0.3, 0.16 * size));
	});

	onMount(() => {
		if (!canvas) return;
		let logo: LogoView | null = null;
		try {
			logo = new LogoView(canvas, settings.quality);
		} catch {
			// No second WebGL context: show the title as text instead.
			logoOk = false;
		}
		const onResize = () => logo?.resize();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			logo?.dispose();
		};
	});

	function play() {
		// Gambit is for a crowd: five rivals round a six-sided board.
		client.quickPlay(gamePick.game === 'gambit' ? 5 : 3, gamePick.game);
	}
	function create() {
		client.create(gamePick.game);
	}
	function pick(g: typeof gamePick.game) {
		if (g === gamePick.game) return;
		sfx.open();
		gamePick.set(g);
	}
	const conquest = $derived(gamePick.game === 'conquest');
	const gambit = $derived(gamePick.game === 'gambit');
	/** The board the menu's table shows for Gambit: six seats, a new one each visit. */
	const menuBoard = { terrain: 'mixed' as const, seed: (Math.random() * 1e9) | 0 };
	// The table shows the game picked: the island, the Realm, or a Gambit board.
	$effect(() => {
		const scene = sceneRef.current;
		if (!scene || client.launching) return;
		if (conquest) scene.showConquestTable();
		else if (gambit) scene.showGambitTable(6, menuBoard, PLAYER_COLORS.slice(0, 6).map((c) => PLAYER_RGB[c] ?? 0xffffff));
		else if (scene.conquest || scene.gambit) scene.showMenuBoard();
	});
	function join() {
		if (code.length !== 5 || busy) return;
		client.join(code);
	}
	function rejoin() {
		if (!client.resumable || busy) return;
		client.join(client.resumable.code);
	}
	function openSheet(s: NonNullable<typeof sheet>) {
		sfx.open();
		if (s === 'history') historyOf = undefined;
		sheet = s;
	}
	function closeSheet() {
		sfx.close();
		sheet = null;
	}
	function openCampaign() {
		sfx.open();
		campaign.open = true;
	}
	function closeCampaign() {
		sfx.close();
		campaign.open = false;
	}
	function openTutorial() {
		sfx.open();
		reading = true;
	}
	function closeTutorial() {
		sfx.close();
		reading = false;
	}
	function toggleSound() {
		muted = !muted;
		setMuted(muted);
	}
	function onKey(e: KeyboardEvent) {
		if (reading && e.key === 'Escape') return closeTutorial();
		if (campaign.open && e.key === 'Escape') return closeCampaign();
		// N turns night mode on and off, as in a game, unless typing.
		if (e.key.toLowerCase() !== 'n' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
		if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
		settings.setNight(!settings.night);
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="home">
	<Embers />
	{#if reading}
		<div class="book">
			<div class="board panel">
				<div class="ribbon">{t('Tutorial')}</div>
				<button class="icon-btn close" onclick={closeTutorial} aria-label={t('Back to the menu')} title={t('Back to the menu')}
					><img src={PIXEL.close} alt="" /></button
				>
				<Tutorial />
			</div>
		</div>
	{:else if campaign.open}
		<div class="book">
			<div class="board panel">
				<div class="ribbon">{t('The Shattered Crown')}</div>
				<button class="icon-btn close" onclick={closeCampaign} aria-label={t('Back to the menu')} title={t('Back to the menu')}
					><img src={PIXEL.close} alt="" /></button
				>
				<Campaign />
			</div>
		</div>
	{/if}
	<!-- Hidden rather than removed while the tutorial is open, so the 3D title keeps its canvas. -->
	<div class="column" class:away={reading || campaign.open}>
		<header class="crest">
			<div class="logo">
				<canvas bind:this={canvas} aria-label="Reign"></canvas>
				{#if !logoOk}<h1 class="title">REIGN</h1>{/if}
			</div>
			{#if conquest}
				<div class="ribbon tagline">{t('Muster')} <i>·</i> {t('Attack')} <i>·</i> {t('Conquer')}</div>
			{:else if gambit}
				<div class="ribbon tagline">{t('Order')} <i>·</i> {t('Reveal')} <i>·</i> {t('Outwit')}</div>
			{:else}
				<div class="ribbon tagline">{t('Settle')} <i>·</i> {t('Trade')} <i>·</i> {t('Build')}</div>
			{/if}
		</header>

		<div class="sign panel">
			<div class="me">
				<button class="me-face" onclick={() => openSheet('profile')} title={t('Edit your profile')}>
					<Avatar id={me.avatar} size={60} />
				</button>
				<span class="me-name">
					<span class="label">{t('Playing as')}</span>
					<b class="title">{me.nickname}</b>
					{#if !OFFLINE}<small>@{me.username}</small>{/if}
				</span>
				<button class="icon-btn edit" onclick={() => openSheet('profile')} title={t('Edit your profile')} aria-label={t('Edit your profile')}>
					<img src={ACCOUNT_ICONS.quill} alt="" />
				</button>
			</div>
			{#if client.resumable}
				{@const r = client.resumable}
				<button class="btn purple block rejoin" onclick={rejoin} disabled={busy}>
					<img src={PIXEL.door} alt="" />
					<span class="stack"
						>{t('Rejoin game {code}', { code: r.code })}<span class="sub"
							>{t('{n, plural, one {{players} is still playing, a bot holds your seat} other {{players} are still playing, a bot holds your seat}}', { n: r.players.length, players: r.players.join(', ') })}</span
						></span
					>
				</button>
			{/if}

			<div class="games" role="tablist" aria-label={t('Game')}>
				<button
					class="game"
					class:on={!conquest && !gambit}
					role="tab"
					aria-selected={!conquest && !gambit}
					onclick={() => pick('settlement')}
					title={t('Settle an island, trade and build. Classic, Reign Extended and the campaign.')}
				>
					<img class="icon-px" src={PIXEL.house} alt="" />
					<span class="stack"><b>{t('Settlement')}</b><small>{t('Settle · Trade · Build')}</small></span>
				</button>
				<button
					class="game"
					class:on={conquest}
					role="tab"
					aria-selected={conquest}
					onclick={() => pick('conquest')}
					title={t('A war for the Realm: take territories with armies and dice, region by region.')}
				>
					<img class="icon-px" src={PIXEL.sword} alt="" />
					<span class="stack"><b>{t('Conquest')}</b><small>{t('Muster · Attack · Conquer')}</small></span>
				</button>
				<button
					class="game"
					class:on={gambit}
					role="tab"
					aria-selected={gambit}
					onclick={() => pick('gambit')}
					title={t('Up to eight players order their pieces in secret on a hex board, then every move plays out at once.')}
				>
					<img class="icon-px" src={GB_PIXEL.knight} alt="" />
					<span class="stack"><b>{t('Gambit')}</b><small>{t('Order · Reveal · Outwit')}</small></span>
				</button>
			</div>

			{#if !conquest && !gambit}
				<button class="btn purple block" onclick={openCampaign} disabled={busy}>
					<img src={PIXEL.crown} alt="" />
					<span class="stack"
						>{t('Campaign')}<span class="sub">{t('The Shattered Crown: a story for one player')}</span></span
					>
				</button>
			{/if}
			<button class="btn big block shine" onclick={play} disabled={busy}>
				<img src={PIXEL.play} alt="" />
				<span class="stack"
					>{t('Play vs bots')}<span class="sub"
						>{conquest ? t('Three rivals for the Realm, start right away') : gambit ? t('Five rivals round the board, start right away') : t('Three rivals, start right away')}</span
					></span
				>
			</button>
			<button class="btn green block" onclick={create} disabled={busy}>
				<img src={conquest ? CQ_PIXEL.flag : gambit ? GB_PIXEL.monarch : PIXEL.house} alt="" />
				<span class="stack"
					>{t('Create a room')}<span class="sub"
						>{OFFLINE ? (conquest || gambit ? t('Pick the rules and bots') : t('Pick the mode, map and bots')) : t('Invite friends with a code')}</span
					></span
				>
			</button>

			{#if !OFFLINE}
				<div class="divider"><i></i><span>{t('or join a friend')}</span><i></i></div>

				<div class="join">
					<CodeTiles bind:value={code} editable onenter={join} />
					<button class="btn wood" onclick={join} disabled={code.length !== 5 || busy}>{t('Join')}</button>
				</div>
			{/if}
		</div>

		<nav class="extras">
			{#if !OFFLINE}
				<button class="medal" onclick={() => openSheet('friends')}>
					<span class="icon-btn"><img src={ACCOUNT_ICONS.friends} alt="" /></span>
					<span class="cap">{t('Friends')}</span>
					{#if account.incoming.length}
						<span class="count alert" title={t('Friend requests')}>{account.incoming.length}</span>
					{:else if account.onlineFriends.length}
						<span class="count" title={t('Friends online')}>{account.onlineFriends.length}</span>
					{/if}
				</button>
				<button class="medal" onclick={() => openSheet('history')}>
					<span class="icon-btn"><img src={ACCOUNT_ICONS.scroll} alt="" /></span>
					<span class="cap">{t('History')}</span>
				</button>
			{/if}
			<button class="medal" onclick={openTutorial}>
				<span class="icon-btn"><img src={PIXEL.book} alt="" /></span>
				<span class="cap">{t('Tutorial')}</span>
			</button>
			<button class="medal" onclick={() => openSheet('settings')}>
				<span class="icon-btn"><img src={PIXEL.gear} alt="" /></span>
				<span class="cap">{t('Settings')}</span>
			</button>
			<button class="medal" onclick={toggleSound}>
				<span class="icon-btn"><img src={muted ? PIXEL.mute : PIXEL.speaker} alt="" /></span>
				<span class="cap">{muted ? t('Sound off') : t('Sound on')}</span>
			</button>
			<button
				class="medal night"
				class:on={settings.night}
				onclick={() => {
					sfx.click();
					settings.setNight(!settings.night);
				}}
				aria-pressed={settings.night}
				title={settings.night
					? t('On: the room is lit by the fire and the moon. Only you see it. (N)')
					: t("Off: put the room's lights out for a cozy evening. Only you see it. (N)")}
			>
				<span class="icon-btn"><img src={PIXEL.moon} alt="" /></span>
				<span class="cap">{settings.night ? t('Night on') : t('Night off')}</span>
			</button>
		</nav>
	</div>
</div>

{#if sheet === 'settings'}
	<Modal title={t('Settings')} width={600} onclose={closeSheet}><Settings /></Modal>
{:else if sheet === 'profile'}
	<Modal title={t('Your profile')} width={640} onclose={closeSheet}><Profile onclose={closeSheet} /></Modal>
{:else if sheet === 'friends'}
	<Modal title={t('Friends')} width={520} onclose={closeSheet}
		><Friends
			onhistory={(f) => {
				historyOf = f.username;
				sheet = 'history';
			}}
		/></Modal
	>
{:else if sheet === 'history'}
	<Modal title={historyOf ? t('Their games') : t('Your games')} width={620} onclose={closeSheet}><History username={historyOf} /></Modal>
{/if}

<style>
	.home {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		overflow-x: hidden;
		pointer-events: auto;
		background:
			radial-gradient(ellipse 70% 60% at 50% 46%, transparent 35%, rgba(12, 5, 2, 0.6) 100%),
			linear-gradient(
				180deg,
				rgba(12, 5, 2, 0.45),
				transparent 30%,
				transparent 70%,
				rgba(12, 5, 2, 0.5)
			);
	}
	.column {
		position: relative;
		min-height: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		padding: 10px 16px 44px;
	}
	.away {
		display: none;
	}
	/* The two games, side by side above the buttons: the one picked lit in gold. */
	/* Three games side by side: each its picture over its name and what it's about. */
	.games {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}
	.game {
		all: unset;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 3px;
		padding: 6px 4px;
		min-width: 0;
		cursor: pointer;
		background: rgba(0, 0, 0, 0.28);
		box-shadow:
			inset 0 0 0 2px rgba(255, 220, 160, 0.14),
			0 3px 0 rgba(0, 0, 0, 0.35);
		color: var(--muted);
		transition:
			background 0.15s,
			transform 0.1s;
	}
	.game:hover {
		background: rgba(255, 212, 90, 0.08);
	}
	.game.on {
		background: linear-gradient(rgba(255, 212, 90, 0.26), rgba(184, 116, 15, 0.22));
		box-shadow:
			inset 0 0 0 2px var(--gold),
			0 3px 0 rgba(0, 0, 0, 0.35);
		color: #fff2d2;
	}
	.game img {
		width: 28px;
		height: 28px;
		flex: none;
	}
	.game .stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.1;
		min-width: 0;
		max-width: 100%;
	}
	.game b {
		font-family: var(--px);
		font-size: 16px;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.game.on b {
		color: var(--gold);
	}
	.game small {
		max-width: 100%;
		font-size: 10px;
		font-weight: 700;
		opacity: 0.85;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.book {
		position: relative;
		box-sizing: border-box;
		height: 100%;
		min-height: 520px;
		display: flex;
		justify-content: center;
		padding: 46px 16px 18px;
	}
	.book .board {
		position: relative;
		width: min(1180px, 100%);
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: calc(var(--s) * 9) 14px 14px;
		animation: pop-in 0.32s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.book .ribbon {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -62%);
		z-index: 2;
		font-size: 24px;
		padding-left: calc(var(--s) * 6);
		padding-right: calc(var(--s) * 6);
	}
	.book .close {
		position: absolute;
		top: calc(var(--s) * -4);
		right: calc(var(--s) * -4);
		z-index: 3;
		width: calc(var(--s) * 13);
		height: calc(var(--s) * 13);
		border-image-source: var(--art-btn-red);
	}
	.book .close img {
		width: calc(var(--s) * 6);
		height: calc(var(--s) * 6);
	}
	.book .close:active {
		border-image-source: var(--art-btn-red-down);
	}
	.crest {
		display: flex;
		flex-direction: column;
		align-items: center;
		animation: drop-in 0.8s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	.logo {
		width: min(700px, calc(94vw / var(--ui-zoom)));
		aspect-ratio: 700 / 230;
		margin-bottom: -18px;
		pointer-events: none;
	}
	.logo {
		position: relative;
	}
	.logo canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
	.logo h1 {
		position: absolute;
		inset: 0;
		margin: 0;
		display: grid;
		place-items: center;
		font-size: clamp(64px, calc(13vw / var(--ui-zoom)), 132px);
		color: #ffd86b;
		letter-spacing: 0.08em;
		text-shadow:
			0 4px 0 #c9781a,
			0 8px 0 #8a4410,
			0 12px 0 #4a2008,
			0 18px 24px rgba(0, 0, 0, 0.6);
	}
	.tagline {
		--rib: var(--art-ribbon-crimson);
		font-size: 18px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding-left: calc(var(--s) * 6);
		padding-right: calc(var(--s) * 6);
	}
	.tagline i {
		font-style: normal;
		color: var(--gold);
	}
	.sign {
		width: min(400px, 100%);
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 10px 12px 14px;
		animation: pop-in 0.5s cubic-bezier(0.2, 1.3, 0.4, 1) 0.15s both;
	}
	.me {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.me-face {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		transition: transform 0.1s;
	}
	.me-face:hover {
		transform: translateY(-2px) rotate(-2deg);
	}
	.me-name {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.me-name b {
		font-size: 22px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.me-name small {
		font-weight: 700;
		color: var(--muted);
	}
	.edit {
		width: calc(var(--s) * 14);
		height: calc(var(--s) * 14);
		flex: none;
	}
	.sign .btn.block {
		justify-content: flex-start;
		gap: 12px;
		padding-left: calc(var(--s) * 4);
	}
	.rejoin .sub {
		white-space: normal;
	}
	.sign .btn img {
		height: calc(var(--s) * 9);
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
	.extras {
		display: flex;
		gap: 22px;
		animation: fade-in 0.6s ease-out 0.4s both;
	}
	.medal {
		all: unset;
		position: relative;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}
	.medal:hover .icon-btn {
		filter: brightness(1.15);
		transform: translateY(-1px);
	}
	.medal:active .icon-btn {
		border-image-source: var(--art-btn-wood-down);
		transform: translateY(var(--s));
	}
	.night img {
		opacity: 0.6;
	}
	.night.on img {
		opacity: 1;
		filter: drop-shadow(0 0 4px rgba(255, 220, 120, 0.75));
	}
	.medal:focus-visible .icon-btn {
		filter: drop-shadow(0 0 5px rgba(255, 210, 90, 0.9));
	}
	.count {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 20px;
		height: 20px;
		box-sizing: border-box;
		padding: 0 5px;
		display: grid;
		place-items: center;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #fff;
		background: #3f9a2e;
		border: 2px solid #1e0e06;
		box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35);
	}
	.count.alert {
		background: #d0302c;
		animation: bob 1.2s ease-in-out infinite;
	}
	.cap {
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	@media (min-width: 1100px) and (min-aspect-ratio: 4/3) {
		.column {
			align-items: flex-start;
			width: 600px;
			margin-left: max(24px, calc(4vw / var(--ui-zoom)));
		}
		.crest,
		.sign,
		.extras {
			align-self: center;
		}
		.logo {
			width: 580px;
		}
		.sign {
			width: 420px;
		}
	}
	@media (max-height: 760px) and (min-width: 701px) {
		.logo {
			width: min(560px, calc(80vw / var(--ui-zoom)));
		}
	}
	/* Room for every button and the row under them on a laptop screen (1366x768). */
	@media (max-height: 860px) and (min-width: 701px) {
		.logo {
			width: min(420px, calc(80vw / var(--ui-zoom)));
		}
		.column {
			gap: 10px;
			padding-bottom: 14px;
		}
		.sign {
			gap: 10px;
		}
	}
	@media (max-width: 700px) {
		.book {
			padding: 36px 6px 8px;
			min-height: 0;
		}
		.book .board {
			padding: calc(var(--s) * 9) 6px 8px;
		}
		.column {
			justify-content: flex-start;
			padding-top: 18px;
			gap: 12px;
		}
		.tagline {
			font-size: 14px;
		}
		/* Six buttons across a phone: closer together, with smaller captions on one line each,
		   and a second row when the captions are long (Russian). */
		.extras {
			flex-wrap: wrap;
			justify-content: center;
			gap: 10px 8px;
			max-width: calc(100vw / var(--ui-zoom) - 12px);
		}
		.cap {
			font-size: 12px;
			white-space: nowrap;
		}
	}
</style>
