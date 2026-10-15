<script lang="ts">
	import { gambitBoard } from '../../../../shared/gambit/board';
	import { DEFAULT_GAMBIT_SETTINGS } from '../../../../shared/gambit/types';
	import { PLAYER_COLORS } from '../../../../shared/rules/config';
	import { t } from '../../../i18n/index.svelte';
	import GbBoardPreview from '../../gambit/GbBoardPreview.svelte';
	import { PLAYER_CSS } from '../../helpers';
	import { PIXEL } from '../../pixel';

	const board = gambitBoard(6, { ...DEFAULT_GAMBIT_SETTINGS, seed: 7 });
	const colors = PLAYER_COLORS.slice(0, 6).map((c) => PLAYER_CSS[c]);
</script>

<p>{t('Gambit is a war of pieces on a board of hexes, for two to eight players. Everyone starts on the rim, at their keep, with nine pieces round their monarch.')}</p>

<div class="picture"><GbBoardPreview {board} {colors} size={170} /></div>

<ul class="rows">
	<li><img class="icon-px" src={PIXEL.crown} alt="" /><span>{t('Win crowns: the first to the target wins, or whoever has the most when the rounds run out.')}</span></li>
	<li><img class="icon-px" src={PIXEL.star} alt="" /><span>{t('A white shrine stands between every two neighbours: hold it at the end of a round for a crown. The golden Throne in the middle is worth two.')}</span></li>
	<li><img class="icon-px" src={PIXEL.sword} alt="" /><span>{t("Taking someone's piece wins its worth in crowns: a guard or an archer 1, a knight, lancer or seer 2, a monarch 3.")}</span></li>
</ul>
<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span>{t('Every side of the board is laid out alike, so wherever you sit, you start as well placed as anyone.')}</span>
</p>

<style>
	.picture {
		display: flex;
		justify-content: center;
		margin: 4px 0 10px;
	}
</style>
