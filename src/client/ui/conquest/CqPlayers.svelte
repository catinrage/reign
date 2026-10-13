<script lang="ts">
	import { reinforcementsFor, territoriesOf } from '../../../shared/conquest/queries';
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { SIGIL_OF, sigilUrl } from '../../scene/conquest/sigils';
	import TurnTab from '../game/TurnTab.svelte';
	import { PIXEL } from '../pixel';
	import { CQ_PIXEL } from './icons';
	import { cqPlay } from './play.svelte';
	import { cqColor, regionName } from './text';

	/** Everyone at the table: their sigil, territories, armies, cards and what their next turn brings. */
	const v = $derived(cqPlay.view!);
	const seats = $derived(client.lobby?.seats ?? []);
	const playing = $derived(v.phase !== 'ended');
	const rows = $derived(
		v.players.map((p, i) => {
			const lands = territoriesOf(v, i).length;
			const armies = v.armies.reduce((n, a, k) => (v.owner[k] === i ? n + a : n), 0);
			const income = reinforcementsFor(v, i);
			return { p, i, lands, armies, income };
		})
	);
	function incomeTip(r: (typeof rows)[number]) {
		const lines = [t('{n, plural, one {# army} other {# armies}} for {lands, plural, one {# territory} other {# territories}}', { n: r.income.base, lands: r.lands })];
		for (const g of r.income.regions) lines.push(t('+{n} for holding {region}', { n: g.bonus, region: regionName(v, g.region) }));
		return lines.join('\n');
	}
	const sigils = $derived(v.players.map((p) => sigilUrl(SIGIL_OF[p.color], cqColor(v, v.players.indexOf(p)), '#1a0c05', 48)));
</script>

<div class="players" data-net-anchor="players">
	{#each rows as r (r.i)}
		{@const current = r.i === v.current && playing && v.phase === 'play'}
		{@const offline = seats[r.i] && !seats[r.i].connected}
		<div
			class="player plaque"
			class:current
			class:waiting={playing && !current && v.phase === 'play'}
			class:me={r.i === v.me}
			class:out={r.p.out}
			class:offline
			style="--c:{cqColor(v, r.i)}; --frame: var(--art-plaque-{r.p.color})"
			role="presentation"
			data-plaque={r.i}
			onpointerenter={() => {
				cqPlay.spotlight = r.i;
				cqPlay.sync();
			}}
			onpointerleave={() => {
				cqPlay.spotlight = null;
				cqPlay.sync();
			}}
		>
			{#if current}<TurnTab color={r.p.color} />{/if}
			<span class="crest" title={r.p.isBot ? t('Bot') : r.p.name}>
				<img src={sigils[r.i]} alt="" />
				{#if r.p.isBot}<img class="icon-px bot" src={PIXEL.bot} alt={t('bot')} />{/if}
			</span>
			<div class="info">
				<div class="name title">{r.i === v.me ? t('{name} (you)', { name: r.p.name }) : r.p.name}</div>
				{#if r.p.out}
					<div class="stats"><span class="gone">{t('Out of the war')}</span></div>
				{:else}
					<div class="stats">
						<span title={t('Territories held')}><img class="icon-px" src={CQ_PIXEL.flag} alt="" />{#key r.lands}<b class="bump">{r.lands}</b>{/key}</span>
						<span title={t('Armies on the board')}><img class="icon-px" src={CQ_PIXEL.troops} alt="" />{#key r.armies}<b class="bump">{r.armies}</b>{/key}</span>
						<span title={t('Conquest cards')}><img class="icon-px" src={PIXEL.cards} alt="" />{r.p.cardCount}</span>
					</div>
				{/if}
			</div>
			{#if !r.p.out}
				<span class="income coin" title={incomeTip(r)} data-tip-head={t('Armies next turn')}>+{r.income.total}</span>
			{/if}
			{#if offline}
				<span class="away" title={seats[r.i].left ? t('Left the table. A bot plays for them until they rejoin.') : t('Lost connection. A bot covers if they stay away.')}
					>{seats[r.i].left ? t('left') : t('away')}</span
				>
			{/if}
		</div>
	{/each}
</div>

<style>
	.players {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 250px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.player {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 6px 3px 4px;
		pointer-events: auto;
		filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.4));
		transition: filter 0.3s;
	}
	.player.current {
		border-image-source: var(--frame);
		background-color: color-mix(in srgb, var(--c) 16%, #4d2b16);
	}
	.player.waiting {
		filter: brightness(0.78) saturate(0.75) drop-shadow(0 6px 8px rgba(0, 0, 0, 0.4));
	}
	.player.out {
		filter: grayscale(0.9) brightness(0.6);
	}
	.player.offline {
		opacity: 0.65;
	}
	.crest {
		position: relative;
		flex: none;
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
	}
	.crest > img:first-child {
		width: 38px;
		height: 38px;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.6));
	}
	.crest .bot {
		position: absolute;
		right: -4px;
		bottom: -3px;
		width: 16px;
		height: 16px;
		filter: drop-shadow(0 1px 0 #000);
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.me .name {
		color: #ffe08a;
	}
	.stats {
		display: flex;
		gap: 10px;
		margin-top: 2px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #e9d2b0;
	}
	.stats span {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.stats img {
		width: 16px;
		height: 16px;
	}
	.gone {
		color: #c9a98a;
		font-style: italic;
	}
	.bump {
		display: inline-block;
		animation: bump 0.35s ease-out;
	}
	@keyframes bump {
		40% {
			transform: translateY(-4px) scale(1.4);
			color: #fff8e0;
		}
	}
	.income {
		--s: 2.4px;
		font-size: 15px;
		cursor: help;
	}
	.away {
		position: absolute;
		left: 30px;
		bottom: -9px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 11px;
		padding: 1px 5px;
		background: #4a4440;
		color: #eee;
		box-shadow: 0 0 0 2px #1a1210;
	}
	@media (max-width: 900px) {
		.players {
			width: auto;
			top: 6px;
			right: 6px;
			left: 6px;
			flex-direction: row;
			gap: 5px;
			--s: 2px;
		}
		.player {
			flex: 1 1 0;
			min-width: 0;
			gap: 4px;
			padding: 1px 3px 1px 2px;
		}
		.crest,
		.crest > img:first-child {
			width: 26px;
			height: 26px;
		}
		.name {
			font-size: 12px;
		}
		.stats {
			gap: 5px;
			font-size: 12px;
		}
		.stats img {
			width: 12px;
			height: 12px;
		}
		.stats span:nth-child(3),
		.income {
			display: none;
		}
	}
	@media (max-width: 520px) {
		.name {
			display: none;
		}
		.player {
			justify-content: center;
		}
		.stats span:nth-child(2) {
			display: none;
		}
	}
</style>
