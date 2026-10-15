<script lang="ts">
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { GB_PIXEL } from '../../gambit/icons';
</script>

<p>{t('Nobody is knocked out of a game of Gambit: you play to the end.')}</p>

<ul class="rows">
	<li><img class="icon-px" src={GB_PIXEL.monarch} alt="" /><span>{t('A monarch taken comes home to its keep at once, but its player gives one order fewer the next round.')}</span></li>
	<li><img class="icon-px" src={GB_PIXEL.guard} alt="" /><span>{t('Every third round, each keep musters a new guard, while its player has fewer than nine pieces.')}</span></li>
	<li><img class="icon-px" src={PIXEL.clover} alt="" /><span>{t('Forests stop lancers and seers, and shelter from arrows. From a hill an archer shoots three hexes. Nothing stands in a lake, but a knight leaps over one.')}</span></li>
	<li><img class="icon-px" src={PIXEL.crown} alt="" /><span>{t('Shrines pay every round you hold them, so a long hold can beat a quick raid.')}</span></li>
</ul>
<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span>{t('Hover over a piece or a hex on the board to see what it does.')}</span>
</p>
