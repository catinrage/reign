<script lang="ts">
	import { BUILDING_INFO, EXTRA_BUILDINGS, isExtraBuilding } from '../../../shared/rules/buildings';
	import type { BuildKind } from '../../../shared/rules/config';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { costOf } from '../../../shared/rules/queries';
	import { buildAvailable, buildNote, countsList, extraStock, myTurn } from '../helpers';
	import { PIXEL } from '../pixel';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	const mine = $derived(myTurn(view));
	const color = $derived(view.players[view.me]?.color ?? 'white');
	const left = $derived(view.players[view.me]?.piecesLeft);
	const icons = getIcons().urls;

	type Build = { kind: BuildKind; label: string };
	const builds: Build[] = [
		{ kind: 'road', label: 'Road' },
		{ kind: 'settlement', label: 'Settlement' },
		{ kind: 'city', label: 'City' },
		{ kind: 'devCard', label: 'Dev card' }
	];
	/** Reign Extended buildings the host put in this game. */
	const reign = $derived<Build[]>(
		EXTRA_BUILDINGS.filter((b) => view.buildingRules?.[b]).map((b) => ({ kind: b, label: BUILDING_INFO[b].label }))
	);
	/** Phones fit five plaques to a row; past that they take two rows. */
	const cols = $derived.by(() => {
		const n = builds.length + reign.length;
		return n <= 5 ? n : Math.ceil(n / 2);
	});

	function onBuild(kind: BuildKind) {
		if (kind === 'devCard') return client.act({ type: 'buyDevCard' });
		ui.build = ui.build === kind ? null : kind;
	}
	function iconFor(kind: BuildKind) {
		return kind === 'devCard' ? PIXEL.dev : icons[`${kind}:${color}`];
	}
	function stock(kind: BuildKind) {
		if (kind === 'devCard') return view.devDeckCount;
		if (isExtraBuilding(kind)) return extraStock(view, kind);
		return left?.[kind] ?? 0;
	}
</script>

{#snippet plaque(b: Build)}
	{@const ok = buildAvailable(view, b.kind)}
	{@const info = isExtraBuilding(b.kind) ? BUILDING_INFO[b.kind] : null}
	{@const extra = !!info}
	<!-- Reign buildings are new to most players, so they explain themselves and why they can't
	     be built yet (aria-disabled keeps that tooltip working, on phones too). -->
	<button
		class="build plaque"
		class:active={ui.build === b.kind}
		disabled={!ok && !extra}
		aria-disabled={extra ? !ok : undefined}
		title={info?.text}
		data-tip-head={extra ? b.label : undefined}
		data-tip-note={extra && !ok ? buildNote(view, b.kind) : undefined}
		onclick={() => ok && onBuild(b.kind)}
	>
		<img class="piece" class:icon-px={b.kind === 'devCard'} src={iconFor(b.kind)} alt="" />
		<span class="bname title"
			>{b.label}<small title={extra ? undefined : 'Left to build'}>{stock(b.kind)}</small></span
		>
		<span class="cost">
			{#each countsList(costOf(view, view.me, b.kind)) as c (c.res)}
				{#each Array(c.n) as _, k (k)}<img class="res" src={icons[c.res]} alt={c.res} />{/each}
			{/each}
		</span>
	</button>
{/snippet}

{#if view.me >= 0 && view.phase !== 'ended'}
	<div class="actions">
		{#if mine && view.step === 'roll' && !client.rollAsked && !client.tossing}
			<button class="btn big shine roll" onclick={() => client.act({ type: 'rollDice' })}>
				<img src={PIXEL.die} alt="" /> Roll dice
			</button>
		{/if}
		{#if mine && view.step === 'main'}
			{#if !ui.trade}
				<div class="builds panel" style:--cols={cols}>
					{#each builds as b (b.kind)}{@render plaque(b)}{/each}
					{#if reign.length}
						<div class="sep"><i></i><span>Reign</span><i></i></div>
						{#each reign as b (b.kind)}{@render plaque(b)}{/each}
					{/if}
				</div>
			{/if}
			<div class="row">
				<button class="btn wood" class:on={ui.trade} onclick={() => (ui.trade = !ui.trade)}>
					<img class="icon-px" src={PIXEL.trade} alt="" /> Trade
				</button>
				<button
					class="btn red"
					onclick={() => {
						ui.build = null;
						ui.trade = false;
						client.act({ type: 'endTurn' });
					}}><img class="icon-px" src={PIXEL.hourglass} alt="" /> End turn</button
				>
			</div>
		{/if}
	</div>
{/if}

<style>
	.actions {
		position: absolute;
		right: 12px;
		bottom: 12px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
		pointer-events: none;
	}
	.roll {
		font-size: 26px;
		gap: 12px;
		padding: 0 calc(var(--s) * 6);
		animation: bob 1.4s ease-in-out infinite;
	}
	.roll img {
		height: calc(var(--s) * 10);
	}
	.builds {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		padding: 4px;
	}
	.build {
		pointer-events: auto;
		position: relative;
		display: grid;
		grid-template-columns: 42px 1fr;
		grid-template-rows: auto auto;
		align-items: center;
		column-gap: 8px;
		row-gap: 2px;
		padding: 2px 8px 2px 2px;
		background: none;
		color: var(--text);
		cursor: pointer;
		text-align: left;
		min-width: 158px;
		transition:
			transform 0.12s,
			filter 0.15s;
	}
	.build:hover:not(:disabled) {
		transform: translateY(-2px);
		filter: brightness(1.18);
	}
	.build.active {
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 4px #ffd45a) brightness(1.2);
		animation: bob 1.4s ease-in-out infinite;
	}
	.build:disabled,
	.build[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.6;
		filter: grayscale(0.55);
	}
	.build[aria-disabled='true']:hover {
		transform: none;
	}
	/* The Reign buildings sit under a small heading of their own. */
	.sep {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 1px 2px -1px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.7);
	}
	.sep i {
		flex: 1;
		height: 2px;
		background: linear-gradient(90deg, transparent, rgba(255, 212, 90, 0.55), transparent);
	}
	.piece {
		grid-row: 1 / 3;
		width: 42px;
		height: 42px;
		object-fit: contain;
		filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
	}
	.bname {
		font-size: 15px;
		display: flex;
		align-items: baseline;
		gap: 6px;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.bname small {
		font-size: 11px;
		color: var(--muted);
		margin-left: auto;
	}
	.cost {
		display: flex;
		gap: 1px;
	}
	.cost .res {
		width: 19px;
		height: 19px;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.6));
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.row .btn {
		gap: 8px;
	}
	.row .btn img {
		height: calc(var(--s) * 7);
	}
	.btn.wood.on {
		filter: brightness(1.25) drop-shadow(0 0 4px rgba(255, 210, 90, 0.8));
	}
	@media (max-width: 900px) {
		.actions {
			right: 6px;
			bottom: 6px;
			left: 6px;
			align-items: stretch;
		}
		.roll {
			align-self: flex-end;
			font-size: 21px;
		}
		.builds {
			grid-template-columns: repeat(var(--cols, 4), 1fr);
			padding: 2px;
			gap: 3px;
		}
		/* No room for a heading: the Reign buildings join the others. */
		.sep {
			display: none;
		}
		.build {
			min-width: 0;
			grid-template-columns: 1fr;
			justify-items: center;
			padding: 0 2px;
		}
		.piece {
			grid-row: auto;
			width: 30px;
			height: 30px;
		}
		.bname {
			font-size: 11px;
		}
		.bname small {
			display: none;
		}
		.cost .res {
			width: 12px;
			height: 12px;
		}
		.row {
			justify-content: flex-end;
		}
	}
</style>
