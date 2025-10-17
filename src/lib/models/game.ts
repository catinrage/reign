import type { Player } from './player';
import { Terrain } from './terrain';

export class Game {
	private _players: Player[] = [];
	private _terrain: Terrain = new Terrain();
}
