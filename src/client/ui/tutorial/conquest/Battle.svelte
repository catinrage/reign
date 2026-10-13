<script lang="ts">
	import { t } from '../../../i18n/index.svelte';
	import { dieFace } from '../../art';
	import { PIXEL } from '../../pixel';
	import { CQ_PIXEL } from '../../conquest/icons';
</script>

<p>{t('Each throw, the attacker rolls up to three dice (one fewer than the armies on their territory) and the defender up to two (no more than the armies defending).')}</p>

<div class="duel">
	<div class="side">
		<span class="lbl">{t('Attacker')}</span>
		<span class="row"><i style="background-image:{dieFace(6)}"></i><i style="background-image:{dieFace(4)}"></i><i class="lost" style="background-image:{dieFace(2)}"></i></span>
	</div>
	<span class="vs">{t('vs')}</span>
	<div class="side">
		<span class="lbl">{t('Defender')}</span>
		<span class="row"><i class="lost" style="background-image:{dieFace(5)}"></i><i style="background-image:{dieFace(4)}"></i></span>
	</div>
</div>

<ul class="rows">
	<li><img class="icon-px" src={PIXEL.die} alt="" /><span>{t('The highest dice are compared, then the next highest. Each comparison costs the loser one army.')}</span></li>
	<li><img class="icon-px" src={PIXEL.shieldIcon} alt="" /><span>{t('Ties go to the defender. Above: 6 beats 5, but 4 against 4 is the defender\'s, so each side loses one.')}</span></li>
	<li><img class="icon-px" src={CQ_PIXEL.skull} alt="" /><span>{t('When the last defender falls, the territory is yours.')}</span></li>
</ul>
<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>{t('Before you attack, the fight panel and the territory card show your chance of taking it if you keep attacking.')}</span
	>
</p>

<style>
	.duel {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 18px;
		margin: 6px 0 12px;
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.lbl {
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: #8a6236;
	}
	.row {
		display: flex;
		gap: 6px;
	}
	.row i {
		width: 38px;
		height: 38px;
		background-size: 100% 100%;
		image-rendering: pixelated;
	}
	.row i.lost {
		filter: grayscale(0.8) brightness(0.6);
	}
	.vs {
		font-family: var(--px);
		font-weight: 700;
		color: #8a6236;
	}
</style>
