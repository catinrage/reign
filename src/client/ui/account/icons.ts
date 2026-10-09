import { svg } from '../pixel';

/** Pixel icons for accounts, friends and the match history. */
export const ACCOUNT_ICONS = {
	friends: svg(
		[
			'....kkk.........',
			'...kyyyk...kkk..',
			'...kyyyk..kbbbk.',
			'...kyyyk..kbbbk.',
			'....kkk...kbbbk.',
			'..kkrrrkk..kkk..',
			'.krrrrrrrk.kggk.',
			'.krrrrrrrkkgggk.',
			'.krrrrrrrkkgggk.',
			'.kkkkkkkkkkkkkk.'
		],
		{ k: '#2a1a10', y: '#f2c6a0', b: '#d9a27a', r: '#c2372b', g: '#3f8a3a' }
	),
	scroll: svg(
		[
			'.kkkkkkkkkk.',
			'kwwkpppppppk',
			'kwwkpllllppk',
			'.kkkpppppppk',
			'...kpllllppk',
			'...kpppppppk',
			'...kplllpppk',
			'...kpppppppk',
			'...kppkkkkkk',
			'....kkwwwwwk',
			'.....kkkkkk.'
		],
		{ k: '#3a2416', p: '#f6e3bd', l: '#b8946a', w: '#e2c896' }
	),
	quill: svg(
		[
			'.........kkk',
			'........kwwk',
			'.......kwwwk',
			'......kwwwk.',
			'.....kwwwk..',
			'....kwwwk...',
			'...kwwwk....',
			'..kwwk......',
			'..kkk.......',
			'.kk.........',
			'kk..........'
		],
		{ k: '#2a1a10', w: '#f6f0e4' }
	),
	plus: svg(
		['...kkk...', '...kgk...', '...kgk...', 'kkkkgkkkk', 'kggggggk.', 'kkkkgkkkk', '...kgk...', '...kgk...', '...kkk...'],
		{ k: '#1e3a12', g: '#7ad04a' }
	),
	key: svg(
		['.kkk.......', 'kyyyk......', 'ky.ykkkkkkk', 'kyyyyyyyyyk', '.kkkkkykyk.', '......k.k..'],
		{ k: '#2a1a10', y: '#f2c14e' }
	),
	trophy: svg(
		[
			'kkkkkkkkkk',
			'kyyyyyyyyk',
			'kyywyyyyyk',
			'.kywyyyyk.',
			'.kyyyyyyk.',
			'..kyyyyk..',
			'...kyyk...',
			'....kk....',
			'...kyyk...',
			'..kkkkkk..'
		],
		{ k: '#5a3410', y: '#f2c14e', w: '#fff3c0' }
	)
};
