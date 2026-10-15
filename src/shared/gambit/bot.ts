import { hexDistance } from '../board/hex';
import { hash2 } from '../noise';
import { gambitBoard } from './board';
import { moveTargets, rankOf, RANK, shotTargets, SHIELD_WALL, VALUE } from './pieces';
import { ordersAllowed } from './rules';
import type { GambitBoard, GambitView, Order, Piece } from './types';

/**
 * Gambit's bot, reading only its own view. Orders are given at once, so it doesn't search ahead;
 * it weighs each piece's options against where the enemy could strike this round (a guess at how
 * likely they are to), and gives its best few orders: taking what is likely to stay put, getting
 * valuable pieces out of reach, bracing where running isn't possible, and holding the shrines.
 */

/** How likely an enemy piece that can reach a hex is to strike it, and the most it adds up to. */
const STRIKE = 0.3;
const MOST_DANGER = 0.8;
/** How likely a piece is to still stand where it is when the round is played. */
const STAYS = 0.55;
/** A monarch is worth more than its crowns: losing it costs an order too. */
const MONARCH_EXTRA = 2;
/** Crowns a hex closer to a shrine worth fighting for is worth. */
const PROGRESS = 0.25;

interface Threat {
	/** Enemy pieces that could end on the hex this round, by their rank. */
	ranks: number[];
}

export function gambitBot(view: GambitView): Order[] | null {
	const me = view.me;
	if (view.phase !== 'orders' || me < 0 || view.ready[me]) return null;
	const board = gambitBoard(view.players.length, view.settings);
	const pieces = view.pieces;
	const mine = pieces.filter((p) => p.owner === me);
	const threats = threatMap(board, pieces, me);
	const at = new Map(pieces.map((p) => [p.cell, p]));
	const worth = (p: Piece) => VALUE[p.kind] + (p.kind === 'monarch' ? MONARCH_EXTRA : 0);
	const danger = (cell: number) => Math.min(MOST_DANGER, (threats.get(cell)?.ranks.length ?? 0) * STRIKE);
	/** What standing on `cell` at the round's end is likely to cost `p` if it fights with `rank` (null: taken outright). */
	const risk = (p: Piece, cell: number, rank: number | null) => {
		const t = threats.get(cell);
		if (!t) return 0;
		const stronger = rank === null ? t.ranks.length : t.ranks.filter((r) => r > rank).length + t.ranks.filter((r) => r === rank).length * 0.5;
		return worth(p) * Math.min(MOST_DANGER, stronger * STRIKE);
	};
	const goals = shrinesWorthIt(board, pieces, me);
	const noise = (a: number, b: number) => hash2(a, b, view.settings.seed * 977 + view.version * 31 + me) * 0.05;

	type Option = { order: Order; gain: number; to: number | null };
	const best: Option[] = [];
	for (const p of mine) {
		const here = board.cells[p.cell];
		// Doing nothing: the shrine it holds, and the risk of being taken where it stands.
		const stay = here.shrine - risk(p, p.cell, null);
		const options: Option[] = [];
		options.push({ order: { piece: p.id, type: 'brace' }, gain: here.shrine - risk(p, p.cell, rankOf(p, true)) - stay - 0.05, to: null });
		for (const c of moveTargets(board, pieces, p)) {
			const enemy = at.get(c);
			const cell = board.cells[c];
			let gain = cell.shrine;
			if (enemy && enemy.owner !== me) {
				// Taken if it stays unbraced; a braced guard may beat us.
				const braceRisk = enemy.kind === 'guard' && RANK.guard + SHIELD_WALL >= RANK[p.kind] ? 0.25 : 0;
				gain += worth(enemy) * STAYS * (1 - braceRisk) - worth(p) * STAYS * braceRisk;
			}
			gain -= risk(p, c, RANK[p.kind]);
			gain -= 0.5 * danger(c) * worth(p) * 0.5;
			const goal = nearestGoal(board, goals, p.cell, (g) => noise(p.id, g + 5000));
			if (goal >= 0 && p.kind !== 'monarch') gain += (hexDistance(here, board.cells[goal]) - hexDistance(cell, board.cells[goal])) * PROGRESS;
			// The monarch keeps near home, out of the fight.
			if (p.kind === 'monarch') gain -= 0.4 + danger(c) * 2;
			options.push({ order: { piece: p.id, type: 'move', to: c }, gain: gain - stay + noise(p.id, c), to: c });
		}
		for (const c of shotTargets(board, p)) {
			const enemy = at.get(c);
			if (!enemy || enemy.owner === me || board.cells[c].terrain === 'forest') continue;
			options.push({ order: { piece: p.id, type: 'shoot', at: c }, gain: worth(enemy) * STAYS + noise(p.id, c + 1000), to: null });
		}
		const top = options.sort((a, b) => b.gain - a.gain)[0];
		if (top && top.gain > 0.02) best.push(top);
	}
	// The best orders, one a piece, never two to the same hex.
	const orders: Order[] = [];
	const ends = new Set<number>();
	for (const o of best.sort((a, b) => b.gain - a.gain)) {
		if (orders.length >= ordersAllowed(view, me)) break;
		if (o.to !== null && ends.has(o.to)) continue;
		if (o.to !== null) ends.add(o.to);
		orders.push(o.order);
	}
	return orders;
}

/** Where enemy pieces could end this round, and how hard they would fight there. */
function threatMap(board: GambitBoard, pieces: Piece[], me: number): Map<number, Threat> {
	const out = new Map<number, Threat>();
	const add = (cell: number, rank: number) => {
		const t = out.get(cell) ?? { ranks: [] };
		t.ranks.push(rank);
		out.set(cell, t);
	};
	for (const e of pieces) {
		if (e.owner === me) continue;
		for (const c of moveTargets(board, pieces, e)) add(c, RANK[e.kind]);
		// An arrow takes anything it hits (out of the forests).
		for (const c of shotTargets(board, e)) if (board.cells[c].terrain !== 'forest') add(c, 99);
	}
	return out;
}

/** Shrines not held by this player: the ones worth heading for. */
function shrinesWorthIt(board: GambitBoard, pieces: Piece[], me: number): number[] {
	const held = new Map(pieces.map((p) => [p.cell, p.owner]));
	return board.cells.flatMap((c, i) => (c.shrine && held.get(i) !== me ? [i] : []));
}

/** The nearest of the goals (two as near: whichever this game's whim picks, never always the same side). */
function nearestGoal(board: GambitBoard, goals: number[], from: number, whim: (g: number) => number): number {
	let best = -1;
	let d = Infinity;
	for (const g of goals) {
		const e = hexDistance(board.cells[g], board.cells[from]) + whim(g);
		if (e < d) {
			d = e;
			best = g;
		}
	}
	return best;
}
