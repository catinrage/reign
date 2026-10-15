<script lang="ts">
	import { OMEN_INFO } from '../../../shared/conquest/omens';
	import { t } from '../../i18n/index.svelte';
	import { sfx } from '../sound';
	import { OMEN_TONE_STYLE, omenName, omenText, omenTone } from './lore';
	import { cqPlay } from './play.svelte';

	/** This round's omen beside the round: its name, what it does in the tooltip, its card on a click. */
	const v = $derived(cqPlay.view);
	const omen = $derived(v?.omens?.current ?? null);
	const style = $derived(omen ? OMEN_TONE_STYLE[OMEN_INFO[omen].tone] : null);
</script>

{#if v && omen && style && v.phase === 'play'}
	<button
		class="omen-chip plaque"
		style="--tone:{style.color}"
		title={omenText(v)}
		data-tip-head={`${omenName(omen)} · ${omenTone(omen)}`}
		data-tip-note={t('This round’s omen. Click to see its card.')}
		aria-label={t('Omen: {omen}', { omen: omenName(omen) })}
		onclick={() => {
			sfx.open();
			cqPlay.omenOpen = !cqPlay.omenOpen;
		}}
	>
		<img class="icon-px" src={style.icon} alt="" />
		<span class="n">{omenName(omen)}</span>
	</button>
{/if}

<style>
	.omen-chip {
		margin: 0;
		font: inherit;
		pointer-events: auto;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: calc(var(--s) * 16);
		box-sizing: border-box;
		padding: 0 calc(var(--s) * 3) 0 calc(var(--s) * 2);
		font-family: var(--px);
		font-size: 14px;
		color: var(--tone);
		text-shadow: var(--outline-dark);
		white-space: nowrap;
		box-shadow: inset 0 -3px 0 var(--tone);
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.omen-chip img {
		width: 20px;
		height: 20px;
	}
	@media (max-width: 900px) {
		.n {
			display: none;
		}
	}
</style>
