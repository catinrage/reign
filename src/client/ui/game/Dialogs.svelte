<script lang="ts">
	import { CHARACTER_INFO } from '../../../shared/rules/characters';
	import { RESOURCE_LABEL, emptyResources, type Resource } from '../../../shared/rules/config';
	import { discardLimit } from '../../../shared/rules/queries';
	import { client } from '../../state/client.svelte';
	import { RESOURCES, myTurn } from '../helpers';
	import Modal from '../menu/Modal.svelte';
	import { PIXEL } from '../pixel';
	import ResCard from '../ResCard.svelte';
	import Portrait from '../extended/Portrait.svelte';
	import { dialogs } from './dialogs.svelte';

	const view = $derived(client.view!);
	const me = $derived(view.me);
	const res = $derived(view.players[me]?.resources);
	const mustDiscard = $derived(view.step === 'discard' ? (view.pendingDiscards[me] ?? 0) : 0);
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
</script>

{#if mustDiscard && res}
	<Modal title="The robber strikes!" ribbon="crimson" width={480}>
		<p>You hold more than {discardLimit(view, view.me)} cards. Pick {mustDiscard} to give back to the bank.</p>
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
				><span class="coin">{picked}</span><span class="of">of {mustDiscard}</span></span
			>
			<button
				class="btn red"
				disabled={picked !== mustDiscard}
				onclick={() => client.act({ type: 'discard', resources: { ...discard } })}>Discard</button
			>
		</div>
	</Modal>
{/if}

{#if owed.length && !mustDiscard}
	{@const from = CHARACTER_INFO[owed[0]]}
	<Modal title={from.trait} width={480}>
		<div class="owed">
			<Portrait id={owed[0]} size={64} />
			<p>
				{owed[0] === view.players[me].character ? `${from.name} ${from.title}` : `Trading with ${from.name} ${from.title}`}: take
				any resource from the bank{owed.length > 1 ? ` (${owed.length} to take)` : ''}.
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
					<span class="nm">{RESOURCE_LABEL[r]}</span>
				</div>
			{/each}
		</div>
	</Modal>
{/if}

{#if choosingVictim}
	<Modal title="Rob a neighbor" ribbon="crimson" width={400}>
		<p>Take a random card from one player beside the robber.</p>
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
	<Modal title="Year of Plenty" width={480} onclose={() => (dialogs.open = null)}>
		<p>Take any two resources from the bank.</p>
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
				>{yop.length ? 'Reset' : 'Cancel'}</button
			>
			<button
				class="btn green"
				disabled={yop.length !== 2}
				onclick={() => {
					client.act({ type: 'playYearOfPlenty', resources: [yop[0], yop[1]] });
					dialogs.open = null;
				}}>Take them</button
			>
		</div>
	</Modal>
{/if}

{#if dialogs.open === 'monopoly'}
	<Modal title="Monopoly" width={480} onclose={() => (dialogs.open = null)}>
		<p>Name a resource. Every other player hands you all of theirs.</p>
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
					<span class="nm">{RESOURCE_LABEL[r]}</span>
				</div>
			{/each}
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
