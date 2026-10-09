import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sharedUniforms } from './materials';

/**
 * Dark outlines for small voxel models. The model's surface is copied with smoothed normals
 * and drawn back faces only, each vertex pushed out a fixed number of screen pixels, so it
 * shows as a rim round the silhouette. Player pieces use it to stay readable on tiles of
 * their own color (green in a forest, yellow in wheat).
 */

/** Outline width in CSS pixels. */
const WIDTH = 1.6;

let material: THREE.ShaderMaterial | null = null;

function outlineMaterial() {
	material ??= new THREE.ShaderMaterial({
		uniforms: {
			uViewport: sharedUniforms.uViewport,
			uWidth: { value: WIDTH },
			uColor: { value: new THREE.Color('#1a0f0a') }
		},
		vertexShader: /* glsl */ `
			uniform vec2 uViewport;
			uniform float uWidth;
			void main() {
				vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				vec2 dir = (normalMatrix * normal).xy;
				float len = length(dir);
				if (len > 1e-4) clip.xy += dir / len * (2.0 * uWidth / uViewport) * clip.w;
				gl_Position = clip;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			void main() {
				gl_FragColor = vec4(uColor, 1.0);
			}`,
		side: THREE.BackSide
	});
	return material;
}

/** Add an outline to a meshed model (a group from `meshesFor`); clones carry it along. */
export function addOutline(group: THREE.Group) {
	const meshes = group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
	if (!meshes.length) return;
	const parts = meshes.map((m) => {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', m.geometry.getAttribute('position'));
		g.setIndex(m.geometry.getIndex());
		return g;
	});
	// Corners shared by several faces get one normal pointing out between them.
	const hull = mergeVertices(mergeGeometries(parts)!, 1e-3);
	hull.computeVertexNormals();
	const mesh = new THREE.Mesh(hull, outlineMaterial());
	mesh.name = 'outline';
	mesh.scale.copy(meshes[0].scale);
	mesh.position.copy(meshes[0].position);
	mesh.castShadow = false;
	mesh.receiveShadow = false;
	group.add(mesh);
}
