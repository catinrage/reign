import * as THREE from 'three';
import type { Stage } from '../stage';

/** The cozy room around the board: table, furniture, fireplace, decorations. */
export interface Room {
	group: THREE.Group;
	update(dt: number, t: number): void;
}

export function buildRoom(stage: Stage): Room {
	const group = new THREE.Group();
	const table = new THREE.Mesh(
		new THREE.BoxGeometry(300, 6, 300),
		new THREE.MeshStandardMaterial({ color: '#7a3a20', roughness: 0.8 })
	);
	table.position.y = -3;
	table.receiveShadow = true;
	group.add(table);
	stage.scene.add(group);
	return { group, update() {} };
}
