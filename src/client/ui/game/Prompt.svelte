<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { myTurn, playerColor, promptText } from '../helpers';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	const text = $derived(
		ui.build && view.step === 'main'
			? `Click a glowing spot to place your ${ui.build}`
			: promptText(view)
	);
	const mine = $derived(myTurn(view));
</script>

<div class="wrap">
{#key text}
	<div class="prompt" class:mine style="--c:{playerColor(view, view.current)}">
		<span class="chip"></span>
		<span class="title">{text}</span>
		{#if ui.build}
			<button class="btn small wood" onclick={() => (ui.build = null)}>Cancel</button>
		{/if}
	</div>
{/key}
</div>

<style>
	.wrap {
		position: absolute;
		top: 14px;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.prompt {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 18px;
		border-radius: 999px;
		background: rgba(36, 20, 11, 0.86);
		border: 3px solid #1a0d06;
		box-shadow:
			inset 0 2px 0 rgba(255, 220, 170, 0.18),
			0 8px 22px rgba(0, 0, 0, 0.4);
		font-size: 19px;
		color: #fff1d8;
		white-space: nowrap;
		max-width: calc(100vw - 32px);
		animation: pop-in 0.3s ease-out;
		pointer-events: auto;
	}
	.prompt.mine {
		border-color: var(--gold);
		animation:
			pop-in 0.3s ease-out,
			glow 1.8s ease-in-out infinite 0.3s;
	}
	.chip {
		width: 14px;
		height: 14px;
		border-radius: 4px;
		background: var(--c);
		border: 2px solid rgba(0, 0, 0, 0.5);
		flex: none;
	}
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	@media (max-width: 700px) {
		.wrap {
			top: 62px;
		}
		.prompt {
			font-size: 15px;
			padding: 7px 14px;
		}
	}
</style>
