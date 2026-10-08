/** Tiny pixel-art icons drawn as crisp SVG, to match the voxel world in the 2D interface. */

function svg(rows: string[], pal: Record<string, string>): string {
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
	bot: svg(
		['...kk...', '..kyyk..', 'kkkkkkkk', 'kssssssk', 'ksrssrsk', 'kssssssk', 'ksskkssk', 'kkkkkkkk'],
		{ ...base, s: '#cfd6df', r: '#ff5a3c', y: '#f2c14e' }
	),
	trade: svg(
		['....k.....', '....kk....', 'kkkkkyk...', 'kyyyyyyk..', 'kkkkkyk...', '....kk..k.', '....k..kk.', '...kgkkkkk', '..kggggggk', '...kgkkkkk', '....kk....'],
		{ ...base, y: '#f2c14e', g: '#7fd36b' }
	)
};
