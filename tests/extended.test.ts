import { describe, expect, it } from 'vitest';
import { generateStandardBoard } from '../src/shared/board/generate';
import { MAP_PRESETS } from '../src/shared/board/maps';
import { getTopology } from '../src/shared/board/topology';
import { botAction } from '../src/shared/rules/bot';
import { CHARACTERS, type CharacterId } from '../src/shared/rules/characters';
import { BANK_PER_RESOURCE, BANK_PER_RESOURCE_LARGE, RESOURCES } from '../src/shared/rules/config';
import { applyAction, createGame, totalPoints } from '../src/shared/rules/engine';
import type { GameSettings } from '../src/shared/rules/modes';
import { costOf, tradeRatios } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'orange'] as const;
const players = (chars: (CharacterId | null)[]) =>
	chars.map((character, i) => ({ name: `P${i}`, color: COLORS[i], isBot: true, character }));

const extended = (map = 'great', pointsToWin = 10): Partial<GameSettings> => ({
	mode: 'extended',
	map: { preset: map },
	pointsToWin
});

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

function playOut(s: GameState, limit = 30000) {
	const n = s.players.length;
	let perTurn = 0;
	let lastTurn = -1;
	for (let steps = 0; s.phase !== 'ended' && steps < limit; steps++) {
		if (s.turn !== lastTurn) {
			lastTurn = s.turn;
			perTurn = 0;
		}
		let acted = false;
		for (let p = 0; p < n && !acted; p++) {
			if (p === s.current) continue;
			const a = botAction(s, p);
			if (a) {
				s = act(s, p, a);
				acted = true;
			}
		}
		if (acted) continue;
		const a = botAction(s, s.current, perTurn++);
		expect(a, `stuck at ${s.step}`).not.toBeNull();
		s = act(s, s.current, a!);
	}
	return s;
}

describe('modes', () => {
	it('Classic ignores characters and map choices and plays exactly as before', () => {
		const a = createGame(players(['rogue', 'veteran']), 1234);
		const b = createGame(players([null, null]), 1234, undefined, { mode: 'classic', map: { preset: 'realm' }, pointsToWin: 14 });
		expect(a.board).toEqual(generateStandardBoard({ rng: 1234 }));
		expect(b.board).toEqual(a.board);
		expect(a.players.map((p) => p.character)).toEqual([null, null]);
		expect(a.players[1].knightsPlayed).toBe(0);
		expect(a.pointsToWin).toBe(10);
		expect(b.pointsToWin).toBe(10);
		expect(a.mode).toBe('classic');
	});

	it('Reign Extended deals the chosen map and keeps characters', () => {
		const s = createGame(players(['rogue', 'veteran']), 5, undefined, extended('realm', 12));
		expect(s.board.hexes).toHaveLength(37);
		expect(s.mapName).toBe('Grand Realm');
		expect(s.pointsToWin).toBe(12);
		expect(s.players.map((p) => p.character)).toEqual(['rogue', 'veteran']);
		expect(viewFor(s, 0).players[1].character).toBe('veteran');
	});

	it('plays custom maps', () => {
		const tiles = MAP_PRESETS[0].tiles.map((t, i) => ({ ...t, terrain: i < 3 ? ('mountains' as const) : null }));
		const s = createGame(players([null, null]), 5, undefined, { mode: 'extended', map: { custom: { name: 'Peaks', tiles } } });
		expect(s.mapName).toBe('Peaks');
		expect(s.board.hexes.slice(0, 3).every((h) => h.terrain === 'mountains')).toBe(true);
	});
});

describe('character traits', () => {
	const s = createGame(players(['merchant', 'mason', 'scholar', 'veteran']), 77, undefined, extended());

	it('Merchant trades 3:1, Mason builds cheaper cities, Scholar buys cheaper cards', () => {
		expect(tradeRatios(s, 0).wood).toBe(3);
		expect(tradeRatios(s, 1).wood).toBe(4);
		expect(costOf(s, 1, 'city')).toEqual({ wheat: 2, ore: 2 });
		expect(costOf(s, 0, 'city')).toEqual({ wheat: 2, ore: 3 });
		expect(costOf(s, 2, 'devCard')).toEqual({ wheat: 1, ore: 1 });
	});

	it('Veteran starts with a knight', () => {
		expect(s.players[3].knightsPlayed).toBe(1);
		expect(s.players[0].knightsPlayed).toBe(0);
	});

	it('Steward keeps up to 9 cards and Shepherd gets wool on a 7', () => {
		let g = createGame(players(['steward', 'shepherd', null]), 3, undefined, extended());
		while (g.phase === 'setup') g = act(g, g.current, botAction(g, g.current)!);
		// Rig a 7: find a seed state that rolls one.
		for (let tries = 0; tries < 400; tries++) {
			const trial = structuredClone(g);
			trial.board = g.board;
			trial.players[0].resources = { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 1 };
			trial.players[2].resources = { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 1 };
			trial.rng = tries * 7919;
			const r = applyAction(trial, trial.current, { type: 'rollDice' });
			if (!r.ok || r.state.dice![0] + r.state.dice![1] !== 7) continue;
			expect(r.state.pendingDiscards[0]).toBeUndefined();
			expect(r.state.pendingDiscards[2]).toBe(4);
			expect(r.events.some((e) => e.type === 'traitGain' && e.player === 1)).toBe(true);
			return;
		}
		throw new Error('never rolled a 7');
	});

	it('Rogue steals two cards', () => {
		let g = createGame(players(['rogue', null]), 11, undefined, extended());
		while (g.phase === 'setup') g = act(g, g.current, botAction(g, g.current)!);
		const victimHex = g.board.hexes.findIndex(
			(_, h) => h !== g.robberHex && g.buildings.some((b, v) => b?.owner === 1 && getHexes(g, v).includes(h))
		);
		const trial = structuredClone(g);
		trial.board = g.board;
		trial.current = 0;
		trial.step = 'moveRobber';
		trial.resumeStep = 'main';
		trial.players[1].resources = { wood: 3, brick: 0, sheep: 0, wheat: 0, ore: 0 };
		const before = trial.players[0].resources.wood;
		const r = act(trial, 0, { type: 'moveRobber', hex: victimHex });
		expect(r.players[0].resources.wood - before).toBe(2);
		expect(r.players[1].resources.wood).toBe(1);
	});
});

function getHexes(s: GameState, v: number): number[] {
	return getTopology(s.board).vertices[v].hexes;
}

describe('full Reign Extended bot games', () => {
	for (const preset of MAP_PRESETS) {
		it(`finishes games on ${preset.name}`, () => {
			for (let seed = 1; seed <= 6; seed++) {
				const chars = [...CHARACTERS].sort(() => 0).slice((seed * 3) % 5, ((seed * 3) % 5) + 4) as CharacterId[];
				let s = createGame(players(chars), seed * 131, undefined, extended(preset.id, seed % 2 ? 10 : 12));
				s = playOut(s);
				expect(s.phase, `${preset.id} seed ${seed}`).toBe('ended');
				expect(totalPoints(s, s.winner!)).toBeGreaterThanOrEqual(s.pointsToWin);
				for (const r of RESOURCES) {
					expect(s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0)).toBe(BANK_PER_RESOURCE);
				}
			}
		});
	}
});

describe('five and six players', () => {
	for (const n of [5, 6]) {
		it(`finishes ${n}-player games with the bigger bank and deck`, () => {
			for (let seed = 1; seed <= 4; seed++) {
				const chars = CHARACTERS.slice(seed % 3, (seed % 3) + n) as CharacterId[];
				let s = createGame(players(chars), seed * 977, undefined, extended(seed % 2 ? 'great' : 'realm'));
				expect(s.devDeck).toHaveLength(34);
				expect(s.bank.ore).toBe(BANK_PER_RESOURCE_LARGE);
				s = playOut(s);
				expect(s.phase, `${n} players, seed ${seed}`).toBe('ended');
				for (const r of RESOURCES) {
					expect(s.bank[r] + s.players.reduce((k, p) => k + p.resources[r], 0)).toBe(BANK_PER_RESOURCE_LARGE);
				}
			}
		});
	}
});
