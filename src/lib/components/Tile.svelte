<script lang="ts" module>
	import { getGame } from '$lib/models/game.svelte';
	import type { Tile } from '$lib/models/tile';

	export type Props = {
		tile: Tile;
	};
</script>

<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { GLTF, interactivity } from '@threlte/extras';
	import { onDestroy } from 'svelte';
	import * as THREE from 'three';

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

	function getDiceComboCount(value: number): number {
		// Returns the number of dice combinations that result in the given value
		const combos: Record<number, number> = {
			2: 1,
			3: 2,
			4: 3,
			5: 4,
			6: 5,
			7: 6,
			8: 5,
			9: 4,
			10: 3,
			11: 2,
			12: 1
		};
		return combos[value] || 0;
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
	let buildingScenes = $state<(THREE.Object3D | undefined)[]>([]);
	const processedBuildingScenes = new WeakSet<THREE.Object3D>();

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

	// After a GLTF scene is available, ensure all child meshes cast and receive shadows
	function enableBuildingShadows(root: THREE.Object3D) {
		root.traverse((obj) => {
			if ((obj as THREE.Mesh).isMesh) {
				const mesh = obj as THREE.Mesh;
				mesh.castShadow = true;
				mesh.receiveShadow = true;
			}
		});
	}

	useTask(() => {
		// keep scenes array in sync with items
		if (buildingScenes.length !== buildingsInThisTile.length) {
			buildingScenes.length = buildingsInThisTile.length;
		}
		buildingScenes.forEach((scene) => {
			if (!scene || processedBuildingScenes.has(scene)) return;
			enableBuildingShadows(scene);
			processedBuildingScenes.add(scene);
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
</script>

<T.Group position={tilePosition}>
	<!-- Background color layer -->
	<T.Mesh geometry={tileGeometry} castShadow receiveShadow>
		<T.MeshStandardMaterial color={backgroundColor} roughness={0.85} metalness={0.1} />
	</T.Mesh>

	<!-- Texture layer on top -->
	<T.Mesh geometry={tileGeometry} position={[0, 0.01, 0]}>
		<T.MeshStandardMaterial
			map={tileTexture ?? undefined}
			transparent
			alphaTest={0.01}
			roughness={0.85}
			metalness={0.1}
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

	<!-- Buildings placed on this tile -->
	{#each buildingsInThisTile as building, i (i)}
		{#if 'vertexIndex' in building.location}
			{#key building}
				<!-- Vertex-based buildings (Settlement/City/Fortress) -->
				{#if vertexPositions[building.location.vertexIndex]}
					<GLTF
						bind:scene={buildingScenes[i]}
						url={building.model}
						position={[
							vertexPositions[building.location.vertexIndex][0],
							vertexPositions[building.location.vertexIndex][1] + 0.6,
							vertexPositions[building.location.vertexIndex][2]
						]}
						scale={0.6}
						castShadow
					/>
				{/if}
			{/key}
		{:else if 'edgeIndex' in building.location}
			{#key building}
				<!-- Edge-based buildings (Road) -->
				{#if edgePositions[building.location.edgeIndex]}
					<GLTF
						bind:scene={buildingScenes[i]}
						url={building.model}
						position={[
							edgePositions[building.location.edgeIndex].position[0],
							edgePositions[building.location.edgeIndex].position[1] + 0.15,
							edgePositions[building.location.edgeIndex].position[2]
						]}
						rotation={[0, edgePositions[building.location.edgeIndex].rotation, 0]}
						scale={0.5}
						castShadow
					/>
				{/if}
			{/key}
		{/if}
	{/each}
</T.Group>
