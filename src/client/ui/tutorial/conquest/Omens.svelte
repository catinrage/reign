<script lang="ts">
	import { OMENS, OMEN_INFO, OMEN_TONE_LABEL } from '../../../../shared/conquest/omens';
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { OMEN_TONE_STYLE } from '../../conquest/lore';
</script>

<p>
	{t('With omens on, an omen turns over as every round from the second begins, and holds until the next. A gentle deck leaves the calamities out; a wild one keeps them in.')}
</p>

<h3>{t('The omens')}</h3>
<ul class="rows">
	{#each OMENS as o (o)}
		<li>
			<img class="icon-px" src={OMEN_TONE_STYLE[OMEN_INFO[o].tone].icon} alt="" /><span
				><b>{t(OMEN_INFO[o].name)}</b> ({t(OMEN_TONE_LABEL[OMEN_INFO[o].tone])}): {t(OMEN_INFO[o].text)}</span
			>
		</li>
	{/each}
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span>{t('The round’s omen stands beside the round counter: point at it to read it again, click it to see its card.')}</span>
</p>
