import type { PieceKind } from '../../../shared/gambit/types';
import { svg } from '../pixel';

/** Pixel pictures of Gambit's pieces, as chessmen are drawn: cream with dark outlines. */

const k = '#2a1a10';
const c = '#f3e2b8';
const s = '#c9b48a';
const g = '#f0c24e';
const pal = { k, c, s, g };

export const GB_PIXEL: Record<PieceKind, string> = {
	monarch: svg(
		[
			'...k.kk.k...',
			'..kgkggkgk..',
			'..kggggggk..',
			'...kkkkkk...',
			'...kcccck...',
			'..kccccssk..',
			'...kccssk...',
			'...kccssk...',
			'..kcccccsk..',
			'.kcccccccsk.',
			'.kkkkkkkkkk.',
			'kcccccccccsk',
			'kkkkkkkkkkkk'
		],
		pal
	),
	guard: svg(
		[
			'....kkkk....',
			'...kcccck...',
			'...kccssk...',
			'....kkkk....',
			'..kkcccckk..',
			'.kcckccsk...',
			'.kcck.ccsk..',
			'.kcck.ccsk..',
			'..kkkccsk...',
			'...kcccsk...',
			'..kkkkkkkk..',
			'.kccccccssk.',
			'.kkkkkkkkkk.'
		],
		pal
	),
	archer: svg(
		[
			'.....kk..k..',
			'....kcck.kk.',
			'....kcck.k.k',
			'.....kk..k.k',
			'....kcck.k.k',
			'...kccssk..k',
			'...kccsk...k',
			'...kccsk..k.',
			'...kcccsk.k.',
			'..kccccsk...',
			'..kkkkkkkk..',
			'.kccccccssk.',
			'.kkkkkkkkkk.'
		],
		pal
	),
	seer: svg(
		[
			'.....kk.....',
			'....kcck....',
			'...kcckck...',
			'...kckcck...',
			'....kcck....',
			'.....kk.....',
			'....kcck....',
			'...kccssk...',
			'...kccssk...',
			'..kcccccsk..',
			'..kkkkkkkk..',
			'.kccccccssk.',
			'.kkkkkkkkkk.'
		],
		pal
	),
	lancer: svg(
		[
			'.........k..',
			'........kgk.',
			'.....kk.kkc.',
			'....kcckk.ck',
			'....kcckk...',
			'...kccsk.k..',
			'...kccsk.k..',
			'...kccskk...',
			'...kccssk...',
			'..kcccccsk..',
			'..kkkkkkkk..',
			'.kccccccssk.',
			'.kkkkkkkkkk.'
		],
		pal
	),
	knight: svg(
		[
			'....kk.k....',
			'...kcckck...',
			'..kccccck...',
			'.kcckccccsk.',
			'kccccccccsk.',
			'kkkk.kccsk..',
			'.....kccsk..',
			'....kcccsk..',
			'...kcccccsk.',
			'...kcccccsk.',
			'..kkkkkkkkk.',
			'.kccccccssk.',
			'.kkkkkkkkkk.'
		],
		pal
	)
};
