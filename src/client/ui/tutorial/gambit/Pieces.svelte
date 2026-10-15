<script lang="ts">
	import { PIECE_KINDS } from '../../../../shared/gambit/types';
	import { t } from '../../../i18n/index.svelte';
	import { GB_PIXEL } from '../../gambit/icons';
	import { PIECE_TEXT, pieceName, pieceStats } from '../../gambit/text';
</script>

<p>{t('Nine pieces each: a monarch, three guards, a knight, a seer, two lancers and an archer.')}</p>

<ul class="rows">
	{#each PIECE_KINDS as k (k)}
		<li>
			<img class="icon-px" src={GB_PIXEL[k]} alt="" /><span><b>{pieceName(k)}</b> {t(PIECE_TEXT[k])} <i>{pieceStats(k)}</i></span>
		</li>
	{/each}
</ul>

<style>
	i {
		font-style: normal;
		font-weight: 800;
		color: #8a6236;
	}
</style>
