// Bot games with and without powers: how often each power fires, and each character's win rate.
// Run: npx tsx scripts/dev/powerSim.ts [games per character]
import { botAction } from '../../src/shared/rules/bot';
import { CHARACTERS, type CharacterId } from '../../src/shared/rules/characters';
import { applyAction, createGame } from '../../src/shared/rules/engine';
import type { GameState } from '../../src/shared/rules/types';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const GAMES = Number(process.argv[2] ?? 40);

function play(s: GameState): { s: GameState; used: CharacterId[] } {
	const used: CharacterId[] = [];
	let perTurn = 0;
	let lastTurn = -1;
	for (let steps = 0; s.phase !== 'ended' && steps < 30000; steps++) {
		if (s.turn !== lastTurn) [lastTurn, perTurn] = [s.turn, 0];
		let p = s.current;
		let a = null;
		for (let i = 0; i < s.players.length && !a; i++) if (i !== s.current) (a = botAction(s, i)) && (p = i);
		if (!a) a = botAction(s, (p = s.current), perTurn++);
		if (!a) throw new Error(`stuck at ${s.step}`);
		const r = applyAction(s, p, a);
		if (!r.ok) throw new Error(`${s.players[p].character} ${a.type}: ${r.error}`);
		for (const e of r.events) if (e.type === 'powerUsed') used.push(e.character);
		s = r.state;
	}
	return { s, used };
}

const rows: string[] = [];
for (const c of CHARACTERS) {
	const res = { on: 0, off: 0, uses: 0, turns: 0 };
	for (let g = 0; g < GAMES; g++) {
		const others = CHARACTERS.filter((x) => x !== c).sort(() => Math.random() - 0.5).slice(0, 3);
		const seat = g % 4;
		const chars = [...others];
		chars.splice(seat, 0, c);
		for (const powers of [true, false]) {
			const players = chars.map((character, i) => ({ name: `P${i}`, color: COLORS[i], isBot: true, character }));
			const seed = (g * 7919 + 13) | 0;
			const { s, used } = play(createGame(players, seed, undefined, { mode: 'extended', map: { preset: 'great' }, powers }));
			if (s.winner === seat) res[powers ? 'on' : 'off']++;
			if (powers) {
				res.uses += used.filter((u) => u === c).length;
				res.turns += s.turn;
			}
		}
	}
	rows.push(`${c.padEnd(13)} used ${(res.uses / GAMES).toFixed(2)}/game  wins with powers ${((100 * res.on) / GAMES).toFixed(0)}%  without ${((100 * res.off) / GAMES).toFixed(0)}%  turns ${(res.turns / GAMES).toFixed(0)}`);
	console.log(rows[rows.length - 1]);
}
