import { describe, expect, it } from 'vitest';
import { botAction } from '../src/shared/rules/bot';
import { seedForRoll } from '../src/shared/rules/cheats';
import { RESOURCES } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import { tileIncome } from '../src/shared/rules/income';
import type { GameSettings } from '../src/shared/rules/modes';
import { citySpots, workshopSpots } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (n: number) =>
	COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));
const RICH = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

/** Past setup, with a city and a workshop for the current player, and a bank that can pay anything. */
function board(settings: Partial<GameSettings>, seed: number): GameState {
	let s = createGame(players(3), seed, undefined, settings);
	while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
	s = structuredClone(s);
	const p = s.current;
	s.step = 'main';
	s.players[p].resources = { ...RICH };
	s = act(s, p, { type: 'buildCity', vertex: citySpots(s, p)[0] });
	const shop = workshopSpots(s, p)[0];
	if (shop !== undefined) s = act(s, p, { type: 'buildWorkshop', hex: shop });
	for (const r of RESOURCES) s.bank[r] = 500;
	return s;
}

/** What each player gets from a roll of `total`, by resource. */
function paid(s: GameState, total: number) {
	const t = structuredClone(s);
	t.step = 'roll';
	t.rng = seedForRoll(total);
	const after = act(t, t.current, { type: 'rollDice' });
	expect(after.dice![0] + after.dice![1]).toBe(total);
	return s.players.map((pl, i) =>
		Object.fromEntries(RESOURCES.map((r) => [r, after.players[i].resources[r] - pl.resources[r]]))
	);
}

/** What the income list says each player gets from a roll of `total`. */
function listed(s: GameState, total: number) {
	return s.players.map((_, i) => {
		const got = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
		for (const t of tileIncome(viewFor(s, i), i))
			if (t.number === total && !t.robbed) got[t.resource] += t.amount;
		return got;
	});
}

describe('the tile income list', () => {
	const cases: [string, Partial<GameSettings>][] = [
		['Classic', { mode: 'classic' }],
		['Reign Extended', { mode: 'extended', map: { preset: 'great' }, characters: false }]
	];
	for (const [name, settings] of cases) {
		it(`matches what every roll pays in ${name}`, () => {
			for (const seed of [3, 11, 29]) {
				const s = board(settings, seed);
				for (let total = 2; total <= 12; total++) {
					if (total === 7) continue;
					expect(listed(s, total), `seed ${seed}, roll ${total}`).toEqual(paid(s, total));
				}
			}
		});
	}

	it('counts cities twice and workshops once, and marks the tile under the robber', () => {
		const s = board({ mode: 'extended', map: { preset: 'great' }, characters: false }, 5);
		const p = s.current;
		const list = tileIncome(s, p);
		expect(list.some((t) => t.cities > 0 && t.amount >= 2)).toBe(true);
		expect(list.some((t) => t.workshop)).toBe(true);
		for (const t of list)
			expect(t.amount).toBe(t.settlements + t.cities * 2 + (t.workshop ? 1 : 0));
		expect(list.map((t) => t.number)).toEqual([...list.map((t) => t.number)].sort((a, b) => a - b));

		const robbed = structuredClone(s);
		robbed.robberHex = list[0].hex;
		expect(tileIncome(robbed, p).find((t) => t.hex === list[0].hex)!.robbed).toBe(true);
		for (let total = 2; total <= 12; total++) {
			if (total !== 7) expect(listed(robbed, total)).toEqual(paid(robbed, total));
		}
	});
});
