import type { AvatarId } from '../../shared/accounts';
import { hash3, hex, shade } from './voxel/grid';
import { type Bust, bustImage, characterBusts, drawBust, drawBusts } from './portraits';

/**
 * Player avatars: premade voxel busts a player wears on their account, built like the Reign
 * Extended character portraits (same blocks, same lighting) but their own cast, so an avatar is
 * never mistaken for a character pick. Head at x -5..5, y 10..21, z -5..5; the face is z = 5.
 */

const SKIN = { light: hex('#f2c6a0'), mid: hex('#d9a27a'), tan: hex('#c78a5e'), dark: hex('#8e5a3a') };
const EYE = hex('#2a1a12');
const WHITE = hex('#fbf6ee');
const GOLD = hex('#f5c242');
const GOLD_DARK = hex('#c48a1c');
const STEEL = hex('#b4bbc6');
const STEEL_DARK = hex('#6d747f');
const RED = hex('#d0302c');
const BLACK = hex('#24201e');

const fleck = (c: number, k = 0.14, seed = 7) => (x: number, y: number, z: number) => shade(c, 1 - k / 2 + hash3(x, y, z, seed) * k);

function knight(b: Bust) {
	b.body(STEEL, STEEL_DARK);
	// Pauldrons and a blue surcoat with a gold cross.
	b.box(-11, 4, -4, -8, 7, 3, fleck(STEEL));
	b.box(8, 4, -4, 11, 7, 3, fleck(STEEL));
	b.box(-5, 0, 5, 5, 6, 5, hex('#2c5fb0'));
	b.box(-1, 1, 6, 1, 5, 6, GOLD);
	b.box(-3, 3, 6, 3, 3, 6, GOLD);
	b.neck(STEEL_DARK);
	// A great helm hides the face: an eye slit and breathing holes.
	b.box(-6, 10, -6, 6, 22, 6, (x, y, z) => {
		if (y === 22 && (Math.abs(x) === 6 || Math.abs(z) === 6)) return -1;
		return shade(STEEL, 0.9 + hash3(x, y, z, 1) * 0.16 - (y < 13 ? 0.06 : 0));
	});
	b.box(-4, 16, 6, 4, 16, 6, BLACK);
	b.box(-1, 17, 6, 1, 17, 6, STEEL_DARK);
	for (const x of [-3, -1, 1, 3]) b.set(x, 12, 6, BLACK);
	b.box(0, 10, 7, 0, 19, 7, GOLD_DARK);
	b.box(-6, 19, 7, 6, 19, 7, GOLD_DARK);
	// A blue plume.
	for (let i = 0; i < 9; i++) b.box(-1, 23 + Math.floor(i / 2), 2 - i, 1, 23 + Math.floor(i / 2), 2 - i, shade(hex('#3f7ae0'), 1 - i * 0.03));
}

function archer(b: Bust) {
	const tunic = hex('#3f8a3a');
	b.body(tunic, shade(tunic, 0.72));
	// Leather strap across the chest.
	for (let i = 0; i < 9; i++) b.box(-6 + i, i - 1, 5, -5 + i, i - 1, 5, hex('#7a4a22'));
	b.neck(SKIN.light);
	b.head(SKIN.light);
	b.face(SKIN.light, { brow: hex('#9a5a22') });
	b.hair(hex('#b06a2a'), 13, 20);
	// A pointed green cap with a red feather.
	const cap = hex('#2f6e2c');
	b.box(-6, 21, -6, 6, 23, 6, (x, y, z) => (y > 21 && Math.abs(z) === 6 ? -1 : fleck(cap)(x, y, z)));
	b.box(-5, 24, -6, 5, 24, 3, fleck(cap));
	b.box(-3, 25, -7, 3, 25, 0, fleck(cap));
	b.box(-1, 26, -9, 1, 26, -4, fleck(cap));
	for (let i = 0; i < 8; i++) b.set(6, 23 + i, -1 - Math.floor(i / 2), i > 5 ? WHITE : RED);
	// A quiver of arrows over the right shoulder and a bow on the left.
	b.box(7, 6, -6, 9, 15, -4, hex('#8a5328'));
	for (const x of [7, 8, 9]) b.box(x, 16, -5, x, 18, -5, x === 8 ? WHITE : hex('#e8dcc0'));
	const bow = hex('#6a3e1c');
	for (let y = 1; y < 22; y++) {
		const bend = Math.round(Math.sin(((y - 1) / 20) * Math.PI) * 3);
		b.set(-11 - bend, y, 1, bow);
	}
	b.box(-11, 1, 2, -11, 21, 2, hex('#e8dcc0'));
}

function wizard(b: Bust) {
	const robe = hex('#3a3ab0');
	b.body(robe, shade(robe, 0.72));
	for (const [x, y] of [
		[-8, 2],
		[7, 4],
		[-4, 5],
		[9, 1]
	])
		b.set(x, y, 5, GOLD);
	b.neck(SKIN.light);
	b.head(SKIN.light);
	b.face(SKIN.light, { brow: WHITE });
	// A long white beard down the chest.
	const beard = (x: number, y: number, z: number) => shade(WHITE, 0.88 + hash3(x, y, z, 4) * 0.12);
	b.box(-5, 2, 5, 5, 12, 7, (x, y) => {
		if (y > 10 && Math.abs(x) < 2) return -1;
		if (Math.abs(x) > 5 - Math.max(0, 6 - y)) return -1;
		return beard(x, y, 0);
	});
	b.box(-3, 12, 6, 3, 12, 6, beard);
	b.set(0, 11, 6, hex('#9c4a3a'));
	b.hair(WHITE, 12, 21);
	// A tall pointed hat with a wide brim and stars.
	const hat = hex('#2c2c94');
	b.box(-9, 21, -9, 9, 21, 9, (x, _y, z) => (x * x + z * z > 85 ? -1 : shade(hat, 0.85)));
	for (let y = 22; y < 36; y++) {
		const r = Math.max(0.6, 6 - (y - 22) * 0.42);
		const lean = Math.floor(Math.max(0, y - 30) * 0.8);
		b.box(-6, y, -6, 6, y, 6, (x, _y, z) =>
			(x + lean) * (x + lean) + (z + lean) * (z + lean) > r * r ? -1 : hash3(x, y, z, 6) > 0.95 ? GOLD : fleck(hat, 0.1)(x, y, z)
		);
	}
	b.box(-6, 22, -6, 6, 22, 6, (x, _y, z) => (x * x + z * z > 36 ? -1 : GOLD));
	// A staff with a glowing orb.
	b.box(-12, 0, 3, -12, 22, 3, hex('#7a4a22'));
	b.box(-13, 23, 2, -11, 25, 4, hex('#7fe8ff'));
}

function queen(b: Bust) {
	const gown = hex('#9a1e4a');
	b.body(gown, shade(gown, 0.72));
	// An ermine collar: white fur with black flecks.
	b.box(-10, 5, -5, 10, 7, 5, (x, y, z) => {
		if (Math.abs(x) < 3 && z > 2) return -1;
		return (x * 3 + y * 5 + z) % 7 === 0 ? BLACK : shade(WHITE, 0.95 + hash3(x, y, z) * 0.05);
	});
	b.box(-1, 2, 5, 1, 4, 6, hex('#2b7be0'));
	b.neck(SKIN.light);
	b.head(SKIN.light);
	b.face(SKIN.light, { brow: hex('#c8902a'), mouth: hex('#c8303a') });
	// Long golden hair down to the shoulders.
	const hair = hex('#f0c040');
	b.hair(hair, 6, 20);
	for (const s of [-1, 1]) b.box(s * 5, 4, 1, s * 7, 13, 4, (x, y, z) => (Math.abs(x) === 5 && z > 2 ? -1 : fleck(hair)(x, y, z)));
	// A gold crown with gems.
	b.box(-6, 22, -6, 6, 23, 6, (x, _y, z) => (Math.abs(x) < 6 && Math.abs(z) < 6 ? -1 : GOLD));
	for (const [x, z] of [
		[-6, -6],
		[0, -6],
		[6, -6],
		[-6, 0],
		[6, 0],
		[-6, 6],
		[0, 6],
		[6, 6]
	])
		b.box(x, 24, z, x, 25, z, GOLD);
	b.set(0, 23, 7, RED);
	b.set(-4, 23, 7, hex('#2bb06a'));
	b.set(4, 23, 7, hex('#2bb06a'));
	b.set(0, 26, 6, RED);
}

function pirate(b: Bust) {
	const coat = hex('#a8242a');
	b.body(coat, shade(coat, 0.72));
	b.box(-2, 0, 5, 2, 6, 5, WHITE);
	for (const y of [1, 3, 5]) {
		b.set(-3, y, 6, GOLD);
		b.set(3, y, 6, GOLD);
	}
	b.neck(SKIN.tan);
	b.head(SKIN.tan);
	b.face(SKIN.tan, { brow: BLACK });
	// An eye patch and its strap.
	b.box(1, 14, 5, 3, 16, 6, BLACK);
	for (let x = -5; x <= 0; x++) b.set(x, 17 + Math.round(-x / 3), 5, BLACK);
	b.box(-6, 18, -5, -6, 19, 2, BLACK);
	// A black beard.
	b.box(-5, 8, 4, 5, 12, 6, (x, y) => (y > 10 && Math.abs(x) < 2 ? -1 : y < 10 && Math.abs(x) > 3 ? -1 : shade(BLACK, 0.9 + hash3(x, y, 2) * 0.3)));
	b.set(0, 11, 6, hex('#9c4a3a'));
	b.hair(BLACK, 12, 20);
	// A tricorn hat with a skull.
	const hat = hex('#2a2224');
	b.box(-9, 21, -8, 9, 22, 8, (x, y, z) => {
		const tri = Math.abs(x) * 0.6 + (z > 0 ? z : -z * 0.5);
		if (tri > 7.5) return -1;
		if (y === 22 && tri < 6) return -1;
		return fleck(hat)(x, y, z);
	});
	b.box(-5, 22, -5, 5, 25, 5, (x, _y, z) => (x * x + z * z > 28 ? -1 : fleck(hat)(x, 0, z)));
	b.box(-1, 23, 6, 1, 24, 6, WHITE);
	b.set(-1, 24, 7, BLACK);
	b.set(1, 24, 7, BLACK);
	// A green parrot on the shoulder.
	const parrot = hex('#2fb04a');
	b.box(7, 8, -1, 10, 13, 2, parrot);
	b.box(8, 14, -1, 10, 16, 2, parrot);
	b.box(8, 10, -3, 10, 13, -2, hex('#2b7be0'));
	b.box(9, 14, 3, 10, 15, 4, hex('#f5a020'));
	b.set(10, 16, 3, BLACK);
	b.set(9, 15, 3, WHITE);
}

function monk(b: Bust) {
	const robe = hex('#7a5232');
	b.body(robe, shade(robe, 0.72));
	// A hood fallen back around the neck, a rope belt and a wooden cross.
	b.box(-8, 6, -6, 8, 9, 4, (x, y, z) => (Math.abs(x) < 4 && z > -3 ? -1 : fleck(shade(robe, 0.9))(x, y, z)));
	b.box(-11, 1, -5, 11, 1, 5, (x, y, z) => (b.g.solid(x, y, z) ? hex('#d8c08a') : -1));
	b.box(0, 2, 5, 0, 6, 5, hex('#5a3418'));
	b.box(-1, 5, 5, 1, 5, 5, hex('#5a3418'));
	b.neck(SKIN.mid);
	b.head(SKIN.mid);
	b.face(SKIN.mid, { brow: hex('#6a4a2a') });
	// A tonsure: bald on top, a ring of hair around.
	const hair = hex('#6a4a2a');
	b.box(-6, 16, -6, 6, 19, 5, (x, y, z) => (Math.abs(x) < 6 && Math.abs(z) < 6 && z < 5 ? -1 : z === 5 && Math.abs(x) < 6 ? (y >= 18 ? fleck(hair)(x, y, z) : -1) : fleck(hair)(x, y, z)));
	b.box(-5, 18, 5, 5, 19, 6, fleck(hair));
	// Round cheeks and a smile.
	b.set(-2, 11, 5, hex('#9c4a3a'));
	b.set(2, 11, 5, hex('#9c4a3a'));
}

function bard(b: Bust) {
	const doublet = hex('#e0a020');
	b.body(doublet, shade(doublet, 0.72));
	b.box(-11, 0, -5, 11, 6, 4, (x, y, z) => (b.g.solid(x, y, z) ? (Math.floor(x / 2) % 2 ? doublet : hex('#c0302c')) : -1));
	b.neck(SKIN.light);
	b.head(SKIN.light);
	b.face(SKIN.light, { brow: hex('#4a2a14'), look: 1 });
	// Curly brown hair.
	const hair = hex('#5a3418');
	b.hair(hair, 12, 20);
	for (const s of [-1, 1]) for (let y = 11; y < 15; y++) b.set(s * 7, y, (y % 2) - 1, shade(hair, 0.85));
	// A floppy red beret with a long feather.
	const beret = hex('#c0302c');
	b.box(-7, 21, -7, 8, 22, 6, (x, y, z) => ((x - 1) * (x - 1) + z * z > 46 ? -1 : fleck(beret)(x, y, z)));
	b.box(-3, 23, -4, 6, 23, 3, fleck(beret));
	for (let i = 0; i < 12; i++) b.set(-5 - Math.floor(i / 3), 23 + Math.floor(i / 1.6), -3 - Math.floor(i / 3), i > 9 ? hex('#ffffff') : hex('#4ad0c0'));
	// A lute held across the chest.
	const wood = hex('#a8692c');
	b.box(-9, 0, 5, -2, 5, 7, (x, y) => ((x + 5.5) ** 2 / 14 + (y - 2.5) ** 2 / 8 > 1.1 ? -1 : wood));
	b.box(-6, 2, 8, -5, 3, 8, BLACK);
	for (let i = 0; i < 9; i++) b.set(-2 + i, 4 + Math.floor(i / 2), 6, hex('#6a3e1c'));
	b.box(7, 8, 6, 8, 9, 6, hex('#6a3e1c'));
}

function farmer(b: Bust) {
	// A checked red shirt under blue overalls.
	b.body(hex('#c83a2c'), hex('#a02a22'));
	b.box(-11, 0, -5, 11, 6, 4, (x, y, z) => (b.g.solid(x, y, z) ? ((x + y) % 2 ? hex('#c83a2c') : hex('#e8dcc0')) : -1));
	b.box(-6, 0, 5, 6, 4, 5, hex('#3a5ea8'));
	b.box(-5, 5, 5, -4, 7, 5, hex('#3a5ea8'));
	b.box(4, 5, 5, 5, 7, 5, hex('#3a5ea8'));
	b.set(-4, 4, 6, GOLD);
	b.set(4, 4, 6, GOLD);
	b.neck(SKIN.tan);
	b.head(SKIN.tan);
	b.face(SKIN.tan, { brow: hex('#3a2414') });
	b.hair(hex('#3a2414'), 14, 20);
	// A straw of wheat in the mouth and a wide brown hat.
	for (let i = 0; i < 5; i++) b.set(2 + i, 11 + Math.floor(i / 2), 6, i === 4 ? GOLD : hex('#e8c060'));
	const hat = hex('#8a5a2c');
	b.box(-9, 21, -9, 9, 21, 9, (x, _y, z) => (x * x + z * z > 82 ? -1 : fleck(shade(hat, 0.9))(x, 0, z)));
	b.box(-5, 22, -5, 5, 24, 5, (x, y, z) => (x * x + z * z > 30 ? -1 : y === 22 ? hex('#c83a2c') : fleck(hat)(x, y, z)));
	// A sheaf of wheat over the shoulder.
	for (let i = 0; i < 6; i++) b.box(-12 + (i % 3), 2, -1 + Math.floor(i / 3), -12 + (i % 3), 16, -1 + Math.floor(i / 3), hex('#c8a040'));
	b.box(-13, 17, -2, -9, 21, 1, (x, y, z) => (hash3(x, y, z, 3) > 0.3 ? GOLD : -1));
	b.box(-13, 8, -2, -9, 8, 1, RED);
}

function fox(b: Bust) {
	// A green scarf over a cream chest.
	b.body(hex('#d8661c'), hex('#b0501a'));
	b.box(-4, 0, 5, 4, 6, 5, (x, y) => (Math.abs(x) > 6 - y ? -1 : hex('#f4e8d4')));
	b.box(-7, 6, -5, 7, 8, 5, fleck(hex('#2f8a4a')));
	b.box(4, 2, 5, 6, 6, 6, fleck(hex('#2f8a4a')));
	const fur = hex('#e2701e');
	const cream = hex('#f6ecd8');
	b.box(-6, 9, -5, 6, 19, 5, fleck(fur, 0.1));
	// White cheeks and a long muzzle with a black nose.
	b.box(-6, 9, 3, -3, 13, 5, cream);
	b.box(3, 9, 3, 6, 13, 5, cream);
	b.box(-2, 9, 6, 2, 13, 8, (x, y, z) => (y === 13 && Math.abs(x) === 2 ? -1 : y < 11 ? cream : fur));
	b.box(-1, 12, 9, 1, 13, 9, BLACK);
	b.set(0, 10, 9, hex('#9c4a3a'));
	// Narrow amber eyes.
	for (const s of [-1, 1]) {
		b.set(s * 3, 15, 5, hex('#f5b020'));
		b.set(s * 2, 15, 5, BLACK);
		b.box(s * 4, 16, 5, s * 2, 16, 5, shade(fur, 0.6));
	}
	// Tall ears with dark tips and pale insides.
	for (const s of [-1, 1]) {
		for (let y = 20; y < 26; y++) {
			const w = Math.max(0, 2 - Math.floor((y - 20) / 2));
			b.box(s * 4 - w, y, -1, s * 4 + w, y, 1, y > 23 ? BLACK : fur);
			if (y < 23) b.set(s * 4, y, 2, hex('#f2c0a0'));
		}
	}
}

function owl(b: Bust) {
	const feather = hex('#8a5a32');
	const light = hex('#d8b888');
	// The owl is all one rounded bird: wings at the sides, a speckled breast.
	b.box(-10, 0, -5, 10, 9, 4, (x, y, z) => {
		if (Math.abs(x) >= 9 && y >= 8) return -1;
		if (Math.abs(x) < 6 && z > 2) return (x + y) % 3 === 0 ? shade(light, 0.75) : light;
		return shade(feather, 0.88 + hash3(x, y, z, 2) * 0.2);
	});
	b.box(-11, 0, -4, -10, 7, 3, shade(feather, 0.72));
	b.box(10, 0, -4, 11, 7, 3, shade(feather, 0.72));
	b.box(-7, 10, -6, 7, 21, 5, (x, y, z) => {
		if ((Math.abs(x) === 7 && (y === 10 || y === 21)) || (y === 21 && Math.abs(z) > 4)) return -1;
		return shade(feather, 0.9 + hash3(x, y, z, 5) * 0.18);
	});
	// A pale heart-shaped face with big round eyes and an orange beak.
	b.box(-6, 11, 5, 6, 20, 5, (x, y) => ((x * x) / 40 + ((y - 15.5) ** 2) / 26 > 1 ? -1 : light));
	for (const s of [-1, 1]) {
		b.box(s * 3 - 2, 14, 6, s * 3 + 2, 18, 6, (x, y) => ((x - s * 3) ** 2 + (y - 16) ** 2 > 5 ? -1 : hex('#f5c020')));
		b.box(s * 3 - 1, 15, 7, s * 3, 16, 7, BLACK);
		b.set(s * 3 - 1, 16, 8, WHITE);
	}
	b.box(-1, 12, 6, 1, 13, 7, hex('#e8901c'));
	b.set(0, 11, 7, hex('#c0701c'));
	// Ear tufts.
	for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.box(s * (5 + Math.floor(i / 2)), 22 + i, -2, s * (6 + Math.floor(i / 2)), 22 + i, 1, shade(feather, 0.75));
	// Little talons on a branch.
	b.box(-12, 0, 5, 12, 1, 6, hex('#6a3e1c'));
	for (const x of [-5, -3, 3, 5]) b.set(x, 2, 6, hex('#e8a020'));
}

function bear(b: Bust) {
	// A red waistcoat over brown fur.
	const fur = hex('#7a4a2a');
	b.body(fur, shade(fur, 0.75));
	b.box(-11, 0, -5, 11, 6, 4, (x, y, z) => (b.g.solid(x, y, z) ? (Math.abs(x) > 3 ? hex('#b02a24') : fleck(fur)(x, y, z)) : -1));
	b.set(-5, 2, 5, GOLD);
	b.set(-5, 4, 5, GOLD);
	b.box(-7, 9, -6, 7, 20, 5, (x, y, z) => ((Math.abs(x) === 7 && (y === 9 || y === 20)) ? -1 : fleck(fur, 0.16)(x, y, z)));
	// A pale snout with a big black nose, small eyes.
	const snout = hex('#c8955e');
	b.box(-3, 10, 6, 3, 14, 8, (x, y) => (Math.abs(x) === 3 && (y === 10 || y === 14) ? -1 : snout));
	b.box(-1, 13, 9, 1, 14, 9, BLACK);
	b.box(-1, 11, 9, 1, 11, 9, shade(snout, 0.7));
	for (const s of [-1, 1]) {
		b.set(s * 4, 16, 6, BLACK);
		b.set(s * 4, 17, 6, shade(fur, 0.6));
	}
	// Round ears.
	for (const s of [-1, 1]) {
		b.box(s * 5 - 2, 21, -2, s * 5 + 2, 23, 1, (x, y) => (Math.abs(x - s * 5) === 2 && y === 23 ? -1 : fur));
		b.box(s * 5 - 1, 21, 2, s * 5 + 1, 22, 2, snout);
	}
	// A jar of honey.
	b.box(6, 0, 5, 10, 5, 8, hex('#e8a020'));
	b.box(6, 6, 5, 10, 6, 8, hex('#e8dcc0'));
	b.box(7, 2, 9, 9, 3, 9, WHITE);
}

function frog(b: Bust) {
	const green = hex('#5aa83a');
	const belly = hex('#d8e88a');
	b.body(green, shade(green, 0.75));
	b.box(-5, 0, 5, 5, 6, 5, (x, y) => (Math.abs(x) > 3 + y / 3 ? -1 : belly));
	// A royal red cape: the frog prince.
	b.box(-11, 0, -6, 11, 7, -6, hex('#b02a24'));
	b.box(-11, 7, -5, 11, 7, 3, (x, y, z) => (Math.abs(x) > 8 ? hex('#b02a24') : -1));
	// A wide flat head.
	b.box(-8, 9, -5, 8, 16, 5, (x, y, z) => {
		if (Math.abs(x) >= 7 && (y === 16 || y === 9)) return -1;
		return z > 3 && y < 12 ? belly : shade(green, 0.92 + hash3(x, y, z, 8) * 0.16);
	});
	// A wide smile.
	for (let x = -5; x <= 5; x++) b.set(x, 12, 6, shade(green, 0.45));
	b.set(-7, 13, 6, shade(green, 0.45));
	b.set(7, 13, 6, shade(green, 0.45));
	b.set(-2, 14, 6, shade(green, 0.6));
	b.set(2, 14, 6, shade(green, 0.6));
	// Bulging eyes on top.
	for (const s of [-1, 1]) {
		b.box(s * 5 - 2, 16, 0, s * 5 + 2, 19, 4, (x, y, z) => ((x - s * 5) ** 2 + (y - 17.5) ** 2 + (z - 2) ** 2 > 7 ? -1 : green));
		b.box(s * 5 - 1, 17, 5, s * 5 + 1, 18, 5, WHITE);
		b.box(s * 5, 17, 6, s * 5, 18, 6, BLACK);
	}
	// A little gold crown between them.
	b.box(-2, 17, 0, 2, 17, 2, GOLD);
	for (const x of [-2, 0, 2]) b.set(x, 18, 1, GOLD);
	b.set(0, 19, 1, RED);
}

const BUILDERS: Record<AvatarId, (b: Bust) => void> = {
	knight,
	archer,
	wizard,
	queen,
	pirate,
	monk,
	bard,
	farmer,
	fox,
	owl,
	bear,
	frog
};

/**
 * A rendered avatar as an image URL (PNG data), null where WebGL isn't available, or undefined
 * while it's still being drawn (in the background, once per avatar).
 */
export function avatarUrl(id: AvatarId): string | null | undefined {
	return bustImage(`avatar:${id}`, BUILDERS[id] ?? knight);
}

/** An avatar once it's drawn (null without WebGL). */
export function loadAvatar(id: AvatarId): Promise<string | null> {
	return drawBust(`avatar:${id}`, BUILDERS[id] ?? knight);
}

/**
 * Draw every avatar and character portrait ahead of time, one at a time between frames, so no
 * screen has to wait for them. Settles once all are drawn; `progress` hears after each one.
 */
export function prewarmBusts(progress?: (done: number, total: number) => void): Promise<void> {
	const avatars = Object.entries(BUILDERS).map(([id, build]): [string, (b: Bust) => void] => [`avatar:${id}`, build]);
	return drawBusts([...avatars, ...characterBusts()], progress);
}
