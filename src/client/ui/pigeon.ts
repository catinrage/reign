import { svg } from './pixel';

/**
 * The carrier pigeon of the pigeon post: two wing beats for the flight (it carries a rolled note
 * tied with a red ribbon) and a perched one for the loft button.
 */

const PAL = {
	k: '#2a1a10',
	g: '#8a97ab',
	G: '#b8c3d2',
	d: '#5f6b80',
	x: '#3c4558',
	n: '#4e9a82',
	p: '#8a64a8',
	o: '#f29a3a',
	w: '#f2efe6',
	b: '#4a3c34',
	f: '#e07f7a',
	s: '#f4e1b8',
	S: '#cfae74',
	r: '#c2372b'
};

export const PIGEON = {
	/** Wings up, facing right. */
	up: svg(
		[
			'...kk....................',
			'..kGGk...................',
			'..kGGGk..................',
			'...kGGGkk................',
			'...kxGGGGk...............',
			'....kxGGGGk..............',
			'....kxxgGGGk.......kkk...',
			'.....kxxggGGk.....kgggk..',
			'......kxxgggGk...kpggokk.',
			'.kk....kkxgggGkkkpnggwbbk',
			'kddkk....kggggGnpnggkkk..',
			'kdddgkkkkggggggGnnggk....',
			'.kdddgggggggggggGGgk.....',
			'..kkddddggggggggggk......',
			'....kkkddggggggkkk.......',
			'.......kkkkfkkfk.........',
			'........kssrssk..........',
			'........kSSrSSk..........',
			'.........kkkkk...........'
		],
		PAL
	),
	/** Wings down, facing right; the same size as `up`, so the two frames swap in place. */
	down: svg(
		[
			'.........................',
			'.........................',
			'.........................',
			'.........................',
			'.........................',
			'.........................',
			'...................kkk...',
			'..................kgggk..',
			'.................kpggokk.',
			'.kk.............kpnggwbbk',
			'kddkk..........knpnggkkk.',
			'kdddgkkkkkkkkkkgGnnggk...',
			'.kdddgggggGGGGGGGGGgk....',
			'..kkddddxxxxxxxGGGgk.....',
			'....kkdxxGGGGGxxgkkfkkfk.',
			'......kxGGGGGGGkkssrssk..',
			'.....kxGGGGGkk..kSSrSSk..',
			'.....kGGGkk......kkkkk...',
			'......kkk................'
		],
		PAL
	),
	/** Sitting, facing right. */
	perched: svg(
		[
			'.........kkk....',
			'........kgggk...',
			'.......kpggokk..',
			'.......kpnggwbbk',
			'.......knpnggkk.',
			'..kkkkkkgnnggk..',
			'.kGGGGGGGGgggk..',
			'kxGGGGGGGGGggk..',
			'kxxGGGGGGGgggk..',
			'kdxxxgggggggk...',
			'kddkkxxggggk....',
			'kdddkkkkkkk.....',
			'.kkk..kfkfk.....',
			'.....kfkfk......'
		],
		PAL
	)
};

/** The flight frames' size in sprite pixels. */
export const PIGEON_W = 25;
export const PIGEON_H = 19;
