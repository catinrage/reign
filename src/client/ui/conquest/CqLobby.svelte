<script lang="ts">
	import { OMEN_RULES, VICTORY_RULES } from '../../../shared/conquest/settings';
	import { conquestMap, majorityGoal } from '../../../shared/conquest/queries';
	import { MISSION_MIN_PLAYERS, type ConquestSettings, type OmenRule, type VictoryRule } from '../../../shared/conquest/types';
	import { msg, t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import CqHouseRules from './CqHouseRules.svelte';
	import CqMapPicker from './CqMapPicker.svelte';
	import WorldPreview from './WorldPreview.svelte';

	/**
	 * A Conquest table's rules in the lobby: the map, how the war is won, the warlords, the omens and
	 * the fog of war; the house rules (armies, cards, moving) behind their own row.
	 */
	const s = $derived(client.lobby!.conquest);
	const host = $derived(client.isHost);
	const map = $derived(conquestMap(s));
	let picking = $state(false);

	const VICTORY: Record<VictoryRule, { name: string; text: string }> = {
		domination: { name: msg('Conquest'), text: msg('Take every territory of the Realm.') },
		majority: { name: msg('Majority'), text: msg('First to hold two thirds of the Realm wins.') },
		missions: {
			name: msg('Missions'),
			text: msg('Everyone draws a secret mission: complete yours, or take the whole Realm, to win. Three players or more.')
		}
	};
	const tooFew = $derived(s.victory === 'missions' && (client.lobby?.seats.length ?? 0) < MISSION_MIN_PLAYERS);
	const OMENS: Record<OmenRule, { name: string; text: string }> = {
		off: { name: msg('Off'), text: msg('No omens: the war goes as the dice say.') },
		gentle: { name: msg('Gentle'), text: msg('An omen each round from the second: blessings, reprieves and upheavals.') },
		wild: { name: msg('Wild'), text: msg('An omen each round from the second, calamities too: plague and dragon fire.') }
	};
	function set(patch: Partial<ConquestSettings>) {
		client.setConquest(patch);
	}
</script>

<div class="realm plaque">
	<WorldPreview {map} width={78} height={64} />
	<span class="body">
		<span class="label">{s.map === 'random' ? t('A random world') : t('Conquest')}</span>
		<span class="name title">{map.generated ? map.name : t(map.name)}</span>
		<small class="text">{t('{n} territories, {r} regions', { n: map.territories.length, r: map.regions.length })}</small>
	</span>
	<button class="btn small change" onclick={() => (picking = true)}>{host ? t('Change') : t('See it')}</button>
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.crown} alt="" />{t('Victory')}</span>
		<span class="chosen"
			>{s.victory === 'majority'
				? t('Hold {n} territories', { n: majorityGoal(map) })
				: s.victory === 'missions'
					? t('Secret missions')
					: t('Take all {n}', { n: map.territories.length })}</span
		>
	</div>
	<div class="seg three">
		{#each VICTORY_RULES as r (r)}
			<button class="btn small" class:on={s.victory === r} disabled={!host} title={t(VICTORY[r].text)} onclick={() => set({ victory: r })}>{t(VICTORY[r].name)}</button>
		{/each}
	</div>
	<p class="note">{t(VICTORY[s.victory].text)}</p>
	{#if tooFew}
		<p class="note warn">{t('Secret missions need at least three players. Add a bot!')}</p>
	{/if}
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.sword} alt="" />{t('Warlords')}</span>
	</div>
	<div class="seg">
		<button class="btn small" class:on={!s.warlords} disabled={!host} onclick={() => set({ warlords: false })}>{t('Off')}</button>
		<button class="btn small" class:on={s.warlords} disabled={!host} onclick={() => set({ warlords: true })}>{t('Drafted')}</button>
	</div>
	<p class="note">{s.warlords ? t('Everyone drafts a warlord before the war, each bending one rule for them.') : t('No warlords: everyone fights by the same rules.')}</p>
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.raincloud} alt="" />{t('Omens')}</span>
	</div>
	<div class="seg three">
		{#each OMEN_RULES as r (r)}
			<button class="btn small" class:on={s.omens === r} disabled={!host} title={t(OMENS[r].text)} onclick={() => set({ omens: r })}>{t(OMENS[r].name)}</button>
		{/each}
	</div>
	<p class="note">{t(OMENS[s.omens].text)}</p>
</div>

<div class="rule">
	<div class="rule-head">
		<span class="label"><img class="icon-px" src={PIXEL.eye} alt="" />{t('Fog of war')}</span>
	</div>
	<div class="seg">
		<button class="btn small" class:on={!s.fog} disabled={!host} onclick={() => set({ fog: false })}>{t('Off')}</button>
		<button class="btn small" class:on={s.fog} disabled={!host} onclick={() => set({ fog: true })}>{t('On')}</button>
	</div>
	<p class="note">{s.fog ? t('You see armies only on and next to your own territories.') : t('Every army on the map is in plain sight.')}</p>
</div>

<div class="rule"><CqHouseRules /></div>

{#if picking}<CqMapPicker onclose={() => (picking = false)} />{/if}

<style>
	.realm {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px 6px 8px;
	}
	.realm :global(.world) {
		flex: none;
	}
	.realm .change {
		margin-left: auto;
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
	.seg.three {
		grid-template-columns: 1fr 1fr 1fr;
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
	.note.warn {
		color: #ffb09a;
	}
</style>
