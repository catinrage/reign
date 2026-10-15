<script lang="ts">
	import { WARLORDS, WARLORD_INFO } from '../../../../shared/conquest/warlords';
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { WARLORD_ICON } from '../../conquest/lore';
</script>

<p>
	{t('With warlords on, the war opens with a draft. Whoever moves last picks first, from a few more warlords than there are players, and each warlord bends one rule of the war for whoever leads with them.')}
</p>

<h3>{t('The warlords')}</h3>
<ul class="rows">
	{#each WARLORDS as w (w)}
		<li>
			<img class="icon-px" src={WARLORD_ICON[w]} alt="" /><span
				><b>{t(WARLORD_INFO[w].name)} {t(WARLORD_INFO[w].title)}</b> · {t(WARLORD_INFO[w].trait)}: {t(WARLORD_INFO[w].text)}</span
			>
		</li>
	{/each}
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t('Only warlords who can make a difference at your table are drafted: no Spymistress without fog, no Corsair without sea lanes. Point at a warlord on a player’s plaque to read their trait.')}</span
	>
</p>
