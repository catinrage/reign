import { mapSeats, mapTiles, type MapChoice } from '../board/maps';

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

/** Everything the host sets up in the lobby that changes the game itself. */
export interface GameSettings {
	mode: GameMode;
	/** Ignored in Classic, which always deals the standard island. */
	map: MapChoice;
	pointsToWin: number;
}

/** How many players a game with these settings seats. Classic always seats four. */
export function seatsFor(settings: GameSettings): number {
	if (settings.mode !== 'extended') return 4;
	return mapSeats(mapTiles(settings.map)?.length ?? 0);
}

export const DEFAULT_SETTINGS: GameSettings = {
	mode: 'classic',
	map: { preset: 'great' },
	pointsToWin: 10
};
