import { describe, expect, it } from 'vitest';
import { applyGambitCheat, type GambitCheat } from '../src/shared/gambit/cheats';
import { boardOf, createGambit } from '../src/shared/gambit/rules';
import { DEFAULT_GAMBIT_SETTINGS, type GambitState } from '../src/shared/gambit/types';
import { PLAYER_COLORS } from '../src/shared/rules/config';

const game = () => createGambit([0, 1, 2].map((i) => ({ name: `P${i}`, color: PLAYER_COLORS[i], isBot: false })), 3, { ...DEFAULT_GAMBIT_SETTINGS, terrain: 'none' });
function cheat(s: GambitState, by: number, c: GambitCheat) {
	const r = applyGambitCheat(s, by, c);
	if (!r.ok) throw new Error(`${c.type}: ${r.error}`);
	return r.state;
}
const lines = (s: GambitState) => s.log.flatMap((e) => (e.type === 'cheat' ? [e.text] : []));

describe('Gambit dev cheats', () => {
	it('put a piece on a free hex and take one off, never a monarch', () => {
		const s0 = game();
		const taken = new Set(s0.pieces.map((p) => p.cell));
		const free = boardOf(s0).cells.findIndex((c, i) => c.terrain === 'plain' && !taken.has(i));
		const s = cheat(s0, 0, { type: 'piece', player: 1, kind: 'knight', cell: free });
		expect(s.pieces.find((p) => p.cell === free)).toMatchObject({ owner: 1, kind: 'knight' });
		expect(lines(s)).toEqual(['gave P1 a knight']);
		expect(applyGambitCheat(s, 0, { type: 'piece', player: 1, kind: 'guard', cell: free })).toEqual({ ok: false, error: 'That hex is taken.' });
		const gone = cheat(s, 0, { type: 'remove', cell: free });
		expect(gone.pieces.some((p) => p.cell === free)).toBe(false);
		const monarch = s0.pieces.find((p) => p.kind === 'monarch')!;
		expect(applyGambitCheat(s0, 0, { type: 'remove', cell: monarch.cell })).toEqual({ ok: false, error: "Monarchs can't be taken off the board." });
	});

	it('play the round at once with the orders given so far', () => {
		const s = cheat(game(), 2, { type: 'playRound' });
		expect(s.round).toBe(2);
		expect(lines(s)).toEqual(['played the round at once']);
	});

	it('hand out crowns, and refuse once the game is over', () => {
		const s = cheat(game(), 0, { type: 'crowns', player: 2, count: 7 });
		expect(s.players[2].crowns).toBe(7);
		const won = cheat(s, 0, { type: 'win', player: 2 });
		expect(won.phase).toBe('ended');
		expect(applyGambitCheat(won, 0, { type: 'fastBots', on: true })).toEqual({ ok: false, error: 'The game is over.' });
	});
});
