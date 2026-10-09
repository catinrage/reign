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
	import { LogoView } from '../../scene/logo';
	import { account } from '../../state/account.svelte';
	import Embers from '../menu/Embers.svelte';
	import { sideLayout } from '../menu/sideLayout';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import AvatarPicker from './AvatarPicker.svelte';
	import { ACCOUNT_ICONS } from './icons';

	/** The first thing anyone sees: sign in, or make an account. */

	let mode = $state<'in' | 'up'>('in');
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
			logo = new LogoView(canvas);
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
				(password !== confirm ? "The two passwords don't match." : null);
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
</script>

<div class="auth">
	<Embers />
	<div class="column">
		<header class="crest">
			<div class="logo">
				<canvas bind:this={canvas} aria-label="Reign"></canvas>
				{#if !logoOk}<h1 class="title">REIGN</h1>{/if}
			</div>
			<div class="ribbon tagline">Settle <i>·</i> Trade <i>·</i> Build</div>
		</header>

		<form class="sign panel" class:wide={mode === 'up'} onsubmit={submit} novalidate>
			{#if invitedTo}
				<p class="invite plaque">
					<img class="icon-px" src={PIXEL.letter} alt="" />Sign in to join table <b>{invitedTo}</b>
				</p>
			{/if}
			<div class="seg tabs" role="tablist">
				<button type="button" role="tab" aria-selected={mode === 'in'} class="btn small" class:on={mode === 'in'} onclick={() => switchTo('in')}
					><img class="icon-px" src={ACCOUNT_ICONS.key} alt="" />Sign in</button
				>
				<button type="button" role="tab" aria-selected={mode === 'up'} class="btn small" class:on={mode === 'up'} onclick={() => switchTo('up')}
					><img class="icon-px" src={ACCOUNT_ICONS.quill} alt="" />Create account</button
				>
			</div>

			<div class="fields" class:two={mode === 'up'}>
				<div class="col">
					<label class="field">
						<span class="label">Username</span>
						<input
							class="input"
							bind:value={username}
							maxlength={USERNAME_MAX}
							autocomplete="username"
							autocapitalize="off"
							spellcheck="false"
							placeholder="settler_42"
						/>
						{#if mode === 'up'}<span class="hint">Friends find you by it. Letters, digits and _.</span>{/if}
					</label>
					{#if mode === 'up'}
						<label class="field">
							<span class="label">Nickname</span>
							<input class="input" bind:value={nickname} maxlength={NICKNAME_MAX} placeholder="What the table calls you" />
						</label>
					{/if}
					<label class="field">
						<span class="label">Password</span>
						<input
							class="input"
							type="password"
							bind:value={password}
							autocomplete={mode === 'in' ? 'current-password' : 'new-password'}
							placeholder={mode === 'up' ? `At least ${PASSWORD_MIN} characters` : ''}
						/>
					</label>
					{#if mode === 'up'}
						<label class="field">
							<span class="label">Password again</span>
							<input class="input" type="password" bind:value={confirm} autocomplete="new-password" />
						</label>
					{/if}
				</div>
				{#if mode === 'up'}
					<div class="col">
						<span class="label">Avatar</span>
						<div class="well avatars"><AvatarPicker bind:value={avatar} size={54} /></div>
						<span class="hint">You can change all of this later.</span>
					</div>
				{/if}
			</div>

			{#if error}<p class="error" role="alert">{error}</p>{/if}

			<button class="btn big block shine" type="submit" disabled={busy || !username || !password}>
				<img src={mode === 'in' ? PIXEL.play : ACCOUNT_ICONS.quill} alt="" />
				<span class="stack"
					>{mode === 'in' ? 'Sign in' : 'Create account'}<span class="sub"
						>{mode === 'in' ? 'Welcome back, settler' : 'Claim your place at the table'}</span
					></span
				>
			</button>
			<p class="switch">
				{#if mode === 'in'}
					New here? <button type="button" class="link" onclick={() => switchTo('up')}>Create an account</button>
				{:else}
					Have an account? <button type="button" class="link" onclick={() => switchTo('in')}>Sign in</button>
				{/if}
			</p>
		</form>
	</div>
</div>

<style>
	.auth {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		overflow-x: hidden;
		pointer-events: auto;
		background:
			radial-gradient(ellipse 70% 60% at 50% 46%, transparent 35%, rgba(12, 5, 2, 0.6) 100%),
			linear-gradient(180deg, rgba(12, 5, 2, 0.45), transparent 30%, transparent 70%, rgba(12, 5, 2, 0.5));
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
		padding: 10px 16px 32px;
	}
	.crest {
		display: flex;
		flex-direction: column;
		align-items: center;
		animation: drop-in 0.8s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	.logo {
		position: relative;
		width: min(620px, 94vw);
		aspect-ratio: 700 / 230;
		margin-bottom: -18px;
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
		font-size: clamp(64px, 13vw, 132px);
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
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 10px 12px 12px;
		animation: pop-in 0.5s cubic-bezier(0.2, 1.3, 0.4, 1) 0.15s both;
	}
	.sign.wide {
		width: min(720px, 100%);
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
		gap: 12px;
	}
	.fields.two {
		grid-template-columns: 1fr 1.1fr;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.hint {
		font-size: 13px;
		font-weight: 700;
		color: var(--muted);
	}
	.avatars {
		padding: 8px 6px;
	}
	.error {
		margin: 0;
		padding: 6px 10px;
		text-align: center;
		font-weight: 800;
		color: #ffd2c4;
		background: rgba(120, 20, 10, 0.55);
		border: 2px solid rgba(255, 110, 80, 0.6);
		animation: pop-in 0.25s ease-out;
	}
	.sign .btn.block {
		justify-content: flex-start;
		gap: 12px;
		padding-left: calc(var(--s) * 4);
	}
	.sign .btn.block img {
		height: calc(var(--s) * 9);
	}
	.switch {
		margin: 0;
		text-align: center;
		font-weight: 700;
		color: var(--muted);
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
	@media (min-width: 1100px) and (min-aspect-ratio: 4/3) {
		.column {
			width: 760px;
			margin-left: max(24px, 4vw);
		}
		.sign {
			width: 420px;
		}
		.logo {
			width: 560px;
		}
	}
	@media (max-width: 700px) {
		.column {
			justify-content: flex-start;
			padding-top: 18px;
			gap: 12px;
		}
		.fields.two {
			grid-template-columns: 1fr;
		}
		.tagline {
			font-size: 14px;
		}
	}
</style>
