import { describe, expect, it } from 'vitest';
import { applyConquestCheat, type ConquestCheat } from '../src/shared/conquest/cheats';
import { OMENS } from '../src/shared/conquest/omens';
import { attackTargets } from '../src/shared/conquest/queries';
import { applyConquest, createConquest } from '../src/shared/conquest/rules';
import { DEFAULT_CONQUEST_SETTINGS, type ConquestSettings, type CqEvent, type CqState } from '../src/shared/conquest/types';
import { PLAYER_COLORS } from '../src/shared/rules/config';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: PLAYER_COLORS[i], isBot: false }));
const game = (o: Partial<ConquestSettings> = {}) => createConquest(seats(3), 7, { ...DEFAULT_CONQUEST_SETTINGS, warlords: false, ...o });

function cheat(s: CqState, by: number, c: ConquestCheat): CqState {
	const r = applyConquestCheat(s, by, c);
	if (!r.ok) throw new Error(`${c.type}: ${r.error}`);
	return r.state;
}
function error(s: CqState, by: number, c: ConquestCheat): string {
	const r = applyConquestCheat(s, by, c);
	if (r.ok) throw new Error(`${c.type} should have failed`);
	return r.error;
}
const lines = (s: CqState) => s.log.filter((e): e is Extract<CqEvent, { type: 'cheat' }> => e.type === 'cheat').map((e) => e.text);

/** Into the war: every starting army down, player 0's turn, attacking. */
function atWar(o: Partial<ConquestSettings> = {}): CqState {
	let s = cheat(game(o), 0, { type: 'finishDeploy' });
	const placed = s.reserve[0];
	const mine = s.owner.indexOf(0);
	if (placed) s = applyOk(s, 0, mine, placed);
	return s;
}
function applyOk(s: CqState, p: number, t: number, n: number): CqState {
	const r = applyConquest(s, p, { type: 'place', territory: t, count: n });
	if (!r.ok) throw new Error(r.error);
	return r.state;
}

describe('Conquest dev cheats', () => {
	it('finish the deployment the way bots would, and begin the first turn', () => {
		const s = cheat(game(), 1, { type: 'finishDeploy' });
		expect(s.phase).toBe('play');
		expect(s.turn).toBe(1);
		expect(s.armies.every((a) => a >= 1)).toBe(true);
		expect(lines(s)).toEqual(['finished the deployment']);
		expect(error(s, 1, { type: 'finishDeploy' })).toBe('Deployment is already over.');
	});

	it('put armies on any territory, and leave a line in the chronicle', () => {
		const s0 = game();
		const t = s0.owner.indexOf(2);
		const s = cheat(s0, 0, { type: 'armies', territory: t, count: 5 });
		expect(s.armies[t]).toBe(s0.armies[t] + 5);
		expect(s.version).toBe(s0.version + 1);
		expect(lines(s)[0]).toMatch(/^put 5 more armies on /);
		expect(error(s0, 0, { type: 'armies', territory: 999, count: 1 })).toBe('Pick a territory.');
		expect(error(s0, 0, { type: 'armies', territory: t, count: 0 })).toBe('Add 1 to 99 armies.');
	});

	it('hand out cards, from the deck while it has the kind', () => {
		const s0 = game();
		const s = cheat(s0, 0, { type: 'card', player: 1, symbol: 'catapult' });
		expect(s.players[1].cards.map((c) => c.symbol)).toEqual(['catapult']);
		expect(s.deck.length).toBe(s0.deck.length - 1);
		expect(lines(s)).toEqual(['gave P1 a catapult card']);
		// Every card's id stays its own, wild cards out of thin air too.
		let w = s;
		for (let i = 0; i < 4; i++) w = cheat(w, 0, { type: 'card', player: 0, symbol: 'wild' });
		const ids = [...w.deck, ...w.discard, ...w.players.flatMap((p) => p.cards)].map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(error(game({ cards: 'none' }), 0, { type: 'card', player: 0, symbol: 'knight' })).toBe('This game has no cards.');
	});

	it('rig the next battle for either side, however many dice are thrown', () => {
		for (const side of ['attacker', 'defender'] as const)
			for (const dice of [1, 2, 3]) {
				const s = atWar();
				// Player 0 attacks from a territory with armies enough, at a neighbour of someone else's.
				const from = s.owner.findIndex((o, t) => o === 0 && attackTargets(s, t).length > 0);
				const to = attackTargets(s, from)[0];
				s.armies[from] = 10;
				s.armies[to] = 5;
				const rigged = cheat(s, 0, { type: 'rigBattle', side });
				const r = applyConquest(rigged, 0, { type: 'attack', from, to, dice });
				if (!r.ok) throw new Error(r.error);
				const b = r.events.find((e) => e.type === 'battle');
				if (b?.type !== 'battle') throw new Error('no battle');
				if (side === 'attacker') expect(b.attackerLoss).toBe(0);
				else expect(b.defenderLoss).toBe(0);
			}
	});

	it('draw the omen asked for, now', () => {
		const s0 = atWar({ omens: 'wild' });
		const s = cheat(s0, 0, { type: 'omen', omen: 'dragon' });
		expect(s.omens?.current).toBe('dragon');
		expect(s.log.some((e) => e.type === 'omen' && e.omen === 'dragon')).toBe(true);
		expect(s.omens!.deck.filter((o) => o === 'dragon').length).toBeLessThanOrEqual(s0.omens!.deck.filter((o) => o === 'dragon').length);
		expect(error(atWar({ omens: 'off' }), 0, { type: 'omen', omen: OMENS[0] })).toBe('This game has no omens.');
		expect(error(game({ omens: 'wild' }), 0, { type: 'omen', omen: OMENS[0] })).toBe('Omens come once the war has begun.');
	});

	it('end the war in a player’s favour', () => {
		const s = cheat(atWar(), 0, { type: 'win', player: 2 });
		expect(s.phase).toBe('ended');
		expect(s.winner).toBe(2);
		expect(s.log.at(-1)).toMatchObject({ type: 'gameOver', winner: 2 });
		expect(lines(s)).toContain('made P2 win');
		expect(error(s, 0, { type: 'fastBots', on: true })).toBe('The game is over.');
	});

	it('only note fast bots in the chronicle (the room makes them fast)', () => {
		const s0 = game();
		const s = cheat(s0, 0, { type: 'fastBots', on: true });
		expect(lines(s)).toEqual(['made the bots play fast']);
		expect(s.armies).toEqual(s0.armies);
	});
});
