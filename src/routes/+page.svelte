<script>
	import Scene from '$lib/components/Scene.svelte';
	import { BuildingCity } from '$lib/models/building';
	import { setGame } from '$lib/models/game.svelte';
	import { Player } from '$lib/models/player';
	import { Canvas } from '@threlte/core';

	const game = setGame();
	game.init();

	const player = new Player({
		name: 'Player 1',
		color: '#ff0000'
	});

	game.addBuilding(
		new BuildingCity({
			owner: player,
			location: {
				tile: {
					q: 0,
					r: 0
				},
				vertexIndex: 0
			}
		})
	);
</script>

<Canvas>
	<Scene />
</Canvas>
