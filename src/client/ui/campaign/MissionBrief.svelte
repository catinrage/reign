<script lang="ts">
	import { MISSIONS, NARRATOR, missionById } from '../../../shared/campaign/missions';
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';
	import Portrait from '../extended/Portrait.svelte';
	import { PIXEL } from '../pixel';
	import { settings } from '../settings.svelte';
	import { sfx } from '../sound';
	import { ui } from '../game/ui.svelte';
	import Stars from './Stars.svelte';
	import { actNumber, goalText, missionRules, rivalName } from './text';

	/**
	 * A campaign mission's opening page, over the table as the game is dealt: the story so far, the
	 * rules and the goals for the stars. The table waits (as it does with the menu open) until the
	 * player begins.
	 */
	const view = $derived(client.view!);
	const mission = $derived(view.campaign ? missionById(view.campaign.mission) : undefined);
	let lastSeq = -1;

	// A mission dealt (the first time, or again): open on it. A log that starts over is a new game.
	$effect(() => {
		const live = client.latest;
		if (!live?.campaign || client.replaying || client.spectating) return;
		const newest = live.log.length ? live.log[live.log.length - 1].seq : 0;
		const fresh = lastSeq < 0 || newest < lastSeq;
		lastSeq = newest;
		if (fresh && live.phase === 'setup' && live.setupIndex === 0) ui.brief = true;
	});
	$effect(() => () => (ui.brief = false));

	function begin() {
		sfx.close();
		ui.brief = false;
	}
	const zoom = $derived(settings.menuSize / settings.hudSize);
</script>

{#if ui.brief && mission}
	<div class="modal-backdrop brief" style:zoom={zoom === 1 ? undefined : zoom} style:--ui-zoom={settings.menuSize}>
		<div class="sheet">
			<div class="ribbon">{t(mission.title)}</div>
			<div class="board panel">
				<div class="page parch">
					<span class="label"
						>{t('Act {act} · Mission {n} of {total}', { act: actNumber(mission.act), n: MISSIONS.indexOf(mission) + 1, total: MISSIONS.length })}
						· {t(mission.place)}</span
					>
					<div class="story">
						<Portrait id={NARRATOR} size={64} />
						<div class="words">
							<b>{rivalName(NARRATOR)}</b>
							{#each mission.intro as p, i (i)}<p>{t(p)}</p>{/each}
						</div>
					</div>
					<div class="cols">
						<div>
							<h3>{t('Rules')}</h3>
							<ul>
								{#each missionRules(mission) as rule, i (i)}
									<li class:hard={rule.hard}><img class="icon-px" src={rule.icon} alt="" />{rule.text}</li>
								{/each}
							</ul>
						</div>
						<div>
							<h3>{t('Stars')}</h3>
							<ul>
								<li><Stars n={1} of={1} size={18} />{t('Win the mission')}</li>
								{#each mission.goals as g, i (i)}<li><Stars n={1} of={1} size={18} />{goalText(g)}</li>{/each}
							</ul>
						</div>
					</div>
				</div>
				<div class="foot">
					<button class="btn big green shine" onclick={begin}><img src={PIXEL.sword} alt="" />{t('Begin')}</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.brief {
		z-index: 56;
		pointer-events: auto;
	}
	.sheet {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: min(760px, calc(100vw / var(--ui-zoom) - 20px));
		max-height: calc(100vh / var(--ui-zoom) - 20px);
		animation: pop-in 0.45s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.ribbon {
		position: relative;
		z-index: 2;
		flex: none;
		font-size: 24px;
		margin-bottom: calc(var(--s) * -8);
		padding-left: calc(var(--s) * 7);
		padding-right: calc(var(--s) * 7);
	}
	.board {
		width: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding: calc(var(--s) * 9) 12px 12px;
		box-sizing: border-box;
	}
	.page {
		min-height: 0;
		overflow-y: auto;
		padding: 10px 18px 12px;
		color: var(--ink);
		font-size: 15px;
		line-height: 1.45;
		scrollbar-width: thin;
		scrollbar-color: #8a5a32 transparent;
	}
	.story {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-top: 6px;
	}
	.words {
		flex: 1;
		min-width: 0;
	}
	.words b {
		font-family: var(--px);
		font-size: 14px;
		color: #8a4a1a;
	}
	.words p {
		margin: 2px 0 7px;
		text-wrap: pretty;
	}
	.cols {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 4px 20px;
		border-top: 3px solid rgba(138, 98, 54, 0.35);
		margin-top: 4px;
	}
	h3 {
		margin: 8px 0 4px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 17px;
		color: #6b3a14;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 14px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	li img {
		width: 18px;
		height: 18px;
		flex: none;
	}
	li.hard {
		color: #8a2a14;
		font-weight: 700;
	}
	.foot {
		display: flex;
		justify-content: center;
		margin-top: 12px;
	}
	.foot .btn img {
		height: calc(var(--s) * 8);
		margin-right: 8px;
	}
	@media (max-width: 700px) {
		.cols {
			grid-template-columns: 1fr;
		}
		.page {
			padding: 8px 10px;
		}
	}
</style>
