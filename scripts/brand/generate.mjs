/**
 * Rebuild Reign's brand assets: node scripts/brand/generate.mjs
 * Uses Node built-ins and the repo's Playwright + Pixelify Sans. Set BRAND_CHROME
 * to a Chrome/Chromium executable if Playwright's bundled browser isn't installed.
 * All artwork uses integer pixels, opaque palette colors and nearest-neighbor scaling.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = resolve(ROOT, 'src/client/public');
const DOCS = resolve(ROOT, 'docs');
const SCENE = readFileSync(resolve(ROOT, 'src/client/scene/logo.ts'), 'utf8');
// Read the source masks rather than maintaining a second interpretation of the title.
const glyphBlock = SCENE.match(/const GLYPHS[^=]*=\s*\{([\s\S]*?)\n\};/)[1];
const GLYPHS = Object.fromEntries(
	[...glyphBlock.matchAll(/([REGIN]):\s*\[([^\]]+)\]/g)].map(([, letter, rows]) => [
		letter,
		[...rows.matchAll(/'([X.]+)'/g)].map((row) => row[1])
	])
);
const CROWN = [...SCENE.match(/const CROWN = \[([^\]]+)\]/)[1].matchAll(/'([grb.]+)'/g)].map(
	(row) => row[1]
);
const COLORS = {
	top: '#ffe68a',
	hi: '#ffc93a',
	mid: '#f2a21c',
	low: '#cf7410',
	side: '#8f4808',
	sideDark: '#5a2804',
	rimLight: '#ffeaa0',
	rimDark: '#a85a0a',
	walnut: '#4a2812',
	walnutDark: '#2c1508',
	edge: '#1a0b04',
	ruby: '#ff3b30',
	sapphire: '#3d8bff',
	wood0: '#140904',
	wood1: '#2e180b',
	wood2: '#4a2a16',
	wood3: '#7d4b28',
	parch: '#f4e1b8',
	parch2: '#e8cd96',
	ink: '#3a2214',
	gold: '#ffd45a',
	gold2: '#f2b431',
	gold3: '#b8740f',
	red: '#e04b35',
	green: '#5fb43b'
};
const PALETTE = new Set(Object.values(COLORS));
assert.equal(Object.keys(GLYPHS).length, 5);
for (const rows of Object.values(GLYPHS)) assert.equal(rows.length, 9);
assert.deepEqual(CROWN, ['g..g..g', 'g.grg.g', 'ggggggg', 'gbgrgbg', 'ggggggg']);
for (const color of Object.values(COLORS)) {
	assert.ok(
		SCENE.includes(color) ||
			readFileSync(resolve(ROOT, 'src/client/styles/ui.css'), 'utf8').includes(color)
	);
}

class Pixels {
	constructor(width, height, fill = null) {
		this.width = width;
		this.height = height;
		this.pixels = Array(width * height).fill(fill);
	}
	get(x, y) {
		return this.pixels[y * this.width + x];
	}
	set(x, y, color) {
		if (x >= 0 && y >= 0 && x < this.width && y < this.height)
			this.pixels[y * this.width + x] = color;
	}
	rect(x, y, w, h, color) {
		for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) this.set(px, py, color);
	}
	paste(source, x, y) {
		for (let py = 0; py < source.height; py++)
			for (let px = 0; px < source.width; px++) {
				const color = source.get(px, py);
				if (color) this.set(x + px, y + py, color);
			}
	}
	scale(factor) {
		assert.ok(Number.isInteger(this.width * factor) && Number.isInteger(this.height * factor));
		const out = new Pixels(this.width * factor, this.height * factor);
		for (let y = 0; y < out.height; y++)
			for (let x = 0; x < out.width; x++) {
				out.set(x, y, this.get(Math.floor(x / factor), Math.floor(y / factor)));
			}
		return out;
	}
	validate() {
		for (const color of this.pixels)
			assert.ok(color === null || PALETTE.has(color), `Off-palette color ${color}`);
	}
}

function mask(rows, x, y, scale = 1, kind = 'L') {
	const out = new Map();
	for (let gy = 0; gy < rows.length; gy++)
		for (let gx = 0; gx < rows[gy].length; gx++) {
			const value = rows[gy][gx];
			if (value === '.') continue;
			for (let sy = 0; sy < scale; sy++)
				for (let sx = 0; sx < scale; sx++) {
					out.set(`${x + gx * scale + sx},${y + gy * scale + sy}`, value === 'X' ? kind : value);
				}
		}
	return out;
}
function merge(...masks) {
	return new Map(masks.flatMap((m) => [...m]));
}
function grow(shape, radius) {
	const out = new Map();
	for (const key of shape.keys()) {
		const [x, y] = key.split(',').map(Number);
		for (let dy = -radius; dy <= radius; dy++)
			for (let dx = -radius; dx <= radius; dx++) {
				if (dx * dx + dy * dy <= radius * radius + 1) out.set(`${x + dx},${y + dy}`, 'W');
			}
	}
	return out;
}
function paintShape(canvas, shape, color, dx = 0, dy = 0) {
	for (const key of shape.keys()) {
		const [x, y] = key.split(',').map(Number);
		canvas.set(x + dx, y + dy, color);
	}
}
function goldFace(canvas, shape, top, height) {
	for (const [key, kind] of shape) {
		const [x, y] = key.split(',').map(Number);
		let color;
		if (kind === 'r' || kind === 'b') color = kind === 'r' ? COLORS.ruby : COLORS.sapphire;
		else {
			const t = (y - top) / height;
			color =
				kind === 'g' || t < 0.12
					? COLORS.top
					: t < 0.42
						? COLORS.hi
						: t < 0.72
							? COLORS.mid
							: COLORS.low;
			if (!shape.has(`${x},${y - 1}`)) color = COLORS.rimLight;
			else if (!shape.has(`${x},${y + 1}`)) color = COLORS.rimDark;
		}
		canvas.set(x, y, color);
	}
}

function wordmark() {
	const word = 'REIGN',
		p = 3,
		pad = 5,
		crownH = CROWN.length + 1;
	const width = [...word].reduce((w, c) => w + GLYPHS[c][0].length, word.length - 1) * p;
	const result = new Pixels(width + pad * 2 + 2, (9 + crownH) * p + pad * 2 + 2);
	let x = pad;
	const letters = new Map(),
		crown = new Map();
	for (const c of word) {
		for (const entry of mask(GLYPHS[c], x, pad + crownH * p, p)) letters.set(...entry);
		if (c === 'I') {
			const cx = x + Math.floor((GLYPHS.I[0].length - CROWN[0].length) / 2) * p;
			for (const entry of mask(CROWN, cx, pad, p)) crown.set(...entry);
		}
		x += (GLYPHS[c][0].length + 1) * p;
	}
	const solid = merge(letters, crown),
		outer = grow(solid, 3),
		inner = grow(solid, 2);
	paintShape(result, outer, COLORS.edge, 2, 2);
	paintShape(result, outer, COLORS.edge);
	paintShape(result, inner, COLORS.walnutDark, 1, 1);
	paintShape(result, inner, COLORS.walnut);
	paintShape(result, solid, COLORS.sideDark, 2, 2);
	paintShape(result, solid, COLORS.side, 1, 1);
	goldFace(result, solid, pad + crownH * p, 9 * p);
	return result;
}

// The two smallest marks are drawn independently, with deliberate counter/stroke widths.
// At 16px the exact scene R fits in 8x9; at 32px its bowl and leg are opened up.
const R32 = [
	'XXXXXXXXXXXX..',
	'XXXXXXXXXXXXX.',
	'XXX.......XXX.',
	'XXX.......XXX.',
	'XXX.......XXX.',
	'XXX.......XXX.',
	'XXX.......XXX.',
	'XXXXXXXXXXXXX.',
	'XXXXXXXXXXXX..',
	'XXX..XXXX.....',
	'XXX...XXXX....',
	'XXX....XXXX...',
	'XXX.....XXXX..',
	'XXX......XXXX.',
	'XXX.......XXXX',
	'XXX........XXX'
];
const CROWN32 = [
	'gg....g....gg',
	'gg...grg...gg',
	'gg...ggg...gg',
	'ggggggggggggg',
	'ggbgggrgggbgg',
	'ggbgggrgggbgg',
	'ggggggggggggg',
	'ggggggggggggg'
];
function tile(size, solidBackground) {
	const result = new Pixels(size, size, solidBackground ? COLORS.walnutDark : null);
	const corner = size <= 16 ? 2 : size <= 32 ? 4 : 6;
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const inset = Math.max(0, corner - Math.min(y, size - 1 - y));
			if (x < inset || x >= size - inset) continue;
			const edge = x === inset || x === size - 1 - inset || y === 0 || y === size - 1;
			result.set(
				x,
				y,
				edge ? COLORS.edge : y < 2 ? COLORS.wood3 : y > size - 4 ? COLORS.walnutDark : COLORS.walnut
			);
		}
	return result;
}
function icon(size, solidBackground = false) {
	const result = tile(size, solidBackground);
	let shape, top, height;
	if (size === 16) {
		top = 6;
		height = 9;
		// A one-pixel gap separates the crown from the R's top bar at native size.
		const tinyCrown = ['g..g..g', 'g.grg.g', 'gbgrgbg', 'ggggggg'];
		shape = merge(mask(GLYPHS.R, 4, top), mask(tinyCrown, 4, 1));
	} else if (size === 32) {
		top = 13;
		height = 16;
		shape = merge(mask(R32, 9, top), mask(CROWN32, 9, 3));
	} else if (size === 48) {
		top = 24;
		height = 18;
		shape = merge(mask(GLYPHS.R, 16, top, 2), mask(CROWN, 16, 9, 2));
	} else if (size === 60 || size === 64) {
		top = size === 60 ? 26 : 28;
		height = 27;
		const x = (size - 24) / 2;
		shape = merge(mask(GLYPHS.R, x, top, 3), mask(CROWN, x, top - 21, 3));
	} else throw new Error(`No hand-tuned grid for ${size}px`);
	paintShape(result, grow(shape, size < 48 ? 1 : 2), COLORS.edge, 1, 1);
	paintShape(result, shape, COLORS.sideDark, 1, 1);
	goldFace(result, shape, top, height);
	return result;
}

function svg(pixels, title) {
	pixels.validate();
	const rects = [];
	for (let y = 0; y < pixels.height; y++) {
		for (let x = 0; x < pixels.width;) {
			const color = pixels.get(x, y);
			let end = x + 1;
			while (end < pixels.width && pixels.get(end, y) === color) end++;
			if (color)
				rects.push(`  <rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}" />`);
			x = end;
		}
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels.width}" height="${pixels.height}" viewBox="0 0 ${pixels.width} ${pixels.height}" shape-rendering="crispEdges" role="img" aria-labelledby="title">\n  <title id="title">${title}</title>\n${rects.join('\n')}\n</svg>\n`;
}
// Deliberately small SVG renderer: the generated artwork consists solely of integer rects.
// PNGs are read back from the saved SVG, then scaled with nearest-neighbor sampling.
function renderSvg(path) {
	const source = readFileSync(path, 'utf8');
	const [, w, h] = source.match(/viewBox="0 0 (\d+) (\d+)"/);
	const out = new Pixels(+w, +h);
	for (const [, x, y, width, height, color] of source.matchAll(
		/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[\da-f]{6})"\s*\/>/g
	))
		out.rect(+x, +y, +width, +height, color);
	return out;
}
function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
	const type = Buffer.from(name),
		length = Buffer.alloc(4),
		crc = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
	return Buffer.concat([length, type, data, crc]);
}
function png(pixels) {
	pixels.validate();
	const header = Buffer.alloc(13);
	header.writeUInt32BE(pixels.width);
	header.writeUInt32BE(pixels.height, 4);
	header[8] = 8;
	header[9] = 6; // 8-bit RGBA, alpha is always exactly 0 or 255.
	const raw = Buffer.alloc((pixels.width * 4 + 1) * pixels.height);
	for (let y = 0; y < pixels.height; y++)
		for (let x = 0; x < pixels.width; x++) {
			const color = pixels.get(x, y),
				index = y * (pixels.width * 4 + 1) + 1 + x * 4;
			if (!color) continue;
			const value = Number.parseInt(color.slice(1), 16);
			raw[index] = value >> 16;
			raw[index + 1] = value >> 8;
			raw[index + 2] = value;
			raw[index + 3] = 255;
		}
	return Buffer.concat([
		Buffer.from('89504e470d0a1a0a', 'hex'),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}
function ico(images) {
	const data = images.map(png),
		directory = Buffer.alloc(6 + images.length * 16);
	directory.writeUInt16LE(1, 2);
	directory.writeUInt16LE(images.length, 4);
	let offset = directory.length;
	images.forEach((image, i) => {
		const entry = 6 + i * 16;
		directory[entry] = image.width;
		directory[entry + 1] = image.height;
		directory.writeUInt16LE(1, entry + 4);
		directory.writeUInt16LE(32, entry + 6);
		directory.writeUInt32LE(data[i].length, entry + 8);
		directory.writeUInt32LE(offset, entry + 12);
		offset += data[i].length;
	});
	return Buffer.concat([directory, ...data]);
}

async function textRenderer() {
	const executablePath =
		process.env.BRAND_CHROME ||
		(existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
	const browser = await chromium.launch({ headless: true, executablePath });
	const page = await browser.newPage();
	const font = readFileSync(
		resolve(
			ROOT,
			'node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-700-normal.woff2'
		)
	).toString('base64');
	await page.evaluate(async (data) => {
		const font = new FontFace('BrandPixel', `url(data:font/woff2;base64,${data})`);
		document.fonts.add(await font.load());
	}, font);
	return {
		close: () => browser.close(),
		async draw(text, size, color) {
			const result = await page.evaluate(
				({ text, size }) => {
					const canvas = document.createElement('canvas'),
						ctx = canvas.getContext('2d');
					ctx.font = `700 ${size}px BrandPixel`;
					canvas.width = Math.ceil(ctx.measureText(text).width) + 2;
					canvas.height = size + 4;
					ctx.font = `700 ${size}px BrandPixel`;
					ctx.fillStyle = '#ffffff';
					ctx.fillText(text, 1, size);
					// Pixelify's B has a gap in its middle bar that reads as G with a dark
					// outline. Join that bar on the pixel grid, preserving the rest of the font.
					for (let i = 0; i < text.length; i++) {
						if (text[i] !== 'B') continue;
						const probe = document.createElement('canvas');
						probe.width = size * 2;
						probe.height = size + 4;
						const pc = probe.getContext('2d');
						pc.font = ctx.font;
						pc.fillText('B', 0, size);
						const pd = pc.getImageData(0, 0, probe.width, probe.height).data;
						const points = [];
						for (let y = 0; y < probe.height; y++)
							for (let x = 0; x < probe.width; x++) {
								if (pd[(y * probe.width + x) * 4 + 3] >= 128) points.push([x, y]);
							}
						const left = Math.min(...points.map(([x]) => x)),
							right = Math.max(...points.map(([x]) => x));
						const top = Math.min(...points.map(([, y]) => y)),
							bottom = Math.max(...points.map(([, y]) => y));
						const x = 1 + Math.round(ctx.measureText(text.slice(0, i)).width) + left;
						ctx.fillRect(
							x,
							Math.floor((top + bottom) / 2),
							right - left + 1,
							Math.max(1, Math.round(size / 10))
						);
					}
					const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
					const pixels = [];
					for (let y = 0; y < canvas.height; y++)
						for (let x = 0; x < canvas.width; x++) {
							// Threshold the font mask; never carry anti-aliased colors into the artwork.
							if (data[(y * canvas.width + x) * 4 + 3] >= 128) pixels.push([x, y]);
						}
					return { pixels };
				},
				{ text, size }
			);
			const xs = result.pixels.map(([x]) => x),
				ys = result.pixels.map(([, y]) => y);
			const left = Math.min(...xs),
				top = Math.min(...ys);
			const out = new Pixels(Math.max(...xs) - left + 1, Math.max(...ys) - top + 1);
			for (const [x, y] of result.pixels) out.set(x - left, y - top, color);
			return out;
		}
	};
}
function outlineText(canvas, text, x, y, color) {
	const shape = new Map();
	for (let py = 0; py < text.height; py++)
		for (let px = 0; px < text.width; px++) {
			if (text.get(px, py)) shape.set(`${x + px},${y + py}`, 'X');
		}
	paintShape(canvas, grow(shape, 1), color);
	canvas.paste(text, x, y);
}
async function banner(logo, font) {
	const out = new Pixels(320, 160, COLORS.wood1);
	// Offset walnut planks with carved seams, short grain runs and brass fasteners.
	for (let row = 0; row < 8; row++) {
		const y = row * 20;
		out.rect(0, y, 320, 1, COLORS.wood0);
		out.rect(0, y + 1, 320, 1, COLORS.walnut);
		out.rect(0, y + 19, 320, 1, COLORS.walnutDark);
		for (let x = (row % 2) * 40 + 16; x < 320; x += 80) {
			out.rect(x, y + 2, 1, 17, COLORS.wood0);
			out.rect(x + 1, y + 2, 1, 17, COLORS.walnut);
			out.rect(x + 5, y + 5, 2, 2, COLORS.walnutDark);
			out.rect(x + 5, y + 5, 1, 1, COLORS.wood3);
		}
		for (let x = (row * 29) % 61; x < 320; x += 67) {
			out.rect(x, y + 7, 24, 1, COLORS.walnutDark);
			out.rect(x + 8, y + 13, 18, 1, COLORS.walnut);
		}
	}
	out.rect(3, 3, 314, 2, COLORS.walnut);
	out.rect(3, 155, 314, 2, COLORS.wood0);
	out.rect(3, 5, 2, 150, COLORS.walnut);
	out.rect(315, 5, 2, 150, COLORS.wood0);
	for (const x of [7, 309])
		for (const y of [7, 151]) {
			out.rect(x - 1, y - 1, 4, 4, COLORS.wood0);
			out.rect(x, y, 2, 2, COLORS.gold3);
			out.set(x, y, COLORS.gold);
		}
	const large = logo.scale(2);
	out.paste(large, (out.width - large.width) / 2, 7);
	// Same forked-tail/fold/stitched-edge geometry as ui/art.ts, widened for the tagline.
	const ribbon = new Pixels(260, 26);
	for (let y = 0; y < 26; y++)
		for (let x = 0; x < 260; x++) {
			const tx = Math.min(x, 259 - x);
			if (x >= 12 && x <= 247 && y >= 1 && y <= 21) {
				const edge = x === 12 || x === 247 || y === 1 || y === 21;
				const color = edge
					? COLORS.edge
					: y === 2
						? COLORS.ruby
						: y >= 19
							? COLORS.rimDark
							: COLORS.red;
				ribbon.set(x, y, color);
				if ((y === 3 || y === 18) && x % 3 === 0) ribbon.set(x, y, COLORS.parch2);
			} else if (y >= 6 && y <= 25 && tx <= 16) {
				const notch = Math.max(0, Math.round(6 - Math.abs(y - 15.5) * 0.75));
				if (tx < notch) continue;
				ribbon.set(
					x,
					y,
					y === 6 || y === 25 || tx === notch ? COLORS.edge : y === 7 ? COLORS.red : COLORS.rimDark
				);
			}
			if (y >= 22 && tx >= 12 && tx <= 15 && tx - 12 <= y - 22) ribbon.set(x, y, COLORS.edge);
		}
	const tagline = await font.draw('SETTLE · TRADE · BUILD', 20, COLORS.parch);
	assert.ok(tagline.width < 224, 'Tagline must fit inside the ribbon');
	outlineText(ribbon, tagline, Math.floor((260 - tagline.width) / 2), 5, COLORS.edge);
	out.paste(ribbon, 30, 124);
	return out.scale(4);
}
async function preview(logo, banner, small, medium, font) {
	const out = new Pixels(1600, 880, COLORS.parch);
	out.rect(0, 440, 1600, 440, COLORS.wood0);
	for (const [row, color] of [
		[0, COLORS.ink],
		[440, COLORS.parch]
	]) {
		out.paste(
			await font.draw(
				row === 0 ? 'REIGN / LIGHT BACKGROUND' : 'REIGN / DARK BACKGROUND',
				20,
				color
			),
			32,
			row + 24
		);
		for (const [x, label] of [
			[32, '16PX'],
			[208, '32PX'],
			[424, 'WORDMARK'],
			[928, 'BANNER']
		]) {
			out.paste(await font.draw(label, 20, color), x, row + 70);
		}
		// Actual-size icons plus large nearest-neighbor proofs, with clear labels.
		out.paste(small, 32, row + 104);
		out.paste(small.scale(8), 32, row + 144);
		out.paste(medium, 208, row + 104);
		out.paste(medium.scale(4), 208, row + 144);
		out.paste(logo.scale(3), 424, row + 140);
		out.paste(banner.scale(0.5), 928, row + 104);
	}
	return out;
}

mkdirSync(PUBLIC, { recursive: true });
writeFileSync(
	resolve(PUBLIC, 'logo.svg'),
	svg(wordmark(), 'Reign — gold voxel wordmark with jeweled crown')
);
writeFileSync(resolve(PUBLIC, 'favicon.svg'), svg(icon(16), 'Reign — crowned gold R on walnut'));
const logo = renderSvg(resolve(PUBLIC, 'logo.svg'));
const small = renderSvg(resolve(PUBLIC, 'favicon.svg')),
	medium = icon(32);
writeFileSync(resolve(PUBLIC, 'logo.png'), png(logo.scale(4)));
writeFileSync(resolve(PUBLIC, 'logo@2x.png'), png(logo.scale(8)));
writeFileSync(resolve(PUBLIC, 'favicon-32.png'), png(medium));
writeFileSync(resolve(PUBLIC, 'favicon.ico'), ico([small, medium, icon(48)]));
writeFileSync(resolve(PUBLIC, 'apple-touch-icon.png'), png(icon(60, true).scale(3)));
writeFileSync(resolve(PUBLIC, 'icon-192.png'), png(icon(48).scale(4)));
writeFileSync(resolve(PUBLIC, 'icon-512.png'), png(icon(64).scale(8)));
writeFileSync(
	resolve(PUBLIC, 'site.webmanifest'),
	JSON.stringify(
		{
			name: 'Reign',
			short_name: 'Reign',
			start_url: '/',
			display: 'standalone',
			theme_color: '#1a0e08',
			background_color: '#1a0e08',
			icons: [
				{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
				{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
			]
		},
		null,
		'\t'
	) + '\n'
);
const font = await textRenderer();
try {
	const social = await banner(logo, font);
	writeFileSync(resolve(DOCS, 'logo-banner.png'), png(social));
	writeFileSync(
		resolve(DOCS, 'brand-preview.png'),
		png(await preview(logo, social, small, medium, font))
	);
} finally {
	await font.close();
}
console.log(
	`Generated brand assets; wordmark grid ${logo.width}x${logo.height}, PNG scales 4x / 8x.`
);
