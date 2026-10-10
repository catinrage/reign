import { PLAYER_COLORS } from '../../shared/rules/config';
import { PLAYER_CSS } from '../scene/layout';
import type { DiceStyleId } from '../../shared/accounts';
import { DICE_LOOKS, markAt } from '../scene/diceStyles';

/**
 * Pixel-art pieces for the 2D interface, drawn as crisp SVG at startup: 9-slice frames
 * (carved wood with brass corners, parchment, buttons, wells), cloth ribbons in every
 * player color, coins and crests. They are exposed as CSS variables (`--art-*`), so the
 * stylesheets use them with `border-image` and stay sharp at any size.
 */

type Paint = (x: number, y: number) => string | null;

/** Draw a w×h pixel image; the painter returns a color or null (transparent) per pixel. */
export function pixelSvg(w: number, h: number, paint: Paint): string {
	let rects = '';
	for (let y = 0; y < h; y++) {
		let run: string | null = null;
		let start = 0;
		for (let x = 0; x <= w; x++) {
			const c = x < w ? paint(x, y) : null;
			if (c !== run) {
				if (run)
					rects += `<rect x="${start}" y="${y}" width="${x - start + 0.02}" height="1.02" fill="${run}"/>`;
				run = c;
				start = x;
			}
		}
	}
	return `url("data:image/svg+xml;utf8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`
	)}")`;
}

/** Stable hash in [0,1) for small integer coordinates. */
function h2(x: number, y: number, s = 0) {
	let n = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
	n = Math.imul(n ^ (n >>> 13), 1274126177);
	return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function rgb(hex: string): [number, number, number] {
	const v = parseInt(hex.slice(1), 16);
	return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function toHex([r, g, b]: [number, number, number]) {
	return `#${[r, g, b]
		.map((c) =>
			Math.max(0, Math.min(255, Math.round(c)))
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;
}
/** Mix a color toward white (t > 0) or black (t < 0). */
export function tint(hex: string, t: number) {
	const c = rgb(hex);
	const target = t > 0 ? 255 : 0;
	const k = Math.abs(t);
	return toHex([
		c[0] + (target - c[0]) * k,
		c[1] + (target - c[1]) * k,
		c[2] + (target - c[2]) * k
	]);
}

/** Distance to the nearest edge, and which side it is on. */
function edge(x: number, y: number, w: number, h: number) {
	const l = x;
	const t = y;
	const r = w - 1 - x;
	const b = h - 1 - y;
	const e = Math.min(l, t, r, b);
	// Light from the top-left: top and left edges are lit.
	const lit = (t === e || l === e) && !(b === e || r === e);
	return { e, lit, l, t, r, b };
}

// ---------------------------------------------------------------- frames

/** Carved walnut frame with brass corner brackets and a plank interior. 20×20, slice 7. */
function woodPanel(): string {
	const W = 20;
	return pixelSvg(W, W, (x, y) => {
		const { e, lit } = edge(x, y, W, W);
		const cx = Math.min(x, W - 1 - x);
		const cy = Math.min(y, W - 1 - y);
		const g = h2(x % 6, y % 6, 3);
		// Brass L-brackets in the corners.
		if (e > 0 && cx < 7 && cy < 7 && (cx <= 3 || cy <= 3)) {
			const outline =
				cx === 0 ||
				cy === 0 ||
				cx === 6 ||
				cy === 6 ||
				(cx === 3 && cy > 3) ||
				(cy === 3 && cx > 3);
			if (outline) return '#5a370c';
			if (cx === 2 && cy === 2) return '#fff4c8';
			if (cx === 3 && cy === 3) return '#7a4c12';
			if (x <= 3 || y <= 3) return cx === 1 || cy === 1 ? '#ffe08a' : '#e0a83e';
			return cx === 1 || cy === 1 ? '#f0c060' : '#c58a2c';
		}
		if (e === 0) return '#140904';
		if (e === 1) return lit ? '#b37a46' : '#3e2211';
		if (e === 2 || e === 3) return g > 0.78 ? '#69391c' : e === 2 ? '#8a5430' : '#7a4626';
		if (e === 4) return '#1e0e06';
		if (e === 5) return lit ? '#2c160a' : '#5e361c';
		// Planks.
		if (y % 6 === 0) return '#2e180b';
		if ((x + (Math.floor(y / 6) % 2) * 3) % 6 === 0 && y % 6 === 3) return '#341b0d';
		return g > 0.86 ? '#583219' : g < 0.1 ? '#3f2412' : '#4a2a16';
	});
}

/** Thin wooden plaque for list rows and slots. 12×12, slice 4. */
function plaque(): string {
	const W = 12;
	return pixelSvg(W, W, (x, y) => {
		const { e, lit } = edge(x, y, W, W);
		if ((x === 0 || x === W - 1) && (y === 0 || y === W - 1)) return null;
		if (e === 0) return '#140904';
		if (e === 1) return lit ? '#a26a3a' : '#3a1f10';
		if (e === 2) return lit ? '#6e3f20' : '#4f2c16';
		const g = h2(x % 4, y % 4, 7);
		return g > 0.8 ? '#5a331a' : '#4d2b16';
	});
}

/** Light, face and shadow of a player color, for the pieces that mark whose turn it is. */
function turnPalette(color: string) {
	return { light: tint(color, 0.3), base: tint(color, 0.06), dark: tint(color, -0.3) };
}

/**
 * The plaque framed in a player color, for the player whose turn it is: a bright rim lit from the
 * top left, between the dark outline and a dark line that sets it off the wood. 12×12, slice 4.
 */
function plaqueRim(color: string): string {
	const W = 12;
	const { light, base, dark } = turnPalette(color);
	return pixelSvg(W, W, (x, y) => {
		const { e, lit } = edge(x, y, W, W);
		if ((x === 0 || x === W - 1) && (y === 0 || y === W - 1)) return null;
		if (e === 0) return '#140904';
		if (e === 1) return lit ? light : base;
		if (e === 2) return lit ? base : dark;
		return '#2a1609';
	});
}

/**
 * A pennant in a player color that juts from the left side of their plaque: a notch at the free
 * end, and open at the other, where it lies over the frame's outline. 8×9, slice 2 1 2 4.
 */
function pennant(color: string): string {
	const { light, base, dark } = turnPalette(color);
	const rows = [
		'kkkkkkkk',
		'kLLLLLLL',
		'.kBBBBBB',
		'..kBBBBB',
		'...kBBBB',
		'..kBBBBB',
		'.kBBBBBB',
		'kDDDDDDD',
		'kkkkkkkk'
	];
	const pal: Record<string, string> = { k: '#140904', L: light, B: base, D: dark };
	return pixelSvg(8, 9, (x, y) => pal[rows[y][x]] ?? null);
}

/**
 * The same tab hanging under a plaque (phones, where the plaques sit in a row): open at the top,
 * where it lies over the frame's outline. 7×6, slice 1 1 2 2.
 */
function tabBelow(color: string): string {
	const { light, base, dark } = turnPalette(color);
	const rows = ['kBBBBBk', 'kLBBBBk', 'kLBBBBk', 'kLBBBBk', 'kDDDDDk', '.kkkkk.'];
	const pal: Record<string, string> = { k: '#140904', L: light, B: base, D: dark };
	return pixelSvg(7, 6, (x, y) => pal[rows[y][x]] ?? null);
}

/** Parchment with a deckled, slightly singed edge. 20×20, slice 7. */
function parchment(): string {
	const W = 20;
	return pixelSvg(W, W, (x, y) => {
		const { e } = edge(x, y, W, W);
		const n = h2(x % 6, y % 6, 11);
		if (e === 0) return n > 0.55 ? '#7a5228' : null;
		if (e === 1) return n > 0.18 ? '#a77a42' : '#7a5228';
		if (e === 2) return n > 0.5 ? '#d2ac6c' : '#c49a5a';
		if (e === 3) return n > 0.6 ? '#e6c88e' : '#dcbb7e';
		if (e === 4) return n > 0.5 ? '#efd7a4' : '#e8cd96';
		return n > 0.92 ? '#e4c88f' : n < 0.06 ? '#fbeccb' : '#f4e1b8';
	});
}

/** Sunken dark well for inputs, sliders and card trays. 10×10, slice 3. */
function well(): string {
	const W = 10;
	return pixelSvg(W, W, (x, y) => {
		const { e, lit } = edge(x, y, W, W);
		if ((x === 0 || x === W - 1) && (y === 0 || y === W - 1)) return null;
		if (e === 0) return '#0d0603';
		if (e === 1) return lit ? '#160a04' : '#6e4426';
		return y === 2 || x === 2 ? '#22120a' : '#2b170c';
	});
}

/** Parchment input strip. 10×10, slice 3. */
function inputArt(): string {
	const W = 10;
	return pixelSvg(W, W, (x, y) => {
		const { e, lit } = edge(x, y, W, W);
		if ((x === 0 || x === W - 1) && (y === 0 || y === W - 1)) return null;
		if (e === 0) return '#3a2210';
		if (e === 1) return lit ? '#b89160' : '#fff3d6';
		return y === 2 ? '#e7cf9f' : '#f8e9c6';
	});
}

interface ButtonPal {
	outline: string;
	hi: string;
	top: string;
	base: string;
	lip: string;
	lip2: string;
}

const BUTTONS: Record<string, ButtonPal> = {
	gold: {
		outline: '#3a1d04',
		hi: '#fff3b8',
		top: '#ffd45a',
		base: '#f2b431',
		lip: '#c47a12',
		lip2: '#8a4e08'
	},
	green: {
		outline: '#0f2a07',
		hi: '#d8ffb8',
		top: '#8fe060',
		base: '#5fb43b',
		lip: '#3b8424',
		lip2: '#245a14'
	},
	red: {
		outline: '#3a0905',
		hi: '#ffd2c4',
		top: '#ff7a5e',
		base: '#e04b35',
		lip: '#a82c1c',
		lip2: '#6e170c'
	},
	wood: {
		outline: '#140904',
		hi: '#d9a06a',
		top: '#9a6238',
		base: '#7d4b28',
		lip: '#55301a',
		lip2: '#371d0e'
	},
	purple: {
		outline: '#1a0b30',
		hi: '#e2ceff',
		top: '#9b74e0',
		base: '#7650c2',
		lip: '#55348f',
		lip2: '#371f62'
	}
};

/**
 * Chunky button: highlight, light top band, plain face and a dark lip. 12×14, sliced 5 4 5 4
 * so the stretched middle is one flat color and tall buttons never band.
 */
function button(p: ButtonPal, pressed = false): string {
	const W = 12;
	const H = 14;
	return pixelSvg(W, H, (x, y) => {
		const l = x;
		const r = W - 1 - x;
		const t = y;
		const b = H - 1 - y;
		if ((l === 0 || r === 0) && (t === 0 || b === 0)) return null;
		if (l === 0 || r === 0 || t === 0 || b === 0) return p.outline;
		if (pressed) {
			if (t === 1) return p.lip2;
			if (t === 2) return p.lip;
			if (b === 1) return p.lip2;
			if (l === 1) return p.lip;
			return p.base;
		}
		if (b === 1 || b === 2) return p.lip2;
		if (b <= 4) return p.lip;
		if (t === 1) return r === 1 ? p.top : p.hi;
		if (l === 1) return t <= 4 ? p.hi : p.top;
		if (r === 1) return p.lip;
		return t <= 4 ? p.top : p.base;
	});
}

/** Cloth ribbon with forked tails, stitched edges. 40×16, slice 0 14. */
export function ribbon(color: string): string {
	const W = 40;
	const H = 16;
	const base = color;
	const light = tint(color, 0.3);
	const dark = tint(color, -0.32);
	const tail = tint(color, -0.18);
	const tailDark = tint(color, -0.45);
	const outline = tint(color, -0.78);
	return pixelSvg(W, H, (x, y) => {
		// Body.
		if (x >= 8 && x <= W - 9 && y >= 1 && y <= 12) {
			if (y === 1 || y === 12 || x === 8 || x === W - 9) return outline;
			if (y === 2) return light;
			if (y === 11) return dark;
			if (y === 3 || y === 10) return x % 3 === 0 ? light : base;
			return base;
		}
		// Fold shadows where the tails tuck under the body.
		const fl = x >= 8 && x <= 10 && y >= 13 && y <= 15 && x - 8 <= y - 13;
		const fr = x <= W - 9 && x >= W - 11 && y >= 13 && y <= 15 && W - 9 - x <= y - 13;
		if (fl || fr) return outline;
		// Tails, with a V notch at the ends.
		const tx = x < W / 2 ? x : W - 1 - x;
		if (y >= 4 && y <= 15 && tx <= 10) {
			const notch = Math.max(0, Math.round(4 - Math.abs(y - 9.5) * 0.8));
			if (tx < notch) return null;
			if (y === 4 || y === 15 || tx === notch) return outline;
			if (y === 5) return base;
			if (y === 14) return tailDark;
			return tail;
		}
		return null;
	});
}

/** Gold coin medallion. 16×16. */
function coin(): string {
	const W = 16;
	return pixelSvg(W, W, (x, y) => {
		const d = Math.hypot(x - 7.5, y - 7.5);
		if (d > 7.6) return null;
		if (d > 6.7) return '#4a2606';
		if (d > 5.8) return x + y < 13 ? '#ffe9a0' : '#b8740f';
		if (d > 5.0) return '#d9961e';
		const lit = x + y < 12;
		return lit ? '#ffd257' : '#f2b431';
	});
}

/** Heraldic shield in a player color. 14×16. */
function shield(color: string): string {
	const W = 14;
	const H = 16;
	const light = tint(color, 0.35);
	const dark = tint(color, -0.35);
	const outline = tint(color, -0.8);
	const inside = (x: number, y: number) => {
		if (y < 0 || y >= H) return false;
		const half = (W - 1) / 2;
		const dx = Math.abs(x - half);
		if (y < 10) return dx <= half;
		// Taper to a point at the bottom.
		return dx <= half - (y - 9) * 1.25;
	};
	return pixelSvg(W, H, (x, y) => {
		if (!inside(x, y)) return null;
		if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))
			return outline;
		if (!inside(x - 2, y) || !inside(x, y - 2)) return light;
		if (!inside(x + 2, y) || !inside(x, y + 2)) return dark;
		return (x + y) % 7 === 0 ? tint(color, 0.12) : color;
	});
}

/** One link of an iron chain, tiled vertically to hang signs. 7×10. */
function chain(): string {
	return pixelSvg(7, 10, (x, y) => {
		// Oval ring seen face-on (rows 0-6), then a link seen edge-on (rows 6-9).
		if (y <= 6) {
			const d = Math.hypot((x - 3) / 3.2, (y - 3) / 3.6);
			if (d > 1.02) return null;
			if (d > 0.62) return x < 3 ? '#b9bec8' : '#5d6370';
			if (d > 0.4) return '#25282e';
			return null;
		}
		if (x >= 2 && x <= 4) return x === 2 ? '#c9ced8' : x === 3 ? '#8a909c' : '#4a4f5a';
		return null;
	});
}

/** Small corner flourish (gold leaf) for parchment pages. 9×9. */
function flourish(): string {
	const rows = [
		'ggg......',
		'g.ddg....',
		'g.d..g...',
		'.d.gg.g..',
		'..g..g...',
		'..g.g....',
		'...g.....',
		'.........',
		'.........'
	];
	return pixelSvg(9, 9, (x, y) => {
		const c = rows[y][x];
		return c === 'g' ? '#b8862e' : c === 'd' ? '#e6b958' : null;
	});
}

/** Gold diamond for section dividers. 9×7. */
function diamond(): string {
	return pixelSvg(9, 7, (x, y) => {
		const d = Math.abs(x - 4) + Math.abs(y - 3);
		if (d > 4) return null;
		if (d === 4) return '#5a370c';
		if (d <= 1) return '#fff0b0';
		return x + y < 7 ? '#ffd45a' : '#d9961e';
	});
}

/** Playing-card frame: dark outline, rounded pixel corners, a bright bevel. 12×12, slice 3. */
function cardFrame(face: string, light: string, dark: string, outline: string): string {
	const W = 12;
	return pixelSvg(W, W, (x, y) => {
		const { e, lit } = edge(x, y, W, W);
		const cx = Math.min(x, W - 1 - x);
		const cy = Math.min(y, W - 1 - y);
		if (cx === 0 && cy === 0) return null;
		if (e === 0 || (cx === 1 && cy === 1)) return outline;
		if (e === 1) return lit ? light : dark;
		return face;
	});
}

/** Round count badge: dark walnut with a gold rim. 12×12. */
function badge(): string {
	const W = 12;
	return pixelSvg(W, W, (x, y) => {
		const d = Math.hypot(x - 5.5, y - 5.5);
		if (d > 6) return null;
		if (d > 5.1) return '#2a1404';
		if (d > 4.2) return x + y < 11 ? '#ffe08a' : '#c4861c';
		return y < 5 ? '#4a2a16' : '#3a1f10';
	});
}

/** Small repeating textures behind each resource on its card. 8×8. */
const PATTERNS: Record<string, Paint> = {
	wood: (x, y) => {
		const n = h2(x, y, 21);
		return n > 0.82 ? '#5fa83f' : n < 0.18 ? '#24561a' : '#36772a';
	},
	brick: (x, y) => {
		if (y % 4 === 3) return '#8a3418';
		const off = Math.floor(y / 4) % 2 ? 2 : 6;
		if ((x + off) % 8 === 0) return '#8a3418';
		return y % 4 === 0 ? '#e0764a' : '#c9583a';
	},
	sheep: (x, y) => {
		const n = h2(x, y, 23);
		if ((x + y * 3) % 7 === 0) return '#b8e070';
		return n > 0.8 ? '#94c858' : '#7cb64a';
	},
	wheat: (x, y) => {
		if ((x + y) % 4 === 0) return '#ffd75c';
		if ((x + y) % 4 === 1) return '#c98a1a';
		return '#eab23a';
	},
	ore: (x, y) => {
		const n = h2(x, y, 25);
		return n > 0.85 ? '#c3c7cf' : n < 0.2 ? '#62666f' : '#8d929b';
	},
	/** Long walnut boards for the inside of wooden panels, matching the carved frame. 48×12. */
	planks: (x, y) => {
		if (y % 6 === 0) return '#2e180b';
		if (x === (y < 6 ? 13 : 37)) return '#2a1609';
		if (x === (y < 6 ? 14 : 38)) return '#5a341b';
		const g = h2(x % 16, y, 3);
		// Grain runs along the boards.
		const streak = h2(Math.floor(x / 5), y, 9);
		if (g > 0.9) return '#5a331a';
		if (streak > 0.78) return '#52301a';
		return g < 0.08 ? '#3f2412' : '#4a2a16';
	},
	/** Paper grain for parchment pages, matching the body of the parchment frame. */
	parch: (x, y) => {
		const n = h2(x, y, 11);
		return n > 0.92 ? '#e4c88f' : n < 0.06 ? '#fbeccb' : '#f4e1b8';
	}
};

const dieCache = new Map<string, string>();
/** A die face as a pixel image (url string for CSS), in one of the dice styles. 14×14. */
export function dieFace(n: number, style: DiceStyleId | null = 'classic'): string {
	const key = `${style ?? 'classic'}:${n}`;
	const hit = dieCache.get(key);
	if (hit) return hit;
	const P: Record<number, [number, number][]> = {
		1: [[6, 6]],
		2: [
			[3, 3],
			[9, 9]
		],
		3: [
			[3, 3],
			[6, 6],
			[9, 9]
		],
		4: [
			[3, 3],
			[9, 3],
			[3, 9],
			[9, 9]
		],
		5: [
			[3, 3],
			[9, 3],
			[6, 6],
			[3, 9],
			[9, 9]
		],
		6: [
			[3, 3],
			[9, 3],
			[3, 6],
			[9, 6],
			[3, 9],
			[9, 9]
		]
	};
	const pips = P[n] ?? [];
	const W = 14;
	const look = style && style !== 'classic' ? DICE_LOOKS[style] : null;
	const url = look
		? pixelSvg(W, W, (x, y) => {
				const { e } = edge(x, y, W, W);
				const cx = Math.min(x, W - 1 - x);
				const cy = Math.min(y, W - 1 - y);
				if (cx === 0 && cy === 0) return null;
				if (e === 0 || (cx === 1 && cy === 1)) return look.rim;
				// The style's picture for the 1, 6×6 in the middle.
				if (n === 1 && look.mark) {
					if (x >= 4 && x <= 9 && y >= 4 && y <= 9 && markAt(look.mark, x - 4, y - 4)) return look.one;
				} else
					for (const [px, py] of pips)
						if (x >= px && x <= px + 1 && y >= py && y <= py + 1) return n === 1 ? look.one : look.pip;
				const body = look.body[look.grain ? Math.floor(h2(0, y, 3) * look.body.length) : 0];
				if (x === W - 2 || y === W - 2) return tint(look.trim ?? body, -0.25);
				if (x === 1 || y === 1) return tint(look.trim ?? body, 0.3);
				return body;
			})
		: pixelSvg(W, W, (x, y) => {
				const { e } = edge(x, y, W, W);
				const cx = Math.min(x, W - 1 - x);
				const cy = Math.min(y, W - 1 - y);
				if (cx === 0 && cy === 0) return null;
				if (e === 0 || (cx === 1 && cy === 1)) return '#2a1a10';
				for (const [px, py] of pips)
					if (x >= px && x <= px + 1 && y >= py && y <= py + 1) return n === 1 ? '#d42a1e' : '#2e1a14';
				if (x === W - 2 || y === W - 2) return '#cfc3a6';
				if (x === 1 || y === 1) return '#ffffff';
				return '#fbf4e2';
			});
	dieCache.set(key, url);
	return url;
}

let installed = false;

/** Put every art piece on :root as a CSS variable. Call once before mounting the interface. */
export function installArt() {
	if (installed) return;
	installed = true;
	const vars: Record<string, string> = {
		'--art-wood': woodPanel(),
		'--art-plaque': plaque(),
		'--art-parch': parchment(),
		'--art-well': well(),
		'--art-input': inputArt(),
		'--art-coin': coin(),
		'--art-chain': chain(),
		'--art-flourish': flourish(),
		'--art-diamond': diamond(),
		'--art-card': cardFrame('#fbf0d6', '#ffffff', '#c9a874', '#3a2210'),
		'--art-card-dev': cardFrame('#7a55c4', '#b796f0', '#3f2478', '#1a0b30'),
		'--art-badge': badge()
	};
	for (const [k, paint] of Object.entries(PATTERNS))
		vars[`--pat-${k}`] = k === 'planks' ? pixelSvg(48, 12, paint) : pixelSvg(8, 8, paint);
	for (const [k, p] of Object.entries(BUTTONS)) {
		vars[`--art-btn-${k}`] = button(p);
		vars[`--art-btn-${k}-down`] = button(p, true);
	}
	for (const c of PLAYER_COLORS) {
		vars[`--art-ribbon-${c}`] = ribbon(PLAYER_CSS[c]);
		vars[`--art-shield-${c}`] = shield(PLAYER_CSS[c]);
		vars[`--art-plaque-${c}`] = plaqueRim(PLAYER_CSS[c]);
		vars[`--art-pennant-${c}`] = pennant(PLAYER_CSS[c]);
		vars[`--art-tab-${c}`] = tabBelow(PLAYER_CSS[c]);
	}
	vars['--art-ribbon-gold'] = ribbon('#e8a92a');
	vars['--art-ribbon-crimson'] = ribbon('#b8322a');
	vars['--art-ribbon-wood'] = ribbon('#7d4b28');
	const root = document.documentElement.style;
	for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
}
