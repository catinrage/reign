<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { SIGIL_OF, sigilUrl } from '../../scene/conquest/sigils';
	import { PIXEL } from '../pixel';
	import { cqPlay } from './play.svelte';
	import { missionDone } from '../../../shared/conquest/queries';
	import { missionText } from './missions';
	import { cqColor } from './text';

	/** The war is over: who won, how, and what everyone did, with the territories each held round by round. */
	const v = $derived(cqPlay.view!);
	let show = $state(false);
	let hidden = $state(false);
	$effect(() => {
		if (v.phase === 'ended') {
			const timer = setTimeout(() => (show = true), 1400);
			return () => clearTimeout(timer);
		}
		show = false;
		hidden = false;
	});
	const reason = $derived([...v.log].reverse().find((e) => e.type === 'gameOver'));
	const winnerMission = $derived(v.winner !== null ? (v.players[v.winner]?.mission ?? null) : null);
	const order = $derived(
		v.players
			.map((p, i) => ({ p, i, s: v.stats.players[i], lands: v.owner.filter((o) => o === i).length }))
			.sort((a, b) =>
				a.i === v.winner ? -1 : b.i === v.winner ? 1 : b.lands - a.lands || (b.s?.outTurn ?? 1e9) - (a.s?.outTurn ?? 1e9)
			)
	);
	const MEDAL = ['gold', 'silver', 'bronze', 'iron'];
	const seats = $derived(client.lobby?.seats ?? []);
	const notReady = $derived(seats.filter((s) => !s.ready));
	const meReady = $derived(!!seats.find((s) => s.id === client.seat)?.ready);
	const total = $derived(v.owner.length);

	// The chart: territories held by each player at the end of each round.
	const W = 300;
	const H = 110;
	const rounds = $derived(Math.max(1, ...v.stats.held.map((h) => h.length - 1)));
	function path(h: number[]) {
		return h.map((n, k) => `${k ? 'L' : 'M'}${((k / rounds) * W).toFixed(1)},${(H - (n / total) * H).toFixed(1)}`).join(' ');
	}
</script>

{#if v.phase === 'ended' && show}
	{#if hidden}
		<button class="btn green shine reopen" onclick={() => (hidden = false)}>{t('Results')}</button>
	{:else}
		<div class="modal-backdrop victory" role="dialog" aria-modal="true" aria-label={t('Results')}>
			<div class="board panel">
				<div class="ribbon" style="--rib: var(--art-ribbon-gold)">
					<img class="icon-px" src={PIXEL.crown} alt="" />
					{v.winner === v.me ? t('Victory!') : t('{player} wins!', { player: v.players[v.winner ?? 0]?.name ?? '' })}
				</div>
				<p class="why">
					{reason?.type === 'gameOver' && reason.reason === 'majority'
						? t('Held two thirds of the Realm.')
						: reason?.type === 'gameOver' && reason.reason === 'mission' && winnerMission
							? t('Completed a secret mission: {mission}', { mission: missionText(v, winnerMission) })
							: t('Conquered every territory of the Realm.')}
				</p>
				<div class="grid">
					<table>
						<thead>
							<tr>
								<th></th>
								<th title={t('Territories held at the end')}>{t('Held')}</th>
								<th title={t('Territories captured')}>{t('Taken')}</th>
								<th title={t('Territories lost')}>{t('Lost')}</th>
								<th title={t('Enemy armies destroyed')}>{t('Destroyed')}</th>
								<th title={t('Own armies fallen')}>{t('Fallen')}</th>
								<th title={t('Card sets traded in')}>{t('Sets')}</th>
								<th title={t('The most territories held at once')}>{t('Peak')}</th>
							</tr>
						</thead>
						<tbody>
							{#each order as r, k (r.i)}
								<tr class:me={r.i === v.me} class:out={r.p.out}>
									<td class="who" style="--c:{cqColor(v, r.i)}">
										<span class="medal" style="--medal: var(--art-medal-{MEDAL[Math.min(k, 3)]}, none)">{k + 1}</span>
										<img src={sigilUrl(SIGIL_OF[r.p.color], cqColor(v, r.i), '#1a0c05', 32)} alt="" />
										<b>{r.p.name}</b>
									</td>
									<td>{r.lands}</td>
									<td>{r.s?.captured ?? 0}</td>
									<td>{r.s?.lost ?? 0}</td>
									<td>{r.s?.killed ?? 0}</td>
									<td>{r.s?.fallen ?? 0}</td>
									<td>{r.s?.sets ?? 0}</td>
									<td>{r.s?.peak ?? 0}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<figure class="chart well">
						<figcaption>{t('Territories held, round by round')}</figcaption>
						<svg viewBox="-4 -4 {W + 8} {H + 8}" preserveAspectRatio="none" aria-hidden="true">
							<line x1="0" y1={H / 3} x2={W} y2={H / 3} class="goal" />
							{#each v.stats.held as h, i (i)}
								<path d={path(h)} style="stroke:{cqColor(v, i)}" />
							{/each}
						</svg>
					</figure>
				</div>
				{#if v.settings.victory === 'missions'}
					<div class="missions well">
						<h3><img class="icon-px" src={PIXEL.letter} alt="" />{t('The secret missions')}</h3>
						<ul>
							{#each order as r (r.i)}
								{@const m = r.p.mission}
								{#if m}
									<li style="--c:{cqColor(v, r.i)}">
										<img src={sigilUrl(SIGIL_OF[r.p.color], cqColor(v, r.i), '#1a0c05', 24)} alt="" />
										<b>{r.p.name}</b>
										<span>{missionText(v, m)}</span>
										{#if missionDone(v, r.i, m)}<img class="icon-px tick" src={PIXEL.check} alt={t('Done!')} />{/if}
									</li>
								{/if}
							{/each}
						</ul>
					</div>
				{/if}
				<div class="foot">
					<button class="btn wood" onclick={() => (hidden = true)}>{t('View board')}</button>
					{#if client.replaying}
						<span></span>
					{:else if client.spectating}
						<button class="btn red" onclick={() => client.leave()}>{t('Stop watching')}</button>
					{:else if client.isHost}
						<button class="btn red" onclick={() => client.leave()}>{t('Leave')}</button>
						<button class="btn green shine" disabled={notReady.length > 0} onclick={() => client.send({ t: 'start' })}>{t('Play again')}</button>
					{:else}
						<button class="btn red" onclick={() => client.leave()}>{t('Leave')}</button>
						<button
							class="btn"
							class:green={meReady}
							class:shine={!meReady}
							aria-pressed={meReady}
							onclick={() => client.send({ t: 'setReady', ready: !meReady })}>{meReady ? t('Ready!') : t('Play again')}</button
						>
					{/if}
				</div>
				{#if client.isHost && notReady.length && !client.spectating}
					<p class="again">{t('Waiting for {players} to be ready.', { players: notReady.map((s) => s.name).join(', ') })}</p>
				{:else if !client.isHost && meReady}
					<p class="again">{t('Waiting for the host to start another game.')}</p>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	.missions {
		margin: 10px 0 0;
		padding: 8px 12px;
	}
	.missions h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 6px;
		font-family: var(--px);
		font-size: 14px;
		color: var(--gold);
	}
	.missions h3 img {
		width: 18px;
		height: 18px;
	}
	.missions ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.missions li {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #e2cba8;
	}
	.missions li b {
		color: var(--c);
		text-shadow: var(--outline-dark);
	}
	.missions li .tick {
		width: 16px;
		height: 16px;
		margin-left: auto;
	}
	.victory {
		z-index: 50;
		pointer-events: auto;
	}
	.board {
		position: relative;
		width: min(760px, calc(100vw / var(--ui-zoom) - 24px));
		padding: 28px 16px 12px;
		animation: pop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.board > .ribbon {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -55%);
		font-size: 24px;
	}
	.ribbon img {
		width: 24px;
		height: 24px;
	}
	.why {
		margin: 4px 0 10px;
		text-align: center;
		font-weight: 800;
		color: var(--muted);
	}
	.grid {
		display: flex;
		gap: 14px;
		align-items: flex-start;
	}
	table {
		flex: 1;
		border-collapse: collapse;
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #ead6b8;
	}
	th {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
		padding: 0 4px 4px;
		cursor: help;
	}
	td {
		text-align: center;
		padding: 4px;
		border-top: 1px solid rgba(255, 220, 160, 0.12);
	}
	td.who {
		display: flex;
		align-items: center;
		gap: 6px;
		text-align: left;
	}
	td.who img {
		width: 22px;
		height: 22px;
	}
	td.who b {
		color: var(--c);
		text-shadow:
			1px 0 0 #1a0c05,
			-1px 0 0 #1a0c05,
			0 1px 0 #1a0c05,
			0 -1px 0 #1a0c05;
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.medal {
		display: inline-grid;
		place-items: center;
		width: 20px;
		height: 20px;
		background: var(--art-coin) center / 100% 100%;
		color: #4a2606;
		font-size: 12px;
	}
	tr.me td {
		background: rgba(255, 212, 90, 0.08);
	}
	tr.out td:not(.who) {
		opacity: 0.6;
	}
	.chart {
		margin: 0;
		width: 240px;
		padding: 4px 6px;
	}
	figcaption {
		font-family: var(--px);
		font-weight: 700;
		font-size: 11px;
		color: var(--muted);
		margin-bottom: 4px;
	}
	svg {
		width: 100%;
		height: 120px;
		display: block;
	}
	svg path {
		fill: none;
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
		stroke-linejoin: round;
		filter: drop-shadow(0 1px 0 #1a0c05);
	}
	.goal {
		stroke: rgba(255, 220, 160, 0.25);
		stroke-dasharray: 4 4;
		vector-effect: non-scaling-stroke;
	}
	.foot {
		display: flex;
		justify-content: center;
		gap: 10px;
		margin-top: 12px;
	}
	.again {
		margin: 6px 0 0;
		text-align: center;
		font-size: 13px;
		color: var(--muted);
	}
	.reopen {
		position: absolute;
		bottom: 96px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
	}
	@media (max-width: 900px) {
		.grid {
			flex-direction: column;
			align-items: stretch;
		}
		.chart {
			width: auto;
		}
		table {
			width: 100%;
			table-layout: fixed;
			font-size: 12px;
		}
		th:first-child {
			width: 30%;
		}
		/* Headings stand on end so whole words (and longer translations) fit narrow columns. */
		th {
			font-size: 9px;
			letter-spacing: 0;
			padding: 0 1px 6px;
			vertical-align: bottom;
		}
		th:not(:first-child) {
			writing-mode: vertical-rl;
			transform: rotate(180deg);
			text-align: left;
			white-space: nowrap;
		}
		td {
			padding: 3px 2px;
		}
		td.who b {
			max-width: 70px;
		}
	}
</style>
