import { svg } from '../pixel';

/** Pixel icons only the tutorial uses, drawn like the ones in ui/pixel.ts. */
export const TUT_ICON = {
	robber: svg(
		[
			'.....kkk.....',
			'....kdddk....',
			'...kdddddk...',
			'...kdkkkdk...',
			'...kykdkyk...',
			'...kddkddk...',
			'....kdddk....',
			'...kdddddk...',
			'..kdddddddk..',
			'..kddkdkddk..',
			'..kddkdkddk..',
			'.kdddkdkdddk.',
			'.kdddddddddk.',
			'.kkkkkkkkkkk.'
		],
		{ k: '#1a0e08', d: '#4a3a34', y: '#f2c14e' }
	),
	isle: svg(
		[
			'.....kkkk.....',
			'...kkggggkk...',
			'..kgggGggggk..',
			'.kggGGGgyyggk.',
			'.kgggGgyyyygk.',
			'kgmmggyyyyggk.',
			'kgmmmggyyggggk',
			'kmmmmmgggbbggk',
			'.kmmmggggbbbgk',
			'.kggggggbbbgk.',
			'..kgggggggggk.',
			'...kkgggggkk..',
			'.....kkkkk....'
		],
		{ k: '#2c3a52', g: '#5fb43b', G: '#2f7f27', y: '#ebb424', m: '#8c8e96', b: '#c95a32' }
	),
	flag: svg(
		[
			'.kk.........',
			'.kkkkkkkkk..',
			'.kkrrrrrrrk.',
			'.kkrrrrrrk..',
			'.kkrrrrrrrk.',
			'.kkkkkkkkk..',
			'.kk.........',
			'.kk.........',
			'.kk.........',
			'.kk.........',
			'kkkk........',
			'kkkk........'
		],
		{ k: '#3a2214', r: '#c2372b' }
	),
	mask: svg(
		[
			'...kkkkkk...',
			'..kssssssk..',
			'.kssssssssk.',
			'.kskksskksk.',
			'.ksbksskbsk.',
			'.kssssssssk.',
			'.ksssrrsssk.',
			'..kssrrssk..',
			'..kkssssk...',
			'....kkkk....'
		],
		{ k: '#2a1a10', s: '#f0c08a', b: '#2a1a10', r: '#c2372b' }
	),
	scroll: svg(
		[
			'.kkkkkkkkkk.',
			'kyyyyyyyyyyk',
			'kykkkkkkkkyk',
			'.kpppppppk..',
			'.kpkkkkppk..',
			'.kpppppppk..',
			'.kpkkkpppk..',
			'.kpppppppk..',
			'.kpkkkkkpk..',
			'kkkkkkkkkkk.',
			'kyyyyyyyyyyk',
			'.kkkkkkkkkk.'
		],
		{ k: '#3a2214', y: '#c08a4a', p: '#f6e3bd' }
	),
	pen: svg(
		[
			'.........kk',
			'........kyk',
			'.......kyk.',
			'......kyk..',
			'.....kyk...',
			'....kyk....',
			'...kyk.....',
			'..kyk......',
			'.kwk.......',
			'kkk........',
			'k..........'
		],
		{ k: '#2a1a10', y: '#f2c14e', w: '#d9dde4' }
	)
};
