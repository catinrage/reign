<script lang="ts">
	import { NARRATOR, missionById } from '../../../shared/campaign/missions';
	import { missionResult } from '../../../shared/rules/campaign';
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';
	import Portrait from '../extended/Portrait.svelte';
	import Stars from './Stars.svelte';
	import { goalText, rivalName } from './text';

	/** The end of a campaign mission, at the top of the end-of-game window: the stars and the story's next line. */
	const view = $derived(client.view!);
	const mission = $derived(view.campaign ? missionById(view.campaign.mission) : undefined);
	const result = $derived(missionResult(view));
</script>

{#if mission && result}
	<section class="result">
		<div class="stars-line">
			<Stars n={result.stars} size={38} pop />
		</div>
		<ul class="goals">
			<li class:met={result.won}>{t('Win the mission')}</li>
			{#each mission.goals as g, i (i)}
				<li class:met={result.goals[i]}>{goalText(g)}</li>
			{/each}
		</ul>
		<div class="story well">
			<Portrait id={NARRATOR} size={56} />
			<p>
				<b>{rivalName(NARRATOR)}</b>
				{#if result.outOfTime}<span class="why">{t('Out of rounds.')}</span>{/if}
				{t(result.won ? mission.victory : mission.defeat)}
			</p>
		</div>
	</section>
{/if}

<style>
	.result {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
	}
	.stars-line {
		display: flex;
		justify-content: center;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.4));
	}
	.goals {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px 16px;
		font-weight: 700;
		font-size: 14px;
		color: var(--muted);
	}
	.goals li::before {
		content: '✗ ';
		color: #c85a40;
	}
	.goals li.met {
		color: var(--text);
	}
	.goals li.met::before {
		content: '✓ ';
		color: #7ad35a;
	}
	.story {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		width: 100%;
		box-sizing: border-box;
	}
	.story p {
		margin: 0;
		font-size: 15px;
		line-height: 1.4;
		text-wrap: pretty;
	}
	.story b {
		display: block;
		font-family: var(--px);
		font-size: 13px;
		color: var(--gold);
	}
	.why {
		font-weight: 700;
		color: #ff9a7a;
		margin-right: 4px;
	}
</style>
