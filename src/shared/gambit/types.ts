import type { PlayerColor } from '../rules/config';

/**
 * Gambit: a war of pieces on a hex board for 4 to 8 players, played in rounds of secret orders.
 * Everyone orders a few pieces at once, then the orders are shown and played out together:
 * archers loose, pieces move, those that meet fight, arrows land. Crowns come from holding
 * shrines and taking pieces; the first to the target (or the most when the rounds run out) wins.
 */

export const GAMBIT_MIN_PLAYERS = 2;
export const GAMBIT_MAX_PLAYERS = 8;

export const PIECE_KINDS = ['monarch', 'guard', 'archer', 'seer', 'lancer', 'knight'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

export const TERRAINS = ['plain', 'forest', 'hill', 'water'] as const;
export type Terrain = (typeof TERRAINS)[number];

/** How much of the board is forest, hills and lakes: none at all (an open field), a little, some, a lot. */
export const TERRAIN_RULES = ['none', 'light', 'mixed', 'wild'] as const;
export type TerrainRule = (typeof TERRAIN_RULES)[number];

export interface GambitSettings {
	/** Orders each player gives a round. */
	orders: number;
	/** Crowns that win the war. */
	crowns: number;
	/** Rounds before the war ends anyway (the most crowns wins). */
	rounds: number;
	terrain: TerrainRule;
	/** The board's seed: the same seed makes the same board. */
	seed: number;
}

export const ORDER_CHOICES = [1, 2, 3] as const;
export const CROWN_CHOICES = [15, 20, 30] as const;
export const ROUND_CHOICES = [10, 15, 20] as const;

export const DEFAULT_GAMBIT_SETTINGS: GambitSettings = {
	orders: 2,
	crowns: 20,
	rounds: 15,
	terrain: 'mixed',
	seed: 1
};

/** One hex of the board. */
export interface Cell {
	q: number;
	r: number;
	terrain: Terrain;
	/** Crowns a round for holding it (0: not a shrine; the Throne in the middle is worth 2). */
	shrine: number;
	/** The seat whose keep this is, or -1. */
	keep: number;
}

export interface GambitBoard {
	cells: Cell[];
	/** The cell index at axial (q, r), by `${q},${r}`. */
	index: Record<string, number>;
	/** Per seat: its keep's cell. */
	keeps: number[];
	/** Steps from the middle to the rim (the board is a hexagon of hexes). */
	radius: number;
}

export interface Piece {
	/** Unique in the game. */
	id: number;
	owner: number;
	kind: PieceKind;
	/** The cell it stands on. */
	cell: number;
}

/**
 * What a piece is told to do this round:
 * - `move`: to that cell (a capture if an enemy is there and stays).
 * - `brace`: stand and fight whoever comes, instead of being taken outright.
 * - `shoot`: an archer looses at that cell; the arrow strikes whoever of another player
 *   stands there once everyone has moved (not in a forest).
 */
export type Order = { piece: number; type: 'move'; to: number } | { piece: number; type: 'brace' } | { piece: number; type: 'shoot'; at: number };

export interface GambitPlayer {
	name: string;
	color: PlayerColor;
	isBot: boolean;
	crowns: number;
	/** Their monarch was taken last round: one order fewer this round. */
	deposed: boolean;
}

export type GambitPhase = 'orders' | 'ended';

export interface GambitState {
	game: 'gambit';
	version: number;
	rng: number;
	settings: GambitSettings;
	players: GambitPlayer[];
	pieces: Piece[];
	nextPieceId: number;
	phase: GambitPhase;
	/** The round being ordered, from 1. */
	round: number;
	/** Per player: the orders given so far this round (secret until the round is played). */
	orders: Order[][];
	/** Per player: done ordering. */
	ready: boolean[];
	winner: number | null;
	stats: GambitStats;
	log: GbEvent[];
	nextEventSeq: number;
}

export interface GambitStats {
	/** Per player, per round played: crowns held at its end. */
	crowns: number[][];
	players: { taken: number; lost: number; shrineCrowns: number; captureCrowns: number }[];
}

/**
 * A piece leaving the board this round (as it stood when the round began), where it fell (where it
 * was going: for two that swapped places, the fight was on the way), and who gets the crowns for
 * it (null: nobody, as when equal ranks fall together).
 */
export interface Loss {
	piece: Piece;
	at: number;
	by: number | null;
	how: 'captured' | 'clash' | 'arrow';
}

/** Everything a round did, in the order the board shows it. */
export interface RoundPlay {
	round: number;
	/** Every order given, by player. */
	orders: Order[][];
	/** Where every piece that moved went (from, to). */
	moves: { piece: number; from: number; to: number }[];
	/** Pieces that met on the way, swapping places: the fight happened between their cells. */
	swaps: { a: number; b: number }[];
	losses: Loss[];
	/** Arrows: the archer, the cell, and the piece struck (null: a miss). */
	arrows: { piece: number; at: number; hit: number | null }[];
	/** Crowns each player earned this round from shrines and from pieces taken. */
	crowns: { player: number; shrines: number; taken: number }[];
	/** Monarchs back at their keeps (by piece id, at the cell). */
	returned: { piece: number; cell: number }[];
	/** New guards mustered at keeps. */
	mustered: Piece[];
}

type Ev<T extends string, P> = { seq: number; type: T } & P;

export type WinReason = 'crowns' | 'rounds';

export type GbEvent =
	| Ev<'gameStarted', { players: number }>
	| Ev<'roundStarted', { round: number }>
	| Ev<'ready', { player: number }>
	| Ev<'roundPlayed', { play: RoundPlay }>
	| Ev<'turnTimedOut', { player: number }>
	| Ev<'gameOver', { winner: number; reason: WinReason }>
	| Ev<'chat', { player: number; text: string }>
	/** A dev cheat was used (only on the local dev server). */
	| Ev<'cheat', { player: number; text: string }>;

export type GambitAction =
	/** Give (or change) this round's orders; `ready` when done. */
	{ type: 'orders'; orders: Order[]; ready: boolean };

export type GambitResult = { ok: true; state: GambitState; events: GbEvent[] } | { ok: false; error: string };

/** What a player sees: everyone's orders but their own stay hidden until the round is played. */
export interface GambitView extends Omit<GambitState, 'rng' | 'orders'> {
	me: number;
	/** Your own orders this round (empty for spectators). */
	myOrders: Order[];
}
