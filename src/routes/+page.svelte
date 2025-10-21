<script>
	import Scene from '$lib/components/Scene.svelte';
	import { setGame } from '$lib/models/game.svelte';
	import { Canvas } from '@threlte/core';

	const game = setGame();
	game.init();
</script>

<Canvas>
	<Scene />
</Canvas>
