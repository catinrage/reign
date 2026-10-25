<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';
	import { myTurn } from '../helpers';
	import { settings } from '../settings.svelte';
	import { sfx } from '../sound';

	const view = $derived(client.view);
	// Your own turn, or cards you still owe after a 7: either is played for you when time runs out.
	const onMe = $derived(!!view && (myTurn(view) || (view.step === 'discard' && !!view.pendingDiscards[view.me])));
	const secs = $derived(client.clock?.running ? Math.ceil((client.timeLeft ?? 0) / 1000) : 0);
	const show = $derived(onMe && secs > 0 && secs <= 5);

	// A tick for each of the last seconds.
	$effect(() => {
		if (show && secs) sfx.tick();
	});
</script>

{#if show}
	<div class="warning" class:calm={settings.reduceMotion} role="alert">
		<div class="edge"></div>
		{#key secs}
			<div class="count" class:last={secs <= 2}>{secs}</div>
		{/key}
		<div class="ribbon hurry">{t("Time's almost up!")}</div>
	</div>
{/if}

<style>
	.warning {
		position: fixed;
		inset: 0;
		/* Over dialogs and the game menu: nothing should hide it. */
		z-index: 65;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}
	/* A red glow pulsing in from the screen edges, once a second (it appears on a tick). */
	.edge {
		position: absolute;
		inset: 0;
		box-shadow:
			inset 0 0 70px 10px rgba(255, 40, 20, 0.55),
			inset 0 0 220px 40px rgba(200, 20, 10, 0.5);
		animation: edge 1s ease-out infinite;
	}
	.count {
		position: relative;
		font-family: var(--px);
		font-weight: 700;
		font-size: 220px;
		line-height: 0.82;
		color: #ffd45a;
		text-shadow:
			6px 0 0 #1a0c05,
			-6px 0 0 #1a0c05,
			0 6px 0 #1a0c05,
			0 -6px 0 #1a0c05,
			6px 6px 0 #1a0c05,
			-6px 6px 0 #1a0c05,
			6px -6px 0 #1a0c05,
			-6px -6px 0 #1a0c05,
			0 16px 0 #1a0c05,
			0 0 60px rgba(255, 70, 30, 0.8);
		/* Each second's number slams in. */
		animation: count 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}
	.count.last {
		color: #ff6a4a;
	}
	.hurry {
		--rib: var(--art-ribbon-crimson);
		position: relative;
		margin-top: 18px;
		font-size: 24px;
		padding-left: calc(var(--s) * 6);
		padding-right: calc(var(--s) * 6);
		animation: pop-in 0.3s ease-out;
	}
	@keyframes edge {
		to {
			opacity: 0.2;
		}
	}
	@keyframes count {
		from {
			opacity: 0;
			transform: scale(1.8);
		}
	}
	/* Reduced motion: the same warning, standing still. */
	.calm .edge,
	.calm .count,
	.calm .hurry {
		animation: none;
	}
	@media (max-width: 700px) {
		.count {
			font-size: 150px;
		}
		.hurry {
			font-size: 18px;
		}
	}
</style>
