import { describe, expect, it } from 'vitest';
import { getTopology } from '../src/shared/board/topology';
import { botAction } from '../src/shared/rules/bot';
import { BLESSINGS, CHARACTERS, HEX_ROLLS, TITHE_CAP, type CharacterId } from '../src/shared/rules/characters';
import { BANK_PER_RESOURCE, RESOURCES, TERRAIN_RESOURCE, totalResources } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import type { GameSettings } from '../src/shared/rules/modes';
import { canPlaceSettlement, isVertexFree, powerReady, powerWait, roadSpots, rollIncome } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (chars: (CharacterId | null)[]) =>
	chars.map((character, i) => ({ name: `P${i}`, color: COLORS[i], isBot: true, character }));
const extended = (more: Partial<GameSettings> = {}): Partial<GameSettings> => ({ mode: 'extended', map: { preset: 'great' }, ...more });
const hand = (wood = 0, brick = 0, sheep = 0, wheat = 0, ore = 0) => ({ wood, brick, sheep, wheat, ore });

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

/**
 * A game past setup with these characters, player 0 to move after the roll (or before it), with
 * every hand emptied and the bank refilled so tests can set hands as they like.
 */
function ready(chars: (CharacterId | null)[], step: 'roll' | 'main' = 'main', more: Partial<GameSettings> = {}, seed = 21): GameState {
	let g = createGame(players(chars), seed, undefined, extended(more));
	while (g.phase === 'setup') g = act(g, g.current, botAction(g, g.current)!);
	const s = structuredClone(g);
	s.board = g.board;
	s.current = 0;
	s.step = step;
	s.dice = step === 'main' ? [3, 3] : null;
	for (const p of s.players) p.resources = hand();
	for (const r of RESOURCES) s.bank[r] = BANK_PER_RESOURCE;
	return s;
}

/** Copy of `g` whose next roll comes out `total` (found by trying seeds). */
function rigged(g: GameState, total: number, action: Action = { type: 'rollDice' }): GameState {
	for (let tries = 0; tries < 3000; tries++) {
		const trial = structuredClone(g);
		trial.board = g.board;
		trial.rng = tries * 7919 + 1;
		const r = applyAction(trial, trial.current, action);
		if (r.ok && r.state.dice && r.state.dice[0] + r.state.dice[1] === total) return r.state;
	}
	throw new Error(`never rolled ${total}`);
}

const cards = (s: GameState) => RESOURCES.reduce((n, r) => n + s.bank[r] + s.players.reduce((m, p) => m + p.resources[r], 0), 0);
const myTiles = (s: GameState, p: number) => {
	const topo = getTopology(s.board);
	return s.board.hexes.map((_, h) => h).filter((h) => topo.hexes[h].vertices.some((v) => s.buildings[v]?.owner === p));
};

describe('character powers: the rules around them', () => {
	it('are off in Classic and when the host picks traits only', () => {
		const classic = createGame(players(['scholar', null]), 3);
		expect(classic.powers).toBe(false);
		const off = ready(['scholar', null], 'main', { powers: false });
		expect(applyAction(off, 0, { type: 'usePower' }).ok).toBe(false);
		expect(powerWait(off, 0)).toBeNull();
	});

	it('go off once per game by default, or again after the rounds the host set', () => {
		const g = ready(['scholar', null]);
		const used = act(g, 0, { type: 'usePower' });
		expect(powerReady(used, 0)).toBe(false);
		expect(applyAction(used, 0, { type: 'usePower' }).ok).toBe(false);

		const r = ready(['scholar', null], 'main', { powerRecharge: 4 });
		let s = act(r, 0, { type: 'usePower' });
		expect(powerWait(s, 0)).toBe(8);
		s = structuredClone(s);
		s.turn += 8;
		expect(powerReady(s, 0)).toBe(true);
	});

	it("only on your own turn, and at the step the power says", () => {
		const g = ready(['bard', 'seer']);
		expect(applyAction(g, 1, { type: 'usePower' }).ok).toBe(false);
		const before = ready(['bard', 'seer'], 'roll');
		const early = applyAction(before, 0, { type: 'usePower' });
		expect(!early.ok && early.error).toMatch(/Roll the dice first/);
		const seer = ready(['seer', null]);
		expect(applyAction(seer, 0, { type: 'usePower' }).ok).toBe(false);
	});

	it('show on everyone\'s plaque through the view', () => {
		const s = act(ready(['scholar', null]), 0, { type: 'usePower' });
		const v = viewFor(s, 1);
		expect(v.players[0].powerUsed).toBe(s.turn);
		expect(v.powers).toBe(true);
		// The Scholar's free card stays secret like any other.
		const bought = v.log.find((e) => e.type === 'devCardBought');
		expect(bought && 'card' in bought && bought.card).toBeNull();
	});
});

describe('character powers: what each does', () => {
	it("Merchant's Market Day trades up to 4 cards 1:1 with the bank", () => {
		const g = ready(['merchant', null]);
		g.players[0].resources = hand(3, 0, 2);
		expect(applyAction(g, 0, { type: 'usePower', give: { wood: 3, sheep: 2 }, get: { ore: 5 } }).ok).toBe(false);
		const s = act(g, 0, { type: 'usePower', give: { wood: 2, sheep: 2 }, get: { ore: 3, wheat: 1 } });
		expect(s.players[0].resources).toEqual(hand(1, 0, 0, 1, 3));
		expect(cards(s)).toBe(cards(g));
	});

	it("Mason's Master Builder makes a city for a single Ore", () => {
		const g = ready(['mason', null]);
		g.players[0].resources = hand(0, 0, 0, 0, 1);
		const v = g.buildings.findIndex((b) => b?.owner === 0);
		const s = act(g, 0, { type: 'usePower', vertex: v });
		expect(s.buildings[v]).toEqual({ owner: 0, kind: 'city' });
		expect(s.players[0].resources.ore).toBe(0);
		expect(s.players[0].piecesLeft.city).toBe(g.players[0].piecesLeft.city - 1);
	});

	it("Scholar's Eureka draws a card she can play the same turn", () => {
		const g = ready(['scholar', null]);
		g.devDeck.push('knight');
		const s = act(g, 0, { type: 'usePower' });
		expect(s.players[0].devCards).toEqual([{ type: 'knight', boughtTurn: s.turn - 1 }]);
		const k = act(s, 0, { type: 'playKnight' });
		expect(k.step).toBe('moveRobber');
	});

	it("Veteran's Call to Arms is a Knight on top of the turn's card", () => {
		const g = ready(['veteran', null], 'roll');
		const s = act(g, 0, { type: 'usePower' });
		expect(s.players[0].knightsPlayed).toBe(g.players[0].knightsPlayed + 1);
		expect(s.step).toBe('moveRobber');
		expect(s.resumeStep).toBe('roll');
		expect(s.devCardPlayedThisTurn).toBe(false);
	});

	it("Rogue's Pickpocket steals 2, and the Witch's purse turns it around", () => {
		const g = ready(['rogue', null, 'witch']);
		g.players[0].resources = hand(3);
		g.players[1].resources = hand(0, 4);
		const s = act(g, 0, { type: 'usePower', target: 1 });
		expect(s.players[0].resources).toEqual(hand(3, 2));
		const w = structuredClone(g);
		w.board = g.board;
		w.players[2].resources = hand(0, 0, 1);
		const t = act(w, 0, { type: 'usePower', target: 2 });
		expect(t.players[0].resources).toEqual(hand(1));
		expect(t.players[2].resources).toEqual(hand(2, 0, 1));
	});

	it("Steward's Tithe pays his tiles with the named number, up to 3 cards", () => {
		const g = ready(['steward', null]);
		const numbers = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
		const n = numbers.find((x) => totalResources({ ...hand(), ...rollIncome(g, 0, x) }) > 0)!;
		const expected = Math.min(TITHE_CAP, totalResources({ ...hand(), ...rollIncome(g, 0, n) }));
		const s = act(g, 0, { type: 'usePower', number: n });
		expect(totalResources(s.players[0].resources)).toBe(expected);
		expect(totalResources(s.players[1].resources)).toBe(0);
		expect(applyAction(g, 0, { type: 'usePower', number: 7 }).ok).toBe(false);
	});

	it("Shepherd's Drive Off sends the robber home and robs whoever moved it", () => {
		const g = ready(['shepherd', null]);
		const away = g.board.hexes.findIndex((_, h) => h !== g.robberHome);
		g.robberHex = away;
		g.robberMover = 1;
		g.players[1].resources = hand(0, 0, 0, 2);
		const s = act(g, 0, { type: 'usePower' });
		expect(s.robberHex).toBe(g.robberHome);
		expect(s.players[0].resources).toEqual(hand(0, 0, 0, 1));
		expect(applyAction(ready(['shepherd', null]), 0, { type: 'usePower' }).ok).toBe(false);
	});

	it("Explorer's Pathfinder builds 2 roads for free", () => {
		const g = ready(['explorer', null]);
		let s = act(g, 0, { type: 'usePower' });
		expect(s.step).toBe('roadBuilding');
		expect(s.roadBuildingLeft).toBe(2);
		s = act(s, 0, { type: 'placeRoad', edge: roadSpots(s, 0)[0] });
		s = act(s, 0, { type: 'placeRoad', edge: roadSpots(s, 0)[0] });
		expect(s.step).toBe('main');
		expect(s.players[0].piecesLeft.road).toBe(g.players[0].piecesLeft.road - 2);
	});

	it("Seer's Foresight rolls three times and keeps one", () => {
		const g = ready(['seer', null], 'roll');
		let s = act(g, 0, { type: 'usePower' });
		expect(s.step).toBe('chooseRoll');
		expect(s.rollChoices).toHaveLength(3);
		expect(applyAction(s, 0, { type: 'rollDice' }).ok).toBe(false);
		expect(applyAction(s, 0, { type: 'endTurn' }).ok).toBe(false);
		const pick = s.rollChoices![1];
		s = act(s, 0, { type: 'keepRoll', index: 1 });
		expect(s.dice).toEqual(pick);
		expect(s.rollChoices).toBeNull();
		expect(['main', 'discard', 'moveRobber']).toContain(s.step);
	});

	it("Alchemist's Transmute Land changes a tile for good, on a new board", () => {
		const g = ready(['alchemist', null]);
		const h = g.board.hexes.findIndex((x) => x.terrain === 'forest');
		const s = act(g, 0, { type: 'usePower', hex: h, terrain: 'mountains' });
		expect(s.board.hexes[h].terrain).toBe('mountains');
		expect(g.board.hexes[h].terrain).toBe('forest');
		expect(getTopology(s.board)).toBe(getTopology(g.board));
		const desert = g.board.hexes.findIndex((x) => x.terrain === 'desert');
		expect(applyAction(g, 0, { type: 'usePower', hex: desert, terrain: 'forest' }).ok).toBe(false);
		expect(applyAction(g, 0, { type: 'usePower', hex: h, terrain: 'desert' }).ok).toBe(false);
	});

	it("Bard's Encore pays everyone the last roll again", () => {
		const g = ready(['bard', null]);
		const n = [6, 8, 5, 9, 4, 10].find((x) => totalResources({ ...hand(), ...rollIncome(g, 0, x) }) > 0)!;
		g.dice = [Math.min(6, n - 1), n - Math.min(6, n - 1)];
		const s = act(g, 0, { type: 'usePower' });
		expect(totalResources(s.players[0].resources)).toBe(totalResources({ ...hand(), ...rollIncome(g, 0, n) }));
		const seven = structuredClone(g);
		seven.board = g.board;
		seven.dice = [3, 4];
		expect(applyAction(seven, 0, { type: 'usePower' }).ok).toBe(false);
	});

	it("Witch's Hex: the target collects nothing from the next two rolls", () => {
		const g = ready(['witch', null]);
		let s = act(g, 0, { type: 'usePower', target: 1 });
		expect(s.hexed[1]).toBe(HEX_ROLLS);
		s = structuredClone(s);
		s.step = 'roll';
		const n = [6, 8, 5, 9, 4, 10, 3, 11].find((x) => totalResources({ ...hand(), ...rollIncome(s, 1, x) }) > 0)!;
		const r1 = rigged(s, n);
		expect(totalResources(r1.players[1].resources)).toBe(0);
		expect(r1.hexed[1]).toBe(1);
		const again = structuredClone(r1);
		again.board = r1.board;
		again.step = 'roll';
		const r2 = rigged(again, n);
		expect(totalResources(r2.players[1].resources)).toBe(0);
		expect(r2.hexed[1]).toBeUndefined();
		const free = structuredClone(r2);
		free.board = r2.board;
		free.step = 'roll';
		expect(totalResources(rigged(free, n).players[1].resources)).toBeGreaterThan(0);
	});

	it("Cartographer's Redraw swaps the numbers on two of her tiles", () => {
		const g = ready(['cartographer', null]);
		const mine = myTiles(g, 0).filter((h) => g.board.hexes[h].number !== null);
		const [a, b] = [mine[0], mine.find((h) => g.board.hexes[h].number !== g.board.hexes[mine[0]].number)!];
		const s = act(g, 0, { type: 'usePower', hex: a, hex2: b });
		expect(s.board.hexes[a].number).toBe(g.board.hexes[b].number);
		expect(s.board.hexes[b].number).toBe(g.board.hexes[a].number);
		const far = g.board.hexes.findIndex((x, h) => x.number !== null && !mine.includes(h));
		expect(applyAction(g, 0, { type: 'usePower', hex: a, hex2: far }).ok).toBe(false);
	});

	it("Baron's Land Grant keeps a corner for him alone", () => {
		const g = ready(['baron', null]);
		const v = getTopology(g.board).vertices.find((x) => isVertexFree(g, x.id))!.id;
		const s = act(g, 0, { type: 'usePower', vertex: v });
		expect(s.claims[v]).toBe(0);
		expect(canPlaceSettlement(s, 1, v, true)).toBe(false);
		expect(canPlaceSettlement(s, 0, v, true)).toBe(true);
	});

	it("Abbess's Blessing doubles a tile's pay twice", () => {
		const g = ready(['abbess', null]);
		const h = myTiles(g, 0).find((x) => g.board.hexes[x].number !== null && TERRAIN_RESOURCE[g.board.hexes[x].terrain] && x !== g.robberHex)!;
		const n = g.board.hexes[h].number!;
		let s = act(g, 0, { type: 'usePower', hex: h });
		expect(s.blessed[h]).toBe(BLESSINGS);
		s = structuredClone(s);
		s.step = 'roll';
		const plain = totalResources({ ...hand(), ...rollIncome(s, 0, n) });
		const r = rigged(s, n);
		expect(totalResources(r.players[0].resources)).toBeGreaterThan(plain);
		expect(r.blessed[h]).toBe(BLESSINGS - 1);
	});

	it("Jester's Mischief pools every hand and deals it out evenly", () => {
		const g = ready(['jester', null, null]);
		g.players[1].resources = hand(5, 2);
		g.players[2].resources = hand(0, 0, 3);
		const s = act(g, 0, { type: 'usePower' });
		const counts = s.players.map((p) => totalResources(p.resources));
		expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
		expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
		expect(cards(s)).toBe(cards(g));
	});
});

describe('character powers: bots', () => {
	it('use every power, and no card is made or lost', () => {
		const used = new Set<CharacterId>();
		const groups: CharacterId[][] = [];
		for (let i = 0; i < CHARACTERS.length; i += 4) groups.push(CHARACTERS.slice(i, i + 4) as CharacterId[]);
		groups.forEach((chars, k) => {
			for (let seed = 1; seed <= 12; seed++) {
				let s = createGame(players(chars), seed * 613 + k, undefined, extended());
				for (let steps = 0; s.phase !== 'ended' && steps < 30000; steps++) {
					let p = s.current;
					let a = null;
					for (let i = 0; i < s.players.length && !a; i++) if (i !== s.current && (a = botAction(s, i))) p = i;
					if (!a) a = botAction(s, (p = s.current), steps % 60);
					const r = applyAction(s, p, a!);
					if (!r.ok) throw new Error(`${s.players[p].character} ${a!.type}: ${r.error}`);
					for (const e of r.events) if (e.type === 'powerUsed') used.add(e.character);
					s = r.state;
				}
				expect(s.phase).toBe('ended');
				for (const r of RESOURCES) {
					expect(s.bank[r] + s.players.reduce((n, pl) => n + pl.resources[r], 0)).toBe(BANK_PER_RESOURCE);
				}
			}
		});
		expect([...used].sort()).toEqual([...CHARACTERS].sort());
	}, 60000);
});
