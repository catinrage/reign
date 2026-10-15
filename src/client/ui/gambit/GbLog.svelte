<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { ui } from '../game/ui.svelte';
	import { PIXEL } from '../pixel';
	import { gbPlay } from './play.svelte';
	import { gbColor, gbEventLines, type GbLogPart } from './text';

	/** The chronicle: what each round did, a line at a time, and the table's chat. */
	const v = $derived(gbPlay.view!);
	const lines = $derived.by(() => {
		const out: { key: string; chat: boolean; head: boolean; parts: GbLogPart[] }[] = [];
		for (const e of v.log) {
			if (e.type === 'roundPlayed') out.push({ key: `h${e.seq}`, chat: false, head: true, parts: [{ text: t('Round {round}', { round: e.play.round }) }] });
			gbEventLines(e, v).forEach((parts, k) => out.push({ key: `e${e.seq}.${k}`, chat: e.type === 'chat', head: false, parts }));
		}
		return out.slice(-50);
	});
	let box: HTMLDivElement | undefined = $state();
	let text = $state('');

	$effect(() => {
		void lines.length;
		void ui.logOpen;
		tick().then(() => box && (box.scrollTop = box.scrollHeight));
	});

	function send() {
		const said = text.trim();
		if (!said) return;
		client.send({ t: 'chat', text: said });
		text = '';
	}
</script>

<div class="log panel" class:closed={!ui.logOpen}>
	<button class="head" onclick={() => (ui.logOpen = !ui.logOpen)} aria-expanded={ui.logOpen}>
		<img class="icon-px" src={PIXEL.book} alt="" />
		<span class="title">{t('Chronicle')}</span>
		<span class="chev" class:open={ui.logOpen}>▸</span>
	</button>
	{#if ui.logOpen}
		<div class="lines well" bind:this={box}>
			{#each lines as l (l.key)}
				<div class="line" class:chat={l.chat} class:head={l.head}>
					{#if l.chat}<img class="icon-px bubble" src={PIXEL.chat} alt="" />{/if}
					{#each l.parts as part, k (k)}
						{#if part.player !== undefined}
							<b class="who" style="--c:{gbColor(v, part.player)}">{part.text}</b>
						{:else}
							<span>{part.text}</span>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
		{#if !client.spectating && !client.replaying}
			<form
				class="chat"
				onsubmit={(e) => {
					e.preventDefault();
					send();
				}}
			>
				<input class="input" bind:value={text} maxlength="200" placeholder={t('Say something…')} />
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
		text-shadow:
			1px 0 0 #1a0c05,
			-1px 0 0 #1a0c05,
			0 1px 0 #1a0c05,
			0 -1px 0 #1a0c05;
	}
	.line.head {
		margin-top: 4px;
		font-family: var(--px);
		font-weight: 700;
		color: var(--gold);
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
			max-width: calc(100vw / var(--ui-zoom) - 70px);
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
