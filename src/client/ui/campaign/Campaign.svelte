<script lang="ts">
	import { onMount } from 'svelte';
	import { ACTS, MISSIONS, NARRATOR, PROLOGUE, missionById } from '../../../shared/campaign/missions';
	import { CHARACTER_INFO } from '../../../shared/rules/characters';
	import { campaign } from '../../state/campaign.svelte';
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';
	import Portrait from '../extended/Portrait.svelte';
	import { PIXEL } from '../pixel';
	import { site } from '../../platform/site.svelte';
	import { sfx } from '../sound';
	import { playWithHeadStart } from './headStart';
	import Stars from './Stars.svelte';
	import { actNumber, actTitle, goalText, missionRules, rivalName } from './text';

	/**
	 * The solo campaign, as a book like the tutorial: the acts and their missions down the side,
	 * with their stars and locks, and the picked mission's page: its story, rivals, rules and the
	 * goals for its stars.
	 */

	onMount(() => {
		void campaign.load();
	});

	let page: HTMLElement | undefined = $state();
	const pickedId = $derived(campaign.picked && missionById(campaign.picked) ? campaign.picked : campaign.current);
	const mission = $derived(missionById(pickedId)!);
	const index = $derived(MISSIONS.indexOf(mission));
	const open = $derived(campaign.isOpen(mission.id));
	const record = $derived(campaign.progress[mission.id]);
	const before = $derived(MISSIONS[index - 1]);
	const busy = $derived(client.pendingJoin || client.launching || client.status !== 'online');
	const stars = $derived(campaign.stars);

	function pick(id: string) {
		if (id === pickedId) return;
		sfx.open();
		campaign.picked = id;
		page?.scrollTo({ top: 0 });
	}
	function play() {
		if (!open || busy) return;
		campaign.open = false;
		client.playMission(mission.id);
	}
	/** Watching a rewarded ad for a head start (site.rewarded). */
	let watching = $state(false);
	async function playHeadStart() {
		if (!open || busy || watching) return;
		watching = true;
		const id = mission.id;
		if (await playWithHeadStart(id)) campaign.open = false;
		watching = false;
	}
</script>

<div class="campaign">
	<nav class="side">
		<div class="total plaque" title={t('Stars earned in the campaign')}>
			<img class="icon-px" src={PIXEL.star} alt="" />
			<b>{stars.have}</b><span>/ {stars.of}</span>
		</div>
		<div class="acts">
			{#each ACTS as act (act.n)}
				{@const list = MISSIONS.filter((m) => m.act === act.n)}
				<section>
					<h3 class="act">{actTitle(act.n)}</h3>
					{#if list.length}
						<ol>
							{#each list as m (m.id)}
								{@const n = MISSIONS.indexOf(m) + 1}
								{@const locked = !campaign.isOpen(m.id)}
								<li>
									<button
										class="mission"
										class:on={m.id === pickedId}
										class:locked
										aria-current={m.id === pickedId ? 'page' : undefined}
										onclick={() => pick(m.id)}
									>
										<span class="num">{n}</span>
										<span class="name">{t(m.title)}</span>
										{#if locked}
											<img class="icon-px lock" src={PIXEL.lock} alt={t('Locked')} />
										{:else}
											<Stars n={campaign.progress[m.id]?.stars ?? 0} size={14} />
										{/if}
									</button>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="soon">{t('More missions are on their way.')}</p>
					{/if}
				</section>
			{/each}
		</div>
		{#if import.meta.env.DEV}
			<label class="dev"><input type="checkbox" bind:checked={campaign.unlocked} /> {t('Open every mission (dev)')}</label>
		{/if}
	</nav>

	<article class="page parch" bind:this={page}>
		{#key mission.id}
			<div class="leaf">
				{#if index === 0}
					<aside class="prologue">
						<span class="label">{t('Prologue')}</span>
						{#each PROLOGUE as p, i (i)}<p>{t(p)}</p>{/each}
					</aside>
				{/if}
				<header>
					<span class="label">{t('Act {act} · Mission {n} of {total}', { act: actNumber(mission.act), n: index + 1, total: MISSIONS.length })}</span>
					<h2 class="title">{t(mission.title)}</h2>
					<p class="place"><img class="icon-px" src={PIXEL.anchor} alt="" />{t(mission.place)}</p>
				</header>

				<div class="story">
					<Portrait id={NARRATOR} size={72} />
					<div class="words">
						<span class="who">{rivalName(NARRATOR)}</span>
						{#each mission.intro as p, i (i)}<p>{t(p)}</p>{/each}
					</div>
				</div>

				<h3>{t('Rivals')}</h3>
				<ul class="rivals">
					{#each mission.rivals as r (r.character)}
						<li class:boss={r.boss}>
							<Portrait id={r.character} size={64} />
							<span class="rname">
								<b>{t(CHARACTER_INFO[r.character].name)}</b>
								<small>{t(CHARACTER_INFO[r.character].title)}</small>
								{#if r.boss}<span class="tag">{t('Boss')}</span>{/if}
							</span>
						</li>
					{/each}
				</ul>

				<h3>{t('Rules')}</h3>
				<ul class="rows rules">
					{#each missionRules(mission) as rule, i (i)}
						<li class:hard={rule.hard}><img class="icon-px" src={rule.icon} alt="" /><span>{rule.text}</span></li>
					{/each}
				</ul>

				<h3>{t('Stars')}</h3>
				<ul class="rows goals">
					<li><Stars n={record ? 1 : 0} of={1} size={22} /><span>{t('Win the mission')}</span></li>
					{#each mission.goals as g, i (i)}
						<li><Stars n={record && record.stars >= i + 2 ? 1 : 0} of={1} size={22} /><span>{goalText(g)}</span></li>
					{/each}
				</ul>

				<footer>
					{#if open}
						{#if record}
							<span class="best"
								>{t('{n, plural, one {Your best: # star, won in round {round}} other {Your best: # stars, won in round {round}}}', {
									n: record.stars,
									round: record.bestRound
								})}</span
							>
						{:else}
							<span></span>
						{/if}
						<div class="plays">
							{#if site.rewarded}
								<button
									class="btn big"
									onclick={playHeadStart}
									disabled={busy || watching}
									title={t('Watch an ad to start with one of each resource.')}
								>
									<img src={PIXEL.clover} alt="" />{t('Head start')}
								</button>
							{/if}
							<button class="btn big shine" onclick={play} disabled={busy || watching}>
								<img src={PIXEL.sword} alt="" />{record ? t('Play again') : t('Play mission')}
							</button>
						</div>
					{:else}
						<p class="locked-note">
							<img class="icon-px" src={PIXEL.lock} alt="" />{t('Win "{mission}" to open this mission.', { mission: t(before.title) })}
						</p>
					{/if}
				</footer>
			</div>
		{/key}
	</article>
</div>

<style>
	.plays {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.campaign {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: 14px;
		flex: 1 1 0;
		min-height: 0;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
	}
	.total {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 4px 10px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.total img {
		width: 24px;
		height: 24px;
	}
	.total span {
		font-size: 15px;
		opacity: 0.8;
	}
	.acts {
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		padding-right: 8px;
		scrollbar-width: thin;
		scrollbar-color: #8a5a32 transparent;
	}
	.act {
		margin: 8px 0 6px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: var(--gold);
		text-shadow: var(--outline-dark);
	}
	section:first-child .act {
		margin-top: 0;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.mission {
		all: unset;
		box-sizing: border-box;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px 6px 8px;
		cursor: pointer;
		color: var(--muted);
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		border-style: solid;
		border-width: calc(var(--s) * 3);
		border-image: var(--art-well) 3 fill / calc(var(--s) * 3) stretch;
		transition:
			transform 0.12s,
			color 0.12s;
	}
	.mission:hover {
		color: var(--text);
		transform: translateX(3px);
	}
	.mission:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 1px;
	}
	.mission.on {
		color: #3a1d04;
		border-width: calc(var(--s) * 5) calc(var(--s) * 4);
		border-image: var(--art-btn-gold) 5 4 fill / calc(var(--s) * 5) calc(var(--s) * 4) stretch;
		padding-top: 3px;
		padding-bottom: 3px;
		text-shadow: 0 1px 0 rgba(255, 246, 200, 0.55);
		transform: translateX(6px);
	}
	.mission.locked {
		opacity: 0.6;
	}
	.mission.on.locked {
		opacity: 0.85;
	}
	.num {
		min-width: 1.2em;
		opacity: 0.7;
		font-size: 13px;
	}
	.name {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lock {
		width: 16px;
		height: 16px;
		flex: none;
	}
	.soon {
		margin: 0 0 4px;
		padding: 4px 10px;
		font-size: 13px;
		font-weight: 700;
		color: var(--muted);
		font-style: italic;
	}
	.dev {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
		pointer-events: auto;
	}

	.page {
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #8a5a32 transparent;
		padding: 10px 22px 14px;
		color: var(--ink);
		font-size: 15.5px;
		line-height: 1.5;
	}
	.leaf {
		max-width: 780px;
		margin: 0 auto;
		animation: turn 0.3s ease-out;
	}
	@keyframes turn {
		from {
			opacity: 0;
			transform: translateX(14px);
		}
	}
	.prologue {
		margin: 0 0 14px;
		padding: 10px 14px 4px;
		background: rgba(138, 98, 54, 0.12);
		border: 2px dashed rgba(138, 98, 54, 0.4);
		font-style: italic;
		color: var(--ink-soft);
	}
	.prologue p {
		margin: 4px 0 8px;
		text-wrap: pretty;
	}
	header {
		padding-bottom: 8px;
		margin-bottom: 12px;
		border-bottom: 3px solid rgba(138, 98, 54, 0.35);
	}
	h2 {
		margin: 2px 0 2px;
		font-size: 30px;
		color: #6b3a14;
		text-shadow: 0 2px 0 rgba(255, 245, 220, 0.8);
	}
	.place {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-weight: 700;
		color: var(--ink-soft);
	}
	.place img {
		width: 20px;
		height: 20px;
	}
	.story {
		display: flex;
		align-items: flex-start;
		gap: 14px;
	}
	.words {
		flex: 1;
		min-width: 0;
	}
	.who {
		display: block;
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #8a4a1a;
	}
	.words p {
		margin: 2px 0 8px;
		text-wrap: pretty;
	}
	h3 {
		margin: 14px 0 6px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		color: #6b3a14;
		text-shadow: 0 2px 0 rgba(255, 245, 220, 0.8);
	}
	.rivals {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 10px 18px;
	}
	.rivals li {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.rname {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.rname b {
		color: #3a1a08;
		font-size: 16px;
	}
	.rname small {
		color: var(--ink-soft);
		font-weight: 700;
	}
	.tag {
		align-self: flex-start;
		margin-top: 3px;
		padding: 0 6px 1px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: #fff2d2;
		background: #a32d22;
		box-shadow: inset 0 -2px 0 #6b1810;
	}
	.rows {
		list-style: none;
		margin: 0 0 6px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.rows li {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.rows li > img {
		width: 22px;
		height: 22px;
		flex: none;
		filter: drop-shadow(0 2px 1px rgba(60, 30, 10, 0.3));
	}
	.rules li.hard span {
		color: #8a2a14;
		font-weight: 700;
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 18px;
		padding-top: 12px;
		border-top: 3px solid rgba(138, 98, 54, 0.35);
	}
	footer .btn img {
		height: calc(var(--s) * 8);
		margin-right: 8px;
	}
	.best {
		font-weight: 700;
		color: var(--ink-soft);
	}
	.locked-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-weight: 700;
		color: var(--ink-soft);
	}
	.locked-note img {
		width: 20px;
		height: 20px;
	}

	@media (max-width: 760px) {
		.campaign {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			gap: 8px;
		}
		.side {
			gap: 6px;
		}
		.total {
			display: none;
		}
		.acts {
			display: flex;
			gap: 6px;
			overflow-x: auto;
			overflow-y: hidden;
			padding: 2px 0 4px;
		}
		.act,
		.soon,
		.dev {
			display: none;
		}
		ol {
			flex-direction: row;
		}
		.mission {
			width: auto;
			padding: 4px 8px 4px 6px;
			font-size: 14px;
		}
		.mission.on,
		.mission:hover {
			transform: none;
		}
		.page {
			padding: 6px 10px 10px;
			font-size: 15px;
		}
		h2 {
			font-size: 24px;
		}
		footer {
			flex-direction: column-reverse;
			align-items: stretch;
		}
	}
</style>
