<script lang="ts">
	import { CHARACTER_INFO } from '../../../shared/rules/characters';
	import { RESOURCE_LABEL, emptyResources, type Resource } from '../../../shared/rules/config';
	import { discardLimit, guildGoodsFor, safeCards } from '../../../shared/rules/queries';
	import { client } from '../../state/client.svelte';
	import { RESOURCES, myTurn } from '../helpers';
	import Modal from '../menu/Modal.svelte';
	import { PIXEL } from '../pixel';
	import ResCard from '../ResCard.svelte';
	import Portrait from '../extended/Portrait.svelte';
	import { dialogs } from './dialogs.svelte';
	import { ui } from './ui.svelte';
	import { t } from '../../i18n/index.svelte';

	const view = $derived(client.view!);
	const me = $derived(view.me);
	const res = $derived(view.players[me]?.resources);
	const mustDiscard = $derived(view.step === 'discard' ? (view.pendingDiscards[me] ?? 0) : 0);
	/** Cards my storehouse keeps safe, which a 7 doesn't count. */
	const safe = $derived(safeCards(view, me));
	const choosingVictim = $derived(myTurn(view) && view.step === 'steal');
	/** Cards a trait owes me (the Seer, the Jester, the Bard's partners), taken one at a time. */
	const owed = $derived(view.phase === 'draft' || view.phase === 'ended' ? [] : (view.picks?.[me] ?? []));

	let discard = $state(emptyResources());
	const picked = $derived(RESOURCES.reduce((n, r) => n + discard[r], 0));
	$effect(() => {
		if (!mustDiscard) discard = emptyResources();
	});

	let yop = $state<Resource[]>([]);
	$effect(() => {
		if (dialogs.open !== 'yearOfPlenty') yop = [];
	});

	function addDiscard(r: Resource) {
		if (!res || picked >= mustDiscard || discard[r] >= res[r]) return;
		discard[r]++;
	}
	function addYop(r: Resource) {
		if (yop.length < 2 && view.bank[r] > yop.filter((x) => x === r).length) yop = [...yop, r];
	}
	/** The city picked for a guild hall becomes one, trading the goods named. */
	function buildGuildHall(resource: Resource) {
		const vertex = dialogs.guildHall;
		dialogs.guildHall = null;
		ui.paths = false;
		if (vertex !== null) client.act({ type: 'buildCityPath', vertex, path: 'guildHall', resource });
	}
</script>

{#if mustDiscard && res}
	<Modal title={t('The robber strikes!')} ribbon="crimson" width={480}>
		<p>
			{#if safe}{t('You hold more than {limit} cards. Your storehouse keeps {safe} safe, so pick {n} to give back to the bank.', {
					limit: discardLimit(view, me),
					safe,
					n: mustDiscard
				})}{:else}{t('You hold more than {limit} cards. Pick {n} to give back to the bank.', {
					limit: discardLimit(view, me),
					n: mustDiscard
				})}{/if}
		</p>
		<div class="row">
			{#each RESOURCES as r (r)}
				<div class="col">
					<ResCard
						res={r}
						count={res[r] - discard[r]}
						size={58}
						dim={res[r] - discard[r] === 0}
						onclick={() => addDiscard(r)}
					/>
					<button
						class="chip"
						class:on={discard[r] > 0}
						disabled={!discard[r]}
						onclick={() => discard[r]--}
					>
						{discard[r] ? `−${discard[r]}` : '·'}
					</button>
				</div>
			{/each}
		</div>
		<div class="foot spread">
			<span class="progress"
				><span class="coin">{picked}</span><span class="of">{t('of {total}', { total: mustDiscard })}</span></span
			>
			<button
				class="btn red"
				disabled={picked !== mustDiscard}
				onclick={() => client.act({ type: 'discard', resources: { ...discard } })}>{t('Discard')}</button
			>
		</div>
	</Modal>
{/if}

{#if owed.length && !mustDiscard}
	{@const from = CHARACTER_INFO[owed[0]]}
	{@const who = { name: t(from.name), title: t(from.title), n: owed.length }}
	<Modal title={t(from.trait)} width={480}>
		<div class="owed">
			<Portrait id={owed[0]} size={64} />
			<p>
				{#if owed[0] === view.players[me].character}
					{owed.length > 1
						? t('{name} {title}: take any resource from the bank ({n} to take).', who)
						: t('{name} {title}: take any resource from the bank.', who)}
				{:else}
					{owed.length > 1
						? t('Trading with {name} {title}: take any resource from the bank ({n} to take).', who)
						: t('Trading with {name} {title}: take any resource from the bank.', who)}
				{/if}
			</p>
		</div>
		<div class="row">
			{#each RESOURCES as r (r)}
				<div class="col">
					<ResCard
						res={r}
						size={58}
						dim={view.bank[r] === 0}
						onclick={() => view.bank[r] > 0 && client.act({ type: 'takePick', resource: r })}
					/>
					<span class="nm">{t(RESOURCE_LABEL[r])}</span>
				</div>
			{/each}
		</div>
	</Modal>
{/if}

{#if choosingVictim}
	<Modal title={t('Rob a neighbor')} ribbon="crimson" width={400}>
		<p>{t('Take a random card from one player beside the robber.')}</p>
		<div class="victims">
			{#each view.stealCandidates as v (v)}
				{@const p = view.players[v]}
				<button
					class="btn wood block victim"
					onclick={() => client.act({ type: 'steal', victim: v })}
				>
					<span class="shield" style="--shield: var(--art-shield-{p.color})"
						>{p.name.slice(0, 1).toUpperCase()}</span
					>
					<span class="vname">{p.name}</span>
					<small><img class="icon-px" src={PIXEL.cards} alt="" />{p.resourceCount}</small>
				</button>
			{/each}
		</div>
	</Modal>
{/if}

{#if dialogs.open === 'yearOfPlenty'}
	<Modal title={t('Year of Plenty')} width={480} onclose={() => (dialogs.open = null)}>
		<p>{t('Take any two resources from the bank.')}</p>
		<div class="row">
			{#each RESOURCES as r (r)}
				<ResCard
					res={r}
					size={58}
					count={yop.filter((x) => x === r).length || undefined}
					dim={view.bank[r] === 0}
					onclick={() => addYop(r)}
				/>
			{/each}
		</div>
		<div class="foot">
			<button class="btn wood" onclick={() => (yop.length ? (yop = []) : (dialogs.open = null))}
				>{yop.length ? t('Reset') : t('Cancel')}</button
			>
			<button
				class="btn green"
				disabled={yop.length !== 2}
				onclick={() => {
					client.act({ type: 'playYearOfPlenty', resources: [yop[0], yop[1]] });
					dialogs.open = null;
				}}>{t('Take them')}</button
			>
		</div>
	</Modal>
{/if}

{#if dialogs.open === 'monopoly'}
	<Modal title={t('Monopoly')} width={480} onclose={() => (dialogs.open = null)}>
		<p>{t('Name a resource. Every other player hands you all of theirs.')}</p>
		<div class="row">
			{#each RESOURCES as r (r)}
				<div class="col">
					<ResCard
						res={r}
						size={58}
						onclick={() => {
							client.act({ type: 'playMonopoly', resource: r });
							dialogs.open = null;
						}}
					/>
					<span class="nm">{t(RESOURCE_LABEL[r])}</span>
				</div>
			{/each}
		</div>
	</Modal>
{/if}

{#if dialogs.guildHall !== null}
	{@const goods = guildGoodsFor(view, me)}
	<Modal title={t('Guild hall')} width={480} onclose={() => (dialogs.guildHall = null)}>
		<p>{t('Name the goods your guild hall trades. You will trade them with the bank at 2:1.')}</p>
		<div class="row">
			{#each RESOURCES as r (r)}
				{@const ok = goods.includes(r)}
				<div class="col">
					<ResCard res={r} size={58} dim={!ok} onclick={ok ? () => buildGuildHall(r) : undefined} />
					<span class="nm">{ok ? t(RESOURCE_LABEL[r]) : t('Already 2:1')}</span>
				</div>
			{/each}
		</div>
		<div class="foot">
			<button class="btn wood" onclick={() => (dialogs.guildHall = null)}>{t('Cancel')}</button>
		</div>
	</Modal>
{/if}

<style>
	.owed {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.owed p {
		margin: 0;
	}
	.row {
		display: flex;
		gap: 10px;
		justify-content: center;
		padding-top: 12px;
		flex-wrap: wrap;
	}
	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.chip {
		all: unset;
		min-width: 30px;
		text-align: center;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		padding: 1px 6px;
		color: var(--muted);
	}
	.chip.on {
		cursor: pointer;
		color: #ffe1d6;
		background: #8a2a1a;
		box-shadow:
			inset 0 2px 0 #c2402a,
			0 0 0 2px #2a0804;
	}
	.foot.spread {
		justify-content: space-between;
	}
	.progress {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.progress .coin {
		--s: 2.5px;
		font-size: 18px;
	}
	.of {
		font-family: var(--px);
		font-weight: 700;
		font-size: 18px;
		color: var(--muted);
	}
	.victims {
		display: flex;
		flex-direction: column;
		gap: 10px;
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
	@media (max-width: 480px) {
		.row {
			gap: 6px;
			flex-wrap: nowrap;
		}
		.row :global(.card) {
			--w: 50px !important;
			--cp: 2px !important;
		}
	}
</style>
