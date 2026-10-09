<script lang="ts">
	import { type AvatarId, NICKNAME_MAX, USERNAME_MAX, cleanUsername, passwordProblem, usernameProblem } from '../../../shared/accounts';
	import { t, tx } from '../../i18n/index.svelte';
	import { OFFLINE } from '../../offline/flag';
	import { account } from '../../state/account.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import AvatarPicker from './AvatarPicker.svelte';
	import { ACCOUNT_ICONS } from './icons';

	/** The player's own profile: avatar, nickname, username and password, and signing out. */

	let { onclose }: { onclose: () => void } = $props();

	const me = account.me!;
	let avatar = $state<AvatarId>(me.avatar);
	let nickname = $state(me.nickname);
	let username = $state(me.username);
	let current = $state('');
	let password = $state('');
	let changingPassword = $state(false);
	let error = $state('');
	let busy = $state(false);

	const dirty = $derived(
		avatar !== account.me?.avatar ||
			nickname.trim() !== account.me?.nickname ||
			cleanUsername(username) !== account.me?.username ||
			(changingPassword && !!password)
	);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (busy || !dirty) return;
		error = '';
		const change: Parameters<typeof account.updateProfile>[0] = {};
		if (avatar !== account.me?.avatar) change.avatar = avatar;
		if (nickname.trim() !== account.me?.nickname) change.nickname = nickname;
		if (cleanUsername(username) !== account.me?.username) {
			const problem = usernameProblem(cleanUsername(username));
			if (problem) return void (error = problem);
			change.username = username;
		}
		if (changingPassword && password) {
			const problem = passwordProblem(password);
			if (problem) return void (error = problem);
			change.password = password;
			change.currentPassword = current;
		}
		busy = true;
		try {
			await account.updateProfile(change);
			client.toast(t('Profile saved.'), 'good');
			onclose();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function signOut() {
		onclose();
		await account.logout();
	}
</script>

<form class="profile" onsubmit={save} novalidate>
	<div class="cols">
		<div class="col">
			<label class="field">
				<span class="label">{t('Nickname')}</span>
				<input class="input" bind:value={nickname} maxlength={NICKNAME_MAX} />
				<span class="hint">{t('What the table calls you.')}</span>
			</label>
			{#if !OFFLINE}
				<label class="field">
					<span class="label">{t('Username')}</span>
					<input class="input" bind:value={username} maxlength={USERNAME_MAX} autocapitalize="off" spellcheck="false" autocomplete="username" />
					<span class="hint">{t('Friends add you by it.')}</span>
				</label>
				{#if changingPassword}
					<label class="field">
						<span class="label">{t('Current password')}</span>
						<input class="input" type="password" bind:value={current} autocomplete="current-password" />
					</label>
					<label class="field">
						<span class="label">{t('New password')}</span>
						<input class="input" type="password" bind:value={password} autocomplete="new-password" />
						<span class="hint">{t('Signs you out everywhere else.')}</span>
					</label>
				{:else}
					<button type="button" class="btn small wood" onclick={() => (changingPassword = true)}
						><img class="icon-px" src={ACCOUNT_ICONS.key} alt="" />{t('Change password')}</button
					>
				{/if}
			{/if}
		</div>
		<div class="col">
			<span class="label">{t('Avatar')}</span>
			<div class="well avatars"><AvatarPicker bind:value={avatar} size={54} /></div>
		</div>
	</div>

	{#if error}<p class="error" role="alert">{tx(error)}</p>{/if}

	<div class="foot">
		{#if OFFLINE}<span></span>{:else}
			<button type="button" class="btn small red" onclick={signOut}
				><img class="icon-px" src={PIXEL.door} alt="" />{t('Sign out')}</button
			>
		{/if}
		<button type="submit" class="btn green" disabled={!dirty || busy}
			><img class="icon-px" src={PIXEL.check} alt="" />{t('Save')}</button
		>
	</div>
</form>

<style>
	.profile {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1.15fr;
		gap: 14px;
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
	.btn img {
		height: 16px;
	}
	.btn {
		gap: 8px;
	}
	.error {
		margin: 0;
		padding: 6px 10px;
		text-align: center;
		font-weight: 800;
		color: #ffd2c4;
		background: rgba(120, 20, 10, 0.55);
		border: 2px solid rgba(255, 110, 80, 0.6);
	}
	.foot {
		justify-content: space-between !important;
		margin-top: 0 !important;
	}
	@media (max-width: 640px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
