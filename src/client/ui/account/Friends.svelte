<script lang="ts">
	import { USERNAME_MAX, type Friend } from '../../../shared/accounts';
	import { WHEREABOUTS, account } from '../../state/account.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import Avatar from './Avatar.svelte';
	import { ACCOUNT_ICONS } from './icons';

	/**
	 * Friends: add one by username, answer requests, and see who is online. At a table (`inviting`)
	 * each online friend gets an Invite button.
	 */

	let {
		inviting = false,
		onhistory = undefined
	}: {
		inviting?: boolean;
		/** Open a friend's match history. */
		onhistory?: (f: Friend) => void;
	} = $props();

	let name = $state('');
	let busy = $state(false);
	let error = $state('');
	/** The friend whose Remove button was pressed once and waits for a second press. */
	let removing = $state<string | null>(null);
	/** Friends invited from this panel a moment ago. */
	let invited = $state<Record<string, number>>({});

	const incoming = $derived(account.requests.filter((r) => r.incoming));
	const outgoing = $derived(account.requests.filter((r) => !r.incoming));
	const atTable = $derived(new Set(client.lobby?.seats.map((s) => s.userId).filter(Boolean)));

	async function run(fn: () => Promise<unknown>) {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await fn();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	function add(e: SubmitEvent) {
		e.preventDefault();
		const who = name.trim().replace(/^@/, '');
		if (!who) return;
		run(async () => {
			const res = await account.addFriend(who);
			name = '';
			client.toast(res.accepted ? `You and ${res.nickname} are friends now.` : `Asked ${res.nickname} to be friends.`, 'good');
		});
	}

	function remove(f: Friend) {
		if (removing !== f.id) {
			removing = f.id;
			setTimeout(() => removing === f.id && (removing = null), 3000);
			return;
		}
		removing = null;
		run(() => account.removeFriend(f.id));
	}

	function invite(f: Friend) {
		client.send({ t: 'invite', user: f.id });
		invited = { ...invited, [f.id]: Date.now() };
		client.toast(`Invited ${f.nickname} to your table.`, 'good');
		setTimeout(() => {
			const { [f.id]: _, ...rest } = invited;
			invited = rest;
		}, 4000);
	}
</script>

<div class="friends">
	<form class="add" onsubmit={add}>
		<input
			class="input"
			bind:value={name}
			maxlength={USERNAME_MAX + 1}
			placeholder="Friend's username"
			autocapitalize="off"
			spellcheck="false"
			aria-label="Friend's username"
		/>
		<button class="btn green" type="submit" disabled={busy || !name.trim()}
			><img class="icon-px" src={ACCOUNT_ICONS.plus} alt="" />Add</button
		>
	</form>
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if incoming.length}
		<div class="divider"><i></i><span>Asking to be friends</span><i></i></div>
		<ul class="list">
			{#each incoming as r (r.user.id)}
				<li class="row plaque fresh">
					<Avatar id={r.user.avatar} size={44} />
					<span class="who"><b class="title">{r.user.nickname}</b><small>@{r.user.username}</small></span>
					<button class="btn small green" disabled={busy} onclick={() => run(() => account.acceptFriend(r.user.id))}
						><img class="icon-px" src={PIXEL.check} alt="" />Accept</button
					>
					<button
						class="icon-btn mini"
						disabled={busy}
						title="Decline"
						aria-label="Decline {r.user.nickname}"
						onclick={() => run(() => account.removeFriend(r.user.id))}><img src={PIXEL.close} alt="" /></button
					>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="divider">
		<i></i><span>Friends {account.onlineFriends.length}/{account.friends.length} online</span><i></i>
	</div>
	{#if account.friends.length}
		<ul class="list">
			{#each account.friends as f (f.id)}
				<li class="row plaque" class:off={f.where === 'offline'}>
					<Avatar id={f.avatar} size={44} where={f.where} />
					<span class="who">
						<b class="title">{f.nickname}</b>
						<small>@{f.username} · <span class="where {f.where}">{WHEREABOUTS[f.where]}</span></small>
					</span>
					{#if inviting && f.where !== 'offline'}
						{#if atTable.has(f.id)}
							<span class="here">At your table</span>
						{:else}
							<button class="btn small" disabled={!!invited[f.id]} onclick={() => invite(f)}
								><img class="icon-px" src={PIXEL.letter} alt="" />{invited[f.id] ? 'Sent' : 'Invite'}</button
							>
						{/if}
					{/if}
					{#if onhistory}
						<button class="icon-btn mini" title="{f.nickname}'s games" aria-label="{f.nickname}'s games" onclick={() => onhistory(f)}
							><img src={ACCOUNT_ICONS.scroll} alt="" /></button
						>
					{/if}
					<button
						class="icon-btn mini"
						class:arm={removing === f.id}
						disabled={busy}
						title={removing === f.id ? 'Press again to remove' : 'Remove friend'}
						aria-label="Remove {f.nickname}"
						onclick={() => remove(f)}><img src={PIXEL.close} alt="" /></button
					>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No friends yet. Add someone by their username, and they'll show up here once they say yes.</p>
	{/if}

	{#if outgoing.length}
		<div class="divider"><i></i><span>Waiting for an answer</span><i></i></div>
		<ul class="list">
			{#each outgoing as r (r.user.id)}
				<li class="row plaque off">
					<Avatar id={r.user.avatar} size={36} />
					<span class="who"><b class="title">{r.user.nickname}</b><small>@{r.user.username}</small></span>
					<button class="btn small wood" disabled={busy} onclick={() => run(() => account.removeFriend(r.user.id))}>Cancel</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.friends {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.add {
		display: flex;
		gap: 8px;
	}
	.add .input {
		flex: 1;
		min-width: 0;
	}
	.btn {
		gap: 6px;
	}
	.btn img {
		height: 15px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
	}
	.row.fresh {
		animation: glow 2.2s ease-in-out infinite;
	}
	.row.off {
		filter: saturate(0.6);
	}
	.row.off :global(.avatar img) {
		opacity: 0.75;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.who b {
		font-size: 17px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.who small {
		font-weight: 700;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.where.menu {
		color: #8ae070;
	}
	.where.lobby,
	.where.game {
		color: var(--gold);
	}
	.here {
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: var(--gold);
	}
	.icon-btn.mini {
		width: calc(var(--s) * 12);
		height: calc(var(--s) * 12);
		flex: none;
	}
	.icon-btn.mini img {
		width: calc(var(--s) * 6);
		height: calc(var(--s) * 6);
	}
	.icon-btn.arm {
		border-image-source: var(--art-btn-red);
	}
	.empty {
		margin: 4px 0 !important;
	}
	.error {
		margin: 0 !important;
		padding: 6px 10px;
		text-align: center;
		font-weight: 800;
		color: #ffd2c4 !important;
		background: rgba(120, 20, 10, 0.55);
		border: 2px solid rgba(255, 110, 80, 0.6);
	}
</style>
