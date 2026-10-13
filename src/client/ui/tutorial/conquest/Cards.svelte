<script lang="ts">
	import { escalatingValue } from '../../../../shared/conquest/queries';
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { CQ_PIXEL } from '../../conquest/icons';
	const values = [0, 1, 2, 3, 4, 5, 6].map(escalatingValue);
</script>

<p>{t('Each card shows a territory and a soldier: a footman, a knight or a catapult. Two wild cards show all three.')}</p>
<div class="kinds">
	<img src={CQ_PIXEL.footman} alt="" /><img src={CQ_PIXEL.knight} alt="" /><img src={CQ_PIXEL.catapult} alt="" /><img src={CQ_PIXEL.wild} alt="" />
</div>
<ul class="rows">
	<li><img class="icon-px" src={PIXEL.cards} alt="" /><span>{t('A set is three alike, one of each, or any two with a wild. Trade a set in while reinforcing for more armies.')}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.flag} alt="" /><span>{t('A traded card showing a territory you hold puts 2 more armies there.')}</span></li>
	<li><img class="icon-px" src={PIXEL.hourglass} alt="" /><span>{t('Hold five cards or more and you must trade before going on.')}</span></li>
</ul>
<h3>{t('What a set is worth')}</h3>
<p>{t('Rising (the standard rule): every set anyone trades is worth more than the one before: {values} and 5 more each after.', { values: values.join(', ') })}</p>
<p>{t('Fixed: three footmen 4, three knights 6, three catapults 8, one of each 10.')}</p>

<style>
	.kinds {
		display: flex;
		justify-content: center;
		gap: 16px;
		margin: 4px 0 10px;
	}
	.kinds img {
		width: 44px;
		height: 44px;
		image-rendering: pixelated;
	}
</style>
