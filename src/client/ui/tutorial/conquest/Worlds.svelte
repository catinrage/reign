<script lang="ts">
	import { WORLD_MAX_TERRITORIES, WORLD_MIN_TERRITORIES } from '../../../../shared/conquest/types';
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { CQ_PIXEL } from '../../conquest/icons';
</script>

<h3>{t('Random worlds')}</h3>
<p>
	{t('Instead of the Realm, the host can make a random world from {min} to {max} territories: pick its shape, how many regions, how many sea lanes and its climate, then Generate until you like it. Everyone sees it on the table.', {
		min: WORLD_MIN_TERRITORIES,
		max: WORLD_MAX_TERRITORIES
	})}
</p>
<ul class="rows">
	<li><img class="icon-px" src={CQ_PIXEL.flag} alt="" /><span>{t('Its regions are worth more the bigger they are and the more ways in they have, as on the classic board.')}</span></li>
	<li><img class="icon-px" src={PIXEL.anchor} alt="" /><span>{t('Sea lanes join every land, so every territory can be reached.')}</span></li>
</ul>

<h3>{t('House rules')}</h3>
<ul class="rows">
	<li><img class="icon-px" src={CQ_PIXEL.troops} alt="" /><span>{t('Armies: a quarter fewer or more to start with, and the least a turn brings (3 as a rule).')}</span></li>
	<li><img class="icon-px" src={PIXEL.cards} alt="" /><span>{t('Cards: rising, fixed or none at all; the two armies for a pictured territory on or off; and how many cards force a trade.')}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.march} alt="" /><span>{t('Fortifying: one move along your own land (the classic rule), one move to a neighbour only, or as many moves as you like.')}</span></li>
</ul>

<h3>{t('Fog of war')}</h3>
<p>
	{t('In the fog you see armies only on your own territories and those next to them. Everyone’s territories show, but elsewhere the medallions read “?” until your armies come near. Spectators see everything, and the fog lifts when the war is over.')}
</p>
