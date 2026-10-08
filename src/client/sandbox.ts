import { buildRoom } from './scene/room/room';
import { generateStandardBoard } from '../shared/board/generate';
import { BoardView } from './scene/board/boardView';
import { Stage } from './scene/stage';

/** Visual test bed: ?sandbox renders a random island without a server. */
export function runSandbox(canvas: HTMLCanvasElement) {
	const params = new URLSearchParams(location.search);
	const seed = Number(params.get('seed') ?? 7);
	const stage = new Stage(canvas, (params.get('q') as 'high' | 'low') ?? 'high');
	const board = generateStandardBoard({ rng: seed });
	const view = new BoardView(board, seed);
	view.setRobber(board.hexes.findIndex((h) => h.terrain === 'desert'), true);
	stage.scene.add(view.group);
	const room = buildRoom(stage);
	stage.onFrame((dt, t) => room.update(dt, t));
	if (params.has('noboard')) view.group.visible = false;
	const az = params.get('az');
	if (az) stage.rig.set({ azimuth: Number(az) }, true);
	const pol = params.get('pol');
	if (pol) stage.rig.set({ polar: Number(pol) }, true);
	const rad = params.get('rad');
	if (rad) stage.rig.set({ radius: Number(rad) }, true);
	stage.onFrame((dt, t) => view.update(dt, t, stage.rig.azimuth));
	stage.start();
	(window as any).__stage = stage;
	(window as any).__ready = true;
}
