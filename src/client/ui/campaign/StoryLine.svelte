<script lang="ts">
	import { NARRATOR } from '../../../shared/campaign/missions';
	import type { CharacterId } from '../../../shared/rules/characters';
	import type { GameEvent } from '../../../shared/rules/types';
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';
	import Portrait from '../extended/Portrait.svelte';
	import { sfx } from '../sound';
	import { ui } from '../game/ui.svelte';
	import { rivalName } from './text';

	/**
	 * The campaign's story as the game goes: what a rival or the narrator says pops up under the turn
	 * banner, their face beside it, one line at a time. A click puts it away early. The chronicle
	 * keeps every line too.
	 */
	type Line = { id: number; who: CharacterId; name: string; text: string };
	const view = $derived(client.view!);
	let queue = $state<Line[]>([]);
	let last = -1;

	$effect(() => {
		const log = view.log;
		const newest = log.length ? log[log.length - 1].seq : 0;
		// Lines already said before this player arrived (a rejoin) stay in the chronicle only.
		const fresh = last >= 0 && newest >= last ? log.filter((e) => e.seq > last) : [];
		last = newest;
		const lines = fresh.filter((e): e is Extract<GameEvent, { type: 'campaignLine' }> => e.type === 'campaignLine');
		if (!lines.length || client.replaying) return;
		queue = [...queue, ...lines.map((e) => line(e))].slice(-4);
	});

	function line(e: Extract<GameEvent, { type: 'campaignLine' }>): Line {
		const cast = e.speaker === null ? null : (view.campaign?.cast[e.speaker] ?? null);
		const who = cast ?? NARRATOR;
		const name = e.speaker === null || !cast ? rivalName(NARRATOR) : rivalName(cast);
		return { id: e.seq, who, name, text: t(e.line) };
	}

	const current = $derived(ui.brief ? undefined : queue[0]);
	$effect(() => {
		const c = current;
		if (!c) return;
		sfx.open();
		const timer = setTimeout(() => next(c.id), 3500 + c.text.length * 45);
		return () => clearTimeout(timer);
	});
	function next(id: number) {
		queue = queue.filter((l) => l.id !== id);
	}
</script>

{#if current}
	{#key current.id}
		<button class="story-bubble plaque" onclick={() => next(current.id)} title={t('Click to put it away')}>
			<Portrait id={current.who} size={58} tip={false} />
			<span class="words">
				<b>{current.name}</b>
				<span>{current.text}</span>
			</span>
		</button>
	{/key}
{/if}

<style>
	.story-bubble {
		font: inherit;
		text-align: left;
		margin: 0;
		position: absolute;
		bottom: 214px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 6;
		box-sizing: border-box;
		width: min(460px, calc(100vw / var(--ui-zoom) - 640px));
		min-width: min(360px, calc(100vw / var(--ui-zoom) - 24px));
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px 10px 10px;
		cursor: pointer;
		pointer-events: auto;
		filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.45));
		animation: speak 0.35s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	@keyframes speak {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-10px) scale(0.92);
		}
	}
	@keyframes speak-phone {
		from {
			opacity: 0;
			transform: translateY(-10px) scale(0.92);
		}
	}
	.words {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		font-size: 15px;
		line-height: 1.35;
		color: var(--text);
		text-wrap: pretty;
	}
	.words b {
		font-family: var(--px);
		font-size: 13px;
		color: var(--gold);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
	}
	@media (max-width: 900px) {
		.story-bubble {
			bottom: auto;
			top: calc(118px + var(--clock-h, 0px));
			/* Clear of the column of round buttons down the left edge. */
			left: auto;
			right: 8px;
			transform: none;
			width: calc(100vw / var(--ui-zoom) - 62px);
			min-width: 0;
			animation-name: speak-phone;
		}
		.words {
			font-size: 14px;
		}
	}
</style>
