import { getTopology } from '../board/topology';
import { TERRAIN_RESOURCE, type Resource } from './config';
import type { GameState, GameView } from './types';

/** What one tile pays a player when its number is rolled. */
export interface TileIncome {
	hex: number;
	number: number;
	resource: Resource;
	/** Cards the tile pays this player: 1 a settlement, 2 a city, and 1 more for their workshop. */
	amount: number;
	/** The robber sits on the tile, so it pays nothing until he moves. */
	robbed: boolean;
	settlements: number;
	cities: number;
	workshop: boolean;
}

type IncomeSource = Pick<GameState | GameView, 'board' | 'buildings' | 'workshops' | 'robberHex'>;

/**
 * Every tile that pays this player on a roll, sorted by number, counted the way the engine pays
 * them out (see `produce` in engine.ts). A bank too short to pay everyone is left out: that
 * changes from roll to roll.
 */
export function tileIncome(s: IncomeSource, player: number): TileIncome[] {
	const topo = getTopology(s.board);
	const out: TileIncome[] = [];
	s.board.hexes.forEach((hex, h) => {
		const resource = TERRAIN_RESOURCE[hex.terrain];
		if (!resource || hex.number === null) return;
		let settlements = 0;
		let cities = 0;
		for (const v of topo.hexes[h].vertices) {
			const b = s.buildings[v];
			if (b?.owner !== player) continue;
			if (b.kind === 'city') cities++;
			else settlements++;
		}
		const workshop = s.workshops?.[h] === player;
		const amount = settlements + cities * 2 + (workshop ? 1 : 0);
		if (!amount) return;
		out.push({
			hex: h,
			number: hex.number,
			resource,
			amount,
			robbed: h === s.robberHex,
			settlements,
			cities,
			workshop
		});
	});
	return out.sort((a, b) => a.number - b.number || b.amount - a.amount || a.hex - b.hex);
}
