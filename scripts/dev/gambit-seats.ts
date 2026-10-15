/**
 * For tables where hexes can't make every seat alike (five, seven, eight players), tries every
 * turn of the seats round the rim and plays bot wars on each, printing how evenly the seats win.
 * The most even goes in SEAT_SHIFT (src/shared/gambit/board.ts).
 *
 *   pnpm tsx scripts/dev/gambit-seats.ts [games=120] [players=5,7,8]
 */
import { boardRadius, SEAT_SHIFT } from '../../src/shared/gambit/board';
import { gambitBot } from '../../src/shared/gambit/bot';
import { applyGambit, createGambit, gambitView } from '../../src/shared/gambit/rules';
import { DEFAULT_GAMBIT_SETTINGS, type TerrainRule } from '../../src/shared/gambit/types';
import { PLAYER_COLORS } from '../../src/shared/rules/config';

const games = Number(process.argv[2] ?? 120);
const tables = process.argv[3] ? process.argv[3].split(',').map(Number) : [5, 7, 8];

function winner(players: number, seed: number, terrain: TerrainRule): number {
	const seats = Array.from({ length: players }, (_, i) => ({ name: `B${i}`, color: PLAYER_COLORS[i], isBot: true }));
	let s = createGambit(seats, seed, { ...DEFAULT_GAMBIT_SETTINGS, terrain, seed });
	for (let guard = 0; s.phase !== 'ended' && guard < 100; guard++)
		for (let p = 0; p < players && s.phase !== 'ended'; p++) {
			const r = applyGambit(s, p, { type: 'orders', orders: gambitBot(gambitView(s, p)) ?? [], ready: true });
			if (!r.ok) throw new Error(r.error);
			s = r.state;
		}
	return s.winner!;
}

for (const players of tables) {
	const spacing = (6 * boardRadius(players)) / players;
	for (let shift = 0; shift < Math.ceil(spacing); shift++) {
		SEAT_SHIFT[players] = shift;
		const wins = Array(players).fill(0);
		for (let g = 0; g < games; g++) wins[winner(players, 5000 + g, g % 2 ? 'mixed' : 'none')]++;
		const pct = wins.map((w) => (100 * w) / games);
		console.log(`${players}p shift ${shift}: spread ${(Math.max(...pct) - Math.min(...pct)).toFixed(0)}  seats ${pct.map((x) => x.toFixed(0) + '%').join(' ')}`);
	}
	delete SEAT_SHIFT[players];
}
