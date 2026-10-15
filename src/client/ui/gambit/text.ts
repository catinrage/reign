import { gambitBoard } from '../../../shared/gambit/board';
import { RANK, VALUE } from '../../../shared/gambit/pieces';
import type { GambitView, GbEvent, PieceKind, Terrain } from '../../../shared/gambit/types';
import { msg, t } from '../../i18n/index.svelte';
import { PLAYER_CSS } from '../helpers';

/** Words for Gambit's interface: the pieces, the ground, whose is what, the chronicle's lines. */

export const PIECE_NAME: Record<PieceKind, string> = {
	monarch: msg('Monarch'),
	guard: msg('Guard'),
	archer: msg('Archer'),
	seer: msg('Seer'),
	lancer: msg('Lancer'),
	knight: msg('Knight')
};

/** How each piece moves and fights, in a sentence or two. */
export const PIECE_TEXT: Record<PieceKind, string> = {
	monarch: msg('Steps to a hex next to it. Taken, it comes home to its keep, and its player gives an order fewer next round.'),
	guard: msg('Steps to a hex next to it. Braced behind its shield it beats a charge, and holds even a knight to a draw.'),
	archer: msg('Steps to a hex next to it, or shoots a hex two away (three from a hill): the arrow strikes whoever stands there once everyone has moved.'),
	seer: msg('Glides along the diagonals, up to two, never through a piece, and stops in a forest.'),
	lancer: msg('Charges along a straight line, up to three hexes, never through a piece, and stops in a forest.'),
	knight: msg('Leaps two hexes on and one aside, over anything.')
};

export const TERRAIN_NAME: Record<Terrain, string> = {
	plain: msg('Open ground'),
	forest: msg('Forest'),
	hill: msg('Hill'),
	water: msg('Lake')
};

export const TERRAIN_TEXT: Record<Terrain, string> = {
	plain: msg('Nothing in the way.'),
	forest: msg('Lancers and seers stop here; no arrow strikes a piece in a forest.'),
	hill: msg('An archer here shoots three hexes away.'),
	water: msg('No piece stands in a lake; only a knight leaps over one.')
};

export function playerName(v: GambitView, p: number): string {
	return v.players[p]?.name ?? '?';
}

export function gbColor(v: Pick<GambitView, 'players'>, p: number): string {
	return PLAYER_CSS[v.players[p]?.color ?? 'white'] ?? '#fff';
}

export function pieceName(kind: PieceKind): string {
	return t(PIECE_NAME[kind]);
}

/** How hard a piece fights and what taking it is worth, for its tooltip. */
export function pieceStats(kind: PieceKind): string {
	return t('Fights at rank {rank} · worth {n, plural, one {# crown} other {# crowns}}', { rank: RANK[kind], n: VALUE[kind] });
}

export function boardOf(v: Pick<GambitView, 'players' | 'settings'>) {
	return gambitBoard(v.players.length, v.settings);
}

export type GbLogPart = { text: string; player?: number; cell?: number };

/** Chronicle lines for an event, as parts (players in their colors), or none. */
export function gbEventLines(e: GbEvent, v: GambitView): GbLogPart[][] {
	const P = (p: number): GbLogPart => ({ text: playerName(v, p), player: p });
	const say = (text: string, slots: Record<string, GbLogPart>, params?: Record<string, string | number>): GbLogPart[] => {
		// Translate with markers in the slots, then cut the sentence at them.
		const marks: Record<string, string> = {};
		for (const k of Object.keys(slots)) marks[k] = `\u0001${k}\u0001`;
		const out: GbLogPart[] = [];
		for (const piece of t(text, { ...params, ...marks }).split('\u0001')) {
			if (!piece) continue;
			if (piece in slots) out.push(slots[piece]);
			else out.push({ text: piece });
		}
		return out;
	};
	switch (e.type) {
		case 'gameStarted':
			return [[{ text: t('The game begins: {n, plural, one {# crown} other {# crowns}} to win.', { n: v.settings.crowns }) }]];
		case 'roundPlayed': {
			const play = e.play;
			const lines: GbLogPart[][] = [];
			for (const l of play.losses) {
				const piece = pieceName(l.piece.kind);
				if (l.how === 'arrow' && l.by !== null)
					lines.push(say(msg("{player}'s arrow struck {victim}'s {piece}."), { player: P(l.by), victim: P(l.piece.owner) }, { piece }));
				else if (l.by !== null) lines.push(say(msg("{player} took {victim}'s {piece}."), { player: P(l.by), victim: P(l.piece.owner) }, { piece }));
				else lines.push(say(msg("{victim}'s {piece} fell in a draw."), { victim: P(l.piece.owner) }, { piece }));
			}
			for (const c of play.crowns)
				lines.push(say(msg('{player} won {n, plural, one {# crown} other {# crowns}}.'), { player: P(c.player) }, { n: c.shrines + c.taken }));
			if (!lines.length) lines.push([{ text: t('Round {round}: no blood spilled, no crowns won.', { round: play.round }) }]);
			return lines;
		}
		case 'turnTimedOut':
			return [say(msg('{player} ran out of time.'), { player: P(e.player) })];
		case 'gameOver':
			return [
				e.reason === 'rounds'
					? say(msg('The rounds are over: {player} wins with {n, plural, one {# crown} other {# crowns}}!'), { player: P(e.winner) }, { n: v.players[e.winner]?.crowns ?? 0 })
					: say(msg('{player} wins with {n, plural, one {# crown} other {# crowns}}!'), { player: P(e.winner) }, { n: v.players[e.winner]?.crowns ?? 0 })
			];
		case 'chat':
			return [[P(e.player), { text: `: ${e.text}` }]];
		// Dev cheats are for the dev server only, and go untranslated.
		case 'cheat':
			return [[{ text: '[cheat] ' }, P(e.player), { text: ` ${e.text}` }]];
		default:
			return [];
	}
}
