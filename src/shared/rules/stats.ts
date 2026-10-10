import { getTopology } from '../board/topology';
import { RESOURCES, TERRAIN_RESOURCE, emptyResources, pips, type ResourceCounts } from './config';
import { eventYield } from './events';
import type { GameEvent, GameState } from './types';

/** What one player did over the game, for the end-of-game window. */
export interface PlayerStats {
	/** Every card that came into their hand except by trading: tiles, steals, cards, traits, events. */
	gained: ResourceCounts;
	/** Cards the dice paid them. */
	rolled: number;
	/** What the dice should have paid them on average, given their tiles at each roll. */
	expected: number;
	/** Cards the dice paid them on a 2, 3, 11 or 12. */
	longShots: number;
	/** Cards their tiles would have paid but the robber sat on them. */
	robbed: number;
	/** Cards they took from other players: steals and Monopoly. */
	stolen: number;
	/** Cards other players took from them. */
	lost: number;
	/** Cards they threw back on a 7. */
	discarded: number;
	/** Pieces they put up, setup included. */
	built: number;
	/** Trades with players, the bank or a harbor. */
	trades: number;
	devCards: number;
}

export interface GameStats {
	players: PlayerStats[];
	/** How often each total came up, indexed by the total (0 and 1 stay 0). */
	rolls: number[];
	/** The most cards one player took from a single roll. */
	bestHaul: { player: number; cards: number; total: number } | null;
}

/** A roll's odds out of 1. */
export function rollOdds(total: number): number {
	return total >= 2 && total <= 12 ? pips(total) / 36 : 0;
}

export function newStats(players: number): GameStats {
	return {
		players: Array.from({ length: players }, () => ({
			gained: emptyResources(),
			rolled: 0,
			expected: 0,
			longShots: 0,
			robbed: 0,
			stolen: 0,
			lost: 0,
			discarded: 0,
			built: 0,
			trades: 0,
			devCards: 0
		})),
		rolls: Array(13).fill(0),
		bestHaul: null
	};
}

/**
 * The cards a roll should pay this player on average, the way `produce` pays: each tile's
 * buildings and workshop, doubled by events and blessings, nothing from the robber's tile or
 * while the Witch's Hex is on them. A bank too short to pay is left out.
 */
export function expectedRoll(s: GameState, player: number): number {
	if (s.hexed?.[player]) return 0;
	const topo = getTopology(s.board);
	let sum = 0;
	s.board.hexes.forEach((hex, h) => {
		const res = TERRAIN_RESOURCE[hex.terrain];
		if (!res || h === s.robberHex) return;
		let amount = 0;
		for (const v of topo.hexes[h].vertices) {
			const b = s.buildings[v];
			if (b?.owner === player) amount += b.kind === 'city' ? 2 : 1;
		}
		if (s.workshops?.[h] === player) amount++;
		if (!amount) return;
		let odds = rollOdds(hex.number ?? 0);
		// Migrating Herds: pastures pay on a 7 too.
		if (s.events?.current === 'migratingHerds' && hex.terrain === 'pasture') odds += rollOdds(7);
		sum += odds * amount * eventYield(s, res) * (s.blessed?.[h] ? 2 : 1);
	});
	return sum;
}

/**
 * Keeps `GameState.stats` up to date as one action plays out. `event` sees each event as it is
 * emitted (before the rest of the action runs, so the board is as the dice found it); `finish`
 * counts the cards that changed hands once the action is done.
 */
export class StatsTracker {
	/** The total of the roll this action made, while its payouts come in. */
	private roll: number | null = null;
	private haul: number[] = [];
	private before: ResourceCounts[];

	constructor(private s: GameState) {
		this.before = s.players.map((p) => ({ ...p.resources }));
	}

	private get stats(): GameStats {
		return (this.s.stats ??= newStats(this.s.players.length));
	}

	event(e: GameEvent) {
		const s = this.s;
		const st = this.stats;
		const of = (i: number) => st.players[i];
		switch (e.type) {
			case 'diceRolled': {
				const total = e.dice[0] + e.dice[1];
				st.rolls[total]++;
				st.players.forEach((p, i) => (p.expected += expectedRoll(s, i)));
				this.roll = total;
				this.haul = s.players.map(() => 0);
				break;
			}
			case 'produced': {
				const topo = getTopology(s.board);
				for (const h of e.blocked) {
					for (const v of topo.hexes[h].vertices) {
						const b = s.buildings[v];
						if (b) of(b.owner).robbed += b.kind === 'city' ? 2 : 1;
					}
					const w = s.workshops[h];
					if (w !== null) of(w).robbed++;
				}
				if (this.roll === null) break;
				for (const g of e.gains) {
					of(g.player).rolled += g.amount;
					if (this.roll <= 3 || this.roll >= 11) of(g.player).longShots += g.amount;
					this.haul[g.player] += g.amount;
				}
				this.haul.forEach((cards, player) => {
					if (cards > (st.bestHaul?.cards ?? 0)) st.bestHaul = { player, cards, total: this.roll! };
				});
				break;
			}
			case 'stole':
				of(e.thief).stolen++;
				of(e.victim).lost++;
				break;
			case 'monopoly':
				for (const [victim, n] of Object.entries(e.taken)) {
					of(e.player).stolen += n;
					of(Number(victim)).lost += n;
				}
				break;
			case 'discarded':
				of(e.player).discarded += e.count;
				break;
			case 'built':
				of(e.player).built++;
				break;
			case 'bankTrade':
				of(e.player).trades++;
				break;
			case 'tradeCompleted':
				of(e.from).trades++;
				of(e.to).trades++;
				break;
			case 'devCardBought':
				of(e.player).devCards++;
				break;
		}
	}

	/** Count every card a player came by in this action, leaving out what they traded for. */
	finish(events: GameEvent[]) {
		// The Jester's Mischief deals every hand out again: nobody came by anything new.
		if (events.some((e) => e.type === 'mischief')) return;
		const st = this.stats;
		const traded = this.s.players.map(() => emptyResources());
		const swap = (p: number, give: Partial<ResourceCounts>, get: Partial<ResourceCounts>) => {
			for (const r of RESOURCES) traded[p][r] += (get[r] ?? 0) - (give[r] ?? 0);
		};
		for (const e of events) {
			if (e.type === 'bankTrade') swap(e.player, { [e.give]: e.giveCount }, { [e.get]: 1 });
			else if (e.type === 'tradeCompleted') {
				swap(e.from, e.give, e.want);
				swap(e.to, e.want, e.give);
			} else if (e.type === 'powerUsed' && e.give && e.get) swap(e.player, e.give, e.get);
		}
		this.s.players.forEach((p, i) => {
			for (const r of RESOURCES) {
				const got = p.resources[r] - this.before[i][r] - traded[i][r];
				if (got > 0) st.players[i].gained[r] += got;
			}
		});
	}
}
