<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';

	/** In place of a hand: whose game this is, that no hand is shown, and the way out. */
	const others = $derived(Math.max(0, (client.lobby?.spectators ?? 1) - 1));
</script>

<div class="watch">
	<div class="bar parch">
		<div class="ribbon tag">Spectating</div>
		<p>
			You're watching game <b>{client.code}</b>. Every hand stays hidden, so the game stays fair.
			{#if others}<span class="more">{others} other{others === 1 ? '' : 's'} watching too.</span
				>{/if}
		</p>
		<button class="btn small red" onclick={() => client.leave()}
			><img src={PIXEL.door} alt="" />Stop watching</button
		>
	</div>
</div>

<style>
	.watch {
		position: absolute;
		bottom: 12px;
		left: 326px;
		right: 326px;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.bar {
		position: relative;
		display: flex;
		align-items: center;
		gap: 14px;
		max-width: 620px;
		padding: 14px 10px 6px;
		font-size: 14px;
		font-weight: 700;
	}
	.tag {
		--rib: var(--art-ribbon-crimson);
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -70%);
		font-size: 16px;
		min-width: 0;
		height: calc(var(--s) * 12);
	}
	p {
		margin: 0;
		line-height: 1.35;
	}
	.more {
		display: block;
		color: #8a6236;
	}
	.btn {
		flex: none;
	}
	@media (max-width: 900px) {
		.watch {
			left: 8px;
			right: 8px;
			bottom: 8px;
		}
		.bar {
			font-size: 12px;
			gap: 8px;
		}
	}
</style>
