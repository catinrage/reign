import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FrameCap } from './frameCap';
import type { Quality } from './stage';
import { Mat, VoxelGrid, hash3, hex, mix } from './voxel/grid';
import { meshesFor } from './voxel/materials';
import { meshGrid } from './voxel/mesher';

/**
 * The title, built from voxels like everything else: chunky letters in polished gold with a
 * bevelled highlight on every stroke, set on a dark walnut backing, and a jewelled crown over the I.
 * `LogoView` renders it live into its own canvas with a slow sway and a glint that sweeps
 * across the letters.
 */

const GLYPHS: Record<string, string[]> = {
	R: [
		'XXXXXX..',
		'XX...XX.',
		'XX...XX.',
		'XX...XX.',
		'XXXXXX..',
		'XX.XX...',
		'XX..XX..',
		'XX...XX.',
		'XX....XX'
	],
	E: [
		'XXXXXXX',
		'XX.....',
		'XX.....',
		'XX.....',
		'XXXXXX.',
		'XX.....',
		'XX.....',
		'XX.....',
		'XXXXXXX'
	],
	I: ['XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', 'XXXXXX'],
	G: [
		'.XXXXXX.',
		'XX....XX',
		'XX......',
		'XX......',
		'XX..XXXX',
		'XX....XX',
		'XX....XX',
		'XX....XX',
		'.XXXXXX.'
	],
	N: [
		'XX....XX',
		'XXX...XX',
		'XXXX..XX',
		'XX.XX.XX',
		'XX..XXXX',
		'XX...XXX',
		'XX....XX',
		'XX....XX',
		'XX....XX'
	]
};

/** g = gold, r = ruby, b = sapphire. */
const CROWN = ['g..g..g', 'g.grg.g', 'ggggggg', 'gbgrgbg', 'ggggggg'];

/** Size of one glyph pixel in voxels. */
const P = 3;
/** Letter thickness in voxels. */
const DEPTH = 6;

const GOLD = {
	top: hex('#ffe68a'),
	hi: hex('#ffc93a'),
	mid: hex('#f2a21c'),
	low: hex('#cf7410'),
	side: hex('#8f4808'),
	sideDark: hex('#5a2804'),
	rimLight: hex('#ffeaa0'),
	rimDark: hex('#a85a0a')
};

function buildLogo(word: string) {
	const gap = 1;
	const widths = [...word].map((c) => GLYPHS[c][0].length);
	const W = widths.reduce((a, b) => a + b, 0) + gap * (word.length - 1);
	const crownH = CROWN.length + 1;
	const rows = 9 + crownH;
	// Glyph-pixel masks: letters, and crown pixels with their kind.
	const letter: boolean[][] = Array.from({ length: rows }, () => new Array(W).fill(false));
	const crown: (string | null)[][] = Array.from({ length: rows }, () => new Array(W).fill(null));
	let ox = 0;
	for (const [k, ch] of [...word].entries()) {
		GLYPHS[ch].forEach((row, y) =>
			[...row].forEach((c, x) => c === 'X' && (letter[y + crownH][ox + x] = true))
		);
		if (ch === 'I') {
			const cx = ox + Math.floor((widths[k] - CROWN[0].length) / 2);
			CROWN.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && (crown[y][cx + x] = c)));
		}
		ox += widths[k] + gap;
	}

	const pad = P + 1;
	const nx = W * P + pad * 2;
	const ny = rows * P + pad * 2;
	const nz = DEPTH + 3;
	const gold = new VoxelGrid(nx, ny, nz);
	const dark = new VoxelGrid(nx, ny, nz);

	// Voxel-resolution masks (grid y grows upward, glyph rows grow downward).
	const solid = (vx: number, vy: number) => {
		const gx = Math.floor((vx - pad) / P);
		const gy = rows - 1 - Math.floor((vy - pad) / P);
		if (vx < pad || vy < pad || gx < 0 || gx >= W || gy < 0 || gy >= rows) return null;
		if (letter[gy][gx]) return 'L';
		return crown[gy][gx];
	};
	const near = (vx: number, vy: number, r: number) => {
		for (let dy = -r; dy <= r; dy++)
			for (let dx = -r; dx <= r; dx++)
				if (dx * dx + dy * dy <= r * r + 1 && solid(vx + dx, vy + dy)) return true;
		return false;
	};

	const letterTop = pad + (9 * P - 1);
	for (let vy = 0; vy < ny; vy++)
		for (let vx = 0; vx < nx; vx++) {
			const s = solid(vx, vy);
			if (!s) {
				// Walnut backing: a rounded border three voxels wide, set behind the letters.
				if (near(vx, vy, 3)) {
					const edge = !near(vx, vy, 2);
					for (let z = 0; z <= 2; z++)
						dark.set(vx, vy, z, hex(edge ? '#1a0b04' : z === 2 ? '#4a2812' : '#2c1508'));
				}
				continue;
			}
			if (s === 'r' || s === 'b') {
				const c = hex(s === 'r' ? '#ff3b30' : '#3d8bff');
				for (let z = 1; z <= DEPTH + 1; z++) dark.set(vx, vy, z, c, Mat.Glow);
				continue;
			}
			// Pixel-art shading baked into the face: a bright line along top edges, a darker
			// one along bottom edges, over a vertical gradient (the crown uses the top colors).
			const up = !solid(vx, vy + 1);
			const down = !solid(vx, vy - 1);
			const t = s === 'L' ? Math.min(1, Math.max(0, (letterTop - vy) / (9 * P - 1))) : 0.05;
			let face =
				t < 0.1
					? mix(GOLD.top, GOLD.hi, t / 0.1)
					: t < 0.55
						? mix(GOLD.hi, GOLD.mid, (t - 0.1) / 0.45)
						: mix(GOLD.mid, GOLD.low, (t - 0.55) / 0.45);
			if (up) face = mix(face, GOLD.rimLight, 0.75);
			else if (down) face = mix(face, GOLD.rimDark, 0.6);
			const n = 0.985 + hash3(vx, vy, 7) * 0.03;
			for (let z = 1; z <= DEPTH; z++) {
				const k = (DEPTH - z) / DEPTH;
				gold.set(vx, vy, z, z === DEPTH ? scale(face, n) : mix(GOLD.side, GOLD.sideDark, k * 0.8));
			}
		}
	return { gold, dark, nx, ny };
}

function scale(c: number, k: number) {
	const r = Math.min(255, ((c >> 16) & 255) * k);
	const g = Math.min(255, ((c >> 8) & 255) * k);
	const b = Math.min(255, (c & 255) * k);
	return (r << 16) | (g << 8) | b;
}

export class LogoView {
	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera: THREE.PerspectiveCamera;
	private group = new THREE.Group();
	private glint: THREE.PointLight;
	private raf = 0;
	private t0 = performance.now();
	private size: { w: number; h: number };

	/** At low quality the logo is drawn with fewer pixels and no smoothing. */
	constructor(
		readonly canvas: HTMLCanvasElement,
		quality: Quality = 'high'
	) {
		const plain = quality === 'low';
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: !plain,
			powerPreference: 'low-power'
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, plain ? 1 : 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.9;
		this.renderer.setClearColor(0x000000, 0);
		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		this.scene.environmentIntensity = 0.45;
		pmrem.dispose();

		const { gold, dark, nx, ny } = buildLogo('REIGN');
		this.size = { w: nx, h: ny };
		const center: [number, number, number] = [nx / 2, ny / 2, DEPTH / 2];
		this.group.add(
			meshesFor(
				meshGrid(gold, { jitter: 0 }),
				1,
				{
					[Mat.Solid]: {
						metalness: 0.5,
						roughness: 0.4,
						envMapIntensity: 1,
						bevel: 0.18,
						bevelWidth: 0.1
					}
				},
				center
			)
		);
		this.group.add(
			meshesFor(
				meshGrid(dark, { jitter: 0.02 }),
				1,
				{ [Mat.Glow]: { emissive: 1.6, roughness: 0.2 } },
				center
			)
		);
		this.scene.add(this.group);

		this.scene.add(new THREE.HemisphereLight('#ffe6c0', '#2a1206', 0.55));
		const key = new THREE.DirectionalLight('#ffe2b0', 1.9);
		key.position.set(-50, 70, 90);
		this.scene.add(key);
		const rim = new THREE.DirectionalLight('#ff9a4a', 1.6);
		rim.position.set(70, -30, 40);
		this.scene.add(rim);
		this.glint = new THREE.PointLight('#fff1cc', 0, 0, 2);
		this.scene.add(this.glint);

		this.camera = new THREE.PerspectiveCamera(16, 1, 10, 2000);
		this.resize();
		this.loop();
	}

	resize() {
		const w = this.canvas.clientWidth || 600;
		const h = this.canvas.clientHeight || 220;
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		// Fit the word with a small margin in both directions.
		const fitW = (this.size.w * 1.08) / (2 * tan * this.camera.aspect);
		const fitH = (this.size.h * 1.12) / (2 * tan);
		this.camera.position.set(0, -10, Math.max(fitW, fitH));
		this.camera.lookAt(0, -1, 0);
		this.camera.updateProjectionMatrix();
	}

	/** Frames a second at most (0: as many as the screen shows), as the table. */
	readonly cap = new FrameCap();

	private loop = (now = performance.now()) => {
		this.raf = requestAnimationFrame(this.loop);
		if (!this.cap.due(now)) return;
		const t = (performance.now() - this.t0) / 1000;
		this.group.rotation.y = Math.sin(t * 0.45) * 0.13;
		this.group.rotation.x = -0.16 + Math.sin(t * 0.6) * 0.035;
		this.group.position.y = Math.sin(t * 0.9) * 0.8;
		// A glint sweeps across the letters every few seconds.
		const cycle = (t % 7) / 7;
		const sweep = THREE.MathUtils.smoothstep(cycle, 0.05, 0.5);
		this.glint.position.set(-110 + sweep * 220, 20, 40);
		this.glint.intensity = cycle < 0.55 ? Math.sin(Math.min(1, cycle / 0.55) * Math.PI) * 2600 : 0;
		this.renderer.render(this.scene, this.camera);
	};

	dispose() {
		cancelAnimationFrame(this.raf);
		this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
		this.scene.environment?.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}
}
