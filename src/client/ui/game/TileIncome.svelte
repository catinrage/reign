<script lang="ts">
	import { CHARACTER_INFO } from '../../../shared/rules/characters';
	import { RESOURCE_LABEL, pips } from '../../../shared/rules/config';
	import { rollLights, tileIncome, type TileIncome } from '../../../shared/rules/income';
	import { harborsOf } from '../../../shared/rules/queries';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { TERRAIN_NAME } from '../extended/terrainColors';
	import { harborTip } from '../helpers';
	import { PIXEL } from '../pixel';
	import { ui } from './ui.svelte';
	import { t } from '../../i18n/index.svelte';

	/**
	 * Your tiles down the left side, one row per number: what each roll pays you, tile by tile, so
	 * you can tell at a glance which numbers you want. Counted the way the engine pays (cities 2,
	 * workshops 1 more), and a tile under the robber shows greyed out with him on it.
	 */
	const view = $derived(client.view!);
	const icons = getIcons().urls;
	const me = $derived(view.me);
	const shepherd = $derived(view.players[me]?.character === 'shepherd');

	interface Row {
		number: number;
		tiles: (TileIncome & { tip: string })[];
	}
	const rows = $derived.by(() => {
		const out: Row[] = [];
		for (const tile of tileIncome(view, me)) {
			let row = out.find((r) => r.number === tile.number);
			if (!row) out.push((row = { number: tile.number, tiles: [] }));
			row.tiles.push({ ...tile, tip: tipFor(tile) });
		}
		return out;
	});

	function tipFor(tile: TileIncome): string {
		const terrain = t(TERRAIN_NAME[view.board.hexes[tile.hex].terrain]);
		const from = [
			tile.settlements &&
				t('{n, plural, one {# settlement} other {# settlements}}', { n: tile.settlements }),
			tile.cities && t('{n, plural, one {# city} other {# cities}}', { n: tile.cities }),
			tile.workshop && t('your workshop')
		].filter((x): x is string => !!x);
		const sources = from.reduce((list, next) => t('{list}, {next}', { list, next }));
		const pays = t('{amount} {resource} from {sources}.', {
			amount: tile.amount,
			resource: t(RESOURCE_LABEL[tile.resource]),
			sources
		});
		return tile.robbed
			? t(
					'{terrain} {number}: the robber sits here, so it pays nothing until he moves. Free, it would pay {pays}',
					{
						terrain,
						number: tile.number,
						pays
					}
				)
			: t('{terrain} {number}: {pays}', { terrain, number: tile.number, pays });
	}

	// Under the tiles, the harbors you trade at: the resource each takes and its rate.
	const harbors = $derived(
		harborsOf(view, me).map((port) => {
			const kind = view.board.ports[port].kind;
			const tip = harborTip(view, port);
			return { port, kind, ratio: kind === 'any' ? 3 : 2, head: tip?.head ?? '', text: tip?.text ?? '' };
		})
	);
	const storm = $derived(view.events?.current === 'stormAtSea');

	// Once the dice land, the tiles the roll paid you light up gold, and the ones it would have but
	// for the robber (or the Witch's Hex, or a bank run dry) light up red, until the next roll.
	const roll = $derived(client.tossing ? null : client.lastRoll);
	const lights = $derived(roll ? rollLights(view, me, roll.seq) : null);
	function rowLight(r: Row) {
		const lit = r.tiles.map((tile) => lights?.tiles.get(tile.hex));
		return lit.includes('paid') ? 'paid' : lit.includes('blocked') ? 'blocked' : null;
	}

	// Open on wide screens, folded on phones, until the player says otherwise.
	const KEY = 'reign:tilesOpen';
	function saved(): boolean | null {
		try {
			const v = localStorage.getItem(KEY);
			return v === null ? null : v === '1';
		} catch {
			return null;
		}
	}
	let open = $state(saved() ?? (typeof window === 'undefined' || window.innerWidth > 900));
	function toggle() {
		open = !open;
		try {
			localStorage.setItem(KEY, open ? '1' : '0');
		} catch {
			/* private mode: keep it for this visit */
		}
	}
</script>

{#if rows.length || shepherd || harbors.length}
	<div
		class="tiles panel"
		class:closed={!open}
		class:cheats={client.cheats}
		class:log-closed={!ui.logOpen}
	>
		<button class="head" onclick={toggle} aria-expanded={open} title={t('What each roll pays you')}>
			<img class="icon-px" src={PIXEL.die} alt="" />
			<span class="title">{t('Your tiles')}</span>
			<span class="chev" class:open>▸</span>
		</button>
		{#if open}
			<div class="rows">
				{#each rows as r (r.number)}
					{@const light = rowLight(r)}
					<div
						class="row"
						class:hit={light === 'paid'}
						class:stopped={light === 'blocked'}
						class:dead={r.tiles.every((tile) => tile.robbed)}
					>
						{#if light}{#key roll?.seq}<span class="glow"></span>{/key}{/if}
						<span class="token" class:red={r.number === 6 || r.number === 8}>
							<b>{r.number}</b>
							<span class="pips"
								>{#each { length: pips(r.number) } as _, k (k)}<i></i>{/each}</span
							>
						</span>
						<span class="pays">
							{#each r.tiles as tile (tile.hex)}
								{@const lit = lights?.tiles.get(tile.hex)}
								<span
									class="chip"
									class:robbed={tile.robbed}
									class:paid={lit === 'paid'}
									class:blocked={lit === 'blocked'}
									title={tile.tip}
								>
									<span class="art" style="--pat: var(--pat-{tile.resource})"
										><img src={icons[tile.resource]} alt={t(RESOURCE_LABEL[tile.resource])} /></span
									>
									{#if tile.robbed}<img
											class="robber"
											src={PIXEL.robber}
											alt={t('robber')}
										/>{:else}<b>{tile.amount}</b>{/if}
								</span>
							{/each}
						</span>
					</div>
				{/each}
				{#if shepherd}
					{@const light = lights?.shepherd}
					<div class="row" class:hit={light === 'paid'} class:stopped={light === 'blocked'}>
						{#if light}{#key roll?.seq}<span class="glow"></span>{/key}{/if}
						<span class="token seven"
							><b>7</b><span class="pips"
								>{#each { length: 6 } as _, k (k)}<i></i>{/each}</span
							></span
						>
						<span class="pays">
							<span
								class="chip"
								class:paid={light === 'paid'}
								class:blocked={light === 'blocked'}
								title={t('{name} {title}: {text}', {
									name: t(CHARACTER_INFO.shepherd.name),
									title: t(CHARACTER_INFO.shepherd.title),
									text: t(CHARACTER_INFO.shepherd.text)
								})}
							>
								<span class="art" style="--pat: var(--pat-sheep)"
									><img src={icons.sheep} alt={t(RESOURCE_LABEL.sheep)} /></span
								>
								<b>1</b>
							</span>
						</span>
					</div>
				{/if}
				{#if harbors.length}
					<div class="sub">{t('Your harbors')}</div>
					<div class="row harbors" class:dead={storm}>
						<span class="token anchor"><img src={PIXEL.anchor} alt="" /></span>
						<span class="pays">
							{#each harbors as h (h.port)}
								<span class="chip" title={h.text} data-tip-head={h.head}>
									{#if h.kind === 'any'}
										<span class="art any"><img src={PIXEL.trade} alt={h.head} /></span>
									{:else}
										<span class="art" style="--pat: var(--pat-{h.kind})"
											><img src={icons[h.kind]} alt={h.head} /></span
										>
									{/if}
									<b class="rate">{h.ratio}:1</b>
								</span>
							{/each}
						</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/*
	 * Under the corner buttons (and the cheat button when there is one), above the chronicle.
	 * The open chronicle reaches about 320px up from the bottom, the folded one about 60px.
	 */
	.tiles {
		--top: calc(14px + var(--s) * 16 + 12px);
		--below: 334px;
		position: absolute;
		left: 14px;
		top: var(--top);
		z-index: 4;
		width: max-content;
		min-width: 172px;
		max-width: 300px;
		max-height: calc(100% - var(--top) - var(--below));
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 2px 4px 4px;
		animation: fade-in 0.4s;
	}
	.tiles.cheats {
		--top: calc(14px + var(--s) * 32 + 20px);
	}
	.tiles.log-closed {
		--below: 76px;
	}
	.closed {
		min-width: 0;
	}
	.head {
		all: unset;
		pointer-events: auto;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 4px;
	}
	.head img {
		width: 22px;
		height: 22px;
	}
	.head .title {
		flex: 1;
		font-size: 16px;
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.7);
	}
	.chev {
		color: var(--muted);
		transition: transform 0.2s;
		font-size: 14px;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.rows {
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 3px;
		/* Room for a lit tile's glow, which the scrolling box would clip at its edge. */
		padding: 6px;
		margin: -6px;
		scrollbar-width: thin;
		scrollbar-color: #7a4a2c transparent;
		pointer-events: auto;
	}
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 6px 3px 4px;
		background: rgba(20, 9, 4, 0.38);
		box-shadow: inset 0 0 0 1px rgba(255, 220, 160, 0.08);
	}
	.row.hit {
		background: rgba(255, 196, 70, 0.22);
		box-shadow: inset 0 0 0 2px rgba(255, 212, 90, 0.75);
	}
	.row.stopped {
		background: rgba(200, 40, 28, 0.24);
		box-shadow: inset 0 0 0 2px rgba(240, 70, 50, 0.8);
	}
	.glow {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: rgba(255, 226, 140, 0.55);
		animation: flash 1.1s ease-out forwards;
	}
	.stopped .glow {
		background: rgba(255, 90, 70, 0.5);
	}
	@keyframes flash {
		to {
			opacity: 0;
		}
	}
	.row.dead .token {
		filter: grayscale(0.8) brightness(0.75);
	}

	/* A number token like the ones on the tiles: parchment disc, red 6 and 8, a dot per chance. */
	.token {
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: radial-gradient(circle at 40% 35%, #fff3d6 0%, #f6deaf 60%, #e6c48c 100%);
		box-shadow:
			0 0 0 2px #2b1a10,
			0 3px 0 2px #1a0c05;
		color: #3a2416;
	}
	.token b {
		/* The body face: the pixel one's 2 and 3 read as an 8 this small. */
		font-family: var(--body);
		font-weight: 900;
		font-size: 17px;
		line-height: 1;
	}
	.token.red,
	.token.seven {
		color: #c7261b;
	}
	.pips {
		display: flex;
		gap: 1px;
		margin-top: 2px;
	}
	.pips i {
		width: 3px;
		height: 3px;
		background: currentColor;
	}
	.pays {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		min-width: 0;
	}
	.chip {
		position: relative;
		display: inline-flex;
		align-items: center;
	}
	/* The resource on its card pattern, a little square of the cards in your hand. */
	.art {
		position: relative;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		background: var(--pat) 0 0 / 16px 16px repeat;
		box-shadow:
			0 0 0 2px #2b1a10,
			inset 0 2px 0 rgba(255, 255, 255, 0.22),
			inset 0 -3px 0 rgba(0, 0, 0, 0.22),
			0 3px 0 2px rgba(0, 0, 0, 0.35);
		overflow: hidden;
	}
	.art img {
		width: 130%;
		max-width: none;
		margin: -15%;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.3));
	}
	.chip b {
		margin-left: 4px;
		font-family: var(--body);
		font-weight: 900;
		font-size: 15px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.chip b::before {
		content: '×';
		font-size: 12px;
		margin-right: 1px;
	}
	.chip.robbed .art {
		filter: grayscale(1) brightness(0.55);
	}
	/* The roll's tiles light up: gold for the ones that paid you, red for the ones stopped. */
	.chip.paid .art,
	.chip.blocked .art {
		z-index: 1;
		animation: lit-pop 0.45s ease-out;
	}
	.chip.paid .art {
		box-shadow:
			0 0 0 2px #ffe07a,
			0 0 0 4px #2b1a10,
			0 0 14px 6px rgba(255, 196, 60, 0.95),
			inset 0 2px 0 rgba(255, 255, 255, 0.4);
	}
	.chip.paid .art img {
		filter: brightness(1.25) saturate(1.2) drop-shadow(0 2px 0 rgba(0, 0, 0, 0.3));
	}
	.chip.blocked .art {
		filter: none;
		box-shadow:
			0 0 0 2px #ff5a42,
			0 0 0 4px #2b1a10,
			0 0 14px 6px rgba(255, 40, 20, 0.9);
	}
	.chip.blocked .art img {
		filter: grayscale(1) brightness(0.7);
	}
	.chip.blocked .art::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(230, 30, 20, 0.45);
	}
	.chip.paid b {
		color: #ffe27a;
	}
	.chip.blocked b {
		color: #ff8a7a;
	}
	.row.hit .token {
		box-shadow:
			0 0 0 2px #ffe07a,
			0 3px 0 2px #1a0c05,
			0 0 12px 4px rgba(255, 196, 60, 0.8);
	}
	.row.dead.stopped .token {
		filter: none;
	}
	.row.stopped .token {
		box-shadow:
			0 0 0 2px #ff5a42,
			0 3px 0 2px #1a0c05,
			0 0 12px 4px rgba(255, 40, 20, 0.75);
	}
	@keyframes lit-pop {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.22);
		}
		100% {
			transform: scale(1);
		}
	}
	/* The harbors you trade at, under your tiles. */
	.sub {
		margin-top: 4px;
		padding: 0 4px;
		font-size: 14px;
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.7);
	}
	.token.anchor img {
		width: 18px;
		height: auto;
		image-rendering: pixelated;
	}
	.art.any {
		background: radial-gradient(circle at 40% 35%, #fff3d6 0%, #f6deaf 60%, #e6c48c 100%);
	}
	.art.any img {
		width: 70%;
		margin: 0;
		image-rendering: pixelated;
	}
	.chip b.rate::before {
		content: none;
	}
	.row.harbors.dead .art {
		filter: grayscale(1) brightness(0.6);
	}
	.robber {
		width: 18px;
		height: auto;
		margin-left: 5px;
		image-rendering: pixelated;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.6));
	}

	/* Phones: under the corner buttons, which stand in a column here, and folded until opened. */
	@media (max-width: 900px) {
		.tiles {
			--top: calc(104px + var(--clock-h, 0px) + var(--s) * 80 + 36px);
			--below: 290px;
			left: 6px;
			min-width: 150px;
			max-width: calc(100vw / var(--ui-zoom) - 12px);
		}
		.tiles.log-closed {
			--below: 290px;
		}
		.head .title {
			font-size: 14px;
		}
		.token {
			width: 30px;
			height: 30px;
		}
		.token b {
			font-size: 14px;
		}
		.art {
			width: 24px;
			height: 24px;
		}
		.chip b {
			font-size: 13px;
		}
	}
	@media (max-width: 700px) {
		.tiles.cheats {
			--top: calc(104px + var(--clock-h, 0px) + var(--s) * 96 + 42px);
		}
	}
</style>
