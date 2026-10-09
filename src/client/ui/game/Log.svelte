<script lang="ts">
	import { tick } from 'svelte';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { eventParts, playerColor } from '../helpers';
	import { PIXEL } from '../pixel';
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
		void ui.logOpen;
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
	<button class="head" onclick={() => (ui.logOpen = !ui.logOpen)} aria-expanded={ui.logOpen}>
		<img class="icon-px" src={PIXEL.book} alt="" />
		<span class="title">Chronicle</span>
		<span class="chev" class:open={ui.logOpen}>▸</span>
	</button>
	{#if ui.logOpen}
		<div class="lines well" bind:this={box}>
			{#each lines as l (l.seq)}
				<div class="line" class:chat={l.chat}>
					{#if l.chat}<img class="icon-px bubble" src={PIXEL.chat} alt="" />{/if}
					{#each l.parts! as p, k (k)}
						{#if p.res}
							<span class="res"
								>{#if (p.count ?? 1) > 1}<b>{p.count}</b>{/if}<img
									src={icons[p.res]}
									alt={p.res}
								/></span
							>
						{:else if p.player !== undefined}
							<b class="who" style="--c:{playerColor(view, p.player)}">{p.text}</b>
						{:else}
							<span>{p.text}</span>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
		{#if !client.spectating}
			<form
				class="chat"
				onsubmit={(e) => {
					e.preventDefault();
					send();
				}}
			>
				<input class="input" bind:value={text} maxlength="200" placeholder="Say something…" />
			</form>
		{/if}
	{/if}
</div>

<style>
	.log {
		position: absolute;
		left: 12px;
		bottom: 12px;
		width: 310px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 2px 4px 4px;
	}
	.closed {
		width: auto;
	}
	.head {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 4px;
	}
	.head img {
		width: 22px;
		height: 22px;
	}
	.head .title {
		flex: 1;
		font-size: 16px;
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.7);
	}
	.chev {
		color: var(--muted);
		transition: transform 0.2s;
		font-size: 14px;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.lines {
		height: 180px;
		overflow-y: auto;
		padding: 2px 6px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 13.5px;
		line-height: 1.35;
		scrollbar-width: thin;
		scrollbar-color: #7a4a2c transparent;
		pointer-events: auto;
	}
	.line {
		animation: fade-in 0.4s;
		color: #ead6b8;
	}
	.who {
		font-weight: 800;
		color: var(--c);
		/* Dark outline keeps light colors (white, yellow) readable. */
		text-shadow:
			1px 0 0 #1a0c05,
			-1px 0 0 #1a0c05,
			0 1px 0 #1a0c05,
			0 -1px 0 #1a0c05;
	}
	.line.chat {
		color: #fff;
		background: rgba(255, 236, 200, 0.07);
		padding: 2px 5px;
	}
	.bubble {
		width: 14px;
		height: 14px;
		vertical-align: -2px;
		margin-right: 4px;
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
	.chat .input {
		width: 100%;
		box-sizing: border-box;
		font-family: var(--body);
		font-weight: 700;
		font-size: 14px;
		min-height: 0;
		padding: 2px 6px;
	}
	@media (max-width: 900px) {
		.log {
			top: calc(104px + var(--clock-h, 0px));
			bottom: auto;
			left: 62px;
			width: 250px;
			max-width: calc(100vw - 70px);
			z-index: 5;
		}
		.log.closed {
			width: auto;
		}
		.lines {
			height: 110px;
			font-size: 12px;
		}
	}
</style>
