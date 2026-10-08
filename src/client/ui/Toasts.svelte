<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { client } from '../state/client.svelte';
</script>

<div class="toasts">
	{#each client.toasts as t (t.id)}
		<div class="toast {t.kind}" animate:flip={{ duration: 200 }} in:fly={{ y: -16, duration: 220 }} out:fly={{ y: -10, duration: 180 }}>
			{t.text}
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		top: 76px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		z-index: 60;
		pointer-events: none;
	}
	.toast {
		font-family: var(--px);
		font-size: 17px;
		padding: 8px 16px;
		border-radius: 8px;
		color: #fff6e2;
		background: rgba(40, 22, 12, 0.92);
		border: 2px solid #f2c14e;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
	}
	.toast.error {
		border-color: #ff6a55;
		background: rgba(70, 18, 10, 0.94);
	}
	.toast.good {
		border-color: #8be06e;
	}
</style>
