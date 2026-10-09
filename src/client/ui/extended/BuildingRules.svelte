<script lang="ts">
	import {
		BUILDING_INFO,
		EXTRA_BUILDINGS,
		cleanBuildingRules,
		type ExtraBuilding
	} from '../../../shared/rules/buildings';
	import { COSTS } from '../../../shared/rules/config';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { countsList } from '../helpers';
	import Modal from '../menu/Modal.svelte';

	/**
	 * The Reign Extended buildings in the lobby: a plaque that says which are in the game, and a
	 * panel where the host switches each one on or off (everyone else can read what they do).
	 */

	const lobby = $derived(client.lobby!);
	const rules = $derived(cleanBuildingRules(lobby.settings.buildings));
	const on = $derived(EXTRA_BUILDINGS.filter((b) => rules[b]));
	const color = $derived(lobby.seats.find((s) => s.id === client.seat)?.color ?? 'red');
	const icons = getIcons().urls;
	let open = $state(false);

	const summary = $derived(
		on.length === EXTRA_BUILDINGS.length ? 'All in play' : on.length ? `${on.length} of ${EXTRA_BUILDINGS.length} in play` : 'None'
	);
	const names = $derived(on.length ? on.map((b) => BUILDING_INFO[b].name).join(', ') : 'Only settlements and cities.');

	function set(b: ExtraBuilding, value: boolean) {
		if (rules[b] !== value) client.send({ t: 'setBuilding', building: b, on: value });
	}
</script>

<button class="pick plaque" title={client.isHost ? 'Choose buildings' : 'See what they do'} onclick={() => (open = true)}>
	<span class="face well"><img src={icons[`${on[0] ?? EXTRA_BUILDINGS[0]}:${color}`]} alt="" class:dim={!on.length} /></span>
	<span class="pick-body">
		<span class="label">Buildings</span>
		<span class="pick-name title">{summary}</span>
		<span class="trait">{names}</span>
		<span class="change">{client.isHost ? 'Choose buildings' : 'See what they do'}</span>
	</span>
</button>

{#if open}
	<Modal title="Reign buildings" width={560} onclose={() => (open = false)}>
		<p>
			{client.isHost
				? 'New buildings to play with besides settlements and cities. Bots build them too.'
				: 'New buildings besides settlements and cities. The host picks which are in play.'}
		</p>
		<div class="list">
			{#each EXTRA_BUILDINGS as b (b)}
				<div class="row plaque" class:off={!rules[b]}>
					<img class="icon" src={icons[`${b}:${color}`]} alt="" />
					<div class="body">
						<span class="name title">{BUILDING_INFO[b].name}</span>
						<span class="text">{BUILDING_INFO[b].text}</span>
						<span class="cost">
							{#each countsList(COSTS[b]) as c (c.res)}
								{#each Array(c.n) as _, k (k)}<img src={icons[c.res]} alt={c.res} />{/each}
							{/each}
						</span>
					</div>
					{#if client.isHost}
						<div class="seg" role="radiogroup" aria-label={BUILDING_INFO[b].name}>
							<button class="btn small" class:on={rules[b]} role="radio" aria-checked={rules[b]} onclick={() => set(b, true)}>On</button>
							<button class="btn small" class:on={!rules[b]} role="radio" aria-checked={!rules[b]} onclick={() => set(b, false)}>Off</button>
						</div>
					{:else}
						<span class="state title">{rules[b] ? 'On' : 'Off'}</span>
					{/if}
				</div>
			{/each}
		</div>
	</Modal>
{/if}

<style>
	.pick {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.pick:hover {
		transform: translateY(-2px);
	}
	.face {
		display: grid;
		place-items: center;
		flex: none;
		width: 78px;
		height: 70px;
		background: radial-gradient(ellipse, #6c9a3c, #3e6424);
		background-clip: padding-box;
	}
	.face img {
		width: 64px;
		height: 64px;
		object-fit: contain;
		filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
	}
	.face img.dim {
		filter: grayscale(1) brightness(0.7);
	}
	.pick-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.pick-name {
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.trait {
		font-size: 13px;
		line-height: 1.3;
		color: #f1dfc2;
	}
	.change {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: var(--gold);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 10px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		transition: filter 0.15s;
	}
	.row.off {
		filter: grayscale(0.6) brightness(0.85);
	}
	.icon {
		flex: none;
		width: 60px;
		height: 60px;
		object-fit: contain;
		filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
	}
	.body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.name {
		font-size: 17px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.text {
		font-size: 13px;
		line-height: 1.3;
		color: #f1dfc2;
	}
	.cost {
		display: flex;
		gap: 1px;
	}
	.cost img {
		width: 20px;
		height: 20px;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.6));
	}
	.state {
		font-size: 16px;
		color: var(--gold);
	}
	.row.off .state {
		color: var(--muted);
	}
	@media (max-width: 520px) {
		.row {
			flex-wrap: wrap;
		}
		.icon {
			width: 46px;
			height: 46px;
		}
		.seg {
			margin-left: auto;
		}
	}
</style>
