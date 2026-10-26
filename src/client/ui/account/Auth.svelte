<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AVATARS,
		type AvatarId,
		NICKNAME_MAX,
		PASSWORD_MIN,
		USERNAME_MAX,
		cleanUsername,
		passwordProblem,
		usernameProblem
	} from '../../../shared/accounts';
	import { msg, t, tx } from '../../i18n/index.svelte';
	import Rich from '../../i18n/Rich.svelte';
	import { LogoView } from '../../scene/logo';
	import { account } from '../../state/account.svelte';
	import { OFFLINE_BUILD } from '../../offline/guest.svelte';
	import { authStart, playAsGuest } from '../../state/guestPlay';
	import Embers from '../menu/Embers.svelte';
	import { fitHeight } from '../menu/fitHeight';
	import { sideLayout } from '../menu/sideLayout';
	import { PIXEL } from '../pixel';
	import { settings } from '../settings.svelte';
	import { sfx } from '../sound';
	import AvatarPicker from './AvatarPicker.svelte';
	import { ACCOUNT_ICONS } from './icons';

	/**
	 * Signing in, or making an account, to play online. Players come here from the guest menu (or
	 * an invite link), so it is kept short enough to fit a game site's frame, with a way back.
	 */

	let mode = $state<'in' | 'up'>(authStart.mode);
	let username = $state('');
	let nickname = $state('');
	let password = $state('');
	let confirm = $state('');
	let avatar = $state<AvatarId>(AVATARS[Math.floor(Math.random() * AVATARS.length)]);
	let error = $state('');
	let busy = $state(false);
	let canvas: HTMLCanvasElement | undefined = $state();
	let logoOk = $state(true);
	// Someone who opened an invite link lands at that table once they're in.
	const invitedTo = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;

	onMount(sideLayout);

	onMount(() => {
		if (!canvas) return;
		let logo: LogoView | null = null;
		try {
			logo = new LogoView(canvas, settings.quality);
		} catch {
			logoOk = false;
		}
		const onResize = () => logo?.resize();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			logo?.dispose();
		};
	});

	function switchTo(m: 'in' | 'up') {
		if (m === mode) return;
		sfx.click();
		mode = m;
		error = '';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = '';
		if (mode === 'up') {
			const problem =
				usernameProblem(cleanUsername(username)) ??
				passwordProblem(password) ??
				(password !== confirm ? msg("The two passwords don't match.") : null);
			if (problem) {
				error = problem;
				return;
			}
		}
		busy = true;
		try {
			if (mode === 'in') await account.login(username, password);
			else await account.register({ username, nickname: nickname || username, password, avatar });
			sfx.open();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function guest() {
		if (busy) return;
		busy = true;
		sfx.open();
		try {
			await playAsGuest();
		} finally {
			busy = false;
		}
	}
</script>

<div class="auth">
	<Embers />
	<div class="column" use:fitHeight={{ margin: 24 }}>
		<header class="crest">
			<div class="logo">
				<canvas bind:this={canvas} aria-label="Reign"></canvas>
				{#if !logoOk}<h1 class="title">REIGN</h1>{/if}
			</div>
		</header>

		<form class="sign panel" class:wide={mode === 'up'} onsubmit={submit} novalidate>
			{#if invitedTo}
				<p class="invite plaque">
					<img class="icon-px" src={PIXEL.letter} alt="" /><span><Rich text={t('Sign in to join table {code}')} slots={{ code }} /></span>
					{#snippet code()}<b>{invitedTo}</b>{/snippet}
				</p>
			{:else}
				<p class="why">
					<img class="icon-px" src={ACCOUNT_ICONS.friends} alt="" />{mode === 'in'
						? t('Sign in to play online with friends')
						: t('Free, and takes a few seconds')}
				</p>
			{/if}
			<div class="seg tabs" role="tablist">
				<button type="button" role="tab" aria-selected={mode === 'in'} class="btn small" class:on={mode === 'in'} onclick={() => switchTo('in')}
					><img class="icon-px" src={ACCOUNT_ICONS.key} alt="" />{t('Sign in')}</button
				>
				<button type="button" role="tab" aria-selected={mode === 'up'} class="btn small" class:on={mode === 'up'} onclick={() => switchTo('up')}
					><img class="icon-px" src={ACCOUNT_ICONS.quill} alt="" />{t('Create account')}</button
				>
			</div>

			<div class="fields" class:two={mode === 'up'}>
				<label class="field">
					<span class="label">{t('Username')}</span>
					<input
						class="input"
						bind:value={username}
						maxlength={USERNAME_MAX}
						autocomplete="username"
						autocapitalize="off"
						spellcheck="false"
						placeholder="settler_42"
						title={mode === 'up' ? t('Friends find you by it. Letters, digits and _.') : undefined}
					/>
				</label>
				{#if mode === 'up'}
					<label class="field">
						<span class="label">{t('Nickname')}</span>
						<input class="input" bind:value={nickname} maxlength={NICKNAME_MAX} placeholder={t('What the table calls you')} />
					</label>
				{/if}
				<label class="field">
					<span class="label">{t('Password')}</span>
					<input
						class="input"
						type="password"
						bind:value={password}
						autocomplete={mode === 'in' ? 'current-password' : 'new-password'}
						placeholder={mode === 'up' ? t('At least {n} characters', { n: PASSWORD_MIN }) : ''}
					/>
				</label>
				{#if mode === 'up'}
					<label class="field">
						<span class="label">{t('Password again')}</span>
						<input class="input" type="password" bind:value={confirm} autocomplete="new-password" />
					</label>
				{/if}
			</div>
			{#if mode === 'up'}
				<div class="field">
					<span class="label">{t('Avatar')} <small class="hint">{t('You can change all of this later.')}</small></span>
					<div class="well avatars"><AvatarPicker bind:value={avatar} size={38} /></div>
				</div>
			{/if}

			{#if error}<p class="error" role="alert">{tx(error)}</p>{/if}

			<button class="btn block shine go" type="submit" disabled={busy || !username || !password}>
				<img src={mode === 'in' ? PIXEL.play : ACCOUNT_ICONS.quill} alt="" />
				{mode === 'in' ? t('Sign in') : t('Create account')}
			</button>
			<div class="foot">
				{#if !OFFLINE_BUILD}
					<button type="button" class="link back" onclick={guest} disabled={busy}>‹ {t('Back to the menu')}</button>
				{/if}
				<span class="switch">
					{#if mode === 'in'}
						{t('New here?')} <button type="button" class="link" onclick={() => switchTo('up')}>{t('Create an account')}</button>
					{:else}
						{t('Have an account?')} <button type="button" class="link" onclick={() => switchTo('in')}>{t('Sign in')}</button>
					{/if}
				</span>
			</div>
		</form>
	</div>
</div>

<style>
	.auth {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;
		pointer-events: auto;
		background:
			radial-gradient(ellipse 70% 60% at 50% 46%, transparent 35%, rgba(12, 5, 2, 0.6) 100%),
			linear-gradient(180deg, rgba(12, 5, 2, 0.45), transparent 30%, transparent 70%, rgba(12, 5, 2, 0.5));
	}
	.auth::-webkit-scrollbar {
		display: none;
	}
	.column {
		position: relative;
		min-height: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 8px 16px 16px;
	}
	.crest {
		display: flex;
		flex-direction: column;
		align-items: center;
		animation: drop-in 0.8s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	.logo {
		position: relative;
		width: min(380px, calc(80vw / var(--ui-zoom)));
		aspect-ratio: 700 / 230;
		margin-bottom: -10px;
		pointer-events: none;
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
		font-size: clamp(48px, calc(9vw / var(--ui-zoom)), 84px);
		color: #ffd86b;
		letter-spacing: 0.08em;
		text-shadow:
			0 3px 0 #c9781a,
			0 6px 0 #8a4410,
			0 9px 0 #4a2008,
			0 14px 18px rgba(0, 0, 0, 0.6);
	}
	.sign {
		width: min(380px, 100%);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 9px;
		padding: 8px 12px 10px;
		animation: pop-in 0.5s cubic-bezier(0.2, 1.3, 0.4, 1) 0.15s both;
	}
	.sign.wide {
		width: min(560px, 100%);
	}
	.why {
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.why img {
		height: 20px;
	}
	.invite {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin: 0;
		padding: 4px 10px;
		font-family: var(--px);
		font-weight: 700;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.invite b {
		color: var(--gold);
		letter-spacing: 0.1em;
	}
	.invite img {
		height: 16px;
	}
	.tabs {
		display: flex;
	}
	.tabs .btn {
		flex: 1;
		gap: 8px;
	}
	.tabs img {
		height: calc(var(--s) * 6);
	}
	.fields {
		display: grid;
		gap: 8px;
	}
	.fields.two {
		grid-template-columns: 1fr 1fr;
		gap: 8px 10px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.field .input {
		min-width: 0;
	}
	.hint {
		font-family: var(--body);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: none;
		color: var(--muted);
		opacity: 0.85;
	}
	.avatars {
		padding: 2px 4px;
	}
	/* One row that scrolls sideways, to keep the form short. */
	.avatars :global(.picker) {
		grid-template-columns: none;
		grid-auto-flow: column;
		grid-auto-columns: 46px;
		gap: 2px;
		overflow-x: auto;
		padding: 4px 2px;
		scrollbar-width: thin;
		scrollbar-color: #b8740f transparent;
	}
	.error {
		margin: 0;
		padding: 5px 10px;
		text-align: center;
		font-weight: 800;
		color: #ffd2c4;
		background: rgba(120, 20, 10, 0.55);
		border: 2px solid rgba(255, 110, 80, 0.6);
		animation: pop-in 0.25s ease-out;
	}
	.go {
		gap: 10px;
		font-size: 20px;
	}
	.go img {
		height: calc(var(--s) * 7);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-weight: 700;
		font-size: 14px;
		color: var(--muted);
	}
	.switch {
		margin-left: auto;
	}
	.link {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		color: var(--gold);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.link:hover {
		color: #fff2a8;
	}
	.back {
		color: #fff2d2;
		text-decoration: none;
		font-family: var(--px);
	}
	@media (min-width: 1100px) and (min-aspect-ratio: 4/3) {
		.column {
			width: 640px;
			margin-left: max(24px, calc(4vw / var(--ui-zoom)));
		}
	}
	@media (max-width: 560px) {
		.fields.two {
			grid-template-columns: 1fr;
		}
	}
</style>
