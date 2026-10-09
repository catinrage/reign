<script lang="ts">
	import { CHARACTER_INFO } from '../../../shared/rules/characters';
	import { RESOURCE_LABEL, pips } from '../../../shared/rules/config';
	import { tileIncome, type TileIncome } from '../../../shared/rules/income';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { TERRAIN_NAME } from '../extended/terrainColors';
	import { PIXEL, svg } from '../pixel';
	import { ui } from './ui.svelte';

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
		for (const t of tileIncome(view, me)) {
			let row = out.find((r) => r.number === t.number);
			if (!row) out.push((row = { number: t.number, tiles: [] }));
			row.tiles.push({ ...t, tip: tipFor(t) });
		}
		return out;
	});

	function tipFor(t: TileIncome): string {
		const terrain = TERRAIN_NAME[view.board.hexes[t.hex].terrain];
		const from = [
			t.settlements && `${t.settlements} settlement${t.settlements > 1 ? 's' : ''}`,
			t.cities && `${t.cities} cit${t.cities > 1 ? 'ies' : 'y'}`,
			t.workshop && 'your workshop'
		].filter(Boolean);
		const pays = `${t.amount} ${RESOURCE_LABEL[t.resource]} from ${from.join(', ')}.`;
		return t.robbed
			? `${terrain} ${t.number}: the robber sits here, so it pays nothing until he moves. Free, it would pay ${pays}`
			: `${terrain} ${t.number}: ${pays}`;
	}

	// The number just rolled lights up once the dice have landed.
	const roll = $derived(client.tossing ? null : client.lastRoll);
	const rolled = $derived(roll ? roll.dice[0] + roll.dice[1] : 0);

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

	const ROBBER = svg(
		[
			'...kkk...',
			'..kgggk..',
			'.kgggggk.',
			'.kgkgkgk.',
			'..kgggk..',
			'.kgggggk.',
			'kgggggggk',
			'kgggggggk',
			'.kgggggk.',
			'kkkkkkkkk'
		],
		{ k: '#1a0f08', g: '#8d8f96' }
	);
</script>

{#if rows.length || shepherd}
	<div
		class="tiles panel"
		class:closed={!open}
		class:cheats={client.cheats}
		class:log-closed={!ui.logOpen}
	>
		<button class="head" onclick={toggle} aria-expanded={open} title="What each roll pays you">
			<img class="icon-px" src={PIXEL.die} alt="" />
			<span class="title">Your tiles</span>
			<span class="chev" class:open>▸</span>
		</button>
		{#if open}
			<div class="rows">
				{#each rows as r (r.number)}
					{@const hit = r.number === rolled}
					<div class="row" class:hit class:dead={r.tiles.every((t) => t.robbed)}>
						{#if hit}{#key roll?.seq}<span class="glow"></span>{/key}{/if}
						<span class="token" class:red={r.number === 6 || r.number === 8}>
							<b>{r.number}</b>
							<span class="pips"
								>{#each { length: pips(r.number) } as _, k (k)}<i></i>{/each}</span
							>
						</span>
						<span class="pays">
							{#each r.tiles as t (t.hex)}
								<span class="chip" class:robbed={t.robbed} title={t.tip}>
									<span class="art" style="--pat: var(--pat-{t.resource})"
										><img src={icons[t.resource]} alt={RESOURCE_LABEL[t.resource]} /></span
									>
									{#if t.robbed}<img class="robber" src={ROBBER} alt="robber" />{:else}<b
											>{t.amount}</b
										>{/if}
								</span>
							{/each}
						</span>
					</div>
				{/each}
				{#if shepherd}
					{@const hit = rolled === 7}
					<div class="row" class:hit>
						{#if hit}{#key roll?.seq}<span class="glow"></span>{/key}{/if}
						<span class="token seven"
							><b>7</b><span class="pips"
								>{#each { length: 6 } as _, k (k)}<i></i>{/each}</span
							></span
						>
						<span class="pays">
							<span
								class="chip"
								title="{CHARACTER_INFO.shepherd.name} {CHARACTER_INFO.shepherd
									.title}: {CHARACTER_INFO.shepherd.text}"
							>
								<span class="art" style="--pat: var(--pat-sheep)"
									><img src={icons.sheep} alt={RESOURCE_LABEL.sheep} /></span
								>
								<b>1</b>
							</span>
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
	.glow {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: rgba(255, 226, 140, 0.55);
		animation: flash 1.1s ease-out forwards;
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
			--top: calc(104px + var(--clock-h, 0px) + var(--s) * 48 + 20px);
			--below: 290px;
			left: 6px;
			min-width: 150px;
			max-width: calc(100vw - 12px);
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
			--top: calc(104px + var(--clock-h, 0px) + var(--s) * 64 + 30px);
		}
	}
</style>
