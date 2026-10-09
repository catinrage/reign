import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CharacterId } from '../../shared/rules/characters';
import { Mat, VoxelGrid, hash3, hex, mix, shade } from './voxel/grid';
import { meshesFor } from './voxel/materials';
import { meshGrid } from './voxel/mesher';

/**
 * Character portraits: a little voxel bust for each Reign Extended character, built from the
 * same bevelled blocks as the island and rendered once into an image the interface can show
 * anywhere (lobby cards, the player list). Coordinates: x to the right, y up, z toward the
 * viewer; the face is the z = 5 plane of an 11-voxel head.
 */

type Paint = number | ((x: number, y: number, z: number) => number);

const SKIN = { light: hex('#f2c6a0'), mid: hex('#d9a27a'), tan: hex('#c78a5e'), dark: hex('#8e5a3a') };
const EYE = hex('#2a1a12');
const WHITE = hex('#fbf6ee');
const GOLD = hex('#f5c242');
const GOLD_DARK = hex('#c48a1c');
const STEEL = hex('#a9b0bb');
const STEEL_DARK = hex('#6d747f');

/** Small per-voxel variation so flat colors read like painted wood. */
const grain = (c: number, k = 0.06) => (x: number, y: number, z: number) => shade(c, 1 - k / 2 + hash3(x, y, z, 5) * k);

export class Bust {
	g = new VoxelGrid(32, 40, 26, -16, 0, -13);

	box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Paint) {
		this.g.box(x0, y0, z0, x1, y1, z1, typeof c === 'number' ? grain(c) : c);
	}
	set(x: number, y: number, z: number, c: number) {
		this.g.set(x, y, z, c);
	}
	clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
		for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.g.clear(x, y, z);
	}
	/** Mirror a voxel run on both sides of x = 0 (x is the right-hand side). */
	pair(x: number, y: number, z: number, c: number) {
		this.set(x, y, z, c);
		this.set(-x, y, z, c);
	}

	/** Shoulders and chest, rounded at the top corners. */
	body(cloth: number, dark: number) {
		this.box(-11, 0, -5, 11, 6, 4, (x, y, z) => {
			if (Math.abs(x) >= 10 && y >= 5) return -1;
			if (Math.abs(x) === 11 && y >= 4) return -1;
			return shade(cloth, (y < 2 ? 0.86 : 1) * (0.97 + hash3(x, y, z) * 0.06));
		});
		// Arms hang down the sides, a shade darker.
		this.box(-11, 0, -4, -10, 3, 3, dark);
		this.box(10, 0, -4, 11, 3, 3, dark);
		this.box(-8, 7, -4, 8, 7, 3, (x) => (Math.abs(x) > 6 ? -1 : cloth));
	}
	neck(skin: number) {
		this.box(-2, 7, -2, 2, 9, 2, shade(skin, 0.86));
	}
	head(skin: number) {
		this.box(-5, 10, -5, 5, 21, 5, skin);
		// Ears.
		this.box(-6, 14, -1, -6, 16, 0, shade(skin, 0.92));
		this.box(6, 14, -1, 6, 16, 0, shade(skin, 0.92));
	}
	/** Eyes, brows, nose, mouth and cheeks on the front of the head. */
	face(skin: number, o: { brow?: number; eye?: number; mouth?: number; look?: number; nose?: boolean } = {}) {
		const z = 5;
		const eye = o.eye ?? EYE;
		const look = o.look ?? 0;
		// Eyes: a white with the pupil toward the middle (or `look` to one side).
		for (const s of [-1, 1]) {
			const inner = s * 2;
			const outer = s * 3;
			this.set(inner, 15, z, look === 0 ? eye : look === s ? WHITE : eye);
			this.set(outer, 15, z, look === 0 ? WHITE : look === s ? eye : WHITE);
			this.set(inner, 16, z, shade(skin, 0.94));
			this.set(outer, 16, z, shade(skin, 0.94));
		}
		const brow = o.brow ?? shade(skin, 0.55);
		this.box(-4, 17, z, -2, 17, z, brow);
		this.box(2, 17, z, 4, 17, z, brow);
		if (o.nose !== false) {
			this.set(0, 14, z + 1, shade(skin, 0.97));
			this.set(0, 13, z + 1, shade(skin, 0.9));
			this.set(0, 13, z, shade(skin, 0.82));
		}
		this.box(-1, 11, z, 1, 11, z, o.mouth ?? hex('#9c4a3a'));
		this.set(-2, 12, z, shade(skin, 0.9));
		this.set(2, 12, z, shade(skin, 0.9));
		// Rosy cheeks.
		this.set(-4, 13, z, mix(skin, hex('#e2766a'), 0.35));
		this.set(4, 13, z, mix(skin, hex('#e2766a'), 0.35));
	}
	/** Hair over the top, sides and back of the head, down to `low` at the sides. */
	hair(color: number, low = 14, fringe = 20) {
		const c = (x: number, y: number, z: number) => shade(color, 0.92 + hash3(x, y, z, 2) * 0.16 - (y < 16 ? 0.08 : 0));
		this.box(-6, 21, -6, 6, 22, 5, c);
		this.box(-6, low, -6, -6, 21, 3, c);
		this.box(6, low, -6, 6, 21, 3, c);
		this.box(-6, low, -6, 6, 21, -6, c);
		this.box(-5, fringe, 5, 5, 21, 6, c);
	}
}

function merchant(b: Bust) {
	const robe = hex('#6a2d8c');
	b.body(robe, shade(robe, 0.75));
	// Gold-trimmed collar and a chain with a medallion.
	b.box(-8, 5, 4, 8, 6, 5, (x) => (Math.abs(x) < 3 ? -1 : GOLD));
	b.box(-3, 2, 5, 3, 4, 5, (x, y) => (Math.abs(x) + Math.abs(y - 3) > 3 ? -1 : y === 3 && x === 0 ? hex('#e8323a') : GOLD));
	b.neck(SKIN.light);
	b.head(SKIN.light);
	b.face(SKIN.light, { brow: hex('#5a3418') });
	// A curled mustache.
	b.box(-3, 12, 6, 3, 12, 6, hex('#5a3418'));
	b.pair(4, 13, 6, hex('#5a3418'));
	b.hair(hex('#5a3418'), 13, 21);
	// A wide teal hat with a red feather.
	const hat = hex('#1f7a78');
	b.box(-9, 22, -9, 9, 22, 8, (x, _y, z) => (x * x + z * z > 82 ? -1 : shade(hat, 0.85)));
	b.box(-5, 23, -5, 5, 26, 5, (x, _y, z) => (x * x + z * z > 30 ? -1 : hat));
	b.box(-5, 23, -5, 5, 23, 5, (x, _y, z) => (x * x + z * z > 30 ? -1 : GOLD));
	for (let i = 0; i < 9; i++) b.set(5 + Math.floor(i / 3), 24 + i, -2 - Math.floor(i / 4), i > 6 ? hex('#ffd0a0') : hex('#e2363a'));
	// Coin pouch at the hip.
	b.box(7, 0, 4, 10, 3, 6, hex('#a8692c'));
	b.box(8, 4, 5, 9, 4, 5, GOLD);
}

function mason(b: Bust) {
	const shirt = hex('#5d7fa8');
	b.body(shirt, shade(shirt, 0.75));
	// Leather apron with straps.
	b.box(-6, 0, 5, 6, 5, 5, hex('#8a5328'));
	b.box(-5, 6, 4, -4, 7, 4, hex('#6a3e1c'));
	b.box(4, 6, 4, 5, 7, 4, hex('#6a3e1c'));
	b.neck(SKIN.tan);
	b.head(SKIN.tan);
	b.face(SKIN.tan, { brow: hex('#a8401c') });
	// Ginger hair in two thick braids over the shoulders.
	const hair = hex('#c4521f');
	b.hair(hair, 12, 20);
	for (const s of [-1, 1]) {
		for (let y = 3; y < 13; y++) b.box(s * 6, y, 2, s * 7, y, 3, y % 3 === 0 ? shade(hair, 0.8) : hair);
		b.box(s * 6, 2, 2, s * 7, 2, 3, hex('#3a6ea8'));
	}
	// Headband.
	b.box(-6, 19, -6, 6, 19, 6, (x, _y, z) => (Math.abs(x) < 6 && Math.abs(z) < 6 && z < 6 ? -1 : hex('#2f5b8f')));
	// A hammer over the right shoulder.
	b.box(-12, 4, -2, -12, 18, -2, hex('#7a4a22'));
	b.box(-14, 17, -3, -10, 20, -1, STEEL);
	b.box(-14, 17, -3, -14, 20, -1, STEEL_DARK);
}

function scholar(b: Bust) {
	const robe = hex('#22356e');
	b.body(robe, shade(robe, 0.75));
	b.box(-3, 0, 5, 3, 6, 5, (x, y) => (Math.abs(x) > 6 - y ? -1 : hex('#e9d9b0')));
	b.neck(SKIN.light);
	b.head(SKIN.light);
	b.face(SKIN.light, { brow: hex('#24180f') });
	// Round spectacles.
	for (const s of [-1, 1]) {
		const cx = s * 3;
		for (const [dx, dy] of [
			[-1, -1],
			[0, -1],
			[1, -1],
			[-1, 1],
			[0, 1],
			[1, 1],
			[-2, 0],
			[2, 0]
		])
			b.set(cx + dx - (s < 0 ? -0 : 0), 15 + dy, 6, GOLD);
	}
	b.set(0, 15, 6, GOLD);
	// Dark hair in a bun, with a quill tucked in.
	const hair = hex('#24180f');
	b.hair(hair, 15, 20);
	b.box(-2, 22, -6, 2, 25, -3, hair);
	for (let i = 0; i < 8; i++) b.set(3 + Math.floor(i / 2), 23 + i, -4, i > 5 ? hex('#ffffff') : hex('#f2eee6'));
	// A thick book held up in front.
	b.box(-10, 0, 5, -3, 7, 7, hex('#8c2a22'));
	b.box(-9, 1, 8, -4, 6, 8, hex('#a8382c'));
	b.box(-9, 3, 8, -4, 3, 8, GOLD);
	b.box(-10, 1, 5, -10, 6, 7, hex('#f2e6c8'));
}

function veteran(b: Bust) {
	const mail = STEEL;
	b.body(hex('#8e8f96'), STEEL_DARK);
	// Chainmail rows and a red tabard with a gold lion-ish emblem.
	b.box(-11, 0, -5, 11, 6, 4, (x, y, z) =>
		b.g.solid(x, y, z) ? ((x + y) % 2 ? shade(mail, 0.82) : shade(mail, 0.95)) : -1
	);
	b.box(-5, 0, 5, 5, 6, 5, hex('#b02a24'));
	b.box(-1, 2, 6, 1, 4, 6, GOLD);
	b.neck(SKIN.mid);
	b.head(SKIN.mid);
	b.face(SKIN.mid, { brow: hex('#c9c9c9') });
	// A scar over the left eye.
	b.set(3, 17, 5, hex('#b06a58'));
	b.set(4, 16, 5, hex('#b06a58'));
	// Big gray beard and mustache.
	const beard = hex('#bfbfc4');
	b.box(-5, 7, 4, 5, 12, 6, (x, y) => (y > 10 && Math.abs(x) < 2 ? -1 : y < 9 && Math.abs(x) > 6 - (9 - y) * 2 ? -1 : shade(beard, 0.9 + hash3(x, y, 1) * 0.15)));
	b.box(-3, 12, 6, 3, 12, 6, beard);
	b.set(0, 11, 6, hex('#9c4a3a'));
	// Steel helmet with a nose guard and a red plume.
	b.box(-6, 19, -6, 6, 23, 6, (x, y, z) => (y === 23 && (Math.abs(x) === 6 || Math.abs(z) === 6) ? -1 : z === 6 && y < 20 ? -1 : shade(mail, 0.9 + hash3(x, y, z) * 0.15)));
	b.box(-6, 19, 6, 6, 19, 6, STEEL_DARK);
	b.box(0, 13, 6, 0, 18, 6, STEEL_DARK);
	for (let i = 0; i < 10; i++) b.box(-1, 24 + Math.floor(i / 3), 2 - i, 1, 24 + Math.floor(i / 2), 2 - i, shade(hex('#d42a24'), 1 - i * 0.03));
}

function rogue(b: Bust) {
	const cloak = hex('#2f5a34');
	b.body(cloak, shade(cloak, 0.72));
	b.box(-2, 0, 5, 2, 6, 5, hex('#3a2a1e'));
	b.box(-1, 3, 6, 1, 3, 6, hex('#b8b8c0'));
	b.neck(SKIN.light);
	b.head(SKIN.light);
	b.face(SKIN.light, { brow: hex('#3a2a1e'), look: -1 });
	// A dark cloth mask over the nose and mouth.
	b.box(-5, 10, 5, 5, 13, 6, (x, y) => shade(hex('#2a2a32'), y === 13 ? 1.1 : 0.95 + hash3(x, y, 9) * 0.1));
	// The hood, deep and pointed.
	const hood = (x: number, y: number, z: number) => shade(cloak, 0.85 + hash3(x, y, z, 3) * 0.2);
	b.box(-7, 10, -7, 7, 23, 6, (x, y, z) => {
		if (Math.abs(x) <= 5 && y <= 21 && z >= -5) return -1;
		if (z === 6 && Math.abs(x) <= 5 && y >= 10 && y <= 21) return -1;
		if (y >= 22 && Math.abs(x) > 6 - (y - 22) * 2) return -1;
		return hood(x, y, z);
	});
	b.box(-5, 22, 5, 5, 22, 6, shade(cloak, 0.6));
	for (let i = 0; i < 4; i++) b.box(-1, 24 + i, -4 - i, 1, 24 + i, -2 - i, hood);
	// A dagger in the hand.
	b.box(9, 0, 5, 10, 2, 6, hex('#3a2a1e'));
	b.box(9, 3, 6, 10, 9, 6, STEEL);
	b.set(9, 10, 6, hex('#e8eef6'));
}

function steward(b: Bust) {
	const coat = hex('#9c1e2a');
	b.body(coat, shade(coat, 0.74));
	// White ruff and a heavy gold chain of office.
	b.box(-6, 7, -4, 6, 8, 5, (x, y, z) => ((x + z) % 2 ? WHITE : shade(WHITE, 0.9)));
	for (let x = -7; x <= 7; x++) b.set(x, 5 - Math.round(Math.abs(x) < 4 ? 0 : (Math.abs(x) - 3) * -0.5), 5, x % 2 ? GOLD : GOLD_DARK);
	b.box(-2, 1, 5, 2, 4, 6, GOLD);
	b.set(0, 2, 7, hex('#2b7be0'));
	b.neck(SKIN.light);
	b.head(SKIN.light);
	b.face(SKIN.light, { brow: hex('#e8e8e8') });
	// Bald on top with white tufts at the sides and a neat white goatee.
	const white = hex('#eeeeee');
	b.box(-6, 14, -6, -6, 19, 2, white);
	b.box(6, 14, -6, 6, 19, 2, white);
	b.box(-6, 14, -6, 6, 18, -6, white);
	b.box(-1, 9, 5, 1, 10, 6, white);
	b.set(-2, 12, 6, white);
	b.set(2, 12, 6, white);
	b.set(-1, 12, 6, white);
	b.set(1, 12, 6, white);
	// A big iron key.
	const key = hex('#5b5f6a');
	b.box(-12, 0, 3, -12, 12, 3, key);
	b.box(-14, 13, 3, -10, 17, 3, (x, y) => (Math.abs(x + 12) === 2 || y === 13 || y === 17 ? key : -1));
	b.box(-14, 1, 3, -13, 3, 3, key);
}

function shepherd(b: Bust) {
	const tunic = hex('#4a8a3a');
	b.body(tunic, shade(tunic, 0.75));
	b.box(-8, 5, 4, 8, 6, 5, (x) => (Math.abs(x) < 3 ? -1 : hex('#e8dcc0')));
	b.neck(SKIN.tan);
	b.head(SKIN.tan);
	b.face(SKIN.tan, { brow: hex('#c99a3a') });
	// Freckles.
	b.set(-3, 13, 5, shade(SKIN.tan, 0.8));
	b.set(3, 13, 5, shade(SKIN.tan, 0.8));
	// Blonde braids and a straw hat with a ribbon.
	const hair = hex('#f2c75a');
	b.hair(hair, 13, 20);
	for (const s of [-1, 1]) for (let y = 4; y < 13; y++) b.box(s * 6, y, 1, s * 6, y, 2, y % 2 ? shade(hair, 0.85) : hair);
	const straw = hex('#e8c060');
	b.box(-9, 22, -9, 9, 22, 8, (x, _y, z) => (x * x + z * z > 80 ? -1 : (x + z) % 2 ? straw : shade(straw, 0.88)));
	b.box(-5, 23, -5, 5, 25, 5, (x, y, z) => (x * x + z * z > 28 ? -1 : y === 23 ? hex('#3a7ad0') : (x + y) % 2 ? straw : shade(straw, 0.9)));
	// A lamb on the shoulder.
	const wool = (x: number, y: number, z: number) => shade(WHITE, 0.9 + hash3(x, y, z, 4) * 0.12);
	b.box(7, 7, -2, 12, 10, 2, wool);
	b.box(11, 9, 2, 13, 11, 4, hex('#3a3030'));
	b.set(12, 11, 4, WHITE);
	b.box(8, 11, -1, 11, 11, 1, wool);
	// The crook.
	b.box(-12, 0, 2, -12, 24, 2, hex('#8a5a2c'));
	b.box(-12, 25, 2, -9, 25, 2, hex('#8a5a2c'));
	b.box(-9, 22, 2, -9, 24, 2, hex('#8a5a2c'));
}

function explorer(b: Bust) {
	const coat = hex('#8a5a32');
	b.body(coat, shade(coat, 0.75));
	// A red scarf and a brass compass on the chest.
	b.box(-6, 6, -4, 6, 8, 5, (x, y, z) => (y === 8 && Math.abs(x) < 3 ? -1 : (x + y + z) % 3 ? hex('#c8322c') : hex('#a82a26')));
	b.box(3, 0, 5, 4, 5, 5, hex('#c8322c'));
	b.box(-5, 1, 5, -3, 3, 5, GOLD);
	b.set(-4, 2, 6, hex('#2a6ad0'));
	b.neck(SKIN.mid);
	b.head(SKIN.mid);
	b.face(SKIN.mid, { brow: hex('#3a2414'), look: 1 });
	// Stubble.
	b.box(-4, 10, 5, 4, 11, 5, (x, y) => (Math.abs(x) <= 1 && y === 11 ? -1 : hash3(x, y, 3) > 0.45 ? shade(SKIN.mid, 0.72) : -1));
	b.hair(hex('#3a2414'), 14, 20);
	// Battered leather hat with a turned-up side.
	const hat = hex('#5a3a22');
	b.box(-8, 22, -8, 8, 22, 7, (x, _y, z) => (x * x + z * z > 66 ? -1 : shade(hat, 0.85)));
	b.box(-8, 23, -8, -7, 25, 7, (x, _y, z) => (x * x + z * z > 66 ? -1 : shade(hat, 0.8)));
	b.box(-5, 23, -5, 5, 26, 5, (x, y, z) => (x * x + z * z > 30 ? -1 : y === 23 ? hex('#2a1a10') : hat));
	// A spyglass held up at the side.
	b.box(9, 2, 4, 10, 4, 5, SKIN.mid);
	for (let i = 0; i < 9; i++) b.box(9, 4 + i, 5 + Math.floor(i / 3), 10, 4 + i, 5 + Math.floor(i / 3), i % 3 === 0 ? GOLD : hex('#3a2a1e'));
}

const BUILDERS: Record<CharacterId, (b: Bust) => void> = {
	merchant,
	mason,
	scholar,
	veteran,
	rogue,
	steward,
	shepherd,
	explorer
};

/** The voxel bust of a character, centered for portraits. */
export function buildBust(id: CharacterId): THREE.Group {
	return bustGroup(BUILDERS[id]);
}

/** Any bust drawn by `build`, as a mesh group centered for portraits. */
export function bustGroup(build: (b: Bust) => void): THREE.Group {
	const b = new Bust();
	build(b);
	const group = new THREE.Group();
	const center: [number, number, number] = [0, 13, 0];
	group.add(meshesFor(meshGrid(b.g, { jitter: 0.015 }), 1, { [Mat.Solid]: { bevel: 0.28, roughness: 0.62 } }, center));
	return group;
}

// ---------------------------------------------------------------- rendering to images

const SIZE = 256;
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;
let failed = false;

/**
 * A rendered portrait as an image URL (PNG data), or null where WebGL isn't available.
 * Rendering happens once per character and is cached.
 */
export function portraitUrl(id: CharacterId): string | null {
	return bustImage(`character:${id}`, BUILDERS[id]);
}

/** A bust drawn by `build` rendered as an image URL, cached under `key`; null without WebGL. */
export function bustImage(key: string, build: (b: Bust) => void): string | null {
	const hit = cache.get(key);
	if (hit || failed) return hit ?? null;
	try {
		renderer ??= makeRenderer();
		const url = render(renderer, bustGroup(build));
		cache.set(key, url);
		return url;
	} catch (e) {
		console.warn('Portraits unavailable', e);
		failed = true;
		return null;
	}
}

function makeRenderer() {
	const canvas = document.createElement('canvas');
	const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
	r.setPixelRatio(1);
	r.setSize(SIZE, SIZE, false);
	r.outputColorSpace = THREE.SRGBColorSpace;
	r.toneMapping = THREE.ACESFilmicToneMapping;
	r.toneMappingExposure = 1.05;
	r.setClearColor(0x000000, 0);
	return r;
}

function render(r: THREE.WebGLRenderer, bust: THREE.Group): string {
	const scene = new THREE.Scene();
	const pmrem = new THREE.PMREMGenerator(r);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.35;
	pmrem.dispose();
	scene.add(new THREE.HemisphereLight('#ffe6c8', '#3a1c0c', 1.1));
	const key = new THREE.DirectionalLight('#ffd8a8', 2.2);
	key.position.set(-40, 60, 80);
	scene.add(key);
	const rim = new THREE.DirectionalLight('#ff9a4a', 1.4);
	rim.position.set(60, 20, -40);
	scene.add(rim);

	bust.rotation.y = -0.42;
	bust.rotation.x = 0.06;
	scene.add(bust);
	// Framed from the chest up, like a painted portrait.
	const camera = new THREE.PerspectiveCamera(22, 1, 10, 1000);
	camera.position.set(0, 6, 70);
	camera.lookAt(0, 3, 0);
	r.render(scene, camera);
	const url = r.domElement.toDataURL('image/png');
	scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
	scene.environment?.dispose();
	return url;
}
