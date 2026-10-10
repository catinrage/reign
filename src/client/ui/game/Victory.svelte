<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { replay } from '../../state/replay.svelte';
	import { getIcons } from '../../scene/icons';
	import Embers from '../menu/Embers.svelte';
	import { RESOURCES, RESOURCE_LABEL } from '../helpers';
	import { PIXEL } from '../pixel';
	import { t } from '../../i18n/index.svelte';
	import { diceChart, gatherLeaders, honors, luck, type Honor } from './postGame';

	const view = $derived(client.view!);
	let hidden = $state(false);
	const ranking = $derived(
		view.players
			.map((p, i) => ({
				i,
				name: p.name,
				color: p.color,
				pts: p.totalPoints ?? p.publicPoints,
				vp: p.devCards?.filter((c) => c.type === 'victoryPoint').length ?? 0
			}))
			.sort((a, b) => b.pts - a.pts)
	);
	let show = $state(false);
	$effect(() => {
		if (view.phase === 'ended') {
			const timer = setTimeout(() => (show = true), 1200);
			return () => clearTimeout(timer);
		}
		show = false;
		hidden = false;
	});
	const winner = $derived(view.winner !== null ? view.players[view.winner] : null);
	const MEDAL = ['gold', 'silver', 'bronze', 'iron'];
	// A rematch needs everyone ready again, just like the first game.
	const seats = $derived(client.lobby?.seats ?? []);
	const notReady = $derived(seats.filter((s) => !s.ready));
	const meReady = $derived(!!seats.find((s) => s.id === client.seat)?.ready);

	// The game's numbers, sent once it is over (games started before they were kept have none).
	const stats = $derived(view.stats);
	const leaders = $derived(stats ? gatherLeaders(stats) : null);
	const honorList = $derived(stats ? honors(stats) : []);
	const chart = $derived(stats ? diceChart(stats) : []);
	const chartMax = $derived(Math.max(1, ...chart.map((c) => Math.max(c.count, c.expected))));
	const rolls = $derived(chart.reduce((n, c) => n + c.count, 0));
	const icons = $derived(stats ? getIcons().urls : null);
	// On a narrow screen the sections take turns behind tabs.
	let width = $state(1000);
	const narrow = $derived(!!stats && width < 700);
	let tab = $state<'standings' | 'honors' | 'dice'>('standings');
	const TABS = $derived([
		{ id: 'standings', label: t('Standings') },
		{ id: 'honors', label: t('Honors') },
		{ id: 'dice', label: t('Dice') }
	] as const);

	const HONOR_ICON: Record<Honor['kind'], string> = {
		lucky: PIXEL.clover,
		unlucky: PIXEL.raincloud,
		haul: PIXEL.cards,
		builder: PIXEL.hammer,
		thief: PIXEL.sword,
		trader: PIXEL.trade,
		target: PIXEL.robber,
		scholar: PIXEL.dev
	};
	function honorTitle(h: Honor): string {
		switch (h.kind) {
			case 'lucky':
				return t('Luckiest');
			case 'unlucky':
				return t('Unluckiest');
			case 'haul':
				return t('Biggest haul');
			case 'builder':
				return t('Master builder');
			case 'thief':
				return t('Highwayman');
			case 'trader':
				return t('Merchant prince');
			case 'target':
				return t("Robber's favorite");
			case 'scholar':
				return t('Scholar');
		}
	}
	function honorWhy(h: Honor): string {
		switch (h.kind) {
			case 'lucky':
			case 'unlucky': {
				const lines = [
					t(
						'{got, plural, one {The dice paid # card where the odds promised {expected}.} other {The dice paid # cards where the odds promised {expected}.}}',
						{
							got: h.got,
							expected: h.expected
						}
					)
				];
				if (h.kind === 'lucky' && h.longShots)
					lines.push(
						t(
							'{n, plural, one {# card came on a 2, 3, 11 or 12.} other {# cards came on a 2, 3, 11 or 12.}}',
							{ n: h.longShots }
						)
					);
				if (h.kind === 'unlucky' && h.robbed)
					lines.push(
						t('The robber blocked {n, plural, one {# more card} other {# more cards}}.', {
							n: h.robbed
						})
					);
				return lines.join(' ');
			}
			case 'haul':
				return t('Took {n, plural, one {# card} other {# cards}} from a single roll of {total}.', {
					n: h.n,
					total: h.total
				});
			case 'builder':
				return t('Put up {n, plural, one {# piece} other {# pieces}}.', { n: h.n });
			case 'thief':
				return t('Took {n, plural, one {# card} other {# cards}} from other players.', { n: h.n });
			case 'trader':
				return t('Made {n, plural, one {# trade} other {# trades}}.', { n: h.n });
			case 'target':
				return t('Thieves and the robber cost them {n, plural, one {# card} other {# cards}}.', {
					n: h.n
				});
			case 'scholar':
				return t('Bought {n, plural, one {# development card} other {# development cards}}.', {
					n: h.n
				});
		}
	}
	/** Cards from the dice beyond the odds, rounded, with its sign. */
	function luckBadge(i: number): string {
		const n = Math.round(luck(stats!.players[i]));
		return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0';
	}
	const nameOf = (i: number) =>
		i === view.me ? t('{player} (you)', { player: view.players[i].name }) : view.players[i].name;
	const facts = $derived(
		stats
			? [
					{
						icon: PIXEL.hourglass,
						text: t('{n, plural, one {# turn} other {# turns}}', { n: view.turn })
					},
					{ icon: PIXEL.die, text: t('{n, plural, one {# roll} other {# rolls}}', { n: rolls }) },
					{
						icon: PIXEL.robber,
						text: t('{n, plural, one {# seven} other {# sevens}}', { n: stats.rolls[7] ?? 0 })
					},
					{
						icon: PIXEL.hammer,
						text: t('{n, plural, one {# piece built} other {# pieces built}}', {
							n: stats.players.reduce((n, p) => n + p.built, 0)
						})
					}
				]
			: []
	);
</script>

{#if show && !hidden && winner}
	<div class="modal-backdrop victory">
		<Embers count={34} />
		<div
			class="stage"
			class:wide={!!stats}
			class:many={!!stats && view.players.length > 5}
			class:narrow
			bind:clientWidth={width}
		>
			<div class="rays"></div>
			<img class="crown icon-px" src={PIXEL.crown} alt="" />
			<div class="ribbon big">
				{view.winner === view.me ? t('Victory!') : t('{player} wins!', { player: winner.name })}
			</div>
			<div class="board panel">
				{#if stats && narrow}
					<div class="tabs" role="tablist">
						{#each TABS as tb (tb.id)}
							<button
								class="tab"
								class:on={tab === tb.id}
								role="tab"
								aria-selected={tab === tb.id}
								onclick={() => (tab = tb.id)}>{tb.label}</button
							>
						{/each}
					</div>
				{/if}
				<div class="body">
					{#if !stats || !narrow || tab === 'standings'}
						<section class="standings">
							{#if stats && icons}
								<div class="row head">
									<span
										class="gathered label"
										title={t('Every card that came into their hand, trades aside')}
										>{t('Cards gathered')}</span
									>
									{#each RESOURCES as r (r)}
										<img
											class="res"
											src={icons[r]}
											alt={t(RESOURCE_LABEL[r])}
											title={t(RESOURCE_LABEL[r])}
										/>
									{/each}
									<span class="label vp">{t('VP')}</span>
								</div>
							{/if}
							{#each ranking as r, k (r.i)}
								<div
									class="row rank plaque"
									class:first={k === 0}
									class:me={r.i === view.me}
									class:cols={!!stats}
									style="animation-delay:{0.25 + k * 0.12}s"
								>
									<span class="medal coin {MEDAL[k] ?? 'iron'}">{k + 1}</span>
									<span class="shield" style="--shield: var(--art-shield-{r.color})"
										>{r.name.slice(0, 1).toUpperCase()}</span
									>
									<span class="nm">{narrow ? r.name : nameOf(r.i)}</span>
									{#if r.vp}<span class="vpc" title={t('Hidden victory point cards')}
											><img class="icon-px" src={PIXEL.victoryPoint} alt="" />{r.vp}</span
										>{/if}
									{#if stats && leaders}
										{#each RESOURCES as res (res)}
											{@const lead = leaders[res].includes(r.i)}
											<span
												class="cell"
												class:lead
												title={lead
													? t('Most {resource} gathered', { resource: t(RESOURCE_LABEL[res]) })
													: t(RESOURCE_LABEL[res])}>{stats.players[r.i].gained[res]}</span
											>
										{/each}
									{/if}
									<span class="pts title">{r.pts}<small>{t('VP')}</small></span>
								</div>
							{/each}
						</section>
					{/if}
					{#if stats && (!narrow || tab === 'honors')}
						<section class="honors">
							{#if !narrow}<div class="divider"><i></i>{t('Honors')}<i></i></div>{/if}
							{#each honorList as h, k (h.kind)}
								<div
									class="honor well"
									class:good={h.kind === 'lucky'}
									class:bad={h.kind === 'unlucky'}
									style="animation-delay:{0.6 + k * 0.1}s"
								>
									<img class="icon-px hi" src={HONOR_ICON[h.kind]} alt="" />
									<div class="txt">
										<div class="ht">
											<span class="htitle">{honorTitle(h)}</span>
											{#if h.kind === 'lucky' || h.kind === 'unlucky'}
												<span class="badge" title={t('Cards from the dice compared with the odds')}
													>{luckBadge(h.players[0])}</span
												>
											{/if}
										</div>
										<p class="why">
											{#each h.players as p (p)}<span
													class="pin"
													style="--shield: var(--art-shield-{view.players[p].color})"
												></span><b class:me={p === view.me}>{nameOf(p)}</b>
											{/each}{honorWhy(h)}
										</p>
									</div>
								</div>
							{:else}
								<p class="none">{t('No honors this time.')}</p>
							{/each}
						</section>
					{/if}
					{#if stats && (!narrow || tab === 'dice')}
						<section class="dice">
							<div class="divider"><i></i>{t('Dice rolls')}<i></i></div>
							<div class="chart" role="img" aria-label={t('Dice rolls')}>
								{#each chart as c (c.total)}
									<div
										class="col"
										class:seven={c.total === 7}
										title={t(
											'{total}: {n, plural, one {rolled # time} other {rolled # times}}, about {expected} expected',
											{
												total: c.total,
												n: c.count,
												expected: Math.round(c.expected * 10) / 10
											}
										)}
									>
										<span class="n">{c.count}</span>
										<div class="track">
											<div class="bar" style="height:{(c.count / chartMax) * 100}%"></div>
											<div class="exp" style="bottom:{(c.expected / chartMax) * 100}%"></div>
										</div>
										<span class="tot" class:hot={c.total === 6 || c.total === 8}>{c.total}</span>
									</div>
								{/each}
							</div>
							<div class="legend">
								<span><i class="sw bar-sw"></i>{t('Rolled')}</span>
								<span><i class="sw exp-sw"></i>{t('Expected')}</span>
							</div>
							<div class="facts">
								{#each facts as f (f.icon)}
									<span class="fact"><img class="icon-px" src={f.icon} alt="" />{f.text}</span>
								{/each}
							</div>
						</section>
					{/if}
				</div>
				<div class="foot">
					<button class="btn wood" onclick={() => (hidden = true)}>{t('View board')}</button>
					{#if client.replaying}
						<button class="btn green shine" onclick={() => replay.play()}
							><img src={PIXEL.play} alt="" />{t('Watch again')}</button
						>
						<button class="btn red" onclick={() => replay.close()}>{t('Close replay')}</button>
					{:else if client.spectating}
						<button class="btn red" onclick={() => client.leave()}>{t('Stop watching')}</button>
					{:else if client.isHost}
						<button
							class="btn green shine"
							disabled={notReady.length > 0}
							onclick={() => client.send({ t: 'start' })}>{t('Play again')}</button
						>
					{:else}
						<button class="btn red" onclick={() => client.leave()}>{t('Leave')}</button>
						<button
							class="btn"
							class:green={meReady}
							class:shine={!meReady}
							aria-pressed={meReady}
							onclick={() => client.send({ t: 'setReady', ready: !meReady })}
							>{meReady ? t('Ready!') : t('Play again')}</button
						>
					{/if}
				</div>
				{#if client.isHost && notReady.length}
					<p class="again">
						{t('Waiting for {players} to be ready.', {
							players: notReady.map((s) => s.name).join(', ')
						})}
					</p>
				{:else if !client.isHost && meReady}
					<p class="again">{t('Waiting for the host to start another game.')}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.victory {
		z-index: 55;
	}
	.stage {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: min(460px, calc(100vw / var(--ui-zoom) - 24px));
		max-height: calc(100vh / var(--ui-zoom) - 16px);
		animation: pop-in 0.5s cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	.stage.wide {
		width: min(900px, calc(100vw / var(--ui-zoom) - 24px));
	}
	.rays {
		position: absolute;
		top: -150px;
		left: 50%;
		width: 520px;
		height: 520px;
		margin-left: -260px;
		background: repeating-conic-gradient(
			from 0deg,
			rgba(255, 214, 110, 0.32) 0deg 9deg,
			transparent 9deg 22.5deg
		);
		mask: radial-gradient(circle, #000 18%, transparent 62%);
		-webkit-mask: radial-gradient(circle, #000 18%, transparent 62%);
		animation: spin 24s linear infinite;
		pointer-events: none;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.crown {
		position: relative;
		width: 96px;
		height: 96px;
		flex: none;
		filter: drop-shadow(0 0 14px rgba(255, 200, 80, 0.9)) drop-shadow(0 6px 0 rgba(60, 30, 4, 0.6));
		animation: bob 1.6s ease-in-out infinite;
	}
	.wide .crown {
		width: 56px;
		height: 56px;
	}
	.wide .ribbon.big {
		font-size: 24px;
	}
	.ribbon.big {
		position: relative;
		z-index: 2;
		flex: none;
		font-size: 28px;
		margin: 6px 0 calc(var(--s) * -9);
		padding-left: calc(var(--s) * 7);
		padding-right: calc(var(--s) * 7);
	}
	.board {
		width: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding: calc(var(--s) * 9) 12px 12px;
	}
	.body {
		min-height: 0;
		overflow-y: auto;
		margin-bottom: 14px;
	}
	.wide:not(.narrow) .body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		grid-template-areas: 'standings honors' 'dice honors';
		grid-template-rows: auto 1fr;
		gap: 10px 16px;
	}
	.standings {
		grid-area: standings;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.honors {
		grid-area: honors;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.dice {
		grid-area: dice;
	}

	/* ------------------------------------------------ tabs (narrow screens) */
	.tabs {
		display: flex;
		justify-content: center;
		gap: 4px;
		margin: 2px 0 10px;
	}
	.tab {
		all: unset;
		cursor: pointer;
		padding: 3px 10px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #e9d2b0;
		background: rgba(0, 0, 0, 0.22);
		box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.35);
	}
	.tab.on {
		color: #fff2d2;
		background: color-mix(in srgb, var(--gold) 26%, #5a3420);
		box-shadow: inset 0 0 0 2px var(--gold);
	}
	.tab:hover:not(.on) {
		filter: brightness(1.2);
	}

	/* ------------------------------------------------ standings */
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.rank {
		padding: 2px 8px 2px 4px;
		animation: pop-in 0.35s ease-out both;
	}
	.row.cols,
	.row.head {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto repeat(5, 30px) 46px;
		gap: 6px;
	}
	.row.head {
		padding: 0 8px 0 4px;
		border-width: 0 calc(var(--s) * 4);
		border-style: solid;
		border-color: transparent;
	}
	.head .gathered {
		grid-column: 1 / 5;
		text-align: right;
		font-size: 11px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.head .res {
		width: 26px;
		height: 26px;
		justify-self: center;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5));
	}
	.head .vp {
		text-align: right;
		font-size: 11px;
	}
	/* Rows without a hidden-points badge keep the columns lined up. */
	.row.cols:not(:has(.vpc)) .nm {
		grid-column: 3 / 5;
	}
	.wide .rank,
	.wide .row.head {
		--s: 2px;
	}
	.wide .rank {
		padding: 0 6px 0 2px;
	}
	.many .standings {
		gap: 3px;
	}
	.many .rank,
	.many .row.head {
		--s: 1.5px;
	}
	.many .medal,
	.many .rank .shield {
		--s: 1.5px;
		font-size: 11px;
	}
	.many .cell {
		height: 20px;
		font-size: 13px;
	}
	.many .chart {
		height: 84px;
	}
	.rank.first {
		filter: drop-shadow(0 0 6px rgba(255, 210, 90, 0.75));
	}
	.medal {
		--s: 2.2px;
		font-size: 15px;
	}
	.wide .medal,
	.wide .rank .shield {
		--s: 1.8px;
		font-size: 13px;
	}
	.medal.silver {
		filter: grayscale(1) brightness(1.35);
	}
	.medal.bronze {
		filter: sepia(0.6) hue-rotate(-18deg) saturate(1.4) brightness(0.85);
	}
	.medal.iron {
		filter: grayscale(1) brightness(0.75);
	}
	.rank .shield {
		--s: 2.2px;
		font-size: 15px;
	}
	.nm {
		flex: 1;
		text-align: left;
		font-family: var(--px);
		font-weight: 700;
		font-size: 17px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.wide .nm {
		font-size: 15px;
	}
	.me .nm {
		color: #ffe08a;
	}
	.vpc {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 13px;
		font-weight: 800;
		color: var(--muted);
	}
	.vpc img {
		width: 16px;
		height: 16px;
	}
	.cell {
		display: grid;
		place-items: center;
		height: 24px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: #e9d2b0;
		background: rgba(0, 0, 0, 0.2);
		box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.25);
	}
	.cell.lead {
		color: #fff6d0;
		background: color-mix(in srgb, var(--gold) 34%, #5a3420);
		box-shadow:
			inset 0 0 0 2px var(--gold),
			0 0 8px rgba(255, 200, 80, 0.55);
		text-shadow: 0 2px 0 #5a3010;
	}
	.pts {
		font-size: 24px;
		color: var(--gold);
		text-shadow: 0 2px 0 #5a3010;
		text-align: right;
	}
	.wide .pts {
		font-size: 20px;
	}
	.pts small {
		font-size: 11px;
		margin-left: 2px;
		color: var(--muted);
		text-shadow: none;
	}

	/* ------------------------------------------------ honors */
	.honor {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 4px 6px;
		text-align: left;
		animation: pop-in 0.35s ease-out both;
	}
	.honor .hi {
		width: 26px;
		height: 26px;
		flex: none;
		margin-top: 2px;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5));
	}
	.txt {
		min-width: 0;
		flex: 1;
	}
	.ht {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}
	.htitle {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold);
	}
	.good .htitle {
		color: #9be27b;
	}
	.bad .htitle {
		color: #9cc4f0;
	}
	.badge {
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		padding: 0 5px;
		color: #fff6e0;
		background: rgba(0, 0, 0, 0.35);
		box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.15);
	}
	.good .badge {
		background: #2f6b22;
	}
	.bad .badge {
		background: #2b4a75;
	}
	.why b {
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #fff2d2;
		margin-right: 5px;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.why b.me {
		color: #ffe08a;
	}
	.pin {
		display: inline-block;
		vertical-align: -1px;
		width: 11px;
		height: 13px;
		margin-right: 3px;
		background: var(--shield) center / 100% 100%;
	}
	.why {
		margin: 1px 0 0;
		font-size: 12.5px;
		line-height: 1.3;
		color: var(--muted);
	}
	.none {
		margin: 8px 0;
		color: var(--muted);
		text-align: center;
	}

	/* ------------------------------------------------ dice */
	.dice .divider {
		margin: 4px 0 6px;
	}
	.chart {
		display: flex;
		align-items: stretch;
		gap: 4px;
		height: 104px;
	}
	.col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
	}
	.col .n {
		font-size: 11px;
		font-weight: 800;
		color: var(--muted);
		line-height: 14px;
	}
	.track {
		position: relative;
		flex: 1;
		width: 100%;
		background: rgba(0, 0, 0, 0.18);
	}
	.bar {
		position: absolute;
		left: 2px;
		right: 2px;
		bottom: 0;
		background: linear-gradient(#ffd86b, #c8862c);
		box-shadow:
			inset 0 0 0 2px rgba(90, 48, 16, 0.6),
			inset 0 3px 0 rgba(255, 255, 255, 0.35);
		animation: grow-up 0.6s ease-out both;
		transform-origin: bottom;
	}
	.seven .bar {
		background: linear-gradient(#b4b8c0, #6d7079);
	}
	@keyframes grow-up {
		from {
			transform: scaleY(0);
		}
	}
	.exp {
		position: absolute;
		left: -1px;
		right: -1px;
		height: 0;
		border-top: 3px dashed #fff6e0;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.6));
	}
	.tot {
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #fff2d2;
		line-height: 18px;
	}
	.tot.hot {
		color: #ff8a6a;
	}
	.legend {
		display: flex;
		justify-content: center;
		gap: 14px;
		margin-top: 2px;
		font-size: 12px;
		color: var(--muted);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.sw {
		display: inline-block;
		width: 14px;
	}
	.bar-sw {
		height: 10px;
		background: linear-gradient(#ffd86b, #c8862c);
	}
	.exp-sw {
		height: 0;
		border-top: 3px dashed #fff6e0;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px 12px;
		margin-top: 8px;
	}
	.fact {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #e9d2b0;
	}
	.fact img {
		width: 16px;
		height: 16px;
	}

	/* ------------------------------------------------ narrow screens */
	.narrow .row.cols,
	.narrow .row.head {
		grid-template-columns: auto minmax(0, 1fr) auto repeat(5, 24px) 38px;
		gap: 4px;
	}
	.narrow .row.cols .nm {
		grid-column: 2 / 4;
	}
	.narrow .head .gathered {
		grid-column: 1 / 4;
	}
	.narrow .cell {
		font-size: 13px;
		height: 22px;
	}
	.narrow .head .res {
		width: 20px;
		height: 20px;
	}
	.narrow .nm {
		font-size: 14px;
	}
	/* Rows are in rank order and your row is gold already; hidden points show in the total. */
	.narrow .medal,
	.narrow .vpc {
		display: none;
	}
	.narrow .pts {
		font-size: 17px;
	}
	.narrow .pts small {
		display: none;
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 12px;
		flex: none;
	}
	.again {
		margin: 8px 0 0;
		text-align: center;
		color: var(--muted);
		font-size: 14px;
	}
</style>
