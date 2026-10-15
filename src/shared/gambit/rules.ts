import { randomInt } from '../rng';
import { gambitBoard, nearestFree, START_PIECES, startingCells } from './board';
import { moveTargets, rankOf, shotTargets, VALUE } from './pieces';
import type { PlayerColor } from '../rules/config';
import type {
	GambitAction,
	GambitBoard,
	GambitResult,
	GambitSettings,
	GambitState,
	GambitView,
	GbEvent,
	Loss,
	Order,
	Piece,
	RoundPlay,
	WinReason
} from './types';

/**
 * Gambit's rules, as pure functions of the state (see types.ts for the game). A round: everyone
 * gives their orders in secret, and when the last is ready (or the clock runs out) the round is
 * played out all at once:
 *
 * 1. Pieces that swap places meet on the way and fight there.
 * 2. Everything moves. A piece that moves onto an enemy's hex takes it, unless that enemy was
 *    braced (then they fight); pieces of several players that end on the same hex fight. The
 *    highest rank wins and takes the rest; equal ranks fall together. A piece that moved away
 *    is never taken where it stood.
 * 3. Arrows land: each strikes whoever of another player stands on its hex now, unless in a forest.
 * 4. Crowns: a piece taken is worth its value to whoever took it; every shrine held is worth
 *    its crowns to its holder. A monarch taken comes back to its keep, and its player gives one
 *    order fewer next round. Every third round each keep musters a guard, while the player has
 *    fewer pieces than they began with.
 */

/** How many events the state keeps in its log; older ones are dropped. */
export const GB_LOG_LIMIT = 80;
const CHAT_LIMIT = 240;
/** Every this many rounds, keeps muster a guard. */
export const MUSTER_EVERY = 3;

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

class RuleError extends Error {}
function fail(msg: string): never {
	throw new RuleError(msg);
}

export class Ctx {
	events: GbEvent[] = [];
	constructor(public s: GambitState) {}
	emit(e: DistributiveOmit<GbEvent, 'seq'>) {
		const ev = { ...e, seq: this.s.nextEventSeq++ } as GbEvent;
		this.events.push(ev);
		this.s.log.push(ev);
		if (this.s.log.length > GB_LOG_LIMIT) this.s.log.splice(0, this.s.log.length - GB_LOG_LIMIT);
	}
}

export function boardOf(s: Pick<GambitState, 'players' | 'settings'>): GambitBoard {
	return gambitBoard(s.players.length, s.settings);
}

export function createGambit(seats: { name: string; color: PlayerColor; isBot: boolean }[], seed: number, settings: GambitSettings): GambitState {
	const s: GambitState = {
		game: 'gambit',
		version: 0,
		rng: seed,
		settings,
		players: seats.map((p) => ({ ...p, crowns: 0, deposed: false })),
		pieces: [],
		nextPieceId: 1,
		phase: 'orders',
		round: 1,
		orders: seats.map(() => []),
		ready: seats.map(() => false),
		winner: null,
		stats: { crowns: seats.map(() => []), players: seats.map(() => ({ taken: 0, lost: 0, shrineCrowns: 0, captureCrowns: 0 })) },
		log: [],
		nextEventSeq: 1
	};
	const board = boardOf(s);
	seats.forEach((_, p) => {
		startingCells(board, p).forEach((cell, i) => s.pieces.push({ id: s.nextPieceId++, owner: p, kind: START_PIECES[i], cell }));
	});
	const ctx = new Ctx(s);
	ctx.emit({ type: 'gameStarted', players: seats.length });
	ctx.emit({ type: 'roundStarted', round: 1 });
	return s;
}

/** How many orders `p` gives this round. */
export function ordersAllowed(s: Pick<GambitState, 'settings' | 'players'>, p: number): number {
	return Math.max(1, s.settings.orders - (s.players[p]?.deposed ? 1 : 0));
}

/** Validate and apply one action. Never changes the state it is given. */
export function applyGambit(state: GambitState, player: number, action: GambitAction): GambitResult {
	if (state.phase === 'ended') return { ok: false, error: 'The game is over.' };
	const s = structuredClone(state);
	const ctx = new Ctx(s);
	try {
		if (action?.type !== 'orders') fail('Unknown action.');
		if (!s.players[player]) fail('You are not in this game.');
		s.orders[player] = checkOrders(s, player, action.orders);
		s.ready[player] = !!action.ready;
		if (s.ready.every(Boolean)) playRound(ctx);
	} catch (e) {
		if (e instanceof RuleError) return { ok: false, error: e.message };
		throw e;
	}
	s.version++;
	return { ok: true, state: s, events: ctx.events };
}

/** The orders as given, if they are allowed; otherwise why not. */
function checkOrders(s: GambitState, p: number, given: unknown): Order[] {
	if (!Array.isArray(given)) fail('Give your orders.');
	const most = ordersAllowed(s, p);
	if (given.length > most) fail(most === 1 ? 'You can give only 1 order this round.' : `You can give only ${most} orders this round.`);
	const board = boardOf(s);
	const mine = new Map(s.pieces.filter((x) => x.owner === p).map((x) => [x.id, x]));
	const orders: Order[] = [];
	const ordered = new Set<number>();
	for (const o of given as Order[]) {
		if (!o || typeof o !== 'object') fail('Unknown order.');
		const piece = mine.get(Number(o.piece));
		if (!piece) fail('Order your own pieces.');
		if (ordered.has(piece.id)) fail('One order a piece.');
		ordered.add(piece.id);
		if (o.type === 'move') orders.push({ piece: piece.id, type: 'move', to: Number(o.to) });
		else if (o.type === 'brace') orders.push({ piece: piece.id, type: 'brace' });
		else if (o.type === 'shoot') orders.push({ piece: piece.id, type: 'shoot', at: Number(o.at) });
		else fail('Unknown order.');
	}
	// Your own pieces moving away leave their hexes free for another of yours.
	const leaving = new Set(orders.flatMap((o) => (o.type === 'move' ? [mine.get(o.piece)!.cell] : [])));
	const ends = new Set<number>();
	for (const o of orders) {
		const piece = mine.get(o.piece)!;
		if (o.type === 'move') {
			if (!moveTargets(board, s.pieces, piece, leaving).includes(o.to)) fail("That piece can't move there.");
			if (ends.has(o.to)) fail('Two of your pieces are going to the same hex.');
			ends.add(o.to);
		} else if (o.type === 'shoot') {
			if (!shotTargets(board, piece).includes(o.at)) fail('Only archers shoot, two hexes away (three from a hill).');
		}
	}
	return orders;
}

/** The round's orders played out, all at once (see the top of this file). */
function playRound(ctx: Ctx) {
	const s = ctx.s;
	const board = boardOf(s);
	const orderOf = new Map<number, Order>();
	s.orders.forEach((os) => os.forEach((o) => orderOf.set(o.piece, o)));
	const byId = new Map(s.pieces.map((p) => [p.id, p]));
	const startAt = new Map(s.pieces.map((p) => [p.cell, p]));
	const destOf = (p: Piece) => {
		const o = orderOf.get(p.id);
		return o?.type === 'move' ? o.to : p.cell;
	};
	const moving = (p: Piece) => orderOf.get(p.id)?.type === 'move';
	const braced = (p: Piece) => orderOf.get(p.id)?.type === 'brace';
	const dead = new Set<number>();
	const losses: Loss[] = [];
	const lose = (piece: Piece, by: number | null, how: Loss['how']) => {
		if (dead.has(piece.id)) return;
		dead.add(piece.id);
		const start = byId.get(piece.id)!;
		losses.push({ piece: { ...start }, at: destOf(start), by, how });
	};
	/** Pieces meet: the highest rank wins and takes the rest; equal ranks fall together. */
	const fight = (fighters: { piece: Piece; rank: number }[], others: Piece[] = []) => {
		const top = Math.max(...fighters.map((f) => f.rank));
		const winners = fighters.filter((f) => f.rank === top);
		const win = winners.length === 1 ? winners[0].piece : null;
		for (const f of fighters) if (f.piece !== win) lose(f.piece, win?.owner ?? null, 'clash');
		if (win) for (const o of others) lose(o, win.owner, 'captured');
	};

	// 1. Pieces of two players swapping hexes meet on the way.
	const swaps: RoundPlay['swaps'] = [];
	for (const a of s.pieces) {
		if (!moving(a)) continue;
		const b = startAt.get(destOf(a));
		if (!b || b.owner === a.owner || !moving(b) || destOf(b) !== a.cell || a.id > b.id) continue;
		swaps.push({ a: a.id, b: b.id });
		fight([
			{ piece: a, rank: rankOf(a, false) },
			{ piece: b, rank: rankOf(b, false) }
		]);
	}

	// 2. Everything moves; who ends on the same hex fights.
	const moves = s.pieces.filter((p) => moving(p)).map((p) => ({ piece: p.id, from: p.cell, to: destOf(p) }));
	const ending = new Map<number, Piece[]>();
	for (const p of s.pieces) {
		if (dead.has(p.id)) continue;
		const at = destOf(p);
		ending.set(at, [...(ending.get(at) ?? []), p]);
	}
	for (const group of ending.values()) {
		if (group.length < 2) continue;
		const still = group.find((p) => !moving(p)) ?? null;
		const arriving = group.filter((p) => moving(p));
		if (arriving.length === 1 && still && !braced(still)) {
			lose(still, arriving[0].owner, 'captured');
			continue;
		}
		const fighters = arriving.map((p) => ({ piece: p, rank: rankOf(p, false) }));
		if (still && braced(still)) fighters.push({ piece: still, rank: rankOf(still, true) });
		fight(fighters, still && !braced(still) ? [still] : []);
	}

	// Where everyone stands now.
	const after = s.pieces.filter((p) => !dead.has(p.id)).map((p) => ({ ...p, cell: destOf(p) }));
	const standing = new Map(after.map((p) => [p.cell, p]));

	// 3. Arrows land, loosed as the round began (even by an archer that has fallen since).
	const arrows: RoundPlay['arrows'] = [];
	s.orders.forEach((os, owner) =>
		os.forEach((o) => {
			if (o.type !== 'shoot') return;
			const target = standing.get(o.at);
			const hit = target && target.owner !== owner && !dead.has(target.id) && board.cells[o.at].terrain !== 'forest' ? target : null;
			if (hit) lose(hit, owner, 'arrow');
			arrows.push({ piece: o.piece, at: o.at, hit: hit?.id ?? null });
		})
	);

	// 4. Crowns, monarchs home, musters.
	s.pieces = after.filter((p) => !dead.has(p.id));
	const crowns = s.players.map((_, player) => ({ player, shrines: 0, taken: 0 }));
	const deposed = s.players.map(() => false);
	for (const l of losses) {
		s.stats.players[l.piece.owner].lost++;
		if (l.by !== null && l.by !== l.piece.owner) {
			crowns[l.by].taken += VALUE[l.piece.kind];
			s.stats.players[l.by].taken++;
		}
		if (l.piece.kind === 'monarch') deposed[l.piece.owner] = true;
	}
	for (const p of s.pieces) {
		const shrine = board.cells[p.cell].shrine;
		if (shrine) crowns[p.owner].shrines += shrine;
	}
	const returned: RoundPlay['returned'] = [];
	for (const l of losses) {
		if (l.piece.kind !== 'monarch') continue;
		const cell = nearestFree(board, s.pieces, l.piece.owner);
		if (cell < 0) continue;
		s.pieces.push({ ...l.piece, cell });
		returned.push({ piece: l.piece.id, cell });
	}
	const mustered: Piece[] = [];
	if (s.round % MUSTER_EVERY === 0)
		s.players.forEach((_, p) => {
			if (s.pieces.filter((x) => x.owner === p).length >= START_PIECES.length) return;
			const cell = nearestFree(board, s.pieces, p);
			if (cell < 0) return;
			const guard: Piece = { id: s.nextPieceId++, owner: p, kind: 'guard', cell };
			s.pieces.push(guard);
			mustered.push({ ...guard });
		});
	s.players.forEach((pl, p) => {
		pl.crowns += crowns[p].shrines + crowns[p].taken;
		pl.deposed = deposed[p];
		s.stats.players[p].shrineCrowns += crowns[p].shrines;
		s.stats.players[p].captureCrowns += crowns[p].taken;
		s.stats.crowns[p].push(pl.crowns);
	});
	s.pieces.sort((a, b) => a.id - b.id);
	ctx.emit({
		type: 'roundPlayed',
		play: { round: s.round, orders: s.orders, moves, swaps, losses, arrows, crowns: crowns.filter((c) => c.shrines || c.taken), returned, mustered }
	});

	// The war ends at the target, or when the rounds run out.
	const top = Math.max(...s.players.map((p) => p.crowns));
	if (top >= s.settings.crowns) return gameOver(ctx, leader(s), 'crowns');
	if (s.round >= s.settings.rounds) return gameOver(ctx, leader(s), 'rounds');
	s.round++;
	s.orders = s.players.map(() => []);
	s.ready = s.players.map(() => false);
	ctx.emit({ type: 'roundStarted', round: s.round });
}

/** The most crowns; then the most pieces; then the most taken; then (a dead heat) drawn by lot. */
export function leader(s: GambitState): number {
	const score = (p: number) => [s.players[p].crowns, s.pieces.filter((x) => x.owner === p).length, s.stats.players[p].taken];
	const beats = (a: number[], b: number[]) => {
		const i = a.findIndex((v, k) => v !== b[k]);
		return i >= 0 && a[i] > b[i];
	};
	let tied = [0];
	for (let p = 1; p < s.players.length; p++) {
		if (beats(score(p), score(tied[0]))) tied = [p];
		else if (!beats(score(tied[0]), score(p))) tied.push(p);
	}
	return tied[randomInt(s, tied.length)];
}

export function gameOver(ctx: Ctx, winner: number, reason: WinReason) {
	const s = ctx.s;
	s.phase = 'ended';
	s.winner = winner;
	s.orders = s.players.map(() => []);
	s.ready = s.players.map(() => true);
	ctx.emit({ type: 'gameOver', winner, reason });
}

/** The clock ran out: everyone not ready goes with the orders they had given, and the round is played. */
export function timeOutGambit(state: GambitState): GambitState {
	if (state.phase === 'ended') return state;
	const s = structuredClone(state);
	const ctx = new Ctx(s);
	s.ready.forEach((r, p) => {
		if (r) return;
		ctx.emit({ type: 'turnTimedOut', player: p });
		s.ready[p] = true;
	});
	playRound(ctx);
	s.version++;
	return s;
}

/** Chat goes through the log so it survives reconnects. */
export function addGambitChat(state: GambitState, player: number, text: string): GambitState {
	const clean = String(text ?? '').trim().slice(0, CHAT_LIMIT);
	if (!clean || !state.players[player]) return state;
	const s = structuredClone(state);
	new Ctx(s).emit({ type: 'chat', player, text: clean });
	s.version++;
	return s;
}

/** What `me` sees (-1: a spectator): everyone's orders but their own stay secret. */
export function gambitView(state: GambitState, me: number): GambitView {
	const { rng: _rng, orders, ...rest } = state;
	return structuredClone({ ...rest, me, myOrders: orders[me] ?? [] });
}
