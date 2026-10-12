<script lang="ts">
	import { missionById } from '../../../shared/campaign/missions';
	import { BAN_TEXT, campaignRound, goalMet } from '../../../shared/rules/campaign';
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import { ui } from '../game/ui.svelte';
	import { goalText } from './text';

	/**
	 * A campaign mission in the corner beside the turn counter: the rounds left when there's a limit,
	 * and in its tooltip what the mission forbids and how its stars stand. A click opens the
	 * mission's page again.
	 */
	const view = $derived(client.view!);
	const c = $derived(view.campaign);
	const mission = $derived(c ? missionById(c.mission) : undefined);
	const round = $derived(campaignRound(view));
	const left = $derived(c?.roundLimit ? Math.max(0, c.roundLimit - round + 1) : null);
	const lines = $derived.by(() => {
		if (!c || !mission) return '';
		const out = c.bans.map((b) => `🔒 ${t(BAN_TEXT[b].text)}`);
		if (c.roundLimit) out.push(t('Win by the end of round {n}, or lose', { n: c.roundLimit }));
		// A round goal is still in reach until that round is over; the rest show how they stand now.
		for (const g of c.goals) out.push(`${goalMet(view, c.hero, g, round) ? '★' : '☆'} ${goalText(g)}`);
		return out.join('\n');
	});
</script>

{#if c && mission && view.phase !== 'setup'}
	<button
		class="mission-chip plaque"
		class:urgent={left !== null && left <= 3}
		title={lines}
		data-tip-head={t('Mission: {mission}', { mission: t(mission.title) })}
		data-tip-note={t('Click to read the mission again.')}
		onclick={() => {
			sfx.open();
			ui.brief = true;
		}}
	>
		<img class="icon-px" src={left !== null ? PIXEL.hourglass : PIXEL.crown} alt="" />
		{#if left !== null}
			<span class="n">{t('{n, plural, one {# round left} other {# rounds left}}', { n: left })}</span>
		{:else}
			<span class="n">{t('Mission')}</span>
		{/if}
	</button>
{/if}

<style>
	.mission-chip {
		margin: 0;
		font: inherit;
		color: inherit;
		pointer-events: auto;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: calc(var(--s) * 16);
		box-sizing: border-box;
		padding: 0 calc(var(--s) * 3) 0 calc(var(--s) * 2);
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
		white-space: nowrap;
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.mission-chip img {
		width: 22px;
		height: 22px;
	}
	.mission-chip.urgent {
		box-shadow: inset 0 -3px 0 #e04a30;
	}
	.mission-chip.urgent .n {
		color: #ffb09a;
	}
</style>
