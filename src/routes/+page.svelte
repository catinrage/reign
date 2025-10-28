<script>
	import Scene from '$lib/components/Scene.svelte';
	import { CharacterGreedy } from '$lib/models/character';
	import { setGame } from '$lib/models/game.svelte';
	import { Player } from '$lib/models/player.svelte';
	import { Canvas } from '@threlte/core';

	const game = setGame();
	const player = new Player({
		name: 'Player 1',
		color: '#FF1744',
		character: new CharacterGreedy()
	});
	game.init({
		players: [player]
	});

	player.build('City', {
		tile: {
			q: 0,
			r: 0
		},
		vertexIndex: 0
	});

	player.build('City', {
		tile: {
			q: 1,
			r: 0
		},
		vertexIndex: 0
	});

	player.build('Settlement', {
		tile: {
			q: 0,
			r: 0
		},
		vertexIndex: 2
	});

	player.build('Road', {
		tile: {
			q: 0,
			r: 0
		},
		edgeIndex: 0
	});

	player.build('Road', {
		tile: {
			q: 0,
			r: 0
		},
		edgeIndex: 1
	});
</script>

<Canvas>
	<Scene />
</Canvas>
