/**
 * The games played at Reign's tables: Settlement (the island game of building and trading, with
 * its Classic and Extended modes and the campaign). A table plays one of them, picked when it is
 * opened. More games are in the works on the experimental-games branch.
 */
export const GAME_KINDS = ['settlement'] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export function isGameKind(k: unknown): k is GameKind {
	return GAME_KINDS.includes(k as GameKind);
}
