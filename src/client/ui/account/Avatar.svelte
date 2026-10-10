<script lang="ts">
	import { AVATAR_NAMES, type AvatarId, type Whereabouts } from '../../../shared/accounts';
	import { t } from '../../i18n/index.svelte';
	import { avatarUrl } from '../../scene/avatars';
	import { WHEREABOUTS } from '../../state/account.svelte';

	let {
		id,
		size = 56,
		framed = true,
		where = null
	}: {
		id: AvatarId | null;
		size?: number;
		framed?: boolean;
		/** Shows a status badge: green when online, gold at a table or in a game. */
		where?: Whereabouts | null;
	} = $props();

	const url = $derived(id ? avatarUrl(id) : null);
</script>

<span class="avatar" class:framed style="--size:{size}px">
	<span class="pic">
		<!-- The url is undefined while the picture is being drawn, and null where WebGL isn't available. -->
		{#if url}
			<img src={url} alt={id ? t(AVATAR_NAMES[id]) : ''} draggable="false" />
		{:else if url === null}
			<span class="initial">{id ? t(AVATAR_NAMES[id])[0] : '?'}</span>
		{/if}
	</span>
	{#if where}
		<span class="badge {where}" title={t(WHEREABOUTS[where])}></span>
	{/if}
</span>

<style>
	.avatar {
		position: relative;
		display: inline-block;
		width: var(--size);
		height: var(--size);
		flex: none;
	}
	.pic {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		overflow: hidden;
		box-sizing: border-box;
	}
	.framed .pic {
		border-style: solid;
		border-width: calc(var(--s) * 2);
		border-image: var(--art-well) 3 / calc(var(--s) * 2) stretch;
		background:
			radial-gradient(circle at 50% 38%, rgba(255, 214, 140, 0.5), transparent 62%),
			linear-gradient(#5a6e3a, #24301a);
		background-clip: padding-box;
	}
	/* The renders leave room for tall hats; crop in a little so the face fills the frame. */
	img {
		width: 122%;
		height: 122%;
		margin-top: 6%;
		object-fit: contain;
		filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.45));
	}
	.initial {
		font-family: var(--px);
		font-weight: 700;
		font-size: calc(var(--size) * 0.45);
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	/* A pixel-square status light on the corner. */
	.badge {
		position: absolute;
		right: calc(var(--s) * -1);
		bottom: calc(var(--s) * -1);
		width: max(13px, calc(var(--size) * 0.3));
		height: max(13px, calc(var(--size) * 0.3));
		box-sizing: border-box;
		border: calc(var(--s) * 1) solid #1e0e06;
		box-shadow:
			inset calc(var(--s) * 1) calc(var(--s) * 1) 0 rgba(255, 255, 255, 0.55),
			0 2px 0 rgba(0, 0, 0, 0.5);
		background: #6b5a4a;
	}
	.badge.menu {
		background: #5ad04a;
		animation: pulse 2.4s ease-in-out infinite;
	}
	.badge.lobby,
	.badge.game {
		background: #f2b431;
	}
	.badge.offline {
		background: #5e5048;
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.5);
	}
	@keyframes pulse {
		50% {
			filter: brightness(1.25) drop-shadow(0 0 4px rgba(120, 240, 90, 0.9));
		}
	}
</style>
