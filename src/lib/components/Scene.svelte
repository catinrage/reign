<script lang="ts">
	import { default as TileComponent } from './Tile.svelte';
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { getGame } from '$lib/models/game.svelte';
	import { PieceThief } from '$lib/models/piece';

	const game = getGame();

	const desertTile = game.terrain.tiles.find((tile) => tile.name === 'Desert');
	const thief = new PieceThief({
		location: desertTile!
	});
	game.addPiece(thief);
</script>

<!-- setup camera and make the main light follow the camera by parenting it -->
<T.PerspectiveCamera
	makeDefault
	position={[0, 35, 0]}
	oncreate={(ref) => {
		ref.lookAt(0, 0, 0);
		// Render both default layer (0) and buildings layer (1)
		ref.layers.enable(1);
	}}
>
	<OrbitControls
		enableDamping
		dampingFactor={0.05}
		target={[0, 0, 0]}
		maxPolarAngle={Math.PI / 2.5}
		minPolarAngle={0}
		minDistance={15}
		maxDistance={60}
	/>
	<T.DirectionalLight
		position={[5, 12, 6]}
		intensity={6}
		castShadow
		oncreate={(ref) => {
			// Make this light only affect buildings on layer 1
			ref.layers.set(1);
			// Ensure the shadow camera captures casters on the same layer
			ref.shadow.camera.layers.set(1);
		}}
	/>
</T.PerspectiveCamera>

<T.AmbientLight intensity={5} />

{#each game.terrain.tiles as tile (tile.id)}
	<TileComponent {tile} />
{/each}
