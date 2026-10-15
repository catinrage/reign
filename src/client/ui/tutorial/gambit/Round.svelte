<script lang="ts">
	import { t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { GB_PIXEL } from '../../gambit/icons';
</script>

<p>{t('There are no turns. Each round everyone gives their orders at once, in secret, then all of them play out together.')}</p>

<ul class="rows">
	<li><img class="icon-px" src={GB_PIXEL.guard} alt="" /><span>{t('Click one of your pieces: the hexes it can reach light up. Click one to order it there (red: a piece to take). An archer can shoot an orange hex instead.')}</span></li>
	<li><img class="icon-px" src={PIXEL.letter} alt="" /><span>{t('You give two orders a round (the host may pick one to three). Your orders show as arrows; take one back with its ×.')}</span></li>
	<li><img class="icon-px" src={PIXEL.shieldIcon} alt="" /><span>{t('Brace (B) tells a piece to stand and fight whoever comes, instead of being taken.')}</span></li>
	<li><img class="icon-px" src={PIXEL.check} alt="" /><span>{t('Press Ready (Enter) when you are done. When everyone is ready, or the clock runs out, the round plays out.')}</span></li>
</ul>
<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span>{t('Nobody sees anyone else’s orders until the round plays out: guess where they will go, and be there first, or be gone.')}</span>
</p>
