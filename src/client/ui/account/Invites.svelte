<script lang="ts">
	import type { RoomInvite } from '../../../shared/accounts';
	import { t } from '../../i18n/index.svelte';
	import Rich from '../../i18n/Rich.svelte';
	import { account } from '../../state/account.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import Avatar from './Avatar.svelte';

	/** Invitations to friends' tables, as cards at the top of the screen wherever the player is. */

	let seen = 0;
	$effect(() => {
		const n = account.invites.length;
		if (n > seen) sfx.turn();
		seen = n;
	});

	function join(i: RoomInvite) {
		account.dropInvite(i.id);
		if (client.code === i.code) return;
		if (client.code) client.leave();
		client.join(i.code);
	}

	function decline(i: RoomInvite) {
		account.dropInvite(i.id);
		client.send({ t: 'declineInvite', id: i.id });
	}

	const inGame = $derived(!!client.view && client.lobby?.started && client.view.phase !== 'ended');
</script>

{#if account.invites.length}
	<div class="invites">
		{#each account.invites as i (i.id)}
			<div class="invite panel" role="alert">
				<Avatar id={i.from.avatar} size={52} />
				<div class="text">
					<span class="who title">{i.from.nickname}</span>
					<span class="what"><Rich text={t('invites you to their table {code}')} slots={{ code }} /></span>
					{#snippet code()}<b>{i.code}</b>{/snippet}
					{#if inGame}<span class="warn">{t("Joining leaves the game you're in.")}</span>{/if}
				</div>
				<div class="buttons">
					<button class="btn small green" onclick={() => join(i)}
						><img class="icon-px" src={PIXEL.check} alt="" />{t('Join')}</button
					>
					<button class="btn small wood" onclick={() => decline(i)}>{t('Decline')}</button>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.invites {
		position: fixed;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 70;
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: min(440px, calc(100vw / var(--ui-zoom) - 24px));
		pointer-events: none;
	}
	.invite {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.55));
		animation: drop-in 0.55s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.who {
		font-size: 19px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.what {
		font-weight: 700;
		color: var(--muted);
		font-size: 14px;
	}
	.what b {
		color: var(--gold);
		letter-spacing: 0.08em;
	}
	.warn {
		font-size: 12px;
		font-weight: 800;
		color: #ffb49a;
	}
	.buttons {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.buttons .btn {
		gap: 6px;
	}
	.buttons img {
		height: 14px;
	}
</style>
