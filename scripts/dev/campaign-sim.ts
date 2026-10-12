/**
 * How hard each campaign mission is: plays it many times with a bot in the hero's seat and prints
 * how often the hero wins, the stars it earns and how long games run.
 *
 *   pnpm tsx scripts/dev/campaign-sim.ts [games=200] [mission id...]
 */
import { MISSIONS } from '../../src/shared/campaign/missions';
import { createMissionGame, missionSeats } from '../../src/shared/campaign/start';
import { botAction, closeOffer } from '../../src/shared/rules/bot';
import { missionResult } from '../../src/shared/rules/campaign';
import { PLAYER_COLORS } from '../../src/shared/rules/config';
import { applyAction } from '../../src/shared/rules/engine';
import type { Action, GameState } from '../../src/shared/rules/types';

const games = Number(process.argv[2] ?? 200);
const only = process.argv.slice(3);

function act(s: GameState, p: number, a: Action): GameState {
	const res = applyAction(s, p, a);
	if (res.ok) return res.state;
	const end = applyAction(s, p, { type: 'endTurn' });
	if (end.ok) return end.state;
	throw new Error(`${p} ${JSON.stringify(a)}: ${res.error}`);
}

function playOut(s: GameState): GameState {
	let perTurn = 0;
	let lastTurn = -1;
	for (let steps = 0; s.phase !== 'ended' && steps < 40000; steps++) {
		if (s.turn !== lastTurn) {
			lastTurn = s.turn;
			perTurn = 0;
		}
		let acted = false;
		for (let p = 0; p < s.players.length && !acted; p++) {
			if (p === s.current) continue;
			const a = botAction(s, p);
			if (a) {
				s = act(s, p, a);
				acted = true;
			}
		}
		if (acted) continue;
		const a = botAction(s, s.current, perTurn++) ?? (s.trade?.from === s.current ? closeOffer(s, s.current) : null);
		if (!a) throw new Error(`stuck at ${s.step}`);
		s = act(s, s.current, a);
	}
	return s;
}

for (const m of MISSIONS) {
	if (only.length && !only.includes(m.id)) continue;
	let won = 0;
	let timeOut = 0;
	const stars = [0, 0, 0, 0];
	const goals = m.goals.map(() => 0);
	let rounds = 0;
	let lines = 0;
	for (let i = 0; i < games; i++) {
		const seats = missionSeats(m, { name: 'Hero', color: 'red' }, PLAYER_COLORS);
		const g = playOut(createMissionGame(m, seats, (i * 7919 + 13) >>> 0));
		const r = missionResult(g)!;
		if (r.won) won++;
		if (r.outOfTime) timeOut++;
		stars[r.stars]++;
		r.goals.forEach((ok, k) => ok && goals[k]++);
		rounds += r.round;
		lines += g.campaign!.fired.length;
	}
	const pct = (n: number) => `${Math.round((100 * n) / games)}%`;
	console.log(
		`${m.id.padEnd(22)} win ${pct(won).padStart(4)}  out of time ${pct(timeOut).padStart(4)}  stars 0/1/2/3 ${stars.map(pct).join('/')}  goals ${goals.map(pct).join(' ')}  rounds ${(rounds / games).toFixed(1)}  beats ${(lines / games).toFixed(1)}`
	);
}
