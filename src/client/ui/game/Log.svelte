<script lang="ts">
	import { tick } from 'svelte';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { eventParts, playerColor } from '../helpers';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	const icons = getIcons().urls;
	const lines = $derived(
		view.log
			.map((e) => ({ seq: e.seq, chat: e.type === 'chat', parts: eventParts(e, view) }))
			.filter((l) => l.parts)
			.slice(-40)
	);
	let box: HTMLDivElement | undefined = $state();
	let text = $state('');

	$effect(() => {
		void lines.length;
		tick().then(() => box && (box.scrollTop = box.scrollHeight));
	});

	function send() {
		const t = text.trim();
		if (!t) return;
		client.send({ t: 'chat', text: t });
		text = '';
	}
</script>

<div class="log panel" class:closed={!ui.logOpen}>
	<button class="head title" onclick={() => (ui.logOpen = !ui.logOpen)}>
		Chronicle <span>{ui.logOpen ? '▾' : '▸'}</span>
	</button>
	{#if ui.logOpen}
		<div class="lines" bind:this={box}>
			{#each lines as l (l.seq)}
				<div class="line" class:chat={l.chat}>
					{#each l.parts! as p}
						{#if p.res}
							<span class="res">{#if (p.count ?? 1) > 1}<b>{p.count}</b>{/if}<img src={icons[p.res]} alt={p.res} /></span>
						{:else if p.player !== undefined}
							<b style="color:{playerColor(view, p.player)}">{p.text}</b>
						{:else}
							<span>{p.text}</span>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
		<form class="chat" onsubmit={(e) => { e.preventDefault(); send(); }}>
			<input class="input" bind:value={text} maxlength="200" placeholder="Say something…" />
		</form>
	{/if}
</div>

<style>
	.log {
		position: absolute;
		left: 14px;
		bottom: 14px;
		width: 300px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.head {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		padding: 7px 12px;
		font-size: 15px;
		color: var(--gold);
		display: flex;
		justify-content: space-between;
		background: rgba(0, 0, 0, 0.2);
	}
	.lines {
		height: 190px;
		overflow-y: auto;
		padding: 6px 12px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 13.5px;
		line-height: 1.35;
		scrollbar-width: thin;
		scrollbar-color: #7a4a2c transparent;
	}
	.line {
		animation: fade-in 0.4s;
		color: #f0dcc0;
	}
	.line b {
		font-weight: 800;
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
	}
	.line.chat {
		color: #fff;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 5px;
		padding: 2px 5px;
	}
	.res {
		display: inline-flex;
		align-items: center;
		vertical-align: middle;
	}
	.res b {
		font-size: 12px;
		margin-right: -2px;
	}
	.res img {
		width: 20px;
		height: 20px;
		margin: -3px 0;
	}
	.chat {
		padding: 6px 8px 8px;
	}
	.chat .input {
		width: 100%;
		box-sizing: border-box;
		font-size: 14px;
		padding: 5px 9px;
		font-family: inherit;
	}
	@media (max-width: 900px) {
		.log {
			top: 112px;
			bottom: auto;
			left: 8px;
			width: 240px;
			z-index: 5;
		}
		.closed {
			width: auto;
		}
		.lines {
			height: 110px;
			font-size: 12px;
		}
	}
</style>
