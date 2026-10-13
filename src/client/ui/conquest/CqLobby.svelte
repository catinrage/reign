<script lang="ts">
	import { CARD_RULES, DEPLOY_RULES, VICTORY_RULES } from '../../../shared/conquest/settings';
	import { REALM } from '../../../shared/conquest/realm';
	import { majorityGoal } from '../../../shared/conquest/queries';
	import type { CardRule, ConquestSettings, DeployRule, VictoryRule } from '../../../shared/conquest/types';
	import { msg, t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { CQ_PIXEL } from './icons';

	/** A Conquest table's rules in the lobby: how the war is won, what cards bring, how armies start. */
	const s = $derived(client.lobby!.conquest);
	const host = $derived(client.isHost);

	const VICTORY: Record<VictoryRule, { name: string; text: string }> = {
		domination: { name: msg('Conquest'), text: msg('Take every territory of the Realm.') },
		majority: { name: msg('Majority'), text: msg('First to hold two thirds of the Realm wins.') }
	};
	const CARDS: Record<CardRule, { name: string; text: string }> = {
		escalating: { name: msg('Rising'), text: msg('Each set traded is worth more than the last: 4, 6, 8, 10, 12, 15, then 5 more each.') },
		fixed: { name: msg('Fixed'), text: msg('A set is worth what it shows: footmen 4, knights 6, catapults 8, one of each 10.') }
	};
	const DEPLOY: Record<DeployRule, { name: string; text: string }> = {
		placed: { name: msg('Placed'), text: msg('Everyone places their starting armies by hand, all at once.') },
		random: { name: msg('Random'), text: msg('Starting armies are spread at random, so play starts at once.') }
	};
	function set(patch: Partial<ConquestSettings>) {
		client.setConquest(patch);
	}
</script>

<div class="realm plaque">
	<img class="icon-px" src={PIXEL.sword} alt="" />
	<span class="body">
		<span class="label">{t('Conquest')}</span>
		<span class="name title">{t('The Realm')} <small>{t('{n} territories, {r} regions', { n: REALM.territories.length, r: REALM.regions.length })}</small></span>
		<span class="text">{t('Muster armies, take territories with dice and hold whole regions for bonus armies. Two to six commanders.')}</span>
	</span>
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.crown} alt="" />{t('Victory')}</span>
		<span class="chosen">{s.victory === 'majority' ? t('Hold {n} territories', { n: majorityGoal() }) : t('Take all {n}', { n: REALM.territories.length })}</span>
	</div>
	<div class="seg">
		{#each VICTORY_RULES as r (r)}
			<button class="btn small" class:on={s.victory === r} disabled={!host} title={t(VICTORY[r].text)} onclick={() => set({ victory: r })}>{t(VICTORY[r].name)}</button>
		{/each}
	</div>
	<p class="note">{t(VICTORY[s.victory].text)}</p>
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.cards} alt="" />{t('Card sets')}</span>
	</div>
	<div class="seg">
		{#each CARD_RULES as r (r)}
			<button class="btn small" class:on={s.cards === r} disabled={!host} title={t(CARDS[r].text)} onclick={() => set({ cards: r })}>{t(CARDS[r].name)}</button>
		{/each}
	</div>
	<p class="note">{t(CARDS[s.cards].text)}</p>
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={CQ_PIXEL.troops} alt="" />{t('Starting armies')}</span>
	</div>
	<div class="seg">
		{#each DEPLOY_RULES as r (r)}
			<button class="btn small" class:on={s.deploy === r} disabled={!host} title={t(DEPLOY[r].text)} onclick={() => set({ deploy: r })}>{t(DEPLOY[r].name)}</button>
		{/each}
	</div>
	<p class="note">{t(DEPLOY[s.deploy].text)}</p>
</div>

<style>
	.realm {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px 6px 8px;
	}
	.realm > img {
		width: 40px;
		height: 40px;
		flex: none;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.name small {
		font-size: 12px;
		color: var(--muted);
	}
	.text {
		font-size: 13px;
		line-height: 1.3;
		color: #e2cba8;
	}
	.rule {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.rule-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.label img {
		width: 16px;
		height: 16px;
	}
	.chosen {
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: var(--gold);
	}
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}
	.seg .btn:disabled:not(.on) {
		filter: grayscale(0.6) brightness(0.65);
	}
	.seg .btn:disabled.on {
		filter: none;
		cursor: default;
	}
	.note {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.3;
		color: var(--muted);
	}
</style>
