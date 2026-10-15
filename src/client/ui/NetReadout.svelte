<script lang="ts">
	import { t } from '../i18n/index.svelte';
	import { OFFLINE } from '../offline/flag';
	import { client } from '../state/client.svelte';
	import { netStats } from '../state/netStats.svelte';
	import { sceneRef } from './sceneRef';
	import { settings } from './settings.svelte';

	/**
	 * Frames per second and the ping to the server in a small plate, for players who turn it on
	 * in Settings. The menus have the top right corner free; in a game it hangs under the
	 * players' plaques. Phones get one short line, in the gap between the plaques and the prompt.
	 * It sits outside the zoomed interface layer, so it keeps its size, lets clicks through, and
	 * comes before that layer, so a panel that needs the spot is drawn over it.
	 */

	$effect(() => {
		if (!settings.showStats) return;
		// The frames the table draws, which a frame rate cap holds below the screen's own rate.
		netStats.start(() => sceneRef.current?.stage.drawn);
		return () => netStats.stop();
	});

	let top = $state(10);
	let right = $state(12);
	let narrow = $state(false);
	/** Follow the plaques as players join, shrink or the window changes size. */
	function place() {
		narrow = innerWidth <= 900;
		const r = document.querySelector('[data-net-anchor=players]')?.getBoundingClientRect();
		if (r && r.height > 0) {
			top = r.bottom + (narrow ? 1 : 6);
			right = Math.max(4, innerWidth - r.right);
		} else {
			top = narrow ? 4 : 10;
			right = narrow ? 6 : 12;
		}
	}
	$effect(() => {
		// Every refresh of the numbers, so the plate keeps up with the layout without a watcher.
		void netStats.fps;
		if (settings.showStats) place();
	});

	const online = $derived(client.status === 'online');
	const ms = (v: number) => t('{n} ms', { n: Math.round(v) });
	const fpsTone = (v: number) => (v >= 50 ? 'good' : v >= 30 ? 'fair' : 'bad');
	const pingTone = (v: number) => (v <= 80 ? 'good' : v <= 150 ? 'fair' : 'bad');
</script>

<svelte:window onresize={() => settings.showStats && place()} />

{#if settings.showStats}
	<div class="net" class:narrow style:top="{top}px" style:right="{right}px" aria-hidden="true">
		<div class="line">
			<span class="cell"
				><span class="label">{t('FPS')}</span><b
					class={netStats.fps === null ? '' : fpsTone(netStats.fps)}>{netStats.fps ?? '–'}</b
				></span
			>
			{#if !OFFLINE}
				<span class="cell"
					><span class="label">{t('Ping')}</span><b
						class={online && netStats.ping !== null ? pingTone(netStats.ping) : ''}
						>{online && netStats.ping !== null ? ms(netStats.ping) : '–'}</b
					></span
				>
			{/if}
		</div>
		{#if !OFFLINE}
			<div class="line small">
				<span class="cell jitter"
					><span class="label">{t('Jitter')}</span><b
						>{online && netStats.jitter !== null ? ms(netStats.jitter) : '–'}</b
					></span
				>
				<span class="cell"
					><span class="label">{t('Loss')}</span><b class:bad={!!netStats.loss}
						>{netStats.loss === null ? '–' : `${Math.round(netStats.loss * 100)}%`}</b
					></span
				>
			</div>
		{/if}
	</div>
{/if}

<style>
	.net {
		position: fixed;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		padding: 3px 8px 4px;
		border-radius: 3px;
		background: rgba(20, 10, 4, 0.72);
		box-shadow:
			0 0 0 2px rgba(20, 9, 4, 0.85),
			inset 0 1px 0 rgba(255, 224, 138, 0.18);
		font-family: var(--px);
		font-size: 13px;
		line-height: 1.25;
		color: var(--text);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8);
		white-space: nowrap;
		pointer-events: none;
		user-select: none;
	}
	.line {
		display: flex;
		gap: 12px;
	}
	.line.small {
		font-size: 11px;
		opacity: 0.85;
	}
	.cell {
		display: flex;
		align-items: baseline;
		gap: 5px;
	}
	.label {
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	b {
		min-width: 2ch;
		text-align: right;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	/* Phones: one line, without the jitter. */
	.net.narrow {
		flex-direction: row;
		gap: 10px;
		padding: 0 5px;
		font-size: 10px;
		line-height: 13px;
	}
	.narrow .line {
		gap: 10px;
	}
	.narrow .line.small {
		font-size: inherit;
		opacity: 1;
	}
	.narrow .jitter {
		display: none;
	}
	.good {
		color: #8fe07a;
	}
	.fair {
		color: var(--gold);
	}
	.bad {
		color: #ff7a5c;
	}
</style>
