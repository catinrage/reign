import {
	attackTargets,
	bestSet,
	canAttackNow,
	canEndTurnNow,
	canFortifyNow,
	conquestMap,
	fortifyTargets,
	neighbors,
	regionTerritories,
	territoriesOf
} from './queries';
import type { CqAction, CqView } from './types';

/** Battles a bot fights in one turn at most, so a turn always ends. */
const BATTLES_PER_TURN = 40;

/**
 * A Conquest bot. It decides the next action for the seat `view.me` from that seat's view alone
 * (its own cards and the open board, never anyone else's hand or the deck), and returns null
 * when it has nothing to do: not its turn, or its starting armies all placed.
 */
export function conquestBot(view: CqView): CqAction | null {
	const me = view.me;
	const pl = view.players[me];
	if (!pl || pl.out || view.phase === 'ended') return null;
	if (view.phase === 'deploy') return view.reserve[me] > 0 ? placeArmies(view, true) : null;
	if (view.current !== me) return null;
	if (view.step === 'occupy' && view.occupy) return { type: 'occupy', count: occupyCount(view) };
	const hand = pl.cards ?? [];
	if (view.mustTrade) {
		const set = bestSet(hand, view, me);
		return set ? { type: 'trade', cards: set.cards.map((c) => c.id) } : null;
	}
	if (view.step === 'reinforce') {
		const set = bestSet(hand, view, me);
		// Escalating sets only grow for whoever trades next, so trade at once; fixed ones when they're worth it.
		if (
			set &&
			(view.settings.cards === 'escalating' ||
				hand.length >= 4 ||
				set.armies + (set.bonus === null ? 0 : 2) >= 8)
		) {
			return { type: 'trade', cards: set.cards.map((c) => c.id) };
		}
		if (view.reserve[me] > 0) return placeArmies(view, false);
	}
	if (canAttackNow(view, me)) {
		const attack = chooseAttack(view);
		if (attack) return attack;
	}
	if (canFortifyNow(view, me)) {
		const move = chooseFortify(view);
		if (move) return move;
	}
	return canEndTurnNow(view, me) ? { type: 'endTurn' } : null;
}

/** How many territories each player holds. */
function holdings(view: CqView): number[] {
	const counts = view.players.map(() => 0);
	for (const o of view.owner) counts[o]++;
	return counts;
}

/** Enemy armies next to `t`, all told. */
function threat(view: CqView, t: number): number {
	return attackTargets(view, t).reduce((n, e) => n + view.armies[e], 0);
}

/** How much of each region the bot holds, from 0 to 1. */
function regionShares(view: CqView): number[] {
	return regionTerritories(conquestMap(view.settings)).map(
		(ts) => ts.filter((t) => view.owner[t] === view.me).length / ts.length
	);
}

/**
 * Put armies down in a chunk or two, where they'll do most good: next to weak enemies, in regions
 * the bot nearly holds, and guarding regions it holds. Territories with no enemy next door get none.
 */
function placeArmies(view: CqView, deploying: boolean): CqAction {
	const me = view.me;
	const map = conquestMap(view.settings);
	const shares = regionShares(view);
	const counts = holdings(view);
	let best = -1;
	let bestScore = -Infinity;
	for (const t of territoriesOf(view, me)) {
		const foes = attackTargets(view, t);
		if (!foes.length) continue;
		let score = 0;
		for (const e of foes) {
			const r = map.territories[e].region;
			let v = 1 + shares[r] * shares[r] * map.regions[r].bonus;
			v += 4 / (1 + view.armies[e]);
			if (counts[view.owner[e]] <= 3) v += 2;
			score = Math.max(score, v);
		}
		const r = map.territories[t].region;
		// Guard a region held, or nearly, against what is massed next to it.
		if (shares[r] >= 0.75)
			score +=
				(shares[r] * map.regions[r].bonus * threat(view, t)) /
				(threat(view, t) + view.armies[t] + 1);
		// Armies together hit harder than armies spread thin.
		score += Math.min(view.armies[t], 20) * 0.05;
		if (score > bestScore) {
			bestScore = score;
			best = t;
		}
	}
	if (best < 0) best = territoriesOf(view, me)[0];
	const reserve = view.reserve[me];
	const count = deploying
		? Math.max(1, Math.ceil(reserve / 3))
		: reserve <= 4
			? reserve
			: Math.ceil(reserve / 2);
	return { type: 'place', territory: best, count };
}

/** Battles the bot has fought since its turn began, as far back as the log goes. */
function battlesThisTurn(view: CqView): number {
	let n = 0;
	for (let i = view.log.length - 1; i >= 0; i--) {
		const e = view.log[i];
		if (e.type === 'turnStarted') break;
		if (e.type === 'battle' && e.player === view.me) n++;
	}
	return n;
}

/**
 * The best attack there is, or null. Attacks go in with clearly more armies than the defender,
 * or at fair odds when taking the territory finishes a region, knocks a player out, or earns the
 * turn's card. Close fights are rolled one throw at a time; overwhelming ones are blitzed.
 */
function chooseAttack(view: CqView): CqAction | null {
	if (battlesThisTurn(view) >= BATTLES_PER_TURN) return null;
	const me = view.me;
	const map = conquestMap(view.settings);
	const regions = regionTerritories(map);
	const counts = holdings(view);
	let best: { from: number; to: number; score: number } | null = null;
	for (const from of territoriesOf(view, me)) {
		const a = view.armies[from];
		if (a < 2) continue;
		for (const to of attackTargets(view, from)) {
			const d = view.armies[to];
			const ratio = a / d;
			// Big armies fight closer to the averages, so a smaller edge is enough.
			const good = a >= 3 && (ratio >= 1.4 || (d >= 8 && ratio >= 1.15));
			const fair = a >= d + 2 || (a >= 3 && d === 1);
			const region = map.territories[to].region;
			const completes = regions[region].every((t) => t === to || view.owner[t] === me);
			const knocksOut = counts[view.owner[to]] === 1;
			let score = good ? ratio : 0;
			if (fair && (completes || knocksOut || !view.conquered)) {
				score =
					Math.max(score, ratio) +
					(completes ? map.regions[region].bonus : 0) +
					(knocksOut ? 5 : 0) +
					0.5;
			}
			if (score > 0 && (!best || score > best.score)) best = { from, to, score };
		}
	}
	if (!best) return null;
	const a = view.armies[best.from];
	const d = view.armies[best.to];
	return a - 1 >= d * 3
		? { type: 'attack', from: best.from, to: best.to, blitz: true }
		: { type: 'attack', from: best.from, to: best.to };
}

/**
 * Armies into a territory just taken: nearly all of them when it faces more enemies than the
 * territory they came from still does, otherwise enough stays behind to hold that one.
 */
function occupyCount(view: CqView): number {
	const { from, to, min, max } = view.occupy!;
	const foesFrom = attackTargets(view, from);
	const foesTo = attackTargets(view, to);
	if (!foesFrom.length) return max;
	if (!foesTo.length) return min;
	if (foesTo.length >= foesFrom.length) return max;
	const keep = Math.ceil(Math.max(...foesFrom.map((e) => view.armies[e])) / 2);
	return Math.max(min, Math.min(max, max - keep));
}

/**
 * Bring the biggest idle army (on a territory with no enemy next door) to the front that is most
 * threatened, or do nothing.
 */
function chooseFortify(view: CqView): CqAction | null {
	const me = view.me;
	const map = conquestMap(view.settings);
	const idle = territoriesOf(view, me)
		.filter((t) => view.armies[t] >= 2 && !neighbors(t, map).some((n) => view.owner[n] !== me))
		.sort((a, b) => view.armies[b] - view.armies[a] || a - b);
	for (const from of idle) {
		let to = -1;
		let most = -Infinity;
		for (const t of fortifyTargets(view, from)) {
			const foes = threat(view, t);
			if (!foes) continue;
			const score = foes - view.armies[t] * 0.5;
			if (score > most) {
				most = score;
				to = t;
			}
		}
		if (to >= 0) return { type: 'fortify', from, to, count: view.armies[from] - 1 };
	}
	return null;
}
