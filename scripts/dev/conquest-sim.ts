/**
 * Plays Conquest with bots in every seat and prints who wins by seat, how long games run and how
 * they are won, for each mix of rules.
 *
 *   pnpm tsx scripts/dev/conquest-sim.ts [games=100] [players=all]
 */
import { conquestBot } from '../../src/shared/conquest/bot';
import { applyConquest, conquestView, createConquest } from '../../src/shared/conquest/rules';
import type { CardRule, CqState, DeployRule, VictoryRule } from '../../src/shared/conquest/types';
import { PLAYER_COLORS } from '../../src/shared/rules/config';

const games = Number(process.argv[2] ?? 100);
const tables = process.argv[3] ? [Number(process.argv[3])] : [2, 3, 4, 5, 6];
const CAP = 20000;

interface Result {
	winner: number | null;
	reason: string;
	actions: number;
	rounds: number;
}

/** One game to the end (or the cap): every bot with something to do acts in turn. */
function play(
	players: number,
	seed: number,
	cards: CardRule,
	victory: VictoryRule,
	deploy: DeployRule
): Result {
	const seats = Array.from({ length: players }, (_, i) => ({
		name: `Bot ${i + 1}`,
		color: PLAYER_COLORS[i],
		isBot: true
	}));
	let s: CqState = createConquest(seats, seed, { map: 'realm', cards, victory, deploy });
	let actions = 0;
	while (s.phase !== 'ended' && actions < CAP) {
		const seat = s.phase === 'deploy' ? s.reserve.findIndex((r) => r > 0) : s.current;
		const action = conquestBot(conquestView(s, seat));
		if (!action) throw new Error(`seat ${seat} had nothing to do (seed ${seed})`);
		const r = applyConquest(s, seat, action);
		if (!r.ok) throw new Error(`seat ${seat} ${JSON.stringify(action)}: ${r.error} (seed ${seed})`);
		s = r.state;
		actions++;
	}
	const over = s.log.findLast((e) => e.type === 'gameOver');
	return {
		winner: s.winner,
		reason: over?.type === 'gameOver' ? over.reason : 'unfinished',
		actions,
		rounds: s.round
	};
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`.padStart(4);

for (const players of tables) {
	for (const cards of ['escalating', 'fixed'] as CardRule[])
		for (const victory of ['domination', 'majority'] as VictoryRule[]) {
			const results: Result[] = [];
			for (let g = 0; g < games; g++)
				results.push(play(players, 1000 + g, cards, victory, g % 2 ? 'random' : 'placed'));
			const wins = Array.from(
				{ length: players },
				(_, p) => results.filter((r) => r.winner === p).length
			);
			const reasons = new Map<string, number>();
			for (const r of results) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
			const acts = results.map((r) => r.actions);
			const rounds = results.map((r) => r.rounds);
			console.log(
				`${players}p ${cards.padEnd(10)} ${victory.padEnd(10)} | wins ${wins.map((w) => pct(w, games)).join(' ')}` +
					` | actions median ${median(acts)} max ${Math.max(...acts)} | rounds median ${median(rounds)} max ${Math.max(...rounds)}` +
					` | ${[...reasons].map(([k, v]) => `${k} ${v}`).join(', ')}`
			);
		}
}
