import { describe, expect, it } from 'vitest';
import { botAction } from '../src/shared/rules/bot';
import { applyAction, createGame } from '../src/shared/rules/engine';
import { builtKey } from '../src/shared/rules/queries';
import type { GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';
import { pieceTip } from '../src/client/ui/helpers';

const players = (['red', 'blue', 'yellow'] as const).map((color, i) => ({
	name: `P${i}`,
	color,
	isBot: true
}));

/** A bot game, with every state it went through. */
function botGame(seed: number, extended = false): GameState[] {
	let s = createGame(
		players,
		seed,
		undefined,
		extended ? { mode: 'extended', characters: false } : {}
	);
	const states = [s];
	let perTurn = 0;
	let lastTurn = -1;
	for (let steps = 0; s.phase !== 'ended' && steps < 20000; steps++) {
		if (s.turn !== lastTurn) [lastTurn, perTurn] = [s.turn, 0];
		let who = s.current;
		let a = null;
		for (let p = 0; p < players.length && !a; p++)
			if (p !== s.current && (a = botAction(s, p))) who = p;
		a ??= botAction(s, s.current, perTurn++);
		const r = applyAction(s, who, a!);
		if (!r.ok) throw new Error(r.error);
		s = r.state;
		states.push(s);
	}
	return states;
}

describe('build turns', () => {
	it('dates every piece with the turn it went up on', () => {
		for (const [seed, extended] of [
			[3, false],
			[11, true]
		] as const) {
			const states = botGame(seed, extended);
			for (let i = 1; i < states.length; i++) {
				const before = states[i - 1];
				const after = states[i];
				for (const e of after.log.filter((e) => e.seq >= before.nextEventSeq)) {
					if (e.type !== 'built') continue;
					expect(after.builtTurns[builtKey(e.kind, e.at)]).toBe(before.turn);
				}
			}
			const end = states[states.length - 1];
			end.buildings.forEach((b, v) => {
				if (!b) return;
				expect(end.builtTurns[builtKey('settlement', v)]).toBeTypeOf('number');
				// A settlement can become a city on the turn it went up.
				if (b.kind === 'city') {
					expect(end.builtTurns[builtKey('city', v)]).toBeGreaterThanOrEqual(
						end.builtTurns[builtKey('settlement', v)]
					);
				}
			});
			end.roads.forEach(
				(o, e) => o !== null && expect(end.builtTurns[builtKey('road', e)]).toBeTypeOf('number')
			);
			end.workshops.forEach(
				(o, h) => o !== null && expect(end.builtTurns[builtKey('workshop', h)]).toBeGreaterThan(0)
			);
			end.stoneRoads.forEach(
				(stone, e) => stone && expect(end.builtTurns[builtKey('stoneRoad', e)]).toBeGreaterThan(0)
			);
			if (extended) expect(end.workshops.some((o) => o !== null)).toBe(true);
			// Setup pieces say so.
			expect(Object.values(end.builtTurns).filter((t) => t === 0)).toHaveLength(players.length * 4);
		}
	});

	it('words the tooltip of each kind of piece', () => {
		const end = botGame(11, true).at(-1)!;
		const view = viewFor(end, 0);
		const city = end.buildings.findIndex((b) => b?.kind === 'city');
		const tip = pieceTip(view, { place: 'vertex', at: city })!;
		expect(tip.head).toBe('City');
		const owner = end.buildings[city]!.owner;
		expect(tip.text).toMatch(new RegExp(`^Owner: ${owner === 0 ? 'You' : `P${owner}`}\\n`));
		expect(tip.text).toMatch(/Settled (during setup|on turn \d+)\nBecame a city on turn \d+$/);
		const road = end.roads.findIndex((o, e) => o !== null && !end.stoneRoads[e]);
		expect(pieceTip(view, { place: 'edge', at: road })!.head).toBe('Road');
		const shop = end.workshops.findIndex((o) => o !== null);
		expect(pieceTip(view, { place: 'hex', at: shop })!.text).toMatch(/Built on turn \d+$/);
		expect(['Sawmill', 'Kiln', 'Sheepfold', 'Mill', 'Mine Shaft']).toContain(
			pieceTip(view, { place: 'hex', at: shop })!.head
		);
		expect(pieceTip(view, { place: 'vertex', at: end.buildings.findIndex((b) => !b) })).toBeNull();
		// Spectators see the same.
		expect(pieceTip(viewFor(end, -1), { place: 'edge', at: road })!.text).toMatch(/^Owner: P\d/);
	});
});
