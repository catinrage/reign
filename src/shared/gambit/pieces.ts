import { AXIAL_DIRECTIONS, hexDistance, type Axial } from '../board/hex';
import { cellAt } from './board';
import type { GambitBoard, Piece, PieceKind } from './types';

/**
 * How Gambit's pieces move on hexes, how hard they fight and what taking one is worth.
 *
 * - Monarch, guard and archer step to a neighbouring hex.
 * - The lancer charges along one of the six straight lines, the seer along one of the six
 *   diagonals (between two hexes), up to a few hexes, never through a piece, and stopping
 *   in a forest.
 * - The knight leaps (two hexes straight on, then one aside) over anything.
 * - The archer can instead shoot at a hex two away (three from a hill).
 * No piece stands in water.
 */

/** The six diagonals: two hexes away, between two neighbours. */
export const DIAGONALS: readonly Axial[] = [
	{ q: 2, r: -1 },
	{ q: 1, r: 1 },
	{ q: -1, r: 2 },
	{ q: -2, r: 1 },
	{ q: -1, r: -1 },
	{ q: 1, r: -2 }
];

/** The knight's twelve leaps: three hexes away, off every straight line and diagonal. */
export const LEAPS: readonly Axial[] = [
	{ q: 1, r: 2 },
	{ q: 2, r: 1 },
	{ q: 3, r: -1 },
	{ q: 3, r: -2 },
	{ q: 2, r: -3 },
	{ q: 1, r: -3 },
	{ q: -1, r: -2 },
	{ q: -2, r: -1 },
	{ q: -3, r: 1 },
	{ q: -3, r: 2 },
	{ q: -2, r: 3 },
	{ q: -1, r: 3 }
];

/** How far the lancer charges (hexes) and the seer glides (diagonal steps). */
export const LANCER_REACH = 3;
export const SEER_REACH = 2;
/** The archer's range, and from a hill. */
export const ARROW_RANGE = 2;
export const HILL_RANGE = 3;

/** Who wins when pieces meet: the higher rank (equal ranks fall together). */
export const RANK: Record<PieceKind, number> = { archer: 0, guard: 1, monarch: 2, seer: 2, lancer: 2, knight: 3 };
/** A guard braced behind its shield fights this much harder. */
export const SHIELD_WALL = 2;
/** Crowns for taking one. */
export const VALUE: Record<PieceKind, number> = { archer: 1, guard: 1, seer: 2, lancer: 2, knight: 2, monarch: 3 };

/** What stands where at the start of the round: cell → piece. */
export function occupancy(pieces: Piece[]): Map<number, Piece> {
	return new Map(pieces.map((p) => [p.cell, p]));
}

/**
 * Where `piece` can move this round, as the board stands. `leaving`: cells of the player's own
 * pieces that are moving away this round, free to move into.
 */
export function moveTargets(board: GambitBoard, pieces: Piece[], piece: Piece, leaving: ReadonlySet<number> = new Set()): number[] {
	const at = occupancy(pieces);
	const from = board.cells[piece.cell];
	const out: number[] = [];
	/** Can it end on `c`? And is it free to go on through? */
	const land = (c: number) => {
		if (c < 0 || board.cells[c].terrain === 'water') return { ok: false, on: false };
		const who = at.get(c);
		if (who && who.owner === piece.owner && !leaving.has(c)) return { ok: false, on: false };
		const blocked = !!who && !(who.owner === piece.owner && leaving.has(c));
		return { ok: true, on: !blocked && board.cells[c].terrain !== 'forest' };
	};
	const slide = (dirs: readonly Axial[], reach: number) => {
		for (const d of dirs)
			for (let k = 1; k <= reach; k++) {
				const c = cellAt(board, { q: from.q + d.q * k, r: from.r + d.r * k });
				const l = land(c);
				if (l.ok) out.push(c);
				if (!l.on) break;
			}
	};
	switch (piece.kind) {
		case 'lancer':
			slide(AXIAL_DIRECTIONS, LANCER_REACH);
			break;
		case 'seer':
			slide(DIAGONALS, SEER_REACH);
			break;
		case 'knight':
			for (const d of LEAPS) {
				const c = cellAt(board, { q: from.q + d.q, r: from.r + d.r });
				if (land(c).ok) out.push(c);
			}
			break;
		default:
			slide(AXIAL_DIRECTIONS, 1);
	}
	return out;
}

/** Where an archer can shoot: every hex two away, or up to three from a hill. */
export function shotTargets(board: GambitBoard, piece: Piece): number[] {
	if (piece.kind !== 'archer') return [];
	const from = board.cells[piece.cell];
	const most = from.terrain === 'hill' ? HILL_RANGE : ARROW_RANGE;
	const out: number[] = [];
	board.cells.forEach((c, i) => {
		const d = hexDistance(c, from);
		if (d >= ARROW_RANGE && d <= most) out.push(i);
	});
	return out;
}

/** How hard a piece fights where it meets others: braced guards behind their shields fight harder. */
export function rankOf(piece: Piece, braced: boolean): number {
	return RANK[piece.kind] + (braced && piece.kind === 'guard' ? SHIELD_WALL : 0);
}
