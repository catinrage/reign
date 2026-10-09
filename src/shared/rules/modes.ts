import { mapSeats, mapTiles, type MapChoice } from '../board/maps';
import { CHARACTERS, type CharacterId } from './characters';

/**
 * Reign has two modes. Classic is the standard game on the standard island, exactly as before.
 * Reign Extended adds characters, other and custom maps, and the content that comes later.
 */
export const GAME_MODES = ['classic', 'extended'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const MODE_INFO: Record<GameMode, { name: string; text: string }> = {
	classic: { name: 'Classic', text: 'The standard island and the standard rules.' },
	extended: { name: 'Reign Extended', text: 'Characters with traits, bigger and custom maps.' }
};

/** Quick picks for the victory points to play to in Reign Extended. Classic is always 10. */
export const POINT_GOALS = [8, 10, 12, 14];
/** The host can also type any whole number in this range. */
export const POINTS_MIN = 3;
export const POINTS_MAX = 30;

export function validPointGoal(n: unknown): n is number {
	return Number.isInteger(n) && (n as number) >= POINTS_MIN && (n as number) <= POINTS_MAX;
}

/**
 * The highest goal a table can reach in fair time. Each player has room for about one
 * building per tile of island they share, worth up to two points as a city, plus the two
 * bonus cards. The standard game (19 tiles, 4 players) allows 11, the 5-6 player board (30
 * tiles, 6 players) 12; six players on 30 tiles can't play to 20.
 */
export function maxPointsFor(tiles: number, players: number): number {
	const share = tiles / Math.max(2, players);
	return Math.max(POINTS_MIN, Math.min(POINTS_MAX, Math.floor(2 * share) + 2));
}

/** The goal that fits the table best: about two points per tile each player shares. */
export function suggestedPoints(tiles: number, players: number): number {
	const share = tiles / Math.max(2, players);
	return Math.max(5, Math.min(16, Math.round(2 * share), maxPointsFor(tiles, players)));
}

/**
 * Settlements, cities and roads each player gets. Goals above 10 add pieces so the points can
 * be built (the standard set tops out at 13 points of buildings).
 */
export function pieceLimits(pointsToWin: number): { road: number; settlement: number; city: number } {
	const extra = Math.max(0, Math.ceil((pointsToWin - 10) / 2));
	return { road: 15 + 2 * extra, settlement: 5 + extra, city: 4 + extra };
}

/** Everything the host sets up in the lobby that changes the game itself. */
export interface GameSettings {
	mode: GameMode;
	/** Ignored in Classic, which always deals the standard island. */
	map: MapChoice;
	pointsToWin: number;
	/** Reign Extended: whether players draft characters when the game starts. */
	characters: boolean;
	/** Characters the host left out of the draft. */
	leftOut: CharacterId[];
}

/** The characters players can draft with these settings. */
export function characterPool(settings: Pick<GameSettings, 'characters' | 'leftOut'>): CharacterId[] {
	if (!settings.characters) return [];
	return CHARACTERS.filter((c) => !settings.leftOut.includes(c));
}

/** How many players a game with these settings seats. Classic always seats four. */
export function seatsFor(settings: GameSettings): number {
	if (settings.mode !== 'extended') return 4;
	return mapSeats(mapTiles(settings.map)?.length ?? 0);
}

export const DEFAULT_SETTINGS: GameSettings = {
	mode: 'classic',
	map: { preset: 'great' },
	pointsToWin: 10,
	characters: true,
	leftOut: []
};
