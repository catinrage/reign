import { describe, expect, it } from 'vitest';
import { generateStandardBoard } from '../src/shared/board/generate';
import { MAP_PRESETS } from '../src/shared/board/maps';
import { RANDOM_SHAPES, randomMap } from '../src/shared/board/random';
import { hexesInRadius } from '../src/shared/board/hex';
import { getTopology } from '../src/shared/board/topology';
import { botAction } from '../src/shared/rules/bot';
import { CHARACTERS, traitText, type CharacterId } from '../src/shared/rules/characters';
import { BANK_PER_RESOURCE, BANK_PER_RESOURCE_HUGE, BANK_PER_RESOURCE_LARGE, RESOURCES } from '../src/shared/rules/config';
import { applyAction, createGame, totalPoints } from '../src/shared/rules/engine';
import { maxPointsFor, type GameSettings } from '../src/shared/rules/modes';
import { costOf, discardLimit, paymentFor, tradeRatios } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'purple', 'pink'] as const;
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

	it('Steward keeps up to 10 cards and Shepherd gets wool on a 7', () => {
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

describe('the eight newer traits', () => {
	/** A game past setup, played by bots, with these characters. */
	function started(chars: (CharacterId | null)[], seed = 21): GameState {
		let g = createGame(players(chars), seed, undefined, extended());
		while (g.phase === 'setup') g = act(g, g.current, botAction(g, g.current)!);
		return g;
	}
	/** A copy of `g` with its dice rigged to roll `total` next (found by trying seeds). */
	function rollTo(g: GameState, total: number): ReturnType<typeof applyAction> {
		for (let tries = 0; tries < 2000; tries++) {
			const trial = structuredClone(g);
			trial.board = g.board;
			trial.rng = tries * 7919 + 1;
			const r = applyAction(trial, trial.current, { type: 'rollDice' });
			if (r.ok && r.state.dice![0] + r.state.dice![1] === total) return r;
		}
		throw new Error(`never rolled ${total}`);
	}
	const hand = (wood = 0, brick = 0, sheep = 0, wheat = 0, ore = 0) => ({ wood, brick, sheep, wheat, ore });

	it('Seer is owed a card of choice on a 2 or a 12, taken any time', () => {
		const g = started([null, 'seer']);
		const r = rollTo(g, 12);
		if (!r.ok) throw new Error();
		expect(r.state.picks[1]).toEqual(['seer']);
		expect(applyAction(r.state, 0, { type: 'takePick', resource: 'ore' }).ok).toBe(false);
		const before = r.state.players[1].resources.ore;
		const after = act(r.state, 1, { type: 'takePick', resource: 'ore' });
		expect(after.players[1].resources.ore).toBe(before + 1);
		expect(after.picks[1]).toBeUndefined();
		expect(applyAction(after, 1, { type: 'takePick', resource: 'ore' }).ok).toBe(false);
	});

	it('Alchemist pays Brick as Ore and Ore as Brick', () => {
		const g = started(['alchemist', null]);
		expect(paymentFor(g, 0, 'city', hand(0, 3, 0, 2, 0))).toEqual({ wheat: 2, brick: 3 });
		expect(paymentFor(g, 0, 'city', hand(0, 1, 0, 2, 2))).toEqual({ wheat: 2, ore: 2, brick: 1 });
		expect(paymentFor(g, 0, 'road', hand(1, 0, 0, 0, 1))).toEqual({ wood: 1, ore: 1 });
		expect(paymentFor(g, 0, 'road', hand(1, 0, 0, 0, 0))).toBeNull();
		expect(paymentFor(g, 1, 'city', hand(0, 3, 0, 2, 0))).toBeNull();
		// A build tells everyone what she really handed the bank.
		const s = structuredClone(g);
		s.board = g.board;
		s.step = 'main';
		s.current = 0;
		s.players[0].resources = hand(0, 3, 0, 2, 0);
		const vertex = s.buildings.findIndex((b) => b?.owner === 0);
		const built = act(s, 0, { type: 'buildCity', vertex }).log.at(-1);
		expect(built).toEqual(expect.objectContaining({ kind: 'city', paid: { wheat: 2, brick: 3 } }));
	});

	it("Bard's trading partner takes a bonus card, once per turn", () => {
		let g = structuredClone(started(['bard', null, null]));
		g.step = 'main';
		g.current = 0;
		g.players[0].resources = hand(2, 2, 0, 0, 0);
		g.players[1].resources = hand(0, 0, 2, 2, 0);
		g.players[2].resources = hand(0, 0, 2, 2, 0);
		const trade = (s: GameState, partner: number) => {
			s = act(s, 0, { type: 'offerTrade', give: { wood: 1 }, want: { sheep: 1 } });
			s = act(s, partner, { type: 'respondTrade', offerId: s.trade!.id, accept: true });
			return act(s, 0, { type: 'confirmTrade', offerId: s.trade!.id, with: partner });
		};
		g = trade(g, 1);
		expect(g.picks[1]).toEqual(['bard']);
		g = trade(g, 2);
		expect(g.picks[2]).toBeUndefined();
	});

	it('Witch makes her robber pay her instead', () => {
		const g = started([null, 'witch'], 11);
		const hex = g.board.hexes.findIndex((_, h) => h !== g.robberHex && g.buildings.some((b, v) => b?.owner === 1 && getHexes(g, v).includes(h)) && !g.buildings.some((b, v) => b?.owner === 0 && getHexes(g, v).includes(h)));
		const trial = structuredClone(g);
		trial.board = g.board;
		trial.current = 0;
		trial.step = 'moveRobber';
		trial.resumeStep = 'main';
		trial.players[0].resources = hand(3);
		trial.players[1].resources = hand(0, 0, 2);
		const r = act(trial, 0, { type: 'moveRobber', hex });
		expect(r.players[0].resources).toEqual(hand(2));
		expect(r.players[1].resources).toEqual(hand(1, 0, 2));
		expect(r.robberHex).toBe(hex);
		// Only the two of them see which card it was.
		const toll = viewFor(r, 2).log.find((e) => e.type === 'traitToll');
		expect(toll && 'resource' in toll && toll.resource).toBeNull();
	});

	it('Cartographer trades at harbors her roads reach', () => {
		const g = started(['cartographer', null]);
		const topo = getTopology(g.board);
		const port = topo.vertices.find((v) => v.port && v.port !== 'any' && !g.buildings[v.id] && v.neighbors.every((n) => !g.buildings[n]))!;
		const edge = topo.vertices[port.id].edges.find((e) => g.roads[e] === null)!;
		const trial = { ...g, roads: [...g.roads] };
		expect(tradeRatios(trial, 0)[port.port as 'wood']).toBe(4);
		trial.roads[edge] = 0;
		expect(tradeRatios(trial, 0)[port.port as 'wood']).toBe(2);
		trial.roads[edge] = 1;
		expect(tradeRatios(trial, 1)[port.port as 'wood']).toBe(4);
	});

	it("Baron takes a toll from roads touching his", () => {
		const g = started(['baron', null], 5);
		const topo = getTopology(g.board);
		// Give player 1 a road that ends where the Baron's road does, then build off it.
		const baronRoad = g.roads.findIndex((o) => o === 0);
		const e = topo.edges[baronRoad];
		const next = topo.vertices[e.b].edges.find((x) => x !== baronRoad && g.roads[x] === null)!;
		const trial = structuredClone(g);
		trial.board = g.board;
		trial.buildings[e.b] = { owner: 1, kind: 'settlement' };
		trial.current = 1;
		trial.step = 'main';
		trial.players[1].resources = hand(1, 1, 3);
		trial.players[0].resources = hand();
		const r = act(trial, 1, { type: 'placeRoad', edge: next });
		expect(r.players[0].resources).toEqual(hand(0, 0, 1));
		expect(r.players[1].resources).toEqual(hand(0, 0, 2));
	});

	it('Abbess takes one of the cards the others discard on a 7', () => {
		let g = started(['abbess', null, null], 3);
		g.players[1].resources = hand(4, 4, 0, 0, 0);
		g.players[2].resources = hand(0, 0, 4, 4, 0);
		g.players[0].resources = hand();
		const r = rollTo(g, 7);
		if (!r.ok) throw new Error();
		let s = r.state;
		s = act(s, 1, { type: 'discard', resources: { wood: 4 } });
		expect(s.players[0].resources).toEqual(hand());
		s = act(s, 2, { type: 'discard', resources: { sheep: 4 } });
		const got = s.players[0].resources;
		expect(got.wood + got.sheep).toBe(1);
		expect(s.step).toBe('moveRobber');
	});

	it('Jester takes a card of choice when a turn starts alone in last place', () => {
		const g = started([null, 'jester']);
		const trial = structuredClone(g);
		trial.board = g.board;
		trial.step = 'main';
		trial.current = 0;
		// Everyone else has more points.
		const extra = trial.buildings.findIndex((b) => b?.owner === 0);
		trial.buildings[extra] = { owner: 0, kind: 'city' };
		const r = act(trial, 0, { type: 'endTurn' });
		expect(r.picks[1]).toEqual(['jester']);
		const tied = structuredClone(g);
		tied.board = g.board;
		tied.step = 'main';
		tied.current = 0;
		expect(act(tied, 0, { type: 'endTurn' }).picks[1]).toBeUndefined();
	});

	it('bots finish games with every character, and no card is made or lost', () => {
		const groups: CharacterId[][] = [];
		for (let i = 0; i < CHARACTERS.length; i += 4) groups.push(CHARACTERS.slice(i, i + 4) as CharacterId[]);
		groups.push(['witch', 'baron', 'rogue', 'abbess'], ['seer', 'jester', 'bard', 'alchemist']);
		groups.forEach((chars, k) => {
			for (let seed = 1; seed <= 3; seed++) {
				let s = createGame(players(chars), seed * 977 + k, undefined, extended());
				s = playOut(s);
				expect(s.phase, `${chars.join(',')} seed ${seed}`).toBe('ended');
				for (const r of RESOURCES) {
					expect(s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0)).toBe(BANK_PER_RESOURCE);
				}
			}
		});
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

describe('seven and eight players', () => {
	it('finish 8-player games on a big custom island with the biggest bank and deck', () => {
		const tiles = hexesInRadius(5).map((h) => ({ ...h, terrain: null }));
		for (let seed = 1; seed <= 3; seed++) {
			let s = createGame(players(CHARACTERS.slice()), seed * 31, undefined, {
				mode: 'extended',
				map: { custom: { name: 'Vast', tiles } },
				pointsToWin: 13
			});
			expect(s.board.hexes).toHaveLength(91);
			expect(s.devDeck).toHaveLength(43);
			s = playOut(s, 60000);
			expect(s.phase, `seed ${seed}`).toBe('ended');
			expect(totalPoints(s, s.winner!)).toBeGreaterThanOrEqual(13);
			for (const r of RESOURCES) {
				expect(s.bank[r] + s.players.reduce((k, p) => k + p.resources[r], 0)).toBe(BANK_PER_RESOURCE_HUGE);
			}
		}
	}, 60_000);
});

describe('random islands at their biggest goal', () => {
	for (const shape of RANDOM_SHAPES)
		it(`finishes ${shape} games played to the most points the island allows`, () => {
			for (const [tiles, n, seed] of [
				[24, 2, 1],
				[40, 4, 2],
				[60, 6, 3]
			]) {
				const custom = randomMap({ tiles, shape, lakes: seed % 2 === 1, seed });
				const goal = maxPointsFor(tiles, n);
				const chars = CHARACTERS.slice(0, n) as CharacterId[];
				let s = createGame(players(chars), seed * 53, undefined, { mode: 'extended', map: { custom }, pointsToWin: goal });
				s = playOut(s, 80000);
				expect(s.phase, `${shape} ${tiles} tiles, ${n} players to ${goal}`).toBe('ended');
				expect(totalPoints(s, s.winner!)).toBeGreaterThanOrEqual(goal);
			}
		});
});

describe('character draft', () => {
	it('drafts in reverse settlement order, then plays out', () => {
		for (let seed = 1; seed <= 3; seed++) {
			const n = 3 + seed;
			let s = createGame(players(Array(n).fill(null)), seed * 71, undefined, {
				...extended('realm'),
				characters: true,
				leftOut: ['merchant']
			});
			expect(s.phase).toBe('draft');
			expect(s.draft!.order).toEqual([...Array(n).keys()].reverse());
			expect(s.draft!.pool).not.toContain('merchant');
			expect(applyAction(s, s.current, { type: 'placeSettlement', vertex: 0 }).ok).toBe(false);
			expect(applyAction(s, s.current, { type: 'pickCharacter', character: 'merchant' }).ok).toBe(false);
			expect(applyAction(s, (s.current + 1) % n, { type: 'pickCharacter', character: 'mason' }).ok).toBe(false);
			s = act(s, s.current, { type: 'pickCharacter', character: 'veteran' });
			expect(s.players[n - 1].character).toBe('veteran');
			expect(s.players[n - 1].knightsPlayed).toBe(1);
			expect(applyAction(s, s.current, { type: 'pickCharacter', character: 'veteran' }).ok).toBe(false);
			s = playOut(s);
			expect(s.phase).toBe('ended');
			expect(new Set(s.players.map((p) => p.character)).size).toBe(n);
		}
	});

	it('skips the draft when characters are off', () => {
		const s = createGame(players([null, null]), 5, undefined, { ...extended(), characters: false });
		expect(s.phase).toBe('setup');
		expect(s.draft).toBeNull();
	});
});

describe('hand limit', () => {
	it('lets the host change the hand limit on a 7, and the Steward holds three more', () => {
		expect(createGame(players([null, null]), 1).handLimit).toBe(7);
		expect(createGame(players([null, null]), 1, undefined, { mode: 'classic', handLimit: 12 } as never).handLimit).toBe(7);
		let g = createGame(players(['steward', null, null]), 3, undefined, { ...extended(), handLimit: 4 });
		expect(g.handLimit).toBe(4);
		expect(discardLimit(g, 0)).toBe(7);
		expect(discardLimit(g, 1)).toBe(4);
		expect(traitText('steward', 4)).toContain('more than 7 cards');
		expect(traitText('steward', 10)).toContain('more than 13 cards');
		while (g.phase === 'setup') g = act(g, g.current, botAction(g, g.current)!);
		for (let tries = 0; tries < 400; tries++) {
			const trial = structuredClone(g);
			trial.board = g.board;
			// Steward with 7 cards keeps them; 5 cards is one too many for everyone else.
			trial.players[0].resources = { wood: 2, brick: 2, sheep: 1, wheat: 1, ore: 1 };
			trial.players[1].resources = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 };
			trial.players[2].resources = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 };
			trial.rng = tries * 7919;
			const r = applyAction(trial, trial.current, { type: 'rollDice' });
			if (!r.ok || r.state.dice![0] + r.state.dice![1] !== 7) continue;
			expect(r.state.pendingDiscards[0]).toBeUndefined();
			expect(r.state.pendingDiscards[1]).toBe(2);
			expect(r.state.pendingDiscards[2]).toBeUndefined();
			return;
		}
		throw new Error('never rolled a 7');
	});
});
