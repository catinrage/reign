import { getTopology } from '../board/topology';
import { TERRAIN_RESOURCE, type Resource } from './config';
import { tilePays } from './events';
import type { GameEvent, GameState, GameView, ResourceGain } from './types';

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

/** How a roll went for one of a player's tiles: it paid them, or something stopped it. */
export type TileLight = 'paid' | 'blocked';

/** Events a roll can emit before what its tiles paid out (the Seer's pick, the Shepherd's wool). */
const BEFORE_PAYOUT = new Set<GameEvent['type']>(['traitGain', 'pickOwed']);

/**
 * What the roll `seq` in the log did to each of this player's tiles, read off the payout the
 * engine logged with it: a tile that paid them is 'paid', and one that would have but didn't is
 * 'blocked' (the robber on it, the Witch's Hex on the player, or a bank too short to pay). Tiles
 * the roll didn't touch are left out, and so is the Shepherd's wool on a 7, under `shepherd`.
 */
export function rollLights(
	s: Pick<
		GameView,
		'board' | 'buildings' | 'workshops' | 'robberHex' | 'events' | 'log' | 'players'
	>,
	player: number,
	seq: number
): { tiles: Map<number, TileLight>; shepherd: TileLight | null } {
	const tiles = new Map<number, TileLight>();
	let shepherd: TileLight | null = null;
	const at = s.log.findIndex((e) => e.seq === seq);
	const roll = s.log[at];
	if (roll?.type !== 'diceRolled') return { tiles, shepherd };
	const total = roll.dice[0] + roll.dice[1];
	if (total === 7 && s.players[player]?.character === 'shepherd') shepherd = 'blocked';
	for (const e of s.log.slice(at + 1)) {
		if (e.type === 'traitGain' && e.player === player && e.character === 'shepherd')
			shepherd = 'paid';
		if (BEFORE_PAYOUT.has(e.type)) continue;
		if (e.type !== 'produced' && e.type !== 'nothingProduced') break;
		// What stopped a tile: the robber, the Hex, a short bank (nothing at all paid out, say).
		const out: {
			gains: ResourceGain[];
			blocked: number[];
			shortages: Resource[] | null;
			hexed?: number[];
		} = e.type === 'produced' ? e : { gains: [], blocked: [], shortages: null };
		for (const t of tileIncome(s, player)) {
			if (!tilePays(s, s.board.hexes[t.hex], total)) continue;
			if (out.gains.some((g) => g.player === player && g.hex === t.hex)) tiles.set(t.hex, 'paid');
			else if (
				out.blocked.includes(t.hex) ||
				out.hexed?.includes(player) ||
				(out.shortages ?? [t.resource]).includes(t.resource)
			)
				tiles.set(t.hex, 'blocked');
			// Anything else was built after the roll.
		}
		break;
	}
	return { tiles, shepherd };
}
