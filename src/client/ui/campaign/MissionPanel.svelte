<script lang="ts">
	import { MISSIONS, missionById } from '../../../shared/campaign/missions';
	import { campaignRound, goalMet } from '../../../shared/rules/campaign';
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import { ui } from '../game/ui.svelte';
	import Stars from './Stars.svelte';
	import { actNumber, goalText, missionRules } from './text';

	/**
	 * The mission being played, in the game menu: what each star asks and how it stands right now,
	 * the round, and the mission's rules. A button opens the mission's story page again (not while
	 * the table is paused for everyone, whose curtain would cover it).
	 */
	let { story: storyButton = true }: { story?: boolean } = $props();
	const view = $derived(client.view!);
	const c = $derived(view.campaign);
	const mission = $derived(c ? missionById(c.mission) : undefined);
	const round = $derived(campaignRound(view));
	const started = $derived(view.phase !== 'setup' && view.phase !== 'draft');
	const goals = $derived(
		c ? c.goals.map((g) => ({ text: goalText(g), met: goalMet(view, c.hero, g, round) })) : []
	);

	function story() {
		sfx.open();
		ui.menu = false;
		ui.brief = true;
	}
</script>

{#if c && mission}
	<section class="mission-panel parch">
		<span class="label"
			>{t('Act {act} · Mission {n} of {total}', {
				act: actNumber(mission.act),
				n: MISSIONS.indexOf(mission) + 1,
				total: MISSIONS.length
			})}</span
		>
		<h2>{t(mission.title)}</h2>
		<p class="where">
			<img class="icon-px" src={PIXEL.anchor} alt="" />{t(mission.place)}
			{#if started}
				<span class="round"
					>· {c.roundLimit
						? t('Round {n} of {limit}', { n: round, limit: c.roundLimit })
						: t('Round {round}', { round })}</span
				>
			{/if}
		</p>

		<h3>{t('Stars')}</h3>
		<ul>
			<li><Stars n={0} of={1} size={18} /><span>{t('Win the mission')}</span></li>
			{#each goals as g, i (i)}
				<li class:met={g.met}>
					<Stars n={g.met ? 1 : 0} of={1} size={18} /><span>{g.text}</span>
					<em>{g.met ? t('On track') : t('Not yet')}</em>
				</li>
			{/each}
		</ul>
		<p class="hint">{t('Goals only count if you win the mission.')}</p>

		<h3>{t('Rules')}</h3>
		<ul>
			{#each missionRules(mission) as rule, i (i)}
				<li class:hard={rule.hard}>
					<img class="icon-px" src={rule.icon} alt="" /><span>{rule.text}</span>
				</li>
			{/each}
		</ul>

		{#if storyButton}
			<button class="btn small wood story" onclick={story}
				><img src={PIXEL.book} alt="" />{t('Read the story again')}</button
			>
		{/if}
	</section>
{/if}

<style>
	.mission-panel {
		min-height: 0;
		overflow-y: auto;
		padding: 10px 14px 12px;
		color: var(--ink);
		font-size: 14px;
		line-height: 1.4;
		scrollbar-width: thin;
		scrollbar-color: #8a5a32 transparent;
	}
	.label {
		font-family: var(--px);
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #8a6236;
	}
	h2 {
		margin: 2px 0 0;
		font-family: var(--px);
		font-size: 20px;
		color: #4a2410;
	}
	.where {
		margin: 2px 0 4px;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		color: #6b4a2a;
		font-weight: 700;
	}
	.where img {
		width: 16px;
		height: 16px;
	}
	.round {
		font-weight: 700;
	}
	h3 {
		margin: 8px 0 4px;
		padding-top: 6px;
		border-top: 3px solid rgba(138, 98, 54, 0.35);
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		color: #6b3a14;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	li span {
		flex: 1;
		min-width: 0;
	}
	li img {
		width: 18px;
		height: 18px;
		flex: none;
	}
	li em {
		flex: none;
		font-style: normal;
		font-size: 12px;
		font-weight: 700;
		color: #8a6236;
	}
	li.met em {
		color: #3d7a1e;
	}
	li.hard {
		color: #8a2a14;
		font-weight: 700;
	}
	.hint {
		margin: 4px 0 0;
		font-size: 12px;
		font-style: italic;
		color: #8a6236;
	}
	.story {
		margin-top: 12px;
	}
	.story img {
		height: calc(var(--s) * 6);
		margin-right: 6px;
	}
</style>
