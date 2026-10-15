/**
 * Plays Gambit with bots in every seat and prints who wins by seat, how long wars run, how they
 * end and where the crowns come from, for each table size and kind of ground.
 *
 *   pnpm tsx scripts/dev/gambit-sim.ts [games=100] [players=all]
 */
import { gambitBot } from '../../src/shared/gambit/bot';
import { applyGambit, createGambit, gambitView } from '../../src/shared/gambit/rules';
import { DEFAULT_GAMBIT_SETTINGS, TERRAIN_RULES, type GambitState, type TerrainRule } from '../../src/shared/gambit/types';
import { PLAYER_COLORS } from '../../src/shared/rules/config';

const games = Number(process.argv[2] ?? 100);
const tables = process.argv[3] ? process.argv[3].split(',').map(Number) : [4, 6, 8];

function play(players: number, seed: number, terrain: TerrainRule): GambitState {
	const seats = Array.from({ length: players }, (_, i) => ({ name: `B${i}`, color: PLAYER_COLORS[i], isBot: true }));
	let s = createGambit(seats, seed, { ...DEFAULT_GAMBIT_SETTINGS, terrain, seed });
	for (let guard = 0; s.phase !== 'ended' && guard < 100; guard++)
		for (let p = 0; p < players && s.phase !== 'ended'; p++) {
			const r = applyGambit(s, p, { type: 'orders', orders: gambitBot(gambitView(s, p)) ?? [], ready: true });
			if (!r.ok) throw new Error(`seat ${p}, round ${s.round}: ${r.error}`);
			s = r.state;
		}
	return s;
}

for (const players of tables)
	for (const terrain of TERRAIN_RULES) {
		const wins = Array(players).fill(0);
		let rounds = 0;
		let byCrowns = 0;
		let shrine = 0;
		let taken = 0;
		let top = 0;
		let lost = 0;
		for (let g = 0; g < games; g++) {
			const s = play(players, 1000 + g, terrain);
			wins[s.winner!]++;
			rounds += s.round;
			if (s.log.some((e) => e.type === 'gameOver' && e.reason === 'crowns')) byCrowns++;
			for (const st of s.stats.players) {
				shrine += st.shrineCrowns;
				taken += st.captureCrowns;
				lost += st.lost;
			}
			top += Math.max(...s.players.map((p) => p.crowns));
		}
		const pct = (n: number) => `${Math.round((100 * n) / games)}%`;
		console.log(
			`${players}p ${terrain.padEnd(5)} rounds ${(rounds / games).toFixed(1)}  by crowns ${pct(byCrowns)}  winner ${(top / games).toFixed(1)} crowns  ` +
				`from shrines ${Math.round((100 * shrine) / Math.max(1, shrine + taken))}%  pieces lost/game ${(lost / games).toFixed(1)}  seats ${wins.map(pct).join(' ')}`
		);
	}
