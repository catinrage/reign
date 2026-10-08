import { generateStandardBoard } from '../../src/shared/board/generate';
import { buildBoard } from '../../src/client/scene/board/terrain';
for (let i = 0; i < 3; i++) {
	const t = performance.now();
	const b = buildBoard(generateStandardBoard({ rng: i + 1 }), i + 1);
	let tris = 0;
	b.group.traverse((o: any) => o.isMesh && (tris += o.geometry.index.count / 3));
	console.log('board ms', Math.round(performance.now() - t), 'tris', tris);
}
