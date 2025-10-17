<script lang="ts">
	import { default as TileComponent } from './Tile.svelte';
	import { Terrain } from './models/terrain';
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';

	const terrain = $state(new Terrain());
	terrain.generate();
</script>

<!-- setup camera -->
<T.PerspectiveCamera
	makeDefault
	position={[0, 35, 0]}
	oncreate={(ref) => {
		ref.lookAt(0, 0, 0);
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
</T.PerspectiveCamera>
<T.AmbientLight intensity={5} />
<!-- <T.DirectionalLight position={[5, 12, 6]} intensity={1.15} castShadow /> -->

{#each terrain.tiles as tile (tile.id)}
	<TileComponent {...tile} />
{/each}
