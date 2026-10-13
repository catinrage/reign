import type { CardSymbol } from '../../../shared/conquest/types';
import { svg } from '../pixel';

/** Pixel pictures for Conquest: the soldiers on its cards, and a few marks for the interface. */

const k = '#2a1a10';

export const CQ_PIXEL = {
	footman: svg(
		[
			'.....kkk.....',
			'....kssskk...',
			'....kssssk...',
			'....kffffk...',
			'.....kffk....',
			'...kkrrrrkk..',
			'..krrrrrrrrk.',
			'.kyrkrrrrkrk.',
			'.kykkrrrrkkw.',
			'.kyk.rrrr.kw.',
			'..k..bbbb.kw.',
			'.....bkkb.kw.',
			'.....bk.b..k.',
			'....kkk.kkk..'
		],
		{ k, s: '#c9ced8', f: '#f1c9a0', r: '#c2372b', y: '#f2c14e', b: '#6a3f22', w: '#e4e8ee' }
	),
	knight: svg(
		[
			'......kk.....',
			'.....kbbk....',
			'....kbbbbkk..',
			'...kbbbbbbbk.',
			'..kbbkbbbbbbk',
			'.kbbbbbbbkkk.',
			'kbbbbbbbbk...',
			'kkkkbbbbbk...',
			'....kbbbbbk..',
			'...kbbbbbbk..',
			'..kmmmmmmmmk.',
			'..kmyyyyyymk.',
			'..kkkkkkkkkk.'
		],
		{ k, b: '#a8673a', m: '#4a2a16', y: '#f2c14e' }
	),
	catapult: svg(
		[
			'..........kk.',
			'.........kssk',
			'........kkssk',
			'.......kbkkk.',
			'......kbk....',
			'.....kbk.....',
			'....kbk......',
			'.kkkbkkkkkk..',
			'.kbbbbbbbbbk.',
			'.kkbkkkkkbkk.',
			'.kwwk...kwwk.',
			'.kwwk...kwwk.',
			'..kk.....kk..'
		],
		{ k, b: '#a8673a', s: '#8d929b', w: '#c08a4a' }
	),
	wild: svg(
		[
			'......k......',
			'.....kyk.....',
			'.....kyk.....',
			'....kyyyk....',
			'kkkkkyyykkkkk',
			'.kyyyyyyyyyk.',
			'..kyyyyyyyk..',
			'...kyyyyyk...',
			'...kyyyyyk...',
			'..kyyk.kyyk..',
			'..kyk...kyk..',
			'.kkk.....kkk.'
		],
		{ k, y: '#ffd45a' }
	),
	/** A territory: a little flag on a mound. */
	flag: svg(
		[
			'.kk.......',
			'.kwkkkk...',
			'.kwwwwwk..',
			'.kwwwwwwk.',
			'.kwwwwwk..',
			'.kwkkkk...',
			'.kk.......',
			'.kk.......',
			'gkkgg.....',
			'gggggg....'
		],
		{ k, w: '#f4e1b8', g: '#5fb43b' }
	),
	/** An army: three little soldiers. */
	troops: svg(
		[
			'.kk...kk...kk.',
			'kssk.kssk.kssk',
			'kffk.kffk.kffk',
			'krrk.krrk.krrk',
			'krrrkkrrrkkrrk',
			'krrk.krrk.krrk',
			'kbbk.kbbk.kbbk',
			'kk.k.kk.k.kk.k'
		],
		{ k, s: '#c9ced8', f: '#f1c9a0', r: '#c2372b', b: '#6a3f22' }
	),
	/** Moving armies: a boot-print arrow. */
	march: svg(
		['....kk....', '....kyk...', 'kkkkkyyk..', 'kyyyyyyyk.', 'kyyyyyyyyk', 'kyyyyyyyk.', 'kkkkkyyk..', '....kyk...', '....kk....'],
		{ k, y: '#9fd36a' }
	),
	/** Undo: a curling arrow back. */
	undo: svg(
		['...k......', '..kyk.....', '.kyyykkk..', 'kyyyyyyyk.', '.kyyykkyyk', '..kyk..kyk', '...k...kyk', '.......kyk', '....kkkyk.', '....kyyk..', '....kkk...'],
		{ k, y: '#fff3b8' }
	),
	/** A skull for armies lost. */
	skull: svg(
		['..kkkkk..', '.kwwwwwk.', 'kwwwwwwwk', 'kwkkwkkwk', 'kwkkwkkwk', 'kwwwkwwwk', '.kwwwwwk.', '..kwkwk..', '..kkkkk..'],
		{ k, w: '#f4ead2' }
	)
};

export const SYMBOL_ICON: Record<CardSymbol, string> = {
	footman: CQ_PIXEL.footman,
	knight: CQ_PIXEL.knight,
	catapult: CQ_PIXEL.catapult,
	wild: CQ_PIXEL.wild
};
