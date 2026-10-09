import { getTopology } from '../../../shared/board/topology';
import { TERRAIN_RESOURCE } from '../../../shared/rules/config';
import { citySpots, isVertexFree } from '../../../shared/rules/queries';
import type { GameView } from '../../../shared/rules/types';
import type { PickKind } from '../../scene/gameScene';

/** What the player clicks on the board for their power, and which spots are allowed. */
export function powerPick(view: GameView, first?: number): { kind: PickKind; options: number[]; prompt: string } | null {
	const me = view.me;
	const ch = view.players[me]?.character;
	const tiles = view.board.hexes.map((_, h) => h);
	const producing = (h: number) => !!TERRAIN_RESOURCE[view.board.hexes[h].terrain] && view.board.hexes[h].number !== null;
	switch (ch) {
		case 'mason':
			return { kind: 'city', options: citySpots(view, me), prompt: 'Click a settlement to make it a city' };
		case 'baron': {
			const topo = getTopology(view.board);
			const options = topo.vertices.map((v) => v.id).filter((v) => isVertexFree(view, v) && view.claims?.[v] === undefined);
			return { kind: 'settlement', options, prompt: 'Click an empty corner to claim it' };
		}
		case 'alchemist':
			return { kind: 'tile', options: tiles.filter(producing), prompt: 'Click a tile to transmute' };
		case 'abbess':
			return { kind: 'tile', options: tiles.filter(producing), prompt: 'Click a tile to bless' };
		case 'cartographer': {
			const topo = getTopology(view.board);
			const mine = (h: number) => topo.hexes[h].vertices.some((v) => view.buildings[v]?.owner === me);
			const n = first === undefined ? null : view.board.hexes[first].number;
			const options = tiles.filter((h) => view.board.hexes[h].number !== null && mine(h) && h !== first && view.board.hexes[h].number !== n);
			return {
				kind: 'tile',
				options,
				prompt: first === undefined ? 'Click the first tile whose number moves' : `Click the tile to swap the ${n} with`
			};
		}
		default:
			return null;
	}
}
