import * as THREE from 'three';
import { pips } from '../../../shared/rules/config';
import { Mat, VoxelGrid, hash3, hex, pick, shade } from '../voxel/grid';
import { meshesFor } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';

/** Round cream tokens: number discs on tiles and harbor discs on the piers. */

export const TOKEN_RADIUS = 4.4;

let discGroup: THREE.Group | null = null;

function disc(): THREE.Group {
	if (!discGroup) {
		const N = 10;
		const g = new VoxelGrid(N, 2, N);
		const c = (N - 1) / 2;
		for (let z = 0; z < N; z++)
			for (let x = 0; x < N; x++) {
				const d = Math.hypot(x - c, z - c);
				if (d > 4.7) continue;
				g.set(x, 0, z, pick([hex('#c9a874'), hex('#bf9d69')], hash3(x, 0, z)));
				g.set(x, 1, z, d > 3.9 ? hex('#e2c48e') : hex('#f4dcaa'));
			}
		discGroup = meshesFor(meshGrid(g, { jitter: 0.03 }), 1, {}, [N / 2, 0, N / 2]);
	}
	return discGroup.clone(true);
}

const rings = new Map<number, THREE.Group>();

/**
 * A band in a player's color round a token, flush with its top. On number tokens it marks
 * the tiles your buildings touch; on harbor discs, the player who holds the harbor. A dark
 * edge keeps it apart from a tile of the same color (green on a forest, yellow on wheat).
 */
export function tokenRing(color: number): THREE.Group {
	let ring = rings.get(color);
	if (!ring) {
		const N = 16;
		const g = new VoxelGrid(N, 2, N);
		const c = (N - 1) / 2;
		const edge = hex('#2b1a10');
		for (let z = 0; z < N; z++)
			for (let x = 0; x < N; x++) {
				const d = Math.hypot(x - c, z - c);
				if (d <= 4.7 || d > 6.9) continue;
				const band = d <= 5.9;
				g.set(x, 0, z, band ? shade(color, 0.78) : edge);
				g.set(x, 1, z, band ? shade(color, 0.97 + hash3(x, 1, z) * 0.08) : edge);
			}
		ring = meshesFor(meshGrid(g, { jitter: 0.03 }), 1, { [Mat.Solid]: { lift: 0.3 } }, [N / 2, 0, N / 2]);
		// Drawn faintly where trees or peaks stand in front of it, like the number.
		const see = (inner: number, outer: number, tint: THREE.ColorRepresentation, order: number) => {
			const m = new THREE.Mesh(
				new THREE.RingGeometry(inner, outer, 48),
				new THREE.MeshBasicMaterial({
					color: tint,
					transparent: true,
					opacity: 0.7,
					depthWrite: false,
					depthFunc: THREE.GreaterDepth,
					polygonOffset: true,
					polygonOffsetFactor: -2,
					polygonOffsetUnits: -2
				})
			);
			m.rotation.x = -Math.PI / 2;
			m.position.y = 2.02;
			m.renderOrder = order;
			m.name = 'ring-ghost';
			ring!.add(m);
		};
		see(4.8, 6.3, color, 2);
		see(6.3, 7.3, edge, 2);
		rings.set(color, ring);
	}
	const r = ring.clone(true);
	r.name = 'ring';
	return r;
}

function faceTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
	const s = 256;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = s;
	const ctx = canvas.getContext('2d')!;
	const grad = ctx.createRadialGradient(s / 2, s * 0.42, s * 0.05, s / 2, s / 2, s / 2);
	grad.addColorStop(0, '#fff3d6');
	grad.addColorStop(0.75, '#f6deaf');
	grad.addColorStop(1, '#e6c48c');
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
	ctx.fill();
	// faint pixel grain so it matches the voxel world
	for (let i = 0; i < 900; i++) {
		const x = Math.floor(Math.random() * 32) * 8;
		const y = Math.floor(Math.random() * 32) * 8;
		ctx.fillStyle = `rgba(120,80,30,${Math.random() * 0.05})`;
		ctx.fillRect(x, y, 8, 8);
	}
	ctx.strokeStyle = 'rgba(150,105,50,0.55)';
	ctx.lineWidth = 6;
	ctx.beginPath();
	ctx.arc(s / 2, s / 2, s / 2 - 14, 0, Math.PI * 2);
	ctx.stroke();
	draw(ctx, s);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 8;
	return tex;
}

function withFace(tex: THREE.Texture, seeThrough = false): THREE.Group {
	const g = new THREE.Group();
	g.add(disc());
	const face = new THREE.Mesh(
		new THREE.CircleGeometry(TOKEN_RADIUS * 0.98, 40),
		// At night the face glows a little from within (see `BoardView.update`), to read in the dark.
		new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x000000, roughness: 0.7, transparent: true })
	);
	face.rotation.x = -Math.PI / 2;
	face.position.y = 2.02;
	face.receiveShadow = true;
	face.name = 'face';
	g.add(face);
	if (seeThrough) {
		// Drawn only where something stands in front of the face (a peak or a tree from a low
		// camera, the robber), faintly, so the number can always be read.
		const ghost = new THREE.Mesh(
			face.geometry,
			new THREE.MeshBasicMaterial({
				map: tex,
				transparent: true,
				opacity: 0.6,
				depthWrite: false,
				depthFunc: THREE.GreaterDepth,
				polygonOffset: true,
				polygonOffsetFactor: -2,
				polygonOffsetUnits: -2
			})
		);
		ghost.rotation.x = -Math.PI / 2;
		ghost.position.y = 2.02;
		ghost.renderOrder = 2;
		ghost.name = 'ghost';
		g.add(ghost);
	}
	return g;
}

export function numberToken(n: number): THREE.Group {
	const red = n === 6 || n === 8;
	const tex = faceTexture((ctx, s) => {
		ctx.fillStyle = red ? '#c7261b' : '#3a2416';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `900 ${n >= 10 ? 112 : 128}px "Nunito Variable", system-ui, sans-serif`;
		ctx.fillText(String(n), s / 2, s * 0.45);
		const dots = pips(n);
		const size = 16;
		const gap = 24;
		const start = s / 2 - ((dots - 1) * gap) / 2;
		for (let i = 0; i < dots; i++) {
			ctx.beginPath();
			ctx.arc(start + i * gap, s * 0.76, size / 2, 0, Math.PI * 2);
			ctx.fill();
		}
	});
	const g = withFace(tex, true);
	g.userData.number = n;
	return g;
}

/** Each harbor's resource color, as on its cards (light, dark), so a harbor reads by color alone. */
const HARBOR_TINT: Record<string, [string, string]> = {
	wood: ['#4a9236', '#24561a'],
	brick: ['#d8643f', '#8a3418'],
	sheep: ['#93cc58', '#4f8a2c'],
	wheat: ['#f0bf45', '#b07a14'],
	ore: ['#a3a8b1', '#5a5e66']
};
const RATIO_FONT = '900 {px}px "Nunito Variable", system-ui, sans-serif';

/**
 * A harbor's disc: the face is filled with its resource's color, with the resource drawn big
 * on it and its rate on a dark plate below, so it can be read from the table's usual view.
 * The 3:1 harbor shows all five resources over its rate. `icons` are the resource pictures.
 */
export function harborToken(icons: Record<string, HTMLCanvasElement>, ratio: number, kind: string): THREE.Group {
	const tex = faceTexture((ctx, s) => {
		ctx.imageSmoothingEnabled = false;
		const tint = HARBOR_TINT[kind];
		if (tint) {
			const grad = ctx.createRadialGradient(s / 2, s * 0.38, s * 0.06, s / 2, s / 2, s * 0.44);
			grad.addColorStop(0, tint[0]);
			grad.addColorStop(1, tint[1]);
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(s / 2, s / 2, s / 2 - 20, 0, Math.PI * 2);
			ctx.fill();
			const icon = icons[kind];
			if (icon) ctx.drawImage(icon, s * 0.1, s * -0.06, s * 0.8, s * 0.8);
		} else {
			// Any resource: the five of them in an arch over the rate.
			const list = Object.keys(HARBOR_TINT);
			list.forEach((r, i) => {
				const a = Math.PI * (0.92 - (0.84 * i) / (list.length - 1));
				const x = s / 2 + Math.cos(a) * s * 0.27;
				const y = s * 0.5 - Math.sin(a) * s * 0.27;
				const size = s * 0.3;
				if (icons[r]) ctx.drawImage(icons[r], x - size / 2, y - size / 2, size, size);
			});
		}
		// The rate on a dark plate, big enough to read at a glance.
		const text = `${ratio}:1`;
		ctx.font = RATIO_FONT.replace('{px}', '86');
		const w = ctx.measureText(text).width + 30;
		const h = 78;
		const y = s * 0.6;
		ctx.fillStyle = 'rgba(43, 26, 16, 0.92)';
		ctx.beginPath();
		ctx.roundRect(s / 2 - w / 2, y, w, h, 14);
		ctx.fill();
		ctx.fillStyle = '#fff2d2';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, s / 2, y + h / 2 + 3);
	});
	return withFace(tex);
}
