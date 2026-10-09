<script lang="ts">
	import { client } from '../../state/client.svelte';
	import HowToPlay from '../menu/HowToPlay.svelte';
	import Settings from '../menu/Settings.svelte';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import { ui } from './ui.svelte';

	let page = $state<'main' | 'help' | 'settings'>('main');
	let confirmLeave = $state(false);
	const lobby = $derived(client.lobby);
	const paused = $derived(!!lobby?.paused);
	/** Who paused the game for everyone; null when nobody did (the menu alone pauses bot games). */
	const pausedBy = $derived(lobby?.pausedBy ?? null);
	const pauser = $derived(
		pausedBy === client.seat
			? 'You'
			: (lobby?.seats.find((s) => s.id === pausedBy)?.name ?? 'Someone')
	);
	const playing = $derived(!!client.view && client.view.phase !== 'ended');
	const others = $derived(
		(lobby?.seats ?? []).filter((s) => !s.isBot && s.id !== client.seat && s.connected).length
	);
	const title = $derived(
		page === 'help'
			? 'How to play'
			: page === 'settings'
				? 'Settings'
				: paused
					? 'Paused'
					: 'Game Menu'
	);

	// The table pauses while everyone has the menu open (always true in a game vs bots).
	$effect(() => {
		client.setMenuOpen(ui.menu);
	});
	$effect(() => {
		if (!ui.menu) {
			page = 'main';
			confirmLeave = false;
		}
	});
	// Everyone at the table hears the game stop and go on.
	let wasHeld = false;
	$effect(() => {
		const held = !!pausedBy;
		if (held !== wasHeld) (held ? sfx.close : sfx.open)();
		wasHeld = held;
	});

	function open() {
		sfx.open();
		ui.menu = true;
	}
	function close() {
		sfx.close();
		ui.menu = false;
	}
	function go(p: typeof page) {
		sfx.open();
		page = p;
	}
	function leave() {
		ui.menu = false;
		client.leave();
	}
	function resume() {
		if (pausedBy) client.pauseGame(false);
		close();
	}
	function onKey(e: KeyboardEvent) {
		if (e.key.toLowerCase() !== 'p' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
		if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]'))
			return;
		if (playing) client.pauseGame(!pausedBy);
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="corner">
	<button class="icon-btn gear" onclick={open} aria-label="Menu" title="Menu (Esc)"
		><img src={PIXEL.gear} alt="" /></button
	>
	{#if playing && !pausedBy}
		<button
			class="icon-btn"
			onclick={() => client.pauseGame(true)}
			aria-label="Pause"
			title="Pause the game for everyone (P)"><img src={PIXEL.pause} alt="" /></button
		>
	{/if}
</div>

{#if pausedBy && !ui.menu}
	<div class="modal-backdrop curtain" role="dialog" aria-modal="true" aria-label="Game paused">
		<div class="drop">
			<div class="board panel hanging">
				<div class="ribbon" style="--rib: var(--art-ribbon-crimson)">Paused</div>
				<p class="who">{pauser} paused the game.</p>
				<button class="btn big block shine" onclick={() => client.pauseGame(false)}
					><img src={PIXEL.play} alt="" />Resume</button
				>
				<p class="note">
					<img class="icon-px" src={PIXEL.hourglass} alt="" />Anyone at the table can resume.
				</p>
			</div>
		</div>
	</div>
{/if}

{#if ui.menu}
	<div
		class="modal-backdrop menu-backdrop"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && close()}
	>
		<div class="drop" class:wide={page === 'help'}>
			<div class="board panel hanging">
				<div class="ribbon" style="--rib: var(--art-ribbon-crimson)">{title}</div>
				{#if page === 'main'}
					<div class="list">
						<button class="btn big block shine" onclick={resume}
							><img src={PIXEL.play} alt="" />Resume</button
						>
						{#if playing && others > 0 && !pausedBy}
							<button
								class="btn wood block"
								onclick={() => {
									close();
									client.pauseGame(true);
								}}><img src={PIXEL.pause} alt="" />Pause for everyone</button
							>
						{/if}
						<button class="btn wood block" onclick={() => go('help')}
							><img src={PIXEL.book} alt="" />How to play</button
						>
						<button class="btn wood block" onclick={() => go('settings')}
							><img src={PIXEL.gear} alt="" />Settings</button
						>
						{#if confirmLeave}
							<div class="confirm parch">
								<p>
									Leave the table? A bot plays your seat until you come back with code <b
										>{client.code}</b
									>.
								</p>
								<div class="row">
									<button class="btn small wood" onclick={() => (confirmLeave = false)}>Stay</button
									>
									<button class="btn small red" onclick={leave}
										><img src={PIXEL.door} alt="" />Leave</button
									>
								</div>
							</div>
						{:else}
							<button class="btn red block" onclick={() => (confirmLeave = true)}
								><img src={PIXEL.door} alt="" />Leave game</button
							>
						{/if}
					</div>
					<p class="note">
						<img class="icon-px" src={paused ? PIXEL.hourglass : PIXEL.chat} alt="" />
						{#if pausedBy}
							Paused for everyone until someone resumes.
						{:else if paused}
							The table waits until you return.
						{:else if others > 0}
							The others keep playing while this is open.
						{:else}
							Resume with Esc.
						{/if}
					</p>
				{:else}
					<button class="btn small wood back" onclick={() => go('main')}>‹ Back</button>
					{#if page === 'help'}
						<div class="page parch"><HowToPlay /></div>
					{:else}
						<div class="page"><Settings /></div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.corner {
		position: absolute;
		top: 14px;
		left: 14px;
		z-index: 30;
		display: flex;
		gap: 8px;
		pointer-events: auto;
	}
	.curtain {
		place-items: start center;
		padding-top: 0;
		z-index: 55;
	}
	.who {
		margin: 4px 0 2px;
		text-align: center;
		font-family: var(--px);
		font-size: 20px;
		color: var(--text);
	}
	.gear img {
		transition: transform 0.4s ease;
	}
	.gear:hover img {
		transform: rotate(60deg);
	}
	.menu-backdrop {
		place-items: start center;
		padding-top: 0;
		z-index: 60;
	}
	.drop {
		width: min(400px, calc(100vw - 24px));
		padding-top: 70px;
		animation: drop-in 0.55s cubic-bezier(0.2, 1.25, 0.4, 1) both;
	}
	.drop.wide {
		width: min(800px, calc(100vw - 24px));
	}
	.board {
		width: 100%;
		max-height: calc(100dvh - 110px);
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: calc(var(--s) * 7) 12px 12px;
	}
	.board::before {
		left: 12%;
	}
	.board::after {
		right: 12%;
	}
	.board > .ribbon {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -66%);
		z-index: 2;
		font-size: 24px;
		padding-left: calc(var(--s) * 6);
		padding-right: calc(var(--s) * 6);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.list .btn.block {
		justify-content: flex-start;
		gap: 14px;
		padding-left: calc(var(--s) * 5);
	}
	.list .btn img {
		height: calc(var(--s) * 9);
	}
	.confirm {
		padding: 4px 6px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		animation: pop-in 0.25s ease-out;
	}
	.confirm p {
		margin: 0;
		color: var(--ink);
		font-size: 15px;
		line-height: 1.35;
		text-align: center;
	}
	.confirm .row {
		display: flex;
		justify-content: center;
		gap: 10px;
	}
	.note {
		margin: 2px 0 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 700;
		color: var(--muted);
		text-align: center;
	}
	.note img {
		width: 20px;
		height: 20px;
	}
	.back {
		align-self: flex-start;
	}
	.page {
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #8a5a32 transparent;
	}
	.page.parch {
		padding: 6px 10px;
	}
	@media (max-width: 900px) {
		.corner {
			top: calc(104px + var(--clock-h, 0px));
			left: 6px;
		}
	}
</style>
