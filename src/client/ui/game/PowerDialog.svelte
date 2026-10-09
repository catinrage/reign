<script lang="ts">
	import { CHARACTER_INFO, MARKET_DAY_CARDS, POWER_INFO, TITHE_CAP } from '../../../shared/rules/characters';
	import {
		RESOURCE_LABEL,
		TERRAIN_RESOURCE,
		emptyResources,
		totalResources,
		type Resource,
		type Terrain
	} from '../../../shared/rules/config';
	import { rollIncome } from '../../../shared/rules/queries';
	import type { Action } from '../../../shared/rules/types';
	import { client } from '../../state/client.svelte';
	import { dieFace } from '../art';
	import Portrait from '../extended/Portrait.svelte';
	import { TERRAIN_NAME } from '../extended/terrainColors';
	import { RESOURCES, countsList, myTurn } from '../helpers';
	import Modal from '../menu/Modal.svelte';
	import { PIXEL } from '../pixel';
	import ResCard from '../ResCard.svelte';
	import { ui } from './ui.svelte';

	/**
	 * Using a character's power: what it does and, for powers that need one, the choice it asks for
	 * (a player, a number, cards to trade, a terrain). Powers that pick a spot on the board hand
	 * over to the board. The Seer's three rolls to keep one of are here too.
	 */
	const view = $derived(client.view!);
	const me = $derived(view.me);
	const ch = $derived(view.players[me]?.character ?? null);
	const info = $derived(ch ? POWER_INFO[ch] : null);
	const res = $derived(view.players[me]?.resources ?? emptyResources());
	const choosingRoll = $derived(myTurn(view) && view.step === 'chooseRoll' && !!view.rollChoices);

	let give = $state(emptyResources());
	let get = $state(emptyResources());
	const giving = $derived(totalResources(give));
	const getting = $derived(totalResources(get));
	$effect(() => {
		if (ui.power?.stage !== 'dialog') {
			give = emptyResources();
			get = emptyResources();
		}
	});

	function use(extra: Omit<Extract<Action, { type: 'usePower' }>, 'type'> = {}) {
		client.act({ type: 'usePower', ...extra });
		ui.power = null;
	}
	const close = () => (ui.power = null);
	const others = $derived(view.players.map((_, i) => i).filter((i) => i !== me));
	/** Producing terrains the Alchemist can turn a tile into. */
	const terrains = (Object.keys(TERRAIN_RESOURCE) as Terrain[]).filter((t) => TERRAIN_RESOURCE[t]);
	const total = $derived(view.dice ? view.dice[0] + view.dice[1] : 0);
</script>

{#if choosingRoll}
	<Modal title="Foresight" ribbon="purple" width={460}>
		<p>Keep one of the three rolls. It plays out as if you had just rolled it.</p>
		<div class="rolls">
			{#each view.rollChoices! as d, i (i)}
				<button class="btn wood roll" onclick={() => client.act({ type: 'keepRoll', index: i })}>
					<span class="die" style="background-image: {dieFace(d[0])}"></span>
					<span class="die" style="background-image: {dieFace(d[1])}"></span>
					<b class:seven={d[0] + d[1] === 7}>{d[0] + d[1]}</b>
				</button>
			{/each}
		</div>
	</Modal>
{:else if ui.power?.stage === 'dialog' && ch && info}
	<Modal title={info.name} ribbon="purple" width={info.target === 'trade' ? 520 : 440} onclose={close}>
		<div class="lead">
			<Portrait id={ch} size={54} />
			<p>
				<span class="who">{CHARACTER_INFO[ch].name}'s power.</span>
				{info.text}
				{view.powerRecharge ? `It comes back after ${view.powerRecharge} rounds.` : 'Once per game.'}
			</p>
		</div>

		{#if info.target === 'player'}
			<div class="victims">
				{#each others as v (v)}
					{@const p = view.players[v]}
					{@const empty = ch === 'rogue' && p.resourceCount === 0}
					<button class="btn wood block victim" disabled={empty} onclick={() => use({ target: v })}>
						<span class="shield" style="--shield: var(--art-shield-{p.color})">{p.name.slice(0, 1).toUpperCase()}</span>
						<span class="vname">{p.name}</span>
						{#if ch === 'witch' && view.hexed?.[v]}<small>hexed</small>{/if}
						<small><img class="icon-px" src={PIXEL.cards} alt="" />{p.resourceCount}</small>
					</button>
				{/each}
			</div>
		{:else if info.target === 'number'}
			<div class="numbers">
				{#each [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as n (n)}
					{@const pays = countsList(rollIncome(view, me, n, TITHE_CAP))}
					<button class="btn wood num" disabled={!pays.length} onclick={() => use({ number: n })}>
						<b>{n}</b>
						<span class="pays">
							{#each pays as c (c.res)}<ResCard res={c.res} count={c.n} size={22} />{/each}
						</span>
					</button>
				{/each}
			</div>
		{:else if info.target === 'trade'}
			<p class="sub">Give (from your hand)</p>
			<div class="row">
				{#each RESOURCES as r (r)}
					<div class="col">
						<ResCard
							res={r}
							size={50}
							count={res[r] - give[r]}
							dim={res[r] - give[r] === 0 || get[r] > 0}
							onclick={() => giving < MARKET_DAY_CARDS && res[r] > give[r] && !get[r] && give[r]++}
						/>
						<span class="chip" class:on={give[r] > 0}>{give[r] ? `−${give[r]}` : '·'}</span>
					</div>
				{/each}
			</div>
			<p class="sub">Take (from the bank)</p>
			<div class="row">
				{#each RESOURCES as r (r)}
					<div class="col">
						<ResCard
							res={r}
							size={50}
							dim={view.bank[r] <= get[r] || give[r] > 0}
							onclick={() => getting < giving && view.bank[r] > get[r] && !give[r] && get[r]++}
						/>
						<span class="chip" class:on={get[r] > 0}>{get[r] ? `+${get[r]}` : '·'}</span>
					</div>
				{/each}
			</div>
			<div class="foot">
				<button
					class="btn wood"
					onclick={() => {
						give = emptyResources();
						get = emptyResources();
					}}>Reset</button
				>
				<button class="btn purple" disabled={!giving || giving !== getting} onclick={() => use({ give, get })}
					>{giving ? `Trade ${giving} for ${getting}` : 'Pick cards to trade'}</button
				>
			</div>
		{:else if info.target === 'none'}
			{#if ch === 'bard'}
				<p class="sub">Everyone collects the {total} again.</p>
			{/if}
			<div class="foot">
				<button class="btn wood" onclick={close}>Not now</button>
				<button class="btn purple" onclick={() => use()}>Use {info.name}</button>
			</div>
		{:else}
			<div class="foot">
				<button class="btn wood" onclick={close}>Not now</button>
				<button class="btn purple" onclick={() => (ui.power = { stage: 'pick' })}>Pick on the board</button>
			</div>
		{/if}
	</Modal>
{:else if ui.power?.stage === 'terrain'}
	{@const hex = view.board.hexes[ui.power.hex]}
	{@const h = ui.power.hex}
	<Modal title="Transmute Land" ribbon="purple" width={480} onclose={close}>
		<p>The {TERRAIN_NAME[hex.terrain]} {hex.number} becomes, for the rest of the game:</p>
		<div class="row">
			{#each terrains.filter((t) => t !== hex.terrain) as t (t)}
				{@const r = TERRAIN_RESOURCE[t] as Resource}
				<div class="col">
					<ResCard res={r} size={58} onclick={() => use({ hex: h, terrain: t })} />
					<span class="nm">{TERRAIN_NAME[t]}</span>
					<span class="nm small">{RESOURCE_LABEL[r]}</span>
				</div>
			{/each}
		</div>
		<div class="foot">
			<button class="btn wood" onclick={() => (ui.power = { stage: 'pick' })}>Another tile</button>
		</div>
	</Modal>
{/if}

<style>
	.lead {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.lead p {
		margin: 0;
		text-align: left;
	}
	.who {
		color: #d9ccff;
		font-weight: 700;
	}
	.sub {
		margin: 12px 0 0 !important;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: var(--muted);
		text-align: left !important;
	}
	.rolls {
		display: flex;
		gap: 10px;
		justify-content: center;
	}
	.roll {
		flex-direction: column;
		gap: 6px;
		padding: 6px 12px;
	}
	.roll .die {
		display: inline-block;
		width: 30px;
		height: 30px;
		background-size: contain;
		image-rendering: pixelated;
	}
	.roll b {
		font-size: 22px;
	}
	.roll b.seven {
		color: #ffb08a;
	}
	.numbers {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 6px;
		margin-top: 12px;
	}
	.num {
		flex-direction: column;
		gap: 3px;
		padding: 4px 2px;
		min-height: 58px;
	}
	.num b {
		font-size: 20px;
	}
	.pays {
		display: flex;
		gap: 2px;
		min-height: 22px;
	}
	.row {
		display: flex;
		gap: 10px;
		justify-content: center;
		padding-top: 6px;
		flex-wrap: wrap;
	}
	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.chip {
		min-width: 30px;
		text-align: center;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: var(--muted);
	}
	.chip.on {
		color: #efe6ff;
	}
	.victims {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 12px;
	}
	.victim {
		justify-content: flex-start;
		gap: 12px;
		font-size: 19px;
	}
	.victim .shield {
		--s: 2.2px;
		font-size: 15px;
	}
	.vname {
		flex: 1;
		text-align: left;
	}
	.victim small {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 15px;
		color: var(--muted);
	}
	.victim small img {
		width: 18px;
		height: 18px;
	}
	.nm {
		font-family: var(--px);
		font-size: 13px;
		color: var(--muted);
		font-weight: 700;
	}
	.nm.small {
		font-size: 11px;
	}
	.foot {
		margin-top: 14px;
	}
</style>
