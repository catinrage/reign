/** Tiny pixel-art icons drawn as crisp SVG, to match the voxel world in the 2D interface. */

export function svg(rows: string[], pal: Record<string, string>): string {
	const h = rows.length;
	const w = rows[0].length;
	let rects = '';
	rows.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const c = pal[row[x]];
			if (c) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`;
		}
	});
	return `data:image/svg+xml;utf8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`
	)}`;
}

const base = { k: '#2a1a10', w: '#ffffff' };

export const PIXEL = {
	knight: svg(
		[
			'................',
			'.......kk.......',
			'......kssk......',
			'......kssk......',
			'..kkk.kssk.kkk..',
			'.krrrkkssskrrrk.',
			'.krrrrkssksrrrk.',
			'.krrrrrkkrrrrrk.',
			'.krrrryyyyrrrrk.',
			'..krrryyyyrrrk..',
			'..krrrrrrrrrrk..',
			'...krrrrrrrrk...',
			'....krrrrrrk....',
			'.....krrrrk.....',
			'......kkkk......',
			'................'
		],
		{ ...base, r: '#c2372b', s: '#d9dde4', y: '#f2c14e' }
	),
	roadBuilding: svg(
		[
			'................',
			'................',
			'..........kkkkk.',
			'.........kbbbbk.',
			'........kbbbbk..',
			'.......kbbbbk...',
			'......kbbbbk....',
			'.....kbbbbk.....',
			'....kbbbbk......',
			'...kbbbbk.......',
			'..kbbbbk....kkk.',
			'.kbbbbk....kyyk.',
			'.kkkkk....kyyyk.',
			'..........kyyk..',
			'...........kk...',
			'................'
		],
		{ ...base, b: '#a0662f', y: '#f2c14e' }
	),
	yearOfPlenty: svg(
		[
			'................',
			'.....k...k......',
			'....kyk.kyk.....',
			'....kyk.kyk..k..',
			'.k..kyykyyk.kyk.',
			'kyk..kyyyk..kyk.',
			'kyyk.kyyyk.kyyk.',
			'.kyykkyyykkyyk..',
			'..kyyyyyyyyyk...',
			'...kgggggggk....',
			'...kgGGGGGgk....',
			'...kgggggggk....',
			'....kyyyyyk.....',
			'....kyyyyyk.....',
			'.....kkkkk......',
			'................'
		],
		{ ...base, y: '#f6c33a', g: '#8a5a2b', G: '#c08a4a' }
	),
	monopoly: svg(
		[
			'................',
			'......kkkk......',
			'.....kbbbbk.....',
			'......kyyk......',
			'.....kbbbbk.....',
			'....kbbbbbbk....',
			'...kbbbyybbbk...',
			'..kbbbyyyybbbk..',
			'..kbbbybbbbbbk..',
			'..kbbbyyyybbbk..',
			'..kbbbbbbybbbk..',
			'..kbbbyyyybbbk..',
			'...kbbbyybbbk...',
			'....kkkkkkkk....',
			'................',
			'................'
		],
		{ ...base, b: '#7a5232', y: '#f2c14e' }
	),
	victoryPoint: svg(
		[
			'................',
			'................',
			'..k....k....k...',
			'.kyk..kyk..kyk..',
			'.kyyk.kyk.kyyk..',
			'.kyyykkyykyyyk..',
			'.kyyyyyyyyyyyk..',
			'.kyyryyybyyryk..',
			'.kyyyyyyyyyyyk..',
			'.kooooooooooook.',
			'.kyyyyyyyyyyyk..',
			'..kkkkkkkkkkk...',
			'................',
			'................',
			'................',
			'................'
		],
		{ ...base, y: '#f2c14e', r: '#d23b2f', b: '#2c5fd6', o: '#c8902a' }
	),
	crown: svg(
		['k.....k.....k', 'yk...kyk...ky', 'yyk.kyyyk.kyy', 'yyykyyyyykyyy', 'yyyyyyyyyyyyy', 'kkkkkkkkkkkkk'],
		{ ...base, y: '#f2c14e' }
	),
	army: svg(
		['....kk....', '...kssk...', '...kssk...', 'kk.kssk.kk', 'krrkkkkrrk', 'krrryyrrrk', '.krrrrrrk.', '..krrrrk..', '...kkkk...'],
		{ ...base, r: '#c2372b', s: '#d9dde4', y: '#f2c14e' }
	),
	road: svg(
		['......kkk', '.....kbbk', '....kbbk.', '...kbbk..', '..kbbk...', '.kbbk....', 'kbbk.....', 'kkk......'],
		{ ...base, b: '#c08a4a' }
	),
	cards: svg(
		['..kkkkk..', '.kwwwwwk.', 'kkkkkkwk.', 'kwwwwkwk.', 'kwyywkwk.', 'kwyywkk..', 'kwwwwk...', 'kkkkkk...'],
		{ ...base, y: '#f2c14e', w: '#f6e3bd' }
	),
	dev: svg(
		['kkkkkk', 'kpppPk', 'kpyyPk', 'kpyyPk', 'kpppPk', 'kkkkkk'],
		{ ...base, p: '#7a4ec2', P: '#5a3496', y: '#f2c14e' }
	),
	/** A padlock: something only you can see. */
	lock: svg(['..kkk..', '.k...k.', '.k...k.', 'kkkkkkk', 'kyyyyyk', 'kyykyyk', 'kyykyyk', 'kyyyyyk', 'kkkkkkk'], {
		k: '#2a1404',
		y: '#f2c14e'
	}),
	/** The back of a development card: what it is stays a mystery. */
	devBack: svg(
		[
			'................',
			'.....kkkkkk.....',
			'....kkyyyykk....',
			'...kkyyyyyykk...',
			'...kyyykkyyyk...',
			'...kyykkkkyyk...',
			'...kkkk.kkyyk...',
			'.......kkyyyk...',
			'......kkyyykk...',
			'......kyyykk....',
			'......kyykk.....',
			'......kyyk......',
			'......kkkk......',
			'......kyyk......',
			'......kyyk......',
			'......kkkk......'
		],
		{ k: '#2a1404', y: '#f2c14e' }
	),
	bot: svg(
		['...kk...', '..kyyk..', 'kkkkkkkk', 'kssssssk', 'ksrssrsk', 'kssssssk', 'ksskkssk', 'kkkkkkkk'],
		{ ...base, s: '#cfd6df', r: '#ff5a3c', y: '#f2c14e' }
	),
	trade: svg(
		['....k.....', '....kk....', 'kkkkkyk...', 'kyyyyyyk..', 'kkkkkyk...', '....kk..k.', '....k..kk.', '...kgkkkkk', '..kggggggk', '...kgkkkkk', '....kk....'],
		{ ...base, y: '#f2c14e', g: '#7fd36b' }
	),
	moon: svg(
		[
			'.....k........',
			'...kkdk....w..',
			'..kddyk...www.',
			'.kddyk.....w..',
			'kddyyk........',
			'kdyyyk........',
			'kdyyyyk.......',
			'kdyyyyk.......',
			'kdyyyyykk..kk.',
			'kddyyyyyykkddk',
			'.kdyyyyyyyydk.',
			'..kdyyyyyydk..',
			'...kddddddk...',
			'....kkkkkk....'
		],
		{ ...base, y: '#fff0a8', d: '#e3b84e' }
	),
	die: svg(
		[
			'.kkkkkkkkkk.',
			'kwwwwwwwwwsk',
			'kwppwwwwppsk',
			'kwppwwwwppsk',
			'kwwwwwwwwwsk',
			'kwwwwppwwwsk',
			'kwwwwppwwwsk',
			'kwwwwwwwwwsk',
			'kwppwwwwppsk',
			'kwppwwwwppsk',
			'kssssssssssk',
			'.kkkkkkkkkk.'
		],
		{ ...base, w: '#fffaf0', s: '#d9cdb4', p: '#3a1f1a' }
	),
	hourglass: svg(
		[
			'bbbbbbbbbb',
			'.kwwwwwwk.',
			'.kyyyyyyk.',
			'..kyyyyk..',
			'...kyyk...',
			'....kk....',
			'...kwwk...',
			'..kwwyyk..',
			'.kwyyyyyk.',
			'.kyyyyyyk.',
			'bbbbbbbbbb'
		],
		{ ...base, b: '#8a5430', w: '#d8eef5', y: '#f2c14e' }
	),
	watch: svg(
		[
			'....kkk....',
			'....kyk....',
			'...kkkkk...',
			'.kkyyyyykk.',
			'.kywwwwwYk.',
			'kywwwkwwwYk',
			'kywwwkwwwYk',
			'kywwwkkkwYk',
			'kywwwwwwwYk',
			'.kYwwwwwYk.',
			'.kkYYYYYkk.',
			'...kkkkk...'
		],
		{ ...base, y: '#f2c14e', Y: '#b8740f', w: '#f6e3bd' }
	),
	gear: svg(
		[
			'.....kk.....',
			'..k.kggk.k..',
			'.kgkggggkgk.',
			'..kggggggk..',
			'.kggkkkkggk.',
			'kggk....kggk',
			'kggk....kggk',
			'.kggkkkkggk.',
			'..kggggggk..',
			'.kgkggggkgk.',
			'..k.kggk.k..',
			'.....kk.....'
		],
		{ k: '#4a2c08', g: '#e6b04a' }
	),
	hammer: svg(
		[
			'..kkkkkk....',
			'.kssssssk...',
			'kssSSSSssk..',
			'kSSkkkkSSk..',
			'.kk.kbbk.k..',
			'....kbbk....',
			'....kbbk....',
			'....kbbk....',
			'....kbbk....',
			'....kbbk....',
			'....kBBk....',
			'.....kk.....'
		],
		{ k: '#2a1a10', s: '#d9dde3', S: '#8d96a3', b: '#c58a4a', B: '#7a4a22' }
	),
	/** An arrow up: a city growing into a castle, a guild hall or a fortress. */
	grow: svg(
		[
			'....k....',
			'...kgk...',
			'..kgggk..',
			'.kgggggk.',
			'kgggggggk',
			'kkkgggkkk',
			'..kgggk..',
			'..kgggk..',
			'..kGGGk..',
			'..kkkkk..'
		],
		{ k: '#1e2a0e', g: '#a8e070', G: '#5e9a34' }
	),
	pause: svg(
		['kkk..kkk', 'kyk..kyk', 'kyk..kyk', 'kyk..kyk', 'kyk..kyk', 'kyk..kyk', 'kyk..kyk', 'kyk..kyk', 'kkk..kkk'],
		{ k: '#3a1d04', y: '#fff3b8' }
	),
	book: svg(
		[
			'.kkkk..kkkk.',
			'kppppkkppppk',
			'kpllpkkpllpk',
			'kppppkkppppk',
			'kpllpkkpllpk',
			'kppppkkppppk',
			'kpllpkkpllpk',
			'kppppkkppppk',
			'kkkkkkkkkkkk',
			'.rrrrrrrrrr.'
		],
		{ k: '#3a2416', p: '#f6e3bd', l: '#b8946a', r: '#9a2c1c' }
	),
	door: svg(
		[
			'..kkkkkk..',
			'.kbbbbbbk.',
			'kbbdbbdbbk',
			'kbbdbbdbbk',
			'kbbdbbdbbk',
			'kbbdbbdbbk',
			'kbbdbbdybk',
			'kbbdbbdbbk',
			'kbbdbbdbbk',
			'kbbdbbdbbk',
			'kkkkkkkkkk'
		],
		{ k: '#1e0e06', b: '#8a5430', d: '#5e351b', y: '#f2c14e' }
	),
	play: svg(
		[
			'kk.......',
			'kyk......',
			'kyyk.....',
			'kyyyk....',
			'kyyyyk...',
			'kyyyk....',
			'kyyk.....',
			'kyk......',
			'kk.......'
		],
		{ k: '#3a1d04', y: '#fff3b8' }
	),
	/** A small arrow that points at whose turn it is. */
	pointer: svg(['kk...', 'kwk..', 'kwwk.', 'kwwwk', 'kwwk.', 'kwk..', 'kk...'], {
		k: '#1a0c05',
		w: '#fff6e0'
	}),
	letter: svg(
		[
			'kkkkkkkkkkkk',
			'kwkwwwwwwkwk',
			'kwwkwwwwkwwk',
			'kwwwkwwkwwwk',
			'kwwwwkrkwwwk',
			'kwwwwrrrwwwk',
			'kwwwwwrwwwwk',
			'kkkkkkkkkkkk'
		],
		{ k: '#6a4a2a', w: '#f6e3bd', r: '#c2271d' }
	),
	speaker: svg(
		[
			'.....k......',
			'....kk...k..',
			'kkkkwk.k..k.',
			'kwwwwk..k.k.',
			'kwwwwk..k.k.',
			'kkkkwk.k..k.',
			'....kk...k..',
			'.....k......'
		],
		{ k: '#2a1a10', w: '#e6d2b0' }
	),
	mute: svg(
		[
			'.....k......',
			'....kk......',
			'kkkkwk.r...r',
			'kwwwwk..r.r.',
			'kwwwwk...r..',
			'kkkkwk..r.r.',
			'....kk.r...r',
			'.....k......'
		],
		{ k: '#2a1a10', w: '#e6d2b0', r: '#d8352a' }
	),
	close: svg(
		[
			'kk.....kk',
			'kwk...kwk',
			'.kwk.kwk.',
			'..kwkwk..',
			'...kwk...',
			'..kwkwk..',
			'.kwk.kwk.',
			'kwk...kwk',
			'kk.....kk'
		],
		{ k: '#2a1006', w: '#ffe1c8' }
	),
	check: svg(
		[
			'........kk',
			'.......kgk',
			'kk....kgk.',
			'kgk..kgk..',
			'.kgkkgk...',
			'..kggk....',
			'...kk.....'
		],
		{ k: '#10260a', g: '#9be27b' }
	),
	star: svg(
		[
			'....k....',
			'...kyk...',
			'kkkkyykkk',
			'kyyyyyyyk',
			'.kyyyyyk.',
			'..kyyyk..',
			'.kyykyyk.',
			'.kyk.kyk.',
			'.kk...kk.'
		],
		{ k: '#5a3010', y: '#ffd86b' }
	),
	anchor: svg(
		[
			'...kkk...',
			'...k.k...',
			'...kkk...',
			'.kkkkkkk.',
			'....k....',
			'....k....',
			'k...k...k',
			'kk..k..kk',
			'.kk.k.kk.',
			'..kkkkk..'
		],
		{ k: '#2c3a52' }
	),
	sword: svg(
		[
			'........kk',
			'.......kwk',
			'......kwk.',
			'.....kwk..',
			'.k..kwk...',
			'.kkkwk....',
			'..kyk.....',
			'.kykk.....',
			'kyk.kk....',
			'kk........'
		],
		{ k: '#2a1a10', w: '#e4e8ee', y: '#c08a4a' }
	),
	chat: svg(
		[
			'.kkkkkkkkk.',
			'kwwwwwwwwwk',
			'kwkkwkkwkwk',
			'kwwwwwwwwwk',
			'kwkkkwkkwwk',
			'kwwwwwwwwwk',
			'.kkkwkkkkk.',
			'...kk......',
			'..k........'
		],
		{ k: '#3a2416', w: '#f6e3bd' }
	),
	house: svg(
		[
			'....kk....',
			'...krrk...',
			'..krrrrk..',
			'.krrrrrrk.',
			'krrrrrrrrk',
			'.kwwwwwwk.',
			'.kwwkkwwk.',
			'.kwwkdkwk.',
			'.kwwkdkwk.',
			'.kkkkkkkk.'
		],
		{ k: '#2a1a10', r: '#c2372b', w: '#f0dcc0', d: '#6a3f22' }
	),
	shieldIcon: svg(
		[
			'kkkkkkkkk',
			'kyyyyyyyk',
			'kyrrrrryk',
			'kyrryrryk',
			'kyryyyryk',
			'kyrryrryk',
			'.kyrrryk.',
			'..kyyyk..',
			'...kkk...'
		],
		{ k: '#2a1a10', y: '#f2c14e', r: '#c2372b' }
	),
	tankard: svg(
		[
			'..wwwww....',
			'.wwwwwww...',
			'kwwwwwwwk..',
			'khywyyyykkk',
			'khywyyyyk.k',
			'khyyyyyyk.k',
			'khyyyyyyk.k',
			'khyyyyyykkk',
			'khyyyyyyk..',
			'.kkkkkkk...'
		],
		{ k: '#5a3010', y: '#f2a52c', h: '#ffd27a', w: '#fffaf0' }
	),
	eye: svg(
		[
			'....kkkkkk....',
			'..kkwwwwwwkk..',
			'.kwwwwbbwwwwk.',
			'kwwwwbbbbwwwwk',
			'kwwwbbkkbbwwwk',
			'kwwwwbbbbwwwwk',
			'.kwwwwbbwwwwk.',
			'..kkwwwwwwkk..',
			'....kkkkkk....'
		],
		{ k: '#2a1a10', w: '#fff6e0', b: '#3f86c9' }
	)
};
