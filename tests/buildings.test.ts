import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { Room } from '../src/server/room';
import { getTopology } from '../src/shared/board/topology';
import type { ServerMessage } from '../src/shared/protocol';
import { botAction } from '../src/shared/rules/bot';
import { WORKSHOP_LIMIT, allBuildings, cleanBuildingRules } from '../src/shared/rules/buildings';
import { BANK_PER_RESOURCE, COSTS, RESOURCES, TERRAIN_RESOURCE } from '../src/shared/rules/config';
import { applyAction, createGame } from '../src/shared/rules/engine';
import type { GameSettings } from '../src/shared/rules/modes';
import { workshopSpots } from '../src/shared/rules/queries';
import type { Action, GameState } from '../src/shared/rules/types';
import { viewFor } from '../src/shared/rules/view';

const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
const players = (n: number) => COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));
// Characters off, so games go straight to setup instead of drafting first.
const extended = (more: Partial<GameSettings> = {}): Partial<GameSettings> => ({ mode: 'extended', map: { preset: 'great' }, characters: false, ...more });
const RICH = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };

function act(s: GameState, p: number, a: Action): GameState {
	const r = applyAction(s, p, a);
	if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
	return r.state;
}

function error(s: GameState, p: number, a: Action): string | undefined {
	const r = applyAction(s, p, a);
	return r.ok ? undefined : r.error;
}

/** A game past its setup, in the current player's main step, with cards to spend. */
function midGame(settings: Partial<GameSettings>, seed = 7): GameState {
	let s = createGame(players(3), seed, undefined, settings);
	while (s.phase === 'setup') s = act(s, s.current, botAction(s, s.current)!);
	s = structuredClone(s);
	s.step = 'main';
	s.players[s.current].resources = { ...RICH };
	for (const r of RESOURCES) s.bank[r] = BANK_PER_RESOURCE - s.players.reduce((n, p) => n + p.resources[r], 0);
	return s;
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

describe('host switches for the Reign Extended buildings', () => {
	it('Classic has none of them, whatever the settings say', () => {
		const s = midGame({ mode: 'classic', buildings: allBuildings() });
		expect(s.buildingRules).toEqual(allBuildings(false));
		expect(workshopSpots(s, s.current)).toEqual([]);
		const h = s.board.hexes.findIndex((hx) => hx.terrain !== 'desert');
		expect(error(s, s.current, { type: 'buildWorkshop', hex: h })).toBe('Workshops are not part of this game.');
	});

	it('Reign Extended plays them all unless the host turns one off', () => {
		expect(createGame(players(2), 1, undefined, extended()).buildingRules).toEqual(allBuildings());
		const s = midGame(extended({ buildings: { ...allBuildings(), workshop: false } }));
		expect(s.buildingRules.workshop).toBe(false);
		expect(workshopSpots(s, s.current)).toEqual([]);
		expect(error(s, s.current, { type: 'buildWorkshop', hex: 0 })).toBe('Workshops are not part of this game.');
	});

	it('cleans up switches from the lobby', () => {
		expect(cleanBuildingRules({ workshop: false, palace: true })).toEqual({ ...allBuildings(), workshop: false });
		expect(cleanBuildingRules({ workshop: 'yes' })).toEqual(allBuildings());
		expect(cleanBuildingRules(undefined)).toEqual(allBuildings());
		expect(cleanBuildingRules(null)).toEqual(allBuildings());
	});
});

describe('workshops', () => {
	it('go on a producing tile beside your building, one per tile, three at most, for their cost', () => {
		let s = midGame(extended());
		const p = s.current;
		const spots = workshopSpots(s, p);
		expect(spots.length).toBeGreaterThan(0);
		const topo = getTopology(s.board);
		for (const h of spots) {
			expect(TERRAIN_RESOURCE[s.board.hexes[h].terrain]).toBeTruthy();
			expect(topo.hexes[h].vertices.some((v) => s.buildings[v]?.owner === p)).toBe(true);
		}
		const notMine = s.board.hexes.findIndex(
			(hx, h) => TERRAIN_RESOURCE[hx.terrain] && !topo.hexes[h].vertices.some((v) => s.buildings[v]?.owner === p)
		);
		expect(error(s, p, { type: 'buildWorkshop', hex: notMine })).toBe('Build it on a tile beside one of your settlements or cities.');
		const desert = s.board.hexes.findIndex((hx) => hx.terrain === 'desert');
		expect(error(s, p, { type: 'buildWorkshop', hex: desert })).toBe('Workshops go on tiles that produce something.');
		expect(error(s, p, { type: 'buildWorkshop', hex: 1.5 })).toBe('Pick a tile on the island.');
		expect(error(s, (p + 1) % 3, { type: 'buildWorkshop', hex: spots[0] })).toBe("It's not your turn.");

		const before = { ...s.players[p].resources };
		const bank = { ...s.bank };
		s = act(s, p, { type: 'buildWorkshop', hex: spots[0] });
		expect(s.workshops[spots[0]]).toBe(p);
		for (const r of RESOURCES) {
			const cost = COSTS.workshop[r] ?? 0;
			expect(s.players[p].resources[r]).toBe(before[r] - cost);
			expect(s.bank[r]).toBe(bank[r] + cost);
		}
		expect(s.log.at(-1)).toMatchObject({ type: 'built', player: p, kind: 'workshop', at: spots[0] });
		expect(error(s, p, { type: 'buildWorkshop', hex: spots[0] })).toBe('That tile already has a workshop.');
		expect(workshopSpots(s, p)).not.toContain(spots[0]);

		// Up to the limit (this seed's player has room for more than that).
		const more = workshopSpots(s, p);
		expect(more.length).toBeGreaterThanOrEqual(WORKSHOP_LIMIT);
		for (const h of more.slice(0, WORKSHOP_LIMIT - 1)) s = act(s, p, { type: 'buildWorkshop', hex: h });
		expect(s.workshops.filter((o) => o === p)).toHaveLength(WORKSHOP_LIMIT);
		expect(workshopSpots(s, p)).toEqual([]);
		expect(error(s, p, { type: 'buildWorkshop', hex: more[WORKSHOP_LIMIT - 1] })).toBe('You can build at most 3 workshops.');
	});

	it("can't be built without the cards or before the roll", () => {
		const s = midGame(extended());
		const h = workshopSpots(s, s.current)[0];
		const poor = structuredClone(s);
		// A Lumber, a Brick and an Ore: two of them aren't enough.
		expect(COSTS.workshop).toEqual({ wood: 1, brick: 1, ore: 1 });
		poor.players[poor.current].resources = { wood: 1, brick: 1, sheep: 2, wheat: 2, ore: 0 };
		expect(error(poor, poor.current, { type: 'buildWorkshop', hex: h })).toBe("You don't have enough resources.");
		const early = structuredClone(s);
		early.step = 'roll';
		expect(error(early, early.current, { type: 'buildWorkshop', hex: h })).toBe('Roll the dice first.');
	});

	it('pays its owner one more card when the tile produces, but not under the robber', () => {
		const s = midGame(extended());
		const p = s.current;
		const h = workshopSpots(s, p).find((x) => s.board.hexes[x].number !== null)!;
		const res = TERRAIN_RESOURCE[s.board.hexes[h].terrain]!;
		const withShop = act(s, p, { type: 'buildWorkshop', hex: h });
		// Find a roll of the tile's number, then play it with and without the workshop.
		const rolled = (state: GameState, rng: number) => {
			const t = structuredClone(state);
			t.board = state.board;
			t.step = 'roll';
			t.rng = rng;
			return applyAction(t, p, { type: 'rollDice' });
		};
		let seed = 0;
		for (; seed < 2000; seed++) {
			const r = rolled(withShop, seed * 7919);
			if (r.ok && r.state.dice![0] + r.state.dice![1] === s.board.hexes[h].number) break;
		}
		expect(seed).toBeLessThan(2000);
		const without = structuredClone(withShop);
		without.board = withShop.board;
		without.workshops[h] = null;
		const a = rolled(withShop, seed * 7919);
		const b = rolled(without, seed * 7919);
		if (!a.ok || !b.ok) throw new Error('roll failed');
		expect(a.state.players[p].resources[res] - b.state.players[p].resources[res]).toBe(1);
		const produced = a.events.find((e) => e.type === 'produced');
		expect(produced && produced.type === 'produced' && produced.gains.some((g) => g.workshop && g.hex === h && g.player === p)).toBe(true);

		const robbed = structuredClone(withShop);
		robbed.board = withShop.board;
		robbed.robberHex = h;
		const c = rolled(robbed, seed * 7919);
		if (!c.ok) throw new Error('roll failed');
		const gains = c.events.flatMap((e) => (e.type === 'produced' ? e.gains : []));
		expect(gains.some((g) => g.hex === h)).toBe(false);
	});

	it('show up in every player view', () => {
		const s = act(midGame(extended()), 0, { type: 'endTurn' });
		const view = viewFor(s, 1);
		expect(view.buildingRules).toEqual(allBuildings());
		expect(view.workshops).toEqual(s.workshops);
	});
});

describe('bots and workshops', () => {
	it('build workshops in Reign Extended and still finish their games', () => {
		let built = 0;
		for (let seed = 1; seed <= 6; seed++) {
			const s = playOut(createGame(players(seed % 2 ? 3 : 4), seed * 211, undefined, extended()));
			expect(s.phase, `seed ${seed}`).toBe('ended');
			for (const r of RESOURCES) {
				expect(s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0)).toBe(BANK_PER_RESOURCE);
			}
			const topo = getTopology(s.board);
			s.workshops.forEach((owner, h) => {
				if (owner === null) return;
				built++;
				expect(TERRAIN_RESOURCE[s.board.hexes[h].terrain]).toBeTruthy();
				expect(topo.hexes[h].vertices.some((v) => s.buildings[v]?.owner === owner)).toBe(true);
			});
			for (let p = 0; p < s.players.length; p++) expect(s.workshops.filter((o) => o === p).length).toBeLessThanOrEqual(WORKSHOP_LIMIT);
		}
		expect(built).toBeGreaterThan(0);
	});

	it('leave them alone when the host turned them off, and in Classic', () => {
		for (const settings of [extended({ buildings: { ...allBuildings(), workshop: false } }), { mode: 'classic' as const }]) {
			const s = playOut(createGame(players(3), 99, undefined, settings));
			expect(s.phase).toBe('ended');
			expect(s.workshops.every((o) => o === null)).toBe(true);
		}
	});
});

describe('the lobby switch', () => {
	afterEach(() => vi.useRealTimers());

	function fakeSocket() {
		const sent: ServerMessage[] = [];
		const ws = { readyState: 1, OPEN: 1, send: (data: string) => sent.push(JSON.parse(data)) };
		return { ws: ws as unknown as WebSocket, sent };
	}

	it('lets only the host turn a building off, asks guests to ready again, and plays it', () => {
		vi.useFakeTimers();
		const room = new Room('BUILD');
		const a = fakeSocket();
		const b = fakeSocket();
		const host = room.join(a.ws, 'Ada');
		const guest = room.join(b.ws, 'Bram');
		if (typeof host === 'string' || typeof guest === 'string') throw new Error('join failed');
		room.handle(host, { t: 'setMode', mode: 'extended' }, a.ws);
		expect(room.lobbyInfo().settings.buildings).toEqual(allBuildings());
		room.handle(guest, { t: 'setBuilding', building: 'workshop', on: false }, b.ws);
		expect(room.lobbyInfo().settings.buildings.workshop).toBe(true);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'setBuilding', building: 'castle' as 'workshop', on: false }, a.ws);
		expect(room.lobbyInfo().settings.buildings).toEqual(allBuildings());
		expect(guest.ready).toBe(true);
		room.handle(host, { t: 'setBuilding', building: 'workshop', on: false }, a.ws);
		expect(room.lobbyInfo().settings.buildings.workshop).toBe(false);
		expect(guest.ready).toBe(false);
		room.handle(guest, { t: 'setReady', ready: true }, b.ws);
		room.handle(host, { t: 'start' }, a.ws);
		expect(room.game!.buildingRules.workshop).toBe(false);
		// Locked while the game runs.
		room.handle(host, { t: 'setBuilding', building: 'workshop', on: true }, a.ws);
		expect(room.lobbyInfo().settings.buildings.workshop).toBe(false);
		room.dispose();
	});
});
