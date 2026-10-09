import * as THREE from 'three';
import { pips } from '../../../shared/rules/config';
import { VoxelGrid, hash3, hex, pick } from '../voxel/grid';
import { meshesFor } from '../voxel/materials';
import { meshGrid } from '../voxel/mesher';

/** Round cream tokens: number discs on tiles and harbor discs on the piers. */

export const TOKEN_RADIUS = 4.4;
const FONT = '"Pixelify Sans", "Nunito Variable", system-ui, sans-serif';

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
		new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, transparent: true })
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

export function harborToken(icon: HTMLCanvasElement | null, ratio: number, kind: string): THREE.Group {
	const tex = faceTexture((ctx, s) => {
		if (icon) ctx.drawImage(icon, s * 0.22, s * 0.1, s * 0.56, s * 0.56);
		else {
			ctx.fillStyle = '#3a2416';
			ctx.font = `700 92px ${FONT}`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('?', s / 2, s * 0.38);
		}
		ctx.fillStyle = kind === 'any' ? '#3a2416' : '#7a3d12';
		ctx.font = `700 62px ${FONT}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(`${ratio}:1`, s / 2, s * 0.78);
	});
	return withFace(tex);
}
