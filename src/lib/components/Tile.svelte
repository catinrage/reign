<script lang="ts" module>
	import { getGame } from '$lib/models/game.svelte';
	import type { BaseTile } from '$lib/models/tile';
	import { getDiceComboCount } from '$lib/utils';

	export type Props = {
		tile: BaseTile;
	};
</script>

<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { GLTF, interactivity } from '@threlte/extras';
	import { onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

	const game = getGame();

	interactivity();

	const isBrowser = typeof window !== 'undefined';
	const textureLoader = isBrowser ? new THREE.TextureLoader() : null;
	const textureCache: Record<string, THREE.Texture | undefined> = {};

	let { tile }: Props = $props();

	const { number, image, position, textureScale = 1 } = tile;

	const piecesInThisTile = $derived(game.getPiecesInTile(tile));
	const buildingsInThisTile = $derived(game.getBuildingsInTile(tile));
	const hasThief = $derived(piecesInThisTile.some((piece) => piece.name === 'Thief'));

	const TILE_RADIUS = 2.75;
	const TILE_HEIGHT = 0.28;

	const backgroundColor = '#614735';

	// Calculate vertex positions for a hexagon (6 vertices)
	function getVertexPositions(): [number, number, number][] {
		const vertices: [number, number, number][] = [];
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI / 3) * i; // 60 degrees apart
			const x = TILE_RADIUS * Math.cos(angle);
			const z = TILE_RADIUS * Math.sin(angle);
			vertices.push([x, TILE_HEIGHT / 2 + 0.05, z]);
		}
		return vertices;
	}

	// Calculate edge positions (midpoint between vertices) and exact orientation/length
	function getEdgePositions(): Array<{
		position: [number, number, number];
		rotation: number; // yaw around Y so the long axis (Z) aligns with the edge
		length: number; // bar length to match the side length (minus a tiny margin)
	}> {
		const edges: Array<{ position: [number, number, number]; rotation: number; length: number }> =
			[];
		for (let i = 0; i < 6; i++) {
			const angle1 = (Math.PI / 3) * i;
			const angle2 = (Math.PI / 3) * ((i + 1) % 6);

			const x1 = TILE_RADIUS * Math.cos(angle1);
			const z1 = TILE_RADIUS * Math.sin(angle1);
			const x2 = TILE_RADIUS * Math.cos(angle2);
			const z2 = TILE_RADIUS * Math.sin(angle2);

			// Midpoint between the two vertices
			const midX = (x1 + x2) / 2;
			const midZ = (z1 + z2) / 2;

			// Edge direction from v1 -> v2 on XZ plane
			const dx = x2 - x1;
			const dz = z2 - z1;
			// Rotate the bar so its local Z axis lies along the edge
			const rotation = Math.atan2(dx, dz);

			// Exact side length of a regular hex with circumradius = TILE_RADIUS is TILE_RADIUS
			// But compute from vertices to be robust; subtract a small margin so it doesn't touch red points visually
			const length = Math.hypot(dx, dz) - 0.05;

			edges.push({
				position: [midX, TILE_HEIGHT / 2 + 0.05, midZ],
				rotation,
				length
			});
		}
		return edges;
	}

	const vertexPositions = getVertexPositions();
	const edgePositions = getEdgePositions();

	function loadResourceTexture(source: string): THREE.Texture | null {
		if (!isBrowser || !textureLoader) return null;
		const url = source;
		if (!url) return null;
		const cached = textureCache[url];
		if (cached) {
			return cached;
		}
		const texture = textureLoader.load(
			url,
			(loaded) => {
				loaded.needsUpdate = true;
				// Force material update by reassigning the texture
				tileTexture = null;
				queueMicrotask(() => {
					tileTexture = loaded;
				});
			},
			undefined,
			(error) => {
				console.error(`Failed to load texture: ${url}`, error);
			}
		);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 8;
		texture.repeat.set(textureScale, textureScale);
		texture.center.set(0.5, 0.5);
		textureCache[url] = texture;
		return texture;
	}

	function createTileGeometry(): THREE.CylinderGeometry {
		const geometry = new THREE.CylinderGeometry(TILE_RADIUS, TILE_RADIUS, TILE_HEIGHT, 6, 1, false);
		geometry.rotateY(Math.PI / 6);
		geometry.computeVertexNormals();
		return geometry;
	}

	function createNumberTexture(value: number): THREE.Texture {
		// Generates a round token similar to a Catan number chit using a canvas texture.
		if (!isBrowser) return new THREE.Texture();
		const size = 256;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Unable to create number token texture');
		}

		if (value !== 0) {
			ctx.clearRect(0, 0, size, size);
			ctx.fillStyle = '#00000077';
			ctx.beginPath();
			ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
			ctx.fill();

			ctx.lineWidth = 0;
			ctx.stroke();

			ctx.fillStyle = '#ffffff';
			if (value === 6 || value === 8) {
				ctx.fillStyle = '#8BC34A';
			}
			ctx.font = `${size * 0.3}px "Libre Baskerville", "Arial", sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(value), size / 2, size / 2);

			// Draw probability dots below the number
			const dotCount = getDiceComboCount(value);
			if (dotCount > 0) {
				const dotRadius = size * 0.015;
				const dotSpacing = size * 0.04;
				const totalWidth = (dotCount - 1) * dotSpacing;
				const startX = size / 2 - totalWidth / 2;
				const dotY = size / 2 + size * 0.15;

				for (let i = 0; i < dotCount; i++) {
					ctx.beginPath();
					ctx.arc(startX + i * dotSpacing, dotY, dotRadius, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}

		const tokenTexture = new THREE.CanvasTexture(canvas);
		tokenTexture.colorSpace = THREE.SRGBColorSpace;
		tokenTexture.anisotropy = 4;
		tokenTexture.needsUpdate = true;
		return tokenTexture;
	}

	function axialToWorld({ q, r }: Props['tile']['position']): [number, number, number] {
		const x = TILE_RADIUS * 1.5 * q;
		const z = TILE_RADIUS * Math.sqrt(3) * (r + q / 2);
		return [x, TILE_HEIGHT / 2, z];
	}

	const tileGeometry = createTileGeometry();
	const tilePosition = $derived(axialToWorld(position));
	let tileTexture = $state<THREE.Texture | null>(loadResourceTexture(image));
	let numberTexture = $state(createNumberTexture(number));
	let currentTokenValue = number;
	let numberMeshRef = $state<THREE.Mesh | undefined>(undefined);
	let edgeMeshRefs = $state<(THREE.Mesh | undefined)[]>(Array(6).fill(undefined));
	let buildingObjects = $state<(THREE.Object3D | undefined)[]>([]);
	let buildingGroupRefs = $state<(THREE.Group | undefined)[]>([]);

	// GLTF model cache and loader for buildings
	const gltfLoader = isBrowser ? new GLTFLoader() : null;
	const modelCache: Record<string, THREE.Object3D | null | undefined> = {};

	async function loadModel(url: string): Promise<THREE.Object3D | null> {
		if (!isBrowser || !gltfLoader) return null;
		if (modelCache[url] !== undefined) return modelCache[url] ?? null;
		try {
			const gltf = await gltfLoader.loadAsync(url);
			modelCache[url] = gltf.scene;
			return gltf.scene;
		} catch (e) {
			console.error('Failed to load GLTF model', url, e);
			modelCache[url] = null;
			return null;
		}
	}

	const { camera } = useThrelte();

	// Make number billboard (always face camera but stay flat on tile)
	useTask(() => {
		if (numberMeshRef && camera.current) {
			const meshWorldPos = new THREE.Vector3();
			numberMeshRef.getWorldPosition(meshWorldPos);

			// Calculate direction to camera on XZ plane only
			const dx = camera.current.position.x - meshWorldPos.x;
			const dz = camera.current.position.z - meshWorldPos.z;

			// Calculate angle (rotation around Y axis when lying flat)
			const angle = Math.atan2(dx, dz);

			// Apply rotations in correct order: first face camera (Y), then lay flat (X)
			numberMeshRef.rotation.order = 'YXZ';
			numberMeshRef.rotation.set(-Math.PI / 2, angle, 0);
		}

		// Make edge markers stay parallel to edges (flat on XZ plane)
		edgeMeshRefs.forEach((edgeMesh, i) => {
			if (edgeMesh && camera.current) {
				// Keep the edge aligned with its original orientation and flat on the tile
				const edge = edgePositions[i];
				edgeMesh.rotation.order = 'YXZ';
				edgeMesh.rotation.set(0, edge.rotation, 0);
			}
		});
	});

	// (coloring code removed) only enabling shadows for loaded GLTFs

	// After a GLTF scene is available, ensure all child meshes cast and receive shadows,
	// and tint the materials to the owner's color while preserving PBR shading and maps.
	function enableBuildingShadows(root: THREE.Object3D, colorHex: string) {
		const ownerColor = new THREE.Color(colorHex);
		root.traverse((obj) => {
			// Put all building objects on layer 1 so only the directional light affects them
			obj.layers.set(1);
			// Handle Meshes (SkinnedMesh extends Mesh)
			if (obj instanceof THREE.Mesh) {
				const mesh = obj as THREE.Mesh;
				mesh.castShadow = true;
				mesh.receiveShadow = true;

				// Apply owner color while keeping texture/normal maps for depth
				const applyOwnerTint = (material: THREE.Material | null | undefined) => {
					if (!material) return;

					// If material is unlit (MeshBasic), convert to a lit PBR material and copy maps
					if (material instanceof THREE.MeshBasicMaterial) {
						const src = material as THREE.MeshBasicMaterial;
						const newMat = new THREE.MeshStandardMaterial({
							color: ownerColor.clone(),
							roughness: 0.7,
							metalness: 0.1
						});
						// Preserve key properties for depth and appearance
						newMat.map = src.map ?? null;
						newMat.alphaMap = src.alphaMap ?? null;
						// Carry rendering flags
						newMat.transparent = src.transparent;
						newMat.opacity = src.opacity;
						newMat.side = src.side;
						newMat.depthTest = src.depthTest;
						newMat.depthWrite = src.depthWrite;
						// Ensure no emissive contribution; rely on scene lighting entirely
						newMat.emissive.set(0x000000);
						newMat.emissiveIntensity = 0;
						// Dispose old material and assign
						src.dispose();
						mesh.material = newMat;
						return;
					}
					// If material has a color, tint it; preserve maps and lighting so the model keeps depth
					if ('color' in material) {
						const matWithColor = material as THREE.Material & { color: THREE.Color };
						matWithColor.color.set(ownerColor);
						// Remove any emissive contribution from existing materials
						if ('emissive' in material) {
							const matWithEmissive = material as THREE.Material & {
								emissive: THREE.Color;
								emissiveIntensity?: number;
								emissiveMap?: THREE.Texture | null;
							};
							matWithEmissive.emissive.set(0x000000);
							if (
								'emissiveIntensity' in matWithEmissive &&
								typeof matWithEmissive.emissiveIntensity === 'number'
							) {
								matWithEmissive.emissiveIntensity = 0;
							}
							if ('emissiveMap' in matWithEmissive) {
								matWithEmissive.emissiveMap = null as unknown as THREE.Texture;
							}
						}
						return;
					}
					// Otherwise, replace with a lit PBR material in the owner's color
					const newMat = new THREE.MeshStandardMaterial({
						color: ownerColor,
						roughness: 0.7,
						metalness: 0.1
					});
					if (
						'dispose' in (material as THREE.Material) &&
						typeof (material as THREE.Material).dispose === 'function'
					) {
						(material as THREE.Material).dispose();
					}
					mesh.material = newMat;
				};

				if (Array.isArray(mesh.material)) {
					(mesh.material as THREE.Material[]).forEach((m) => applyOwnerTint(m));
				} else {
					applyOwnerTint(mesh.material as THREE.Material | undefined);
				}
			}
		});
	}

	useTask(() => {
		// keep arrays in sync with items
		if (buildingObjects.length !== buildingsInThisTile.length) {
			buildingObjects.length = buildingsInThisTile.length;
		}
		if (buildingGroupRefs.length !== buildingsInThisTile.length) {
			buildingGroupRefs.length = buildingsInThisTile.length;
		}

		// ensure each building has its own cloned object
		buildingsInThisTile.forEach(async (building, i) => {
			if (!buildingObjects[i]) {
				const source = await loadModel(building.model);
				if (!source) return;
				const clone = skeletonClone(source) as THREE.Object3D;
				// Apply owner color, shadows, and layers to the cloned instance
				enableBuildingShadows(clone, buildingsInThisTile[i]?.owner?.color ?? '#ffffff');
				buildingObjects[i] = clone;
			}
			// attach to its group when available
			const obj = buildingObjects[i];
			const grp = buildingGroupRefs[i];
			if (obj && grp && obj.parent !== grp) {
				if (obj.parent) obj.parent.remove(obj);
				grp.add(obj);
			}
		});
	});

	$effect(() => {
		tileTexture = loadResourceTexture(image);
		if (tileTexture) {
			tileTexture.repeat.set(textureScale, textureScale);
			tileTexture.center.set(0.5, 0.5);
			tileTexture.needsUpdate = true;
		}

		const value = number;
		if (value === currentTokenValue) return;
		numberTexture.dispose();
		numberTexture = createNumberTexture(value);
		currentTokenValue = value;
	});

	onDestroy(() => {
		tileGeometry.dispose();
		numberTexture.dispose();
	});

	// console.log(game.getBuildingsInTile(tile));
</script>

<T.Group position={tilePosition}>
	<!-- Background color layer (unlit, not affected by directional light) -->
	<T.Mesh geometry={tileGeometry} castShadow receiveShadow>
		<T.MeshBasicMaterial color={backgroundColor} />
	</T.Mesh>

	<!-- Texture layer on top (unlit; still respects alpha and depth) -->
	<T.Mesh geometry={tileGeometry} position={[0, 0.01, 0]} receiveShadow>
		<T.MeshBasicMaterial
			map={tileTexture ?? undefined}
			transparent
			alphaTest={0.01}
			depthWrite={true}
			color={hasThief && tile.name !== 'Desert' ? '#ff0000' : '#ffffff'}
		/>
	</T.Mesh>

	<T.Mesh bind:ref={numberMeshRef} position={[0, TILE_HEIGHT / 2 + 0.02, 0]}>
		<T.CircleGeometry args={[TILE_RADIUS * 0.5, 48]} />
		<T.MeshBasicMaterial map={numberTexture} transparent depthWrite={false} toneMapped={false} />
	</T.Mesh>

	<!-- Vertex markers (red circles) -->
	{#each vertexPositions as vertexPos, i (i)}
		<T.Mesh position={vertexPos}>
			<T.SphereGeometry args={[0.15, 16, 16]} />
			<T.MeshStandardMaterial color="#ff0000" />
		</T.Mesh>
	{/each}

	<!-- Edge markers (blue bars along hex edges) -->
	{#each edgePositions as edge, i (i)}
		<T.Mesh bind:ref={edgeMeshRefs[i]} position={edge.position}>
			<!-- width (x): thin, height (y): very thin above tile, depth (z): edge length -->
			<T.BoxGeometry args={[0.08, 0.03, edge.length]} />
			<T.MeshStandardMaterial color="#0000ff" />
		</T.Mesh>
	{/each}

	{#each piecesInThisTile as piece (piece.id)}
		{#if piece.name === 'Thief'}
			<GLTF url={piece.model} position={[-1, TILE_HEIGHT / 2 + 1, -1]} scale={1.0} castShadow />
		{/if}
	{/each}

	<!-- Buildings placed on this tile (use a group wrapper and attach cloned object) -->
	{#each buildingsInThisTile as building, i (i)}
		{#if 'vertexIndex' in building.location}
			{#key building}
				<!-- Vertex-based buildings (Settlement/City/Fortress) -->
				{#if vertexPositions[building.location.vertexIndex]}
					<T.Group
						bind:ref={buildingGroupRefs[i]}
						position={[
							vertexPositions[building.location.vertexIndex][0],
							vertexPositions[building.location.vertexIndex][1] +
								0.6 +
								(building.modelZOffset ?? 0),
							vertexPositions[building.location.vertexIndex][2]
						]}
						scale={building.modelScale ?? 1}
					/>
				{/if}
			{/key}
		{:else if 'edgeIndex' in building.location}
			{#key building}
				<!-- Edge-based buildings (Road) -->
				{#if edgePositions[building.location.edgeIndex]}
					<T.Group
						bind:ref={buildingGroupRefs[i]}
						position={[
							edgePositions[building.location.edgeIndex].position[0],
							edgePositions[building.location.edgeIndex].position[1] +
								0.15 +
								(building.modelZOffset ?? 0),
							edgePositions[building.location.edgeIndex].position[2]
						]}
						rotation={[0, edgePositions[building.location.edgeIndex].rotation + Math.PI / 2, 0]}
						scale={building.modelScale ?? 1}
					/>
				{/if}
			{/key}
		{/if}
	{/each}
</T.Group>
