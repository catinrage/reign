<script lang="ts">
	import { WARLORD_INFO, type WarlordId } from '../../../shared/conquest/warlords';
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { SIGIL_OF, sigilUrl } from '../../scene/conquest/sigils';
	import Modal from '../menu/Modal.svelte';
	import { sfx } from '../sound';
	import { WARLORD_ICON } from './lore';
	import { cqPlay } from './play.svelte';
	import { cqColor, playerName } from './text';

	/**
	 * The warlord draft, before the armies are placed: everyone picks one in turn, whoever moves
	 * last picking first. On your pick, choose a warlord and lead with them; the others wait and
	 * watch who takes whom.
	 */
	const v = $derived(cqPlay.view!);
	const d = $derived(v.draft!);
	const picker = $derived(d.order[d.picked]);
	const mine = $derived(v.me >= 0 && picker === v.me && !client.spectating && !client.replaying);
	let chosen = $state<WarlordId | null>(null);
	$effect(() => {
		if (chosen && !d.pool.includes(chosen)) chosen = null;
	});
	function lead() {
		if (!chosen || !mine) return;
		sfx.build();
		client.cqAct({ type: 'pickWarlord', warlord: chosen });
		chosen = null;
	}
</script>

<Modal title={t('Choose your warlord')} width={860}>
	<p class="lead">
		{#if mine}
			{t('Your pick: who leads your armies? Each warlord bends one rule of the war, for you alone.')}
		{:else}
			{t('{player} is choosing a warlord.', { player: playerName(v, picker) })}
		{/if}
	</p>
	<ol class="order">
		{#each d.order as p, k (p)}
			{@const w = v.players[p].warlord}
			<li class:now={k === d.picked} class:done={k < d.picked} style="--c:{cqColor(v, p)}">
				<img src={sigilUrl(SIGIL_OF[v.players[p].color], cqColor(v, p), '#1a0c05', 28)} alt="" />
				<span class="who">{p === v.me ? t('You') : playerName(v, p)}</span>
				{#if w}<span class="took"><img class="icon-px" src={WARLORD_ICON[w]} alt="" />{t(WARLORD_INFO[w].name)}</span>{/if}
			</li>
		{/each}
	</ol>
	<div class="pool">
		{#each d.pool as w (w)}
			{@const info = WARLORD_INFO[w]}
			<button
				class="card"
				class:on={chosen === w}
				disabled={!mine}
				aria-pressed={chosen === w}
				onclick={() => {
					sfx.click();
					chosen = w;
				}}
			>
				<span class="emblem"><img class="icon-px" src={WARLORD_ICON[w]} alt="" /></span>
				<span class="name title">{t(info.name)}</span>
				<span class="epithet">{t(info.title)}</span>
				<span class="trait">{t(info.trait)}</span>
				<span class="text">{t(info.text)}</span>
			</button>
		{/each}
	</div>
	{#if mine}
		<div class="foot">
			<button class="btn green shine" disabled={!chosen} onclick={lead}
				>{chosen ? t('Lead with {name}', { name: t(WARLORD_INFO[chosen].name) }) : t('Pick a warlord')}</button
			>
		</div>
	{/if}
</Modal>

<style>
	.lead {
		margin: 0 0 10px;
		text-align: center;
		color: #e2cba8;
		font-size: 14px;
	}
	.order {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px;
	}
	.order li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px 3px 4px;
		border-radius: 999px;
		background: rgba(20, 10, 4, 0.45);
		color: #e2cba8;
		font-size: 13px;
		opacity: 0.75;
	}
	.order li.now {
		opacity: 1;
		box-shadow: 0 0 0 2px var(--c);
	}
	.order li.done {
		opacity: 1;
	}
	.order .who {
		font-weight: 800;
		color: var(--c);
		text-shadow: var(--outline-dark);
	}
	.order .took {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: #fff2d2;
	}
	.order .took img {
		width: 14px;
		height: 14px;
	}
	.pool {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 8px;
	}
	.card {
		font: inherit;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 10px 8px;
		border-radius: 8px;
		border: 2px solid rgba(255, 220, 160, 0.18);
		background: linear-gradient(rgba(60, 34, 16, 0.85), rgba(36, 20, 9, 0.9));
		color: #e2cba8;
		cursor: pointer;
		text-align: center;
		transition:
			transform 0.12s ease-out,
			border-color 0.12s;
	}
	.card:not(:disabled):hover {
		transform: translateY(-2px);
		border-color: rgba(255, 220, 160, 0.45);
	}
	.card.on {
		border-color: var(--gold);
		box-shadow: 0 0 14px rgba(255, 210, 90, 0.4);
	}
	.card:disabled {
		cursor: default;
	}
	.emblem {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: radial-gradient(#5a3a1c, #2b1a10);
		box-shadow: inset 0 0 0 2px rgba(255, 210, 120, 0.35);
	}
	.emblem img {
		width: 26px;
		height: 26px;
	}
	.name {
		font-size: 17px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.epithet {
		font-size: 12px;
		color: var(--muted);
	}
	.trait {
		margin-top: 4px;
		font-family: var(--px);
		font-size: 12px;
		color: var(--gold);
	}
	.text {
		font-size: 12.5px;
		line-height: 1.3;
	}
	.foot {
		display: flex;
		justify-content: center;
		margin-top: 12px;
	}
</style>
