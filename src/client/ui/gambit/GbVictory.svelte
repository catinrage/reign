<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { gbPlay } from './play.svelte';
	import { gbColor } from './text';

	/** The war is over: who won, how, and where everyone's crowns came from, round by round. */
	const v = $derived(gbPlay.view!);
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
	const order = $derived(
		v.players
			.map((p, i) => ({ p, i, s: v.stats.players[i], pieces: v.pieces.filter((x) => x.owner === i).length }))
			.sort((a, b) => (a.i === v.winner ? -1 : b.i === v.winner ? 1 : b.p.crowns - a.p.crowns))
	);
	const MEDAL = ['gold', 'silver', 'bronze', 'iron'];
	const seats = $derived(client.lobby?.seats ?? []);
	const notReady = $derived(seats.filter((s) => !s.ready));
	const meReady = $derived(!!seats.find((s) => s.id === client.seat)?.ready);

	// The chart: everyone's crowns at the end of each round, against the target.
	const W = 300;
	const H = 110;
	const rounds = $derived(Math.max(1, ...v.stats.crowns.map((c) => c.length)));
	const top = $derived(Math.max(v.settings.crowns, ...v.players.map((p) => p.crowns)));
	function path(c: number[]) {
		return [0, ...c].map((n, k) => `${k ? 'L' : 'M'}${((k / rounds) * W).toFixed(1)},${(H - (n / top) * H).toFixed(1)}`).join(' ');
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
					{reason?.type === 'gameOver' && reason.reason === 'rounds'
						? t('Held the most crowns when the rounds ran out.')
						: t('Reached {n} crowns first.', { n: v.settings.crowns })}
				</p>
				<div class="grid">
					<table>
						<thead>
							<tr>
								<th></th>
								<th title={t('Crowns at the end')}>{t('Crowns')}</th>
								<th title={t('Crowns from holding shrines')}>{t('Shrines')}</th>
								<th title={t('Crowns from taking pieces')}>{t('Spoils')}</th>
								<th title={t('Pieces of others taken')}>{t('Taken')}</th>
								<th title={t('Own pieces lost')}>{t('Lost')}</th>
								<th title={t('Pieces on the board at the end')}>{t('Pieces')}</th>
							</tr>
						</thead>
						<tbody>
							{#each order as r, k (r.i)}
								<tr class:me={r.i === v.me}>
									<td class="who" style="--c:{gbColor(v, r.i)}">
										<span class="medal" style="--medal: var(--art-medal-{MEDAL[Math.min(k, 3)]}, none)">{k + 1}</span>
										<i></i>
										<b>{r.p.name}</b>
									</td>
									<td>{r.p.crowns}</td>
									<td>{r.s?.shrineCrowns ?? 0}</td>
									<td>{r.s?.captureCrowns ?? 0}</td>
									<td>{r.s?.taken ?? 0}</td>
									<td>{r.s?.lost ?? 0}</td>
									<td>{r.pieces}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<figure class="chart well">
						<figcaption>{t('Crowns, round by round')}</figcaption>
						<svg viewBox="-4 -4 {W + 8} {H + 8}" preserveAspectRatio="none" aria-hidden="true">
							<line x1="0" y1={H - (v.settings.crowns / top) * H} x2={W} y2={H - (v.settings.crowns / top) * H} class="goal" />
							{#each v.stats.crowns as c, i (i)}
								<path d={path(c)} style="stroke:{gbColor(v, i)}" />
							{/each}
						</svg>
					</figure>
				</div>
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
	td.who i {
		width: 14px;
		height: 14px;
		flex: none;
		background: var(--c);
		box-shadow: 0 0 0 2px #1a0c05;
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
