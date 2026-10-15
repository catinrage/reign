<script lang="ts">
	import { OMEN_INFO } from '../../../shared/conquest/omens';
	import { t } from '../../i18n/index.svelte';
	import { sfx } from '../sound';
	import { OMEN_TONE_STYLE, omenName, omenText, omenTone } from './lore';
	import { cqPlay } from './play.svelte';

	/**
	 * A new round's omen turns over in the middle of the table for a few moments, as Settlement's
	 * event cards do; the omen chip beside the round brings it back.
	 */
	const v = $derived(cqPlay.view!);
	const omen = $derived(v.omens?.current ?? null);
	const style = $derived(omen ? OMEN_TONE_STYLE[OMEN_INFO[omen].tone] : null);

	/** The newest omen drawn, as the board has shown it: it opens the card by itself once. */
	let seen = -1;
	$effect(() => {
		let newest = -1;
		for (let i = v.log.length - 1; i >= 0; i--)
			if (v.log[i].type === 'omen') {
				newest = v.log[i].seq;
				break;
			}
		if (seen < 0) {
			// Joining mid-game: the current omen is already known, no card flies in.
			seen = newest;
			return;
		}
		if (newest > seen) {
			seen = newest;
			sfx.open();
			cqPlay.omenOpen = true;
			const timer = setTimeout(() => (cqPlay.omenOpen = false), 4200);
			return () => clearTimeout(timer);
		}
	});
</script>

{#if cqPlay.omenOpen && omen && style}
	<div class="omen-wrap">
		<button class="omen panel" style="--tone:{style.color}" onclick={() => (cqPlay.omenOpen = false)} title={t('Close')}>
			<span class="tone"><img class="icon-px" src={style.icon} alt="" />{omenTone(omen)}</span>
			<span class="round">{t('Round {round}', { round: v.round })}</span>
			<span class="name">{omenName(omen)}</span>
			<span class="text">{omenText(v)}</span>
		</button>
	</div>
{/if}

<style>
	.omen-wrap {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
		z-index: 30;
	}
	.omen {
		pointer-events: auto;
		font: inherit;
		cursor: pointer;
		width: min(340px, calc(100vw / var(--ui-zoom) - 40px));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 18px 18px 16px;
		border: 0;
		box-shadow:
			0 0 0 3px var(--tone),
			0 18px 50px rgba(0, 0, 0, 0.6);
		animation: omen-flip 0.6s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	@keyframes omen-flip {
		from {
			transform: perspective(600px) rotateY(90deg) scale(0.8);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}
	.tone {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--px);
		font-size: 13px;
		color: var(--tone);
		text-shadow: var(--outline-dark);
		text-transform: uppercase;
		letter-spacing: 1px;
	}
	.tone img {
		width: 20px;
		height: 20px;
	}
	.round {
		font-size: 12px;
		color: var(--muted);
	}
	.name {
		font-family: var(--px);
		font-size: 26px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.text {
		font-size: 14px;
		line-height: 1.35;
		text-align: center;
		color: #e2cba8;
	}
</style>
