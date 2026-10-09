import * as THREE from 'three';
import { CITY_PATHS, type CityPath } from '../../shared/rules/buildings';
import { RESOURCES, type Resource } from '../../shared/rules/config';
import { pathObject } from './board/cityPaths';
import { cityModel, resourceItemModel, roadModel, settlementModel, stoneRoadModel } from './board/models';
import { storehouseObject } from './board/storehouse';
import { tavernObject } from './board/tavern';
import { workshopObject } from './board/workshops';
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

/** A settlement with a storehouse or a tavern against the wall that faces the camera. */
function settlementWith(color: number, annex: THREE.Group) {
	const g = new THREE.Group();
	g.add(settlementModel(color).clone());
	annex.position.x = 2.5;
	annex.rotation.y = Math.PI / 2;
	g.add(annex);
	return g;
}

/** A workshop standing still for its picture, the Mill's sails turned to a cross. */
function posedWorkshop(res: Resource, color: number) {
	const w = workshopObject(res, color);
	const sails = w.getObjectByName('sails');
	if (sails) sails.rotation.z = Math.PI / 4;
	return w;
}

/** A city path standing still for its picture, its flag streaming out. */
function posedPath(path: CityPath, color: number) {
	const obj = pathObject(path, color);
	const flag = obj.getObjectByName('flag');
	if (flag) flag.rotation.y = -0.5;
	return obj;
}

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
	// `tight` frames the model's own voxels as the camera sees them, centred, instead of the sphere
	// round its box: a tall, thin model (a mill with its sails) then fills its picture like the rest.
	const shoot = (key: string, model: THREE.Object3D, yaw = -0.6, tight = false) => {
		const holder = new THREE.Group();
		holder.add(model);
		model.rotation.y = yaw;
		scene.add(holder);
		const box = new THREE.Box3().setFromObject(holder);
		const center = box.getCenter(new THREE.Vector3());
		camera.position.copy(center).add(new THREE.Vector3(0, 0.75, 1).normalize().multiplyScalar(40));
		camera.lookAt(center);
		camera.updateMatrixWorld();
		const sz = box.getSize(new THREE.Vector3()).length() * 0.5;
		let [left, right, bottom, top] = [-sz, sz, -sz, sz];
		if (tight) {
			[left, right, bottom, top] = [Infinity, -Infinity, Infinity, -Infinity];
			const v = new THREE.Vector3();
			holder.updateMatrixWorld(true);
			holder.traverseVisible((o) => {
				const pos = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.getAttribute('position') : undefined;
				if (!pos) return;
				for (let i = 0; i < pos.count; i++) {
					v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
					[left, right, bottom, top] = [Math.min(left, v.x), Math.max(right, v.x), Math.min(bottom, v.y), Math.max(top, v.y)];
				}
			});
			const half = Math.max(right - left, top - bottom) * 0.6;
			const [cx, cy] = [(left + right) / 2, (bottom + top) / 2];
			[left, right, bottom, top] = [cx - half, cx + half, cy - half, cy + half];
		}
		camera.left = left;
		camera.right = right;
		camera.top = top;
		camera.bottom = bottom;
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
		shoot(`stoneRoad:${color}`, stoneRoadModel(rgbVal).clone(), -0.9);
		shoot(`storehouse:${color}`, settlementWith(rgbVal, storehouseObject(rgbVal)), -0.9, true);
		shoot(`tavern:${color}`, settlementWith(rgbVal, tavernObject(rgbVal)), -0.9, true);
		// Every workshop shares the Mill's picture in the menus.
		shoot(`workshop:${color}`, posedWorkshop('wheat', rgbVal), -0.5, true);
		for (const path of CITY_PATHS) shoot(`${path}:${color}`, posedPath(path, rgbVal), -0.6, true);
	}
	// And each kind of workshop on its own, in red, for the tutorial.
	for (const r of RESOURCES) shoot(`workshop:${r}`, posedWorkshop(r, PLAYER_RGB.red), -0.5, true);
	sharedUniforms.uViewport.value.copy(viewport);
	renderer.dispose();
	renderer.forceContextLoss();
	icons = out;
	return out;
}
