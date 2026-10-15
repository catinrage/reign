<script lang="ts">
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { GB_PIXEL } from '../../gambit/icons';
</script>

<p>{t('Everything moves at once, so what matters is where pieces end up.')}</p>

<ul class="rows">
	<li><img class="icon-px" src={PIXEL.sword} alt="" /><span>{t('Move onto a piece that stays where it is, and you take it, whatever it is, as in chess.')}</span></li>
	<li><img class="icon-px" src={PIXEL.door} alt="" /><span>{t('A piece that moves away is never taken where it stood: you strike at an empty hex.')}</span></li>
	<li><img class="icon-px" src={PIXEL.shieldIcon} alt="" /><span>{t('A braced piece fights back instead. So do pieces of different players that end on the same hex: the highest rank wins and takes the rest; equal ranks fall together.')}</span></li>
	<li><img class="icon-px" src={GB_PIXEL.knight} alt="" /><span>{t('Ranks: archer 0, guard 1 (3 when braced), monarch, seer and lancer 2, knight 3.')}</span></li>
	<li><img class="icon-px" src={GB_PIXEL.lancer} alt="" /><span>{t('Two pieces swapping hexes meet halfway and fight there.')}</span></li>
	<li><img class="icon-px" src={GB_PIXEL.archer} alt="" /><span>{t('Arrows land last, on whoever stands on the hex then (but never in a forest). Shoot where you think someone is going.')}</span></li>
</ul>
