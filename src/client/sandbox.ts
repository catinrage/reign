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
	if (params.has('conquest')) return runConquestSandbox(canvas, params);
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

/** ?sandbox&conquest: the Realm with territories dealt out at random to `&players=` (4) players. */
async function runConquestSandbox(canvas: HTMLCanvasElement, params: URLSearchParams) {
	const { RealmBoard } = await import('./scene/conquest/realmBoard');
	const { REALM } = await import('../shared/conquest/realm');
	const { SIGIL_OF } = await import('./scene/conquest/sigils');
	const { PLAYER_RGB } = await import('./scene/layout');
	const { PLAYER_COLORS } = await import('../shared/rules/config');
	const seed = Number(params.get('seed') ?? 7);
	const stage = new Stage(canvas, (params.get('q') as Quality) ?? 'high');
	const board = new RealmBoard(REALM);
	stage.scene.add(board.group);
	const room = buildRoom(stage);
	room.fitTable(Math.max(board.realm.halfX, board.realm.halfZ) * 1.12 / (TABLE_HALF * ROOM_SCALE));
	stage.onFrame((dt, t) => room.update(dt, t));
	const players = Number(params.get('players') ?? 4);
	let r = seed * 9301 + 49297;
	const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
	const holders = PLAYER_COLORS.slice(0, players).map((c) => ({ color: PLAYER_RGB[c], sigil: SIGIL_OF[c] }));
	const owner = REALM.territories.map((_, i) => (params.has('empty') ? -1 : i % players));
	for (let i = owner.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[owner[i], owner[j]] = [owner[j], owner[i]];
	}
	const armies = owner.map(() => 1 + Math.floor(rand() * rand() * 14));
	board.setHolders(owner, armies, holders);
	const az = params.get('az');
	if (az) stage.rig.set({ azimuth: Number(az) }, true);
	const pol = params.get('pol');
	if (pol) stage.rig.set({ polar: Number(pol) }, true);
	const rad = params.get('rad');
	if (rad) stage.rig.set({ radius: Number(rad) }, true);
	stage.onFrame((dt, t) => board.update(dt, t, { azimuth: stage.rig.azimuth, polar: stage.rig.polar, camera: stage.camera, height: canvas.clientHeight }));
	stage.start();
	(window as any).__stage = stage;
	(window as any).__board = board;
	(window as any).__ready = true;
}
