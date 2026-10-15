/**
 * Reign is a collection of games played at the same tables: Settlement (the island game of
 * building and trading, with its Classic and Extended modes and the campaign), Conquest (a war
 * for the Realm, territory by territory) and Gambit (pieces on a hex board, all ordered in secret
 * and played out at once). A table plays one of them, picked when it is opened.
 */
export const GAME_KINDS = ['settlement', 'conquest', 'gambit'] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export function isGameKind(k: unknown): k is GameKind {
	return GAME_KINDS.includes(k as GameKind);
}
