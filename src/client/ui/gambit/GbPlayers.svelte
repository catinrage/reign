<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { GB_PIXEL } from './icons';
	import { gbPlay } from './play.svelte';
	import { gbColor } from './text';

	/** Everyone at the table: their crowns, pieces on the board, and whether they have given their orders. */
	const v = $derived(gbPlay.view!);
	const seats = $derived(client.lobby?.seats ?? []);
	const playing = $derived(v.phase !== 'ended');
	const rows = $derived(
		v.players
			.map((p, i) => ({ p, i, pieces: v.pieces.filter((x) => x.owner === i).length }))
			// The leader first, then by crowns.
			.sort((a, b) => b.p.crowns - a.p.crowns || a.i - b.i)
	);
</script>

<div class="players" data-net-anchor="players">
	{#each rows as r (r.i)}
		{@const offline = seats[r.i] && !seats[r.i].connected}
		{@const ready = !!v.ready[r.i]}
		<div
			class="player plaque"
			class:me={r.i === v.me}
			class:ready={playing && ready}
			class:offline
			style="--c:{gbColor(v, r.i)}; --frame: var(--art-plaque-{r.p.color})"
			role="presentation"
			data-plaque={r.i}
			onpointerenter={() => {
				gbPlay.spotlight = r.i;
				gbPlay.sync();
			}}
			onpointerleave={() => {
				gbPlay.spotlight = null;
				gbPlay.sync();
			}}
		>
			<span class="crest" title={r.p.isBot ? t('Bot') : r.p.name}>
				<img class="icon-px piece" src={GB_PIXEL.monarch} alt="" />
				{#if r.p.isBot}<img class="icon-px bot" src={PIXEL.bot} alt={t('bot')} />{/if}
			</span>
			<div class="info">
				<div class="name title">{r.i === v.me ? t('{name} (you)', { name: r.p.name }) : r.p.name}</div>
				<div class="stats">
					<span title={t('Pieces on the board')}><img class="icon-px" src={GB_PIXEL.guard} alt="" />{#key r.pieces}<b class="bump">{r.pieces}</b>{/key}</span>
					{#if r.p.deposed && playing}
						<span class="deposed" title={t('Their monarch was taken: one order fewer this round.')}>{t('Deposed')}</span>
					{/if}
				</div>
			</div>
			<span class="crowns coin" title={t('Crowns: the first to {n} wins', { n: v.settings.crowns })}>
				<img class="icon-px" src={PIXEL.crown} alt="" />{#key r.p.crowns}<b class="bump">{r.p.crowns}</b>{/key}
			</span>
			{#if playing}
				<span class="state" title={ready ? t('Orders given') : t('Giving orders…')}>
					<img class="icon-px" src={ready ? PIXEL.check : PIXEL.hourglass} alt="" />
				</span>
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
		border-image-source: var(--frame);
		background-color: color-mix(in srgb, var(--c) 12%, #4d2b16);
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
		background: var(--c);
		box-shadow:
			inset 0 0 0 2px rgba(0, 0, 0, 0.45),
			0 2px 0 rgba(0, 0, 0, 0.5);
	}
	.crest .piece {
		width: 28px;
		height: 28px;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.6));
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
	.deposed {
		font-size: 11px;
		color: #ffb0a0;
		cursor: help;
	}
	.crowns {
		--s: 2.4px;
		display: flex;
		align-items: center;
		gap: 3px;
		font-size: 16px;
		cursor: help;
	}
	.crowns img {
		width: 16px;
		height: 16px;
	}
	.state img {
		width: 18px;
		height: 18px;
		opacity: 0.85;
	}
	.ready .state img {
		opacity: 1;
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
		.crest {
			width: 26px;
			height: 26px;
		}
		.crest .piece {
			width: 20px;
			height: 20px;
		}
		.name {
			font-size: 12px;
		}
		.stats {
			display: none;
		}
	}
	@media (max-width: 520px) {
		.name,
		.state {
			display: none;
		}
	}
</style>
