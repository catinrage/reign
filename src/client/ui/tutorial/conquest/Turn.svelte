<script lang="ts">
	import { SECOND_PLAYER_BONUS } from '../../../../shared/conquest/rules';
	import { t } from '../../../i18n/index.svelte';
	import Rich from '../../../i18n/Rich.svelte';
	import { PIXEL } from '../../pixel';
	import { CQ_PIXEL } from '../../conquest/icons';
</script>

{#snippet kbdAltClick()}<kbd>{t('Alt+click')}</kbd>{/snippet}

<p>{t('Before the first turn everyone places their starting armies at once, a click at a time. Then turns go round the table, each in three steps.')}</p>
<p>{t('With two players, whoever goes second starts with {n} more armies, to make up for moving second.', { n: SECOND_PLAYER_BONUS })}</p>

<h3>{t('1. Reinforce')}</h3>
<ul class="rows">
	<li><img class="icon-px" src={CQ_PIXEL.troops} alt="" /><span>{t('You get a third of your territories in armies (never fewer than 3), plus the bonus of every region you hold whole.')}</span></li>
	<li><img class="icon-px" src={PIXEL.pointer} alt="" /><span>{t('Your territories glow: click one to put armies there. Pick +1, +5 or All in the bar below for how many each click places, and Undo takes one back.')}</span></li>
</ul>

<h3>{t('2. Attack')}</h3>
<ul class="rows">
	<li><img class="icon-px" src={PIXEL.sword} alt="" /><span>{t('Click one of your territories with at least 2 armies: the enemies next to it light up red. Click one (or drag onto it) to attack.')}</span></li>
	<li><img class="icon-px" src={PIXEL.die} alt="" /><span>{t('The fight panel rolls the dice. Attack rolls once, Blitz keeps rolling until it is decided, Stop backs off.')}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.march} alt="" /><span>{t('Take a territory and you must move armies in: at least as many as dice you rolled. The bar suggests a number; change it with − and +.')}</span></li>
	<li><img class="icon-px" src={PIXEL.cards} alt="" /><span>{t('Take at least one territory in a turn to earn a card at its end.')}</span></li>
</ul>

<h3>{t('3. Fortify')}</h3>
<ul class="rows">
	<li><img class="icon-px" src={CQ_PIXEL.march} alt="" /><span>{t('Press End attacks, then move armies once from one territory to another joined to it through your own territories. The way they march lights up. Moving ends your turn; so does End turn.')}</span></li>
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t('Click empty ground or press Esc to drop a selection. Enter presses the main button, and in a fight it rolls the dice.')}</span
	>
</p>
<p class="tip">
	<img class="icon-px" src={PIXEL.pointer} alt="" /><span><Rich text={t('{key} or long press: point out a spot to everyone')} slots={{ key: kbdAltClick }} /></span>
</p>
