<script lang="ts">
	import {
		BUILDING_INFO,
		CITY_PATHS,
		EXTRA_BUILDINGS,
		WORKSHOP_REFUND,
		isCityPath,
		isExtraBuilding
	} from '../../../shared/rules/buildings';
	import type { BuildKind } from '../../../shared/rules/config';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { POWER_INFO } from '../../../shared/rules/characters';
	import { costOf, ownWorkshops, powerReady } from '../../../shared/rules/queries';
	import { buildAvailable, buildNote, countsList, extraStock, myTurn, openCities, pathAvailable, pathNote } from '../helpers';
	import { PIXEL } from '../pixel';
	import { ui } from './ui.svelte';
	import { RESOURCE_LABEL } from '../../../shared/rules/config';
	import { msg, t } from '../../i18n/index.svelte';
	import { AUTO_ROLL_MS, autoRoll } from './autoRoll.svelte';

	const view = $derived(client.view!);
	const mine = $derived(myTurn(view));
	const color = $derived(view.players[view.me]?.color ?? 'white');
	const left = $derived(view.players[view.me]?.piecesLeft);
	const icons = getIcons().urls;

	type Build = { kind: BuildKind; label: string };
	const builds: Build[] = [
		{ kind: 'road', label: msg('Road') },
		{ kind: 'settlement', label: msg('Settlement') },
		{ kind: 'city', label: msg('City') },
		{ kind: 'devCard', label: msg('Dev card') }
	];
	const extra = (b: (typeof EXTRA_BUILDINGS)[number]): Build => ({ kind: b, label: BUILDING_INFO[b].label });
	/** Reign Extended buildings the host put in this game (the city paths have a menu of their own). */
	const reign = $derived<Build[]>(EXTRA_BUILDINGS.filter((b) => view.buildingRules?.[b] && !isCityPath(b)).map(extra));
	/** The city paths in this game: one plaque opens them. */
	const paths = $derived<Build[]>(CITY_PATHS.filter((b) => view.buildingRules?.[b]).map(extra));
	/** Your workshops, any of which you can tear down to build it somewhere better. */
	const owned = $derived(ownWorkshops(view, view.me));
	/** Phones fit five plaques to a row; past that they take two rows. */
	const cols = $derived.by(() => {
		const n = ui.paths ? paths.length + 1 : builds.length + reign.length + (paths.length ? 1 : 0) + (owned.length ? 1 : 0);
		return n <= 5 ? n : Math.ceil(n / 2);
	});

	function onBuild(kind: BuildKind) {
		if (kind === 'devCard') return client.act({ type: 'buyDevCard' });
		ui.power = null;
		ui.build = ui.build === kind ? null : kind;
	}
	/** The city paths take the panel over, each with its price and what it does, and Back. */
	function openPaths() {
		ui.power = null;
		ui.build = null;
		ui.paths = true;
	}
	function closePaths() {
		if (isCityPath(ui.build)) ui.build = null;
		ui.paths = false;
	}

	/** My character's power, when it can be used right now (before or after the roll, as it says). */
	const power = $derived.by(() => {
		const ch = view.players[view.me]?.character;
		if (!mine || !ch || client.tossing || !powerReady(view, view.me)) return null;
		const info = POWER_INFO[ch];
		const now = view.step === 'roll' ? info.when !== 'main' : view.step === 'main' ? info.when !== 'roll' : false;
		return now ? info : null;
	});
	const canRoll = $derived(
		mine && view.step === 'roll' && !client.rollAsked && !client.tossing && !client.presenting
	);
	/**
	 * With auto roll on, the Roll dice button rolls by itself once it has been up a moment. Using a
	 * power holds it, and a Knight takes the turn off the roll until the robber has moved, so either
	 * starts the wait over. A paused game doesn't roll.
	 */
	const autoRolling = $derived(autoRoll.on && canRoll && !ui.power && !client.lobby?.paused);
	$effect(() => {
		if (!autoRolling) return;
		const timer = setTimeout(() => client.act({ type: 'rollDice' }), AUTO_ROLL_MS);
		return () => clearTimeout(timer);
	});

	function onPower() {
		ui.build = null;
		ui.trade = false;
		ui.power = ui.power ? null : { stage: 'dialog' };
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
		data-kind={b.kind}
		disabled={!ok && !extra}
		aria-disabled={extra ? !ok : undefined}
		title={info ? t(info.text) : undefined}
		data-tip-head={extra ? t(b.label) : undefined}
		data-tip-note={extra && !ok ? buildNote(view, b.kind) : undefined}
		onclick={() => ok && onBuild(b.kind)}
	>
		<img class="piece" class:icon-px={b.kind === 'devCard'} src={iconFor(b.kind)} alt="" />
		<span class="bname title"
			>{t(b.label)}<small title={extra ? undefined : t('Left to build')}>{stock(b.kind)}</small></span
		>
		<span class="cost">
			{#each countsList(costOf(view, view.me, b.kind)) as c (c.res)}
				{#each Array(c.n) as _, k (k)}<img class="res" src={icons[c.res]} alt={t(RESOURCE_LABEL[c.res])} />{/each}
			{/each}
		</span>
	</button>
{/snippet}

{#snippet cityPath()}
	{@const ok = pathAvailable(view)}
	<!-- Opens the paths even when none can be taken yet: each says its price and why not. -->
	<button
		class="build plaque"
		class:dim={!ok}
		title={t(
			'Take one of your cities down a path, for good: a castle worth 3 points, a guild hall that trades the goods you name at 2:1, or a fortress where your knights count double.'
		)}
		data-tip-head={t('City path')}
		data-tip-note={ok ? undefined : pathNote(view)}
		onclick={openPaths}
	>
		<span class="piece grown"
			><img src={icons[`city:${color}`]} alt="" /><img class="icon-px arrow" src={PIXEL.grow} alt="" /></span
		>
		<span class="bname title">{t('City path')}<small title={t('Your cities without a path')}>{openCities(view)}</small></span>
		<span class="cost">
			{#each paths as p (p.kind)}<img class="res" src={icons[`${p.kind}:${color}`]} alt={t(p.label)} />{/each}
		</span>
	</button>
{/snippet}

{#snippet back()}
	<button class="build plaque" title={t('Back to the other builds')} onclick={closePaths}>
		<span class="piece"><img class="icon-px return" src={PIXEL.play} alt="" /></span>
		<span class="bname title">{t('Back')}</span>
		<span class="cost hint">{t('Other builds')}</span>
	</button>
{/snippet}

{#snippet tearDown()}
	<button
		class="build plaque"
		class:active={ui.build === 'tearDown'}
		title={t('Tear down one of your workshops to build it somewhere better. The bank gives you back a Lumber.')}
		data-tip-head={t('Tear down')}
		onclick={() => (ui.build = ui.build === 'tearDown' ? null : 'tearDown')}
	>
		<span class="piece torn"><img src={icons[`workshop:${color}`]} alt="" /><img class="icon-px hammer" src={PIXEL.hammer} alt="" /></span>
		<span class="bname title">{t('Tear down')}<small title={t('Your workshops')}>{owned.length}</small></span>
		<span class="cost back"
			><b>+</b>{#each countsList(WORKSHOP_REFUND) as c (c.res)}
				{#each Array(c.n) as _, k (k)}<img class="res" src={icons[c.res]} alt={t(RESOURCE_LABEL[c.res])} />{/each}
			{/each}</span
		>
	</button>
{/snippet}

{#if view.me >= 0 && view.phase !== 'ended'}
	<div class="actions">
		{#if power && !client.presenting}
			<button class="btn purple power" class:on={!!ui.power} title={t(power.text)} data-tip-head={t('Power: {power}', { power: t(power.name) })} onclick={onPower}>
				<span class="gem"></span>{t(power.name)}
			</button>
		{/if}
		{#if canRoll}
			<button
				class="btn big shine roll"
				class:auto={autoRolling}
				style:--auto-ms="{AUTO_ROLL_MS}ms"
				title={autoRolling ? t('Auto roll is on: the dice roll by themselves in a moment.') : undefined}
				onclick={() => client.act({ type: 'rollDice' })}
			>
				<img src={PIXEL.die} alt="" /> {t('Roll dice')}
				{#if autoRolling}<span class="fuse" aria-hidden="true"></span>{/if}
			</button>
		{/if}
		{#if mine && view.step === 'main'}
			{#if !ui.trade}
				<div class="builds panel" style:--cols={cols}>
					{#if ui.paths}
						<div class="sep keep"><i></i><span>{t('City paths')}</span><i></i></div>
						{#each paths as b (b.kind)}{@render plaque(b)}{/each}
						{@render back()}
					{:else}
						{#each builds as b (b.kind)}{@render plaque(b)}{/each}
						{#if reign.length || paths.length}
							<div class="sep"><i></i><span>Reign</span><i></i></div>
							{#each reign as b (b.kind)}{@render plaque(b)}{/each}
							{#if paths.length}{@render cityPath()}{/if}
							{#if owned.length}{@render tearDown()}{/if}
						{/if}
					{/if}
				</div>
			{/if}
			<div class="row">
				<button class="btn wood" class:on={ui.trade} onclick={() => (ui.trade = !ui.trade)}>
					<img class="icon-px" src={PIXEL.trade} alt="" /> {t('Trade')}
				</button>
				<button
					class="btn red"
					onclick={() => {
						ui.build = null;
						ui.paths = false;
						ui.trade = false;
						client.act({ type: 'endTurn' });
					}}><img class="icon-px" src={PIXEL.hourglass} alt="" /> {t('End turn')}</button
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
	.power {
		pointer-events: auto;
	}
	.power.on {
		filter: brightness(1.2);
	}
	.power .gem {
		width: 10px;
		height: 10px;
		transform: rotate(45deg);
		background: #efe6ff;
		box-shadow: 0 0 6px 2px rgba(220, 200, 255, 0.9);
		animation: gem 1.6s ease-in-out infinite;
	}
	@keyframes gem {
		50% {
			box-shadow: 0 0 2px 0 rgba(220, 200, 255, 0.5);
		}
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
	/* Auto roll: a fuse burns down along the button, and the dice roll when it runs out. */
	.fuse {
		position: absolute;
		left: 6%;
		right: 6%;
		bottom: calc(var(--s) * -2);
		height: calc(var(--s) * 2);
		background: linear-gradient(90deg, #ffd166, #ff8a3d);
		box-shadow:
			0 0 0 2px #2a1a10,
			0 0 6px rgba(255, 170, 60, 0.8);
		transform-origin: left;
		animation: fuse var(--auto-ms) linear both;
	}
	@keyframes fuse {
		to {
			transform: scaleX(0);
		}
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
	.build[aria-disabled='true'],
	.build.dim {
		cursor: not-allowed;
		opacity: 0.6;
		filter: grayscale(0.55);
	}
	/* The City path plaque opens its menu even when no path can be taken: each one says why. */
	.build.dim {
		cursor: pointer;
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
	/* Tear down: your workshop, faded, with a hammer over it; and what you get back. */
	.torn {
		position: relative;
		display: block;
	}
	.torn img:first-child {
		width: 100%;
		height: 100%;
		object-fit: contain;
		filter: saturate(0.55) brightness(0.8);
	}
	.torn .hammer {
		position: absolute;
		right: -2px;
		bottom: -1px;
		width: 22px;
		height: 22px;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.85));
	}
	.cost.back {
		align-items: center;
	}
	/* City path: your city with an arrow up out of it. */
	.grown {
		position: relative;
		display: block;
	}
	.grown img:first-child {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.grown .arrow {
		position: absolute;
		right: -1px;
		bottom: 0;
		width: 17px;
		height: 19px;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.85));
	}
	/* Back: an arrow pointing back to the builds. */
	.piece .return {
		display: block;
		width: 22px;
		height: 22px;
		margin: 10px auto;
		transform: scaleX(-1);
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.85));
	}
	.cost.hint {
		font-size: 12px;
		color: var(--muted);
	}
	.cost.back b {
		font-family: var(--px);
		font-size: 14px;
		line-height: 1;
		color: #a8e070;
		margin-right: 1px;
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.75);
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
		/* No room for a heading: the Reign buildings join the others. The city paths keep theirs. */
		.sep:not(.keep) {
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
		.torn .hammer {
			width: 15px;
			height: 15px;
		}
		.grown .arrow {
			width: 12px;
			height: 13px;
		}
		.piece .return {
			width: 16px;
			height: 16px;
			margin: 7px auto;
		}
		.cost.hint {
			display: none;
		}
		.cost.back b {
			font-size: 10px;
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
