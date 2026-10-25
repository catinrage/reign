import { buildRoom } from './scene/room/room';
import { generateBoard, generateStandardBoard } from '../shared/board/generate';
import { presetById } from '../shared/board/maps';
import { islandReach } from './scene/board/terrain';
import { TABLE_HALF } from './scene/room/table';
import { ROOM_SCALE } from './scene/room/util';
import { BoardView } from './scene/board/boardView';
import { type Quality, Stage } from './scene/stage';

/** Visual test bed: ?sandbox renders a random island without a server (&map=<preset> for a Reign Extended map). */
export function runSandbox(canvas: HTMLCanvasElement) {
	const params = new URLSearchParams(location.search);
	const seed = Number(params.get('seed') ?? 7);
	const stage = new Stage(canvas, (params.get('q') as Quality) ?? 'high');
	const preset = presetById(params.get('map') ?? '');
	const board = preset ? generateBoard(preset.tiles, { rng: seed }) : generateStandardBoard({ rng: seed });
	const view = new BoardView(board, seed, Number(params.get('detail') ?? 1));
	view.setRobber(board.hexes.findIndex((h) => h.terrain === 'desert'), true);
	stage.scene.add(view.group);
	const room = buildRoom(stage);
	room.fitTable((islandReach(board) + 50) / (TABLE_HALF * ROOM_SCALE));
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
	(window as any).__view = view;
	(window as any).__ready = true;
}
