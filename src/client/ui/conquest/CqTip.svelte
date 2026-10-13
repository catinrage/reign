<script lang="ts">
	import { attackTargets, conquestMap, neighbors, regionTerritories } from '../../../shared/conquest/queries';
	import { t } from '../../i18n/index.svelte';
	import { SIGIL_OF, sigilUrl } from '../../scene/conquest/sigils';
	import { sceneRef } from '../sceneRef';
	import { settings } from '../settings.svelte';
	import { winChance } from './odds';
	import { cqPlay } from './play.svelte';
	import { cqColor, playerName, regionName, territoryName } from './text';

	/**
	 * What a territory is: its name, its region and what holding all of it brings, whose it is and
	 * how many armies stand on it, and where its sea lanes go. It follows the mouse, or opens over a
	 * territory tapped on a touch screen.
	 */
	const p = cqPlay;
	const v = $derived(p.view!);
	const map = $derived(conquestMap(v.settings));
	let mouse = $state({ x: 0, y: 0, touch: false });
	/** The mouse has rested a moment: the card shows (not while it sweeps across the map). */
	let rested = $state(false);
	let restTimer: ReturnType<typeof setTimeout> | undefined;
	function moved(e: PointerEvent) {
		mouse = { x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
		rested = false;
		clearTimeout(restTimer);
		restTimer = setTimeout(() => (rested = true), 260);
	}
	const tapped = $derived(p.info);
	/** Picking a target or a way to march: a short card, so it hides less of the map. */
	const compact = $derived((p.attacking || p.fortifying) && p.selected !== null);
	// A fight open or a note up says enough on its own.
	const quiet = $derived((p.attacking && p.target !== null) || p.occupying || !!p.note);
	const at = $derived(tapped ?? (mouse.touch || !rested || quiet ? null : p.hover));
	const spot = $derived.by(() => {
		if (at === null) return null;
		if (tapped !== null) {
			void p.view;
			const s = sceneRef.current?.conquest?.screenOf(tapped);
			return s ? { x: s.x / settings.hudSize, y: s.y / settings.hudSize } : null;
		}
		return { x: mouse.x / settings.hudSize, y: mouse.y / settings.hudSize };
	});
	const info = $derived.by(() => {
		if (at === null) return null;
		const def = map.territories[at];
		const owner = v.owner[at];
		const region = def.region;
		const members = regionTerritories(map)[region];
		const held = members.filter((x) => v.owner[x] === owner).length;
		const whole = members.every((x) => v.owner[x] === owner);
		const lanes = map.lanes
			.map(([a, b]) => {
				const i = map.territories.findIndex((x) => x.id === a);
				const j = map.territories.findIndex((x) => x.id === b);
				return i === at ? j : j === at ? i : -1;
			})
			.filter((x) => x >= 0);
		let hint = '';
		if (p.attacking && p.selected !== null && owner !== v.me && attackTargets(v, p.selected).includes(at))
			hint = t('{n}% to take it from {from}', { n: Math.round(winChance(v.armies[p.selected], v.armies[at]) * 100), from: territoryName(v, p.selected) });
		else if (p.placing && owner === v.me) hint = t('Click to place armies here');
		else if (p.attacking && owner === v.me && v.armies[at] >= 2 && attackTargets(v, at).length) hint = t('Click to attack from here');
		return {
			name: territoryName(v, at),
			region: regionName(v, region),
			regionColor: map.regions[region].color,
			bonus: map.regions[region].bonus,
			size: members.length,
			held,
			whole,
			owner,
			armies: v.armies[at],
			neighbors: neighbors(at, map).length,
			lanes,
			hint
		};
	});
</script>

<svelte:window onpointermove={moved} onpointerdown={moved} />

{#if info && spot && sceneRef.current?.conquest?.dragFrom == null}
	{@const flipX = tapped === null && spot.x > window.innerWidth / settings.hudSize - 290}
	{@const flipY = tapped === null && spot.y > window.innerHeight / settings.hudSize - 230}
	<div
		class="tip"
		class:tapped={tapped !== null}
		class:compact
		class:flip-x={flipX}
		class:flip-y={flipY}
		style:left="{spot.x}px"
		style:top="{spot.y}px"
		role="tooltip"
	>
		<div class="name">{info.name}</div>
		{#if compact}
			{#if info.owner >= 0}
				<div class="owner" style="--c:{cqColor(v, info.owner)}">
					<b>{playerName(v, info.owner)}</b>
					<span class="armies">{t('{n, plural, one {# army} other {# armies}}', { n: info.armies })}</span>
				</div>
			{/if}
			{#if info.hint}<div class="hint">{info.hint}</div>{/if}
		{:else}
		<div class="region">
			<i style="background:{info.regionColor}"></i>{info.region}
			<span class="bonus">{t('+{n} a turn to whoever holds all {size}', { n: info.bonus, size: info.size })}</span>
		</div>
		{#if info.owner >= 0}
			<div class="owner" style="--c:{cqColor(v, info.owner)}">
				<img src={sigilUrl(SIGIL_OF[v.players[info.owner].color], cqColor(v, info.owner), '#1a0c05', 32)} alt="" />
				<b>{playerName(v, info.owner)}</b>
				<span class="armies">{t('{n, plural, one {# army} other {# armies}}', { n: info.armies })}</span>
			</div>
			<div class="held">
				{info.whole
					? t('Holds all of {region}', { region: info.region })
					: t('Holds {held} of {size} in {region}', { held: info.held, size: info.size, region: info.region })}
			</div>
		{/if}
		{#if info.lanes.length}
			<div class="lanes">⛵ {t('Sea lane to {places}', { places: info.lanes.map((x) => territoryName(v, x)).join(', ') })}</div>
		{/if}
		{#if info.hint}<div class="hint">{info.hint}</div>{/if}
		{/if}
	</div>
{/if}

<style>
	.tip {
		position: absolute;
		z-index: 30;
		transform: translate(18px, 14px);
		min-width: 180px;
		max-width: 260px;
		padding: 7px 10px 8px;
		background: rgba(30, 16, 8, 0.94);
		border: 2px solid #c99a2e;
		box-shadow:
			0 0 0 2px #1a0c05,
			0 8px 16px rgba(0, 0, 0, 0.5);
		color: #fbeedb;
		font-size: 13px;
		pointer-events: none;
		animation: fade-in 0.15s;
	}
	.tip.tapped {
		transform: translate(-50%, calc(-100% - 34px));
	}
	.tip.flip-x {
		transform: translate(calc(-100% - 18px), 14px);
	}
	.tip.flip-y {
		transform: translate(18px, calc(-100% - 14px));
	}
	.tip.flip-x.flip-y {
		transform: translate(calc(-100% - 18px), calc(-100% - 14px));
	}
	.tip.compact {
		min-width: 0;
		padding: 5px 8px 6px;
	}
	.compact .name {
		font-size: 15px;
	}
	.name {
		font-family: var(--px);
		font-weight: 700;
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.region {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 6px;
		font-weight: 800;
		color: var(--muted);
	}
	.region i {
		width: 10px;
		height: 10px;
		box-shadow: 0 0 0 2px #1a0c05;
	}
	.bonus {
		flex-basis: 100%;
		font-weight: 700;
		font-size: 12px;
		color: var(--gold);
	}
	.owner {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 5px;
	}
	.owner img {
		width: 22px;
		height: 22px;
	}
	.owner b {
		color: var(--c);
		text-shadow:
			1px 0 0 #1a0c05,
			-1px 0 0 #1a0c05,
			0 1px 0 #1a0c05,
			0 -1px 0 #1a0c05;
	}
	.armies {
		margin-left: auto;
		font-weight: 800;
	}
	.held,
	.lanes {
		margin-top: 3px;
		font-size: 12px;
		color: #d8c3a2;
	}
	.hint {
		margin-top: 5px;
		padding-top: 4px;
		border-top: 1px solid rgba(201, 154, 46, 0.4);
		font-weight: 800;
		color: #ffe08a;
	}
</style>
