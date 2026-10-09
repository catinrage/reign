import * as THREE from 'three';
import { RESOURCES } from '../../shared/rules/config';
import { cityModel, resourceItemModel, roadModel, settlementModel } from './board/models';
import { PLAYER_RGB } from './layout';
import { sharedUniforms } from './voxel/materials';

/**
 * Renders the voxel resource items (and pieces) to small images once, so the 2D interface
 * and harbor tokens use the exact same art as the 3D world.
 */
export interface IconSet {
	canvases: Record<string, HTMLCanvasElement>;
	urls: Record<string, string>;
}

let icons: IconSet | null = null;

export function getIcons(): IconSet {
	if (icons) return icons;
	const size = 192;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
	renderer.setSize(size, size, false);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.AgXToneMapping;
	renderer.toneMappingExposure = 1.35;
	const scene = new THREE.Scene();
	scene.add(new THREE.HemisphereLight('#fff3e0', '#5a4030', 1.6));
	const sun = new THREE.DirectionalLight('#ffffff', 2.6);
	sun.position.set(-3, 6, 4);
	scene.add(sun);
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

	const out: IconSet = { canvases: {}, urls: {} };
	// Piece outlines are sized in screen pixels against the shared viewport: size them for this
	// small canvas while shooting, or they swell into a dark square round the piece.
	const viewport = sharedUniforms.uViewport.value.clone();
	sharedUniforms.uViewport.value.set(size, size);
	const shoot = (key: string, model: THREE.Object3D, yaw = -0.6) => {
		const holder = new THREE.Group();
		holder.add(model);
		model.rotation.y = yaw;
		scene.add(holder);
		const box = new THREE.Box3().setFromObject(holder);
		const center = box.getCenter(new THREE.Vector3());
		const sz = box.getSize(new THREE.Vector3()).length() * 0.5;
		camera.left = -sz;
		camera.right = sz;
		camera.top = sz;
		camera.bottom = -sz;
		camera.position.copy(center).add(new THREE.Vector3(0, 0.75, 1).normalize().multiplyScalar(40));
		camera.lookAt(center);
		camera.updateProjectionMatrix();
		renderer.setClearColor(0x000000, 0);
		renderer.render(scene, camera);
		const c = document.createElement('canvas');
		c.width = c.height = size;
		c.getContext('2d')!.drawImage(canvas, 0, 0);
		out.canvases[key] = c;
		out.urls[key] = c.toDataURL('image/png');
		scene.remove(holder);
	};

	for (const r of RESOURCES) shoot(r, resourceItemModel(r).clone());
	for (const [color, rgbVal] of Object.entries(PLAYER_RGB)) {
		shoot(`settlement:${color}`, settlementModel(rgbVal).clone());
		shoot(`city:${color}`, cityModel(rgbVal).clone());
		shoot(`road:${color}`, roadModel(rgbVal).clone(), -0.9);
	}
	sharedUniforms.uViewport.value.copy(viewport);
	renderer.dispose();
	renderer.forceContextLoss();
	icons = out;
	return out;
}
