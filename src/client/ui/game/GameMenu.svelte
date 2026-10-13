<script lang="ts">
	import { client } from '../../state/client.svelte';
		import Settings from '../menu/Settings.svelte';
	import { PIXEL } from '../pixel';
	import { settings } from '../settings.svelte';
	import PigeonButton from './PigeonButton.svelte';
	import SpectatorBadge from './SpectatorBadge.svelte';
	import TurnCounter from './TurnCounter.svelte';
	import CqTurnCounter from '../conquest/CqTurnCounter.svelte';
	import EventChip from './EventChip.svelte';
	import MissionChip from '../campaign/MissionChip.svelte';
	import MissionPanel from '../campaign/MissionPanel.svelte';
	import RumorChip from './RumorChip.svelte';
	import { sfx } from '../sound';
	import Tutorial from '../tutorial/Tutorial.svelte';
	import { ui } from './ui.svelte';
	import { t } from '../../i18n/index.svelte';
	import Rich from '../../i18n/Rich.svelte';
	import { autoRoll } from './autoRoll.svelte';

	let page = $state<'main' | 'help' | 'settings'>('main');
	let confirmLeave = $state(false);
	const lobby = $derived(client.lobby);
	const paused = $derived(!!lobby?.paused);
	/** Who paused the game for everyone; null when nobody did (the menu alone pauses bot games). */
	const pausedBy = $derived(lobby?.pausedBy ?? null);
	const pausedLine = $derived.by(() => {
		if (pausedBy === client.seat) return t('You paused the game.');
		const name = lobby?.seats.find((s) => s.id === pausedBy)?.name;
		return name ? t('{player} paused the game.', { player: name }) : t('Someone paused the game.');
	});
	/** A campaign mission shows its stars and rules beside the menu's buttons. */
	const mission = $derived(page === 'main' && !!client.view?.campaign);
	/** A spectator can't pause the table, only watch it. */
	const game = $derived(client.view ?? client.cq);
	const playing = $derived(!!game && game.phase !== 'ended' && !client.spectating);
	const others = $derived(
		(lobby?.seats ?? []).filter((s) => !s.isBot && s.id !== client.seat && s.connected).length
	);
	const title = $derived(
		page === 'help'
			? t('Tutorial')
			: page === 'settings'
				? t('Settings')
				: paused
					? t('Paused')
					: t('Game Menu')
	);

	// The table pauses while everyone has the menu open (always true in a game vs bots).
	// A campaign mission's opening page holds the table the same way.
	$effect(() => {
		client.setMenuOpen(ui.menu || ui.brief);
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

	// The menu and the pause curtain are drawn at the menu size, not the HUD's they sit in.
	const zoom = $derived(settings.menuSize / settings.hudSize);

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
		const key = e.key.toLowerCase();
		if ((key !== 'p' && key !== 'n') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
		if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]'))
			return;
		if (key === 'n') settings.setNight(!settings.night);
		else if (playing) client.pauseGame(!pausedBy);
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="corner" bind:clientWidth={ui.cornerWidth}>
	<button class="icon-btn gear" onclick={open} aria-label={t('Menu')} title={t('Menu (Esc)')}
		><img src={PIXEL.gear} alt="" /></button
	>
	{#if !client.spectating}<PigeonButton />{/if}
	{#if playing && !pausedBy}
		<button
			class="icon-btn"
			onclick={() => client.pauseGame(true)}
			aria-label={t('Pause')}
			title={t('Pause the game for everyone (P)')}><img src={PIXEL.pause} alt="" /></button
		>
	{/if}
	{#if playing && client.view}
		<button
			class="icon-btn auto-roll"
			class:on={autoRoll.on}
			onclick={() => {
				sfx.click();
				autoRoll.set(!autoRoll.on);
			}}
			aria-label={t('Auto roll')}
			aria-pressed={autoRoll.on}
			title={autoRoll.on
				? t('On: your dice roll by themselves a moment after your turn starts.')
				: t('Off: press Roll dice yourself. Turn it on to roll by itself when your turn starts.')}
			data-tip-head={t('Auto roll')}
			><img src={PIXEL.die} alt="" /><span class="tag">{autoRoll.on ? t('On') : t('Off')}</span></button
		>
	{/if}
	<button
		class="icon-btn night"
		class:on={settings.night}
		onclick={() => {
			sfx.click();
			settings.setNight(!settings.night);
		}}
		aria-label={t('Night mode')}
		aria-pressed={settings.night}
		title={settings.night
			? t('On: the room is lit by the fire and the moon. Only you see it. (N)')
			: t("Off: put the room's lights out for a cozy evening. Only you see it. (N)")}
		data-tip-head={t('Night mode')}
		><img src={PIXEL.moon} alt="" /><span class="tag">{settings.night ? t('On') : t('Off')}</span></button
	>
	{#if client.view}
		<div class="turn-row"><TurnCounter /><span class="events"><MissionChip /><EventChip /><RumorChip /></span></div>
	{:else if client.cq}
		<div class="turn-row"><CqTurnCounter /></div>
	{/if}
	<SpectatorBadge />
</div>

{#if pausedBy && !ui.menu}
	<div
		class="modal-backdrop curtain"
		role="dialog"
		aria-modal="true"
		aria-label={t('Game paused')}
		style:zoom={zoom === 1 ? undefined : zoom}
		style:--ui-zoom={settings.menuSize}
	>
		<div class="drop" class:mission={!!client.view?.campaign}>
			<div class="board panel hanging">
				<div class="ribbon" style="--rib: var(--art-ribbon-crimson)">{t('Paused')}</div>
				<div class="split">
					<div class="side">
						<p class="who">{pausedLine}</p>
						<button class="btn big block shine" onclick={() => client.pauseGame(false)}
							><img src={PIXEL.play} alt="" />{t('Resume')}</button
						>
						<p class="note">
							<img class="icon-px" src={PIXEL.hourglass} alt="" />{t('Anyone at the table can resume.')}
						</p>
					</div>
					{#if client.view?.campaign}<MissionPanel story={false} />{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

{#if ui.menu}
	<div
		class="modal-backdrop menu-backdrop"
		role="presentation"
		style:zoom={zoom === 1 ? undefined : zoom}
		style:--ui-zoom={settings.menuSize}
		onclick={(e) => e.target === e.currentTarget && close()}
	>
		<div class="drop" class:wide={page === 'help'} class:roomy={page === 'settings'} class:mission>
			<div class="board panel hanging">
				<div class="ribbon" style="--rib: var(--art-ribbon-crimson)">{title}</div>
				{#if page === 'main'}
					<div class="split">
						<div class="side">
							<div class="list">
								<button class="btn big block shine" onclick={resume}
									><img src={PIXEL.play} alt="" />{t('Resume')}</button
								>
								{#if playing && others > 0 && !pausedBy}
									<button
										class="btn wood block"
										onclick={() => {
											close();
											client.pauseGame(true);
										}}><img src={PIXEL.pause} alt="" />{t('Pause for everyone')}</button
									>
								{/if}
								<button class="btn wood block" onclick={() => go('help')}
									><img src={PIXEL.book} alt="" />{t('Tutorial')}</button
								>
								<button class="btn wood block" onclick={() => go('settings')}
									><img src={PIXEL.gear} alt="" />{t('Settings')}</button
								>
								{#if client.replaying}
									<button class="btn red block" onclick={leave}
										><img src={PIXEL.door} alt="" />{t('Close replay')}</button
									>
								{:else if client.spectating}
									<button class="btn red block" onclick={leave}
										><img src={PIXEL.door} alt="" />{t('Stop watching')}</button
									>
								{:else if confirmLeave}
									<div class="confirm parch">
										{#if others > 0}
											<p>
												<Rich
													text={t(
														'Leave the table? A bot plays your seat, and you can rejoin from the main menu (or with code {code}) while anyone is still playing.'
													)}
													slots={{ code }}
												/>
												{#snippet code()}<b>{client.code}</b>{/snippet}
											</p>
										{:else}
											<p>
												<Rich text={t('Leave the table? Nobody else is playing, so leaving {cancels}.')} slots={{ cancels }} />
												{#snippet cancels()}<b>{t('cancels this game')}</b>{/snippet}
											</p>
										{/if}
										<div class="row">
											<button class="btn small wood" onclick={() => (confirmLeave = false)}>{t('Stay')}</button
											>
											<button class="btn small red" onclick={leave}
												><img src={PIXEL.door} alt="" />{t('Leave')}</button
											>
										</div>
									</div>
								{:else}
									<button class="btn red block" onclick={() => (confirmLeave = true)}
										><img src={PIXEL.door} alt="" />{t('Leave game')}</button
									>
								{/if}
							</div>
							<p class="note">
								<img class="icon-px" src={paused ? PIXEL.hourglass : PIXEL.chat} alt="" />
								{#if pausedBy}
									{t('Paused for everyone until someone resumes.')}
								{:else if paused}
									{t('The table waits until you return.')}
								{:else if others > 0}
									{t('The others keep playing while this is open.')}
								{:else}
									{t('Resume with Esc.')}
								{/if}
							</p>
						</div>
						{#if mission}<MissionPanel />{/if}
					</div>
				{:else}
					<button class="btn small wood back" onclick={() => go('main')}>‹ {t('Back')}</button>
					{#if page === 'help'}
						<Tutorial mode={client.cq ? 'conquest' : client.view?.mode} />
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
	/* The round's event card goes beside the turn, in the column on phones too. */
	.turn-row {
		display: contents;
	}
	/* The rumor a tavern hears of the next card hangs under this round's card, clear of the
	   prompt in the middle. */
	.events {
		position: relative;
		display: flex;
	}
	.events :global(.rumor-chip) {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 6px;
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
	.auto-roll,
	.night {
		position: relative;
	}
	.auto-roll img,
	.night img {
		opacity: 0.6;
	}
	.auto-roll.on img,
	.night.on img {
		opacity: 1;
	}
	.night.on img {
		filter: drop-shadow(0 0 4px rgba(255, 220, 120, 0.75));
	}
	.auto-roll .tag,
	.night .tag {
		position: absolute;
		bottom: calc(var(--s) * -4);
		left: 50%;
		transform: translateX(-50%);
		padding: 1px 4px;
		border-radius: 3px;
		background: #5a3a24;
		box-shadow: 0 0 0 2px #2a1a10;
		color: #d9c39a;
		font-family: var(--px);
		font-weight: 700;
		font-size: 10px;
		line-height: 1.1;
		text-transform: uppercase;
	}
	.auto-roll.on .tag {
		background: #3f8f3a;
		color: #fff;
	}
	.night.on .tag {
		background: #3a4f8f;
		color: #fff;
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
		width: min(400px, calc(100vw / var(--ui-zoom) - 24px));
		padding-top: 70px;
		animation: drop-in 0.55s cubic-bezier(0.2, 1.25, 0.4, 1) both;
	}
	/* Settings' four tabs need more room across than the menu's buttons. */
	.drop.roomy {
		width: min(600px, calc(100vw / var(--ui-zoom) - 24px));
	}
	.drop.wide {
		width: min(1100px, calc(100vw / var(--ui-zoom) - 24px));
	}
	/* A campaign mission: the buttons on the left, the mission's stars and rules on the right. */
	.drop.mission {
		width: min(820px, calc(100vw / var(--ui-zoom) - 24px));
	}
	.split,
	.side {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
	}
	.drop.mission .split {
		display: grid;
		grid-template-columns: 340px minmax(0, 1fr);
		gap: 14px;
		align-items: start;
	}
	.drop.mission .split > :global(.mission-panel) {
		max-height: calc(100dvh / var(--ui-zoom) - 150px);
	}
	.drop.wide .board {
		height: calc(100dvh / var(--ui-zoom) - 110px);
	}
	.board {
		width: 100%;
		max-height: calc(100dvh / var(--ui-zoom) - 110px);
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
	/* Phones: the panel goes under the buttons, and the two scroll together. */
	@media (max-width: 760px) {
		.drop.mission .split {
			display: flex;
			overflow-y: auto;
		}
		.drop.mission .split > :global(*) {
			flex: none;
		}
		.drop.mission .split > :global(.mission-panel) {
			max-height: none;
			overflow: visible;
		}
	}
	@media (max-width: 900px) {
		/* A column, so the buttons stay clear of the chronicle beside them. */
		.corner {
			top: calc(104px + var(--clock-h, 0px));
			left: 6px;
			flex-direction: column;
			gap: 6px;
		}
		.turn-row {
			display: flex;
			gap: 6px;
		}
		/* On phones the column has room beside it. */
		.events {
			display: contents;
		}
		.events :global(.rumor-chip) {
			position: static;
			margin: 0;
		}
	}
</style>
