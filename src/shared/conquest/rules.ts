import { randomInt, shuffle } from '../rng';
import type { PlayerColor } from '../rules/config';
import {
	bestSet,
	canAttackNow,
	canEndTurnNow,
	canFortifyNow,
	conquestMap,
	fortifyTargets,
	isSet,
	majorityGoal,
	neighbors,
	reinforcementsFor,
	setValue,
	startingArmies,
	territoriesOf
} from './queries';
import type { RealmMap } from './realm';
import {
	CARD_SYMBOLS,
	CONQUEST_MAX_PLAYERS,
	DEFAULT_CONQUEST_SETTINGS,
	type ConquestCard,
	type ConquestSettings,
	type CqAction,
	type CqEvent,
	type CqResult,
	type CqState,
	type CqView
} from './types';

/** How many events the state keeps in its log; older ones are dropped. */
export const CQ_LOG_LIMIT = 80;

/** The longest chat message kept. */
const CHAT_LIMIT = 240;

export interface NewConquestPlayer {
	name: string;
	color: PlayerColor;
	isBot: boolean;
}

/**
 * The deck: one card per territory, its picture going footman, knight, catapult in turn, and two
 * wild cards.
 */
function newDeck(map: RealmMap): ConquestCard[] {
	const cards: ConquestCard[] = map.territories.map((_, i) => ({
		id: i,
		territory: i,
		symbol: CARD_SYMBOLS[i % CARD_SYMBOLS.length]
	}));
	cards.push(
		{ id: cards.length, territory: null, symbol: 'wild' },
		{ id: cards.length + 1, territory: null, symbol: 'wild' }
	);
	return cards;
}

/**
 * Start a game: the territories are dealt out one at a time in a shuffled order, one army on
 * each, and the rest of everyone's starting armies wait in their reserve. With placed deployment
 * everyone puts them down at once before the first turn; with random deployment they are spread
 * out at random and player 0 starts straight away.
 */
export function createConquest(
	players: NewConquestPlayer[],
	seed: number,
	settings: ConquestSettings = DEFAULT_CONQUEST_SETTINGS
): CqState {
	const n = players.length;
	if (n < 2 || n > CONQUEST_MAX_PLAYERS) throw new Error('Conquest seats two to six players.');
	const map = conquestMap(settings);
	const count = map.territories.length;
	const start = startingArmies(n, map);
	const s: CqState = {
		game: 'conquest',
		version: 0,
		rng: seed | 0,
		settings: { ...settings },
		players: players.map((p) => ({
			name: p.name,
			color: p.color,
			isBot: p.isBot,
			cards: [],
			out: false
		})),
		owner: new Array(count).fill(0),
		armies: new Array(count).fill(1),
		phase: 'deploy',
		step: 'reinforce',
		current: 0,
		turn: 0,
		round: 0,
		reserve: new Array(n).fill(0),
		placed: new Array(count).fill(0),
		deck: [],
		discard: [],
		trades: 0,
		conquered: false,
		occupy: null,
		mustTrade: false,
		winner: null,
		stats: {
			players: players.map(() => ({
				armies: start,
				fromCards: 0,
				captured: 0,
				lost: 0,
				killed: 0,
				fallen: 0,
				attacks: 0,
				defences: 0,
				sets: 0,
				peak: 0,
				outTurn: null,
				outBy: null
			})),
			held: players.map(() => [])
		},
		log: [],
		nextEventSeq: 1
	};
	const order = shuffle(s, [...Array(count).keys()]);
	order.forEach((t, i) => (s.owner[t] = i % n));
	s.deck = shuffle(s, newDeck(map));
	for (let p = 0; p < n; p++) {
		const held = territoriesOf(s, p).length;
		s.reserve[p] = start - held;
		s.stats.players[p].peak = held;
		s.stats.held[p].push(held);
	}
	const ctx = new Ctx(s);
	ctx.emit({ type: 'gameStarted', players: n });
	ctx.emit({ type: 'dealt', owner: [...s.owner] });
	if (settings.deploy === 'random') {
		for (let p = 0; p < n; p++) {
			const mine = territoriesOf(s, p);
			for (; s.reserve[p] > 0; s.reserve[p]--) s.armies[mine[randomInt(s, mine.length)]]++;
		}
		startPlay(ctx);
	}
	return s;
}

class RuleError extends Error {}

function fail(msg: string): never {
	throw new RuleError(msg);
}

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

class Ctx {
	events: CqEvent[] = [];
	constructor(public s: CqState) {}
	emit(e: DistributiveOmit<CqEvent, 'seq'>) {
		const ev = { ...e, seq: this.s.nextEventSeq++ } as CqEvent;
		this.events.push(ev);
		this.s.log.push(ev);
		if (this.s.log.length > CQ_LOG_LIMIT) this.s.log.splice(0, this.s.log.length - CQ_LOG_LIMIT);
	}
}

/** Validate and apply one action. Never changes the state it is given. */
export function applyConquest(state: CqState, player: number, action: CqAction): CqResult {
	if (state.phase === 'ended') return { ok: false, error: 'The game is over.' };
	const s = structuredClone(state);
	const ctx = new Ctx(s);
	try {
		dispatch(ctx, player, action);
	} catch (e) {
		if (e instanceof RuleError) return { ok: false, error: e.message };
		throw e;
	}
	s.version++;
	return { ok: true, state: s, events: ctx.events };
}

function dispatch(ctx: Ctx, p: number, a: CqAction) {
	const s = ctx.s;
	if (!Number.isInteger(p) || !s.players[p]) fail('Unknown player.');
	if (s.players[p].out) fail("You're out of the game.");
	if (!a || typeof a !== 'object') fail('Unknown action.');
	if (s.phase === 'deploy') {
		if (a.type !== 'place') fail('Place your starting armies first.');
		return place(ctx, p, a.territory, a.count);
	}
	if (p !== s.current) fail("It's not your turn.");
	switch (a.type) {
		case 'place':
			return place(ctx, p, a.territory, a.count);
		case 'trade':
			return trade(ctx, p, a.cards);
		case 'attack':
			return attack(ctx, p, a);
		case 'occupy':
			return occupy(ctx, p, a.count);
		case 'endAttack':
			checkAttackMoment(s, p);
			leaveReinforce(s);
			s.step = 'fortify';
			ctx.emit({ type: 'attackEnded', player: p });
			return;
		case 'fortify':
			return fortify(ctx, p, a.from, a.to, a.count);
		case 'endTurn':
			if (s.step === 'occupy') fail('Move armies into the territory you took first.');
			if (s.mustTrade) fail('Trade in a set of cards first.');
			if (s.reserve[p] > 0) fail('Place all your armies first.');
			if (!canEndTurnNow(s, p)) fail("You can't end your turn right now.");
			return endTurn(ctx);
		default:
			fail('Unknown action.');
	}
}

const armiesText = (n: number) => (n === 1 ? '1 army' : `${n} armies`);

function isTerritory(s: CqState, t: unknown): t is number {
	return Number.isInteger(t) && (t as number) >= 0 && (t as number) < s.owner.length;
}

/** Fail with the reason the current player can't attack (or fortify, or stop attacking) yet. */
function checkAttackMoment(s: CqState, p: number) {
	if (canAttackNow(s, p)) return;
	if (s.step === 'occupy') fail('Move armies into the territory you took first.');
	if (s.mustTrade) fail('Trade in a set of cards first.');
	if (s.step === 'reinforce') fail('Place all your armies first.');
	fail('Your attacks are over for this turn.');
}

/** Armies placed can't be taken back once the turn moves on from placing them. */
function leaveReinforce(s: CqState) {
	s.placed.fill(0);
}

function place(ctx: Ctx, p: number, t: number, count: number) {
	const s = ctx.s;
	if (s.phase === 'play' && s.step !== 'reinforce')
		fail('Armies are placed at the start of your turn.');
	if (s.mustTrade) fail('Trade in a set of cards first.');
	if (!isTerritory(s, t)) fail('Unknown territory.');
	if (s.owner[t] !== p) fail("That territory isn't yours.");
	if (!Number.isInteger(count) || count === 0) fail('Place at least one army.');
	if (count > s.reserve[p])
		fail(
			s.reserve[p]
				? `You have only ${armiesText(s.reserve[p])} to place.`
				: 'You have no armies left to place.'
		);
	if (-count > s.placed[t])
		fail(
			s.placed[t]
				? `You can take back only ${armiesText(s.placed[t])} there.`
				: 'You placed no armies there to take back.'
		);
	s.armies[t] += count;
	s.reserve[p] -= count;
	s.placed[t] += count;
	ctx.emit({ type: 'placed', player: p, territory: t, count });
	if (s.phase === 'deploy') {
		if (s.reserve[p] === 0) ctx.emit({ type: 'deployDone', player: p });
		if (s.reserve.every((r) => r === 0)) startPlay(ctx);
	}
}

/** Everyone's starting armies are down: the first turn begins, player 0's. */
function startPlay(ctx: Ctx) {
	const s = ctx.s;
	s.phase = 'play';
	s.placed.fill(0);
	s.reserve.fill(0);
	s.turn = 1;
	s.round = 1;
	beginTurn(ctx, 0);
}

function beginTurn(ctx: Ctx, p: number) {
	const s = ctx.s;
	s.current = p;
	s.step = 'reinforce';
	s.placed.fill(0);
	s.reserve.fill(0);
	s.conquered = false;
	s.occupy = null;
	const r = reinforcementsFor(s, p);
	s.reserve[p] = r.total;
	s.stats.players[p].armies += r.total;
	// Five cards or more and the player can't go on until they trade.
	s.mustTrade = s.players[p].cards.length >= 5;
	ctx.emit({ type: 'turnStarted', player: p, turn: s.turn, round: s.round });
	ctx.emit({ type: 'reinforcements', player: p, ...r });
}

function trade(ctx: Ctx, p: number, ids: number[]) {
	const s = ctx.s;
	if (s.step === 'occupy') fail('Move armies into the territory you took first.');
	if (s.step !== 'reinforce' && !s.mustTrade) fail('Cards are traded at the start of your turn.');
	if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3)
		fail('Trade three different cards.');
	const hand = s.players[p].cards;
	const cards = ids.map((id) => hand.find((c) => c.id === id));
	if (cards.some((c) => !c)) fail("You don't have those cards.");
	if (!isSet(cards as ConquestCard[]))
		fail('Those cards are not a set: three alike, one of each, or any with a wild.');
	tradeCards(ctx, p, cards as ConquestCard[]);
}

/** Trade a set in (already checked): armies to the reserve, two more on a pictured territory held. */
function tradeCards(ctx: Ctx, p: number, cards: ConquestCard[]) {
	const s = ctx.s;
	const armies = setValue(s, cards);
	const bonus =
		cards.find((c) => c.territory !== null && s.owner[c.territory] === p)?.territory ?? null;
	const ids = new Set(cards.map((c) => c.id));
	s.players[p].cards = s.players[p].cards.filter((c) => !ids.has(c.id));
	s.discard.push(...cards);
	s.trades++;
	s.reserve[p] += armies;
	if (bonus !== null) s.armies[bonus] += 2;
	const st = s.stats.players[p];
	const got = armies + (bonus === null ? 0 : 2);
	st.sets++;
	st.fromCards += got;
	st.armies += got;
	if (s.players[p].cards.length < 5) s.mustTrade = false;
	// Armies from a set are placed like any others, so a trade outside the reinforce step goes back to it.
	s.step = 'reinforce';
	ctx.emit({ type: 'cardsTraded', player: p, cards, armies, bonus });
}

/** Dice, highest first. */
function roll(s: CqState, n: number): number[] {
	const dice: number[] = [];
	for (let i = 0; i < n; i++) dice.push(randomInt(s, 6) + 1);
	return dice.sort((a, b) => b - a);
}

function attack(ctx: Ctx, p: number, a: Extract<CqAction, { type: 'attack' }>) {
	const s = ctx.s;
	checkAttackMoment(s, p);
	const { from, to } = a;
	if (!isTerritory(s, from) || !isTerritory(s, to)) fail('Unknown territory.');
	if (s.owner[from] !== p) fail('Attack from a territory of yours.');
	if (s.armies[from] < 2) fail('Attack from a territory with at least two armies.');
	if (!neighbors(from, conquestMap(s.settings)).includes(to))
		fail('You can only attack a neighbouring territory.');
	if (s.owner[to] === p) fail("You can't attack your own territory.");
	if (a.dice !== undefined && (!Number.isInteger(a.dice) || a.dice < 1 || a.dice > 3))
		fail('Roll one, two or three dice.');
	leaveReinforce(s);
	s.step = 'attack';
	let dice = 0;
	do {
		dice = Math.min(3, s.armies[from] - 1, a.blitz ? 3 : (a.dice ?? 3));
		battle(ctx, p, from, to, dice);
	} while (a.blitz && s.armies[to] > 0 && s.armies[from] >= 2);
	if (s.armies[to] === 0) capture(ctx, p, from, to, dice);
}

/** One roll of the dice: highest against highest, the defender winning ties. */
function battle(ctx: Ctx, p: number, from: number, to: number, dice: number) {
	const s = ctx.s;
	const defender = s.owner[to];
	const attackRoll = roll(s, dice);
	const defendRoll = roll(s, Math.min(2, s.armies[to]));
	let attackerLoss = 0;
	let defenderLoss = 0;
	for (let i = 0; i < Math.min(attackRoll.length, defendRoll.length); i++) {
		if (attackRoll[i] > defendRoll[i]) defenderLoss++;
		else attackerLoss++;
	}
	s.armies[from] -= attackerLoss;
	s.armies[to] -= defenderLoss;
	const a = s.stats.players[p];
	const d = s.stats.players[defender];
	a.attacks++;
	d.defences++;
	a.killed += defenderLoss;
	a.fallen += attackerLoss;
	d.killed += attackerLoss;
	d.fallen += defenderLoss;
	ctx.emit({
		type: 'battle',
		player: p,
		defender,
		from,
		to,
		attack: attackRoll,
		defend: defendRoll,
		attackerLoss,
		defenderLoss
	});
}

function capture(ctx: Ctx, p: number, from: number, to: number, dice: number) {
	const s = ctx.s;
	const defender = s.owner[to];
	s.owner[to] = p;
	s.conquered = true;
	s.stats.players[p].captured++;
	s.stats.players[defender].lost++;
	const held = territoriesOf(s, p).length;
	s.stats.players[p].peak = Math.max(s.stats.players[p].peak, held);
	ctx.emit({ type: 'captured', player: p, defender, from, to });
	if (!s.owner.includes(defender)) {
		// Knocked out: the winner takes their cards, and with six or more has to trade some in at once.
		const loser = s.players[defender];
		const cards = loser.cards;
		loser.out = true;
		loser.cards = [];
		s.players[p].cards.push(...cards);
		s.stats.players[defender].outTurn = s.turn;
		s.stats.players[defender].outBy = p;
		ctx.emit({ type: 'eliminated', player: defender, by: p, cards: cards.length });
		if (s.players[p].cards.length >= 6) s.mustTrade = true;
	}
	const max = s.armies[from] - 1;
	const min = Math.min(dice, max);
	const win = victory(s);
	if (win) {
		// Everything moves in, so the board the game ends on has no empty territory.
		moveIn(ctx, p, from, to, max);
		return gameOver(ctx, win.winner, win.reason);
	}
	if (min === max) moveIn(ctx, p, from, to, min);
	else {
		s.occupy = { from, to, min, max };
		s.step = 'occupy';
	}
}

function moveIn(ctx: Ctx, p: number, from: number, to: number, count: number) {
	const s = ctx.s;
	s.armies[from] -= count;
	s.armies[to] += count;
	s.occupy = null;
	s.step = s.mustTrade ? 'reinforce' : 'attack';
	ctx.emit({ type: 'occupied', player: p, from, to, count });
}

function occupy(ctx: Ctx, p: number, count: number) {
	const s = ctx.s;
	const o = s.occupy;
	if (s.step !== 'occupy' || !o) fail('There is no territory to move into.');
	if (!Number.isInteger(count) || count < o.min || count > o.max) {
		fail(
			o.min === o.max
				? `Move ${armiesText(o.min)} in.`
				: `Move between ${o.min} and ${o.max} armies in.`
		);
	}
	moveIn(ctx, p, o.from, o.to, count);
}

type Victory = { winner: number; reason: 'domination' | 'majority' | 'lastStanding' };

/** Whether someone has won: the whole map, two thirds of it (if that is the rule), or nobody else left. */
function victory(s: CqState): Victory | null {
	const map = conquestMap(s.settings);
	const counts = s.players.map(() => 0);
	for (const o of s.owner) counts[o]++;
	for (let p = 0; p < counts.length; p++) {
		if (counts[p] === s.owner.length) return { winner: p, reason: 'domination' };
		if (s.settings.victory === 'majority' && counts[p] >= majorityGoal(map))
			return { winner: p, reason: 'majority' };
	}
	const left = s.players.flatMap((pl, i) => (pl.out ? [] : [i]));
	if (left.length === 1) return { winner: left[0], reason: 'lastStanding' };
	return null;
}

function gameOver(ctx: Ctx, winner: number, reason: Victory['reason']) {
	const s = ctx.s;
	s.phase = 'ended';
	s.winner = winner;
	s.occupy = null;
	s.mustTrade = false;
	s.reserve.fill(0);
	s.placed.fill(0);
	recordHeld(s);
	ctx.emit({ type: 'gameOver', winner, reason });
}

/** Note everyone's territories for the end-of-game chart. */
function recordHeld(s: CqState) {
	s.players.forEach((_, p) => s.stats.held[p].push(territoriesOf(s, p).length));
}

function fortify(ctx: Ctx, p: number, from: number, to: number, count: number) {
	const s = ctx.s;
	if (!canFortifyNow(s, p)) checkAttackMoment(s, p);
	if (!isTerritory(s, from) || !isTerritory(s, to)) fail('Unknown territory.');
	if (from === to) fail('Move armies between two different territories.');
	if (s.owner[from] !== p || s.owner[to] !== p) fail('Move armies between territories of yours.');
	if (!fortifyTargets(s, from).includes(to))
		fail('Those territories are not joined through territories of yours.');
	if (!Number.isInteger(count) || count < 1 || count > s.armies[from] - 1) {
		fail(
			s.armies[from] < 2
				? 'Leave at least one army behind.'
				: `Move between 1 and ${s.armies[from] - 1} armies.`
		);
	}
	leaveReinforce(s);
	s.armies[from] -= count;
	s.armies[to] += count;
	ctx.emit({ type: 'fortified', player: p, from, to, count });
	endTurn(ctx);
}

/** The turn is over: a card for a territory taken, and the next player still in begins. */
function endTurn(ctx: Ctx) {
	const s = ctx.s;
	const p = s.current;
	if (s.conquered) drawCard(ctx, p);
	const n = s.players.length;
	let next = p;
	do next = (next + 1) % n;
	while (s.players[next].out && next !== p);
	// Going round past the end of the table ends a round.
	if (next <= p) {
		recordHeld(s);
		s.round++;
	}
	s.turn++;
	beginTurn(ctx, next);
}

function drawCard(ctx: Ctx, p: number) {
	const s = ctx.s;
	if (!s.deck.length) {
		s.deck = shuffle(s, s.discard);
		s.discard = [];
	}
	const card = s.deck.pop();
	if (!card) return;
	s.players[p].cards.push(card);
	ctx.emit({ type: 'cardDrawn', player: p, card });
}

/**
 * Spread `count` armies of p's reserve at random, over territories that face an enemy if they
 * have any.
 */
function scatter(ctx: Ctx, p: number, count: number) {
	const s = ctx.s;
	const mine = territoriesOf(s, p);
	const map = conquestMap(s.settings);
	const front = mine.filter((t) => neighbors(t, map).some((n) => s.owner[n] !== p));
	const pool = front.length ? front : mine;
	const add = new Map<number, number>();
	for (let i = 0; i < count; i++) {
		const t = pool[randomInt(s, pool.length)];
		add.set(t, (add.get(t) ?? 0) + 1);
	}
	s.reserve[p] -= count;
	for (const [t, c] of [...add].sort((a, b) => a[0] - b[0])) {
		s.armies[t] += c;
		ctx.emit({ type: 'placed', player: p, territory: t, count: c });
	}
}

/**
 * The turn clock ran out. During deployment everyone still placing has their armies spread at
 * random and the first turn begins; in a turn, only what the turn can't end without is done
 * (armies moved into a territory just taken, sets traded down below five cards, the reserve
 * placed), and the turn passes.
 */
export function timeOutConquest(state: CqState): CqState {
	if (state.phase === 'ended') return state;
	const s = structuredClone(state);
	const ctx = new Ctx(s);
	if (s.phase === 'deploy') {
		s.players.forEach((_, p) => {
			if (s.reserve[p] <= 0) return;
			ctx.emit({ type: 'turnTimedOut', player: p });
			scatter(ctx, p, s.reserve[p]);
			ctx.emit({ type: 'deployDone', player: p });
		});
		startPlay(ctx);
	} else {
		const p = s.current;
		ctx.emit({ type: 'turnTimedOut', player: p });
		if (s.occupy) moveIn(ctx, p, s.occupy.from, s.occupy.to, s.occupy.min);
		// Each trade takes three cards, so this ends.
		while (s.mustTrade) {
			const set = bestSet(s.players[p].cards, s, p);
			if (!set) {
				s.mustTrade = false;
				break;
			}
			tradeCards(ctx, p, set.cards);
		}
		if (s.reserve[p] > 0) scatter(ctx, p, s.reserve[p]);
		endTurn(ctx);
	}
	s.version++;
	return s;
}

/** Chat goes through the log so it survives reconnects. */
export function addConquestChat(state: CqState, player: number, text: string): CqState {
	const clean = String(text ?? '')
		.trim()
		.slice(0, CHAT_LIMIT);
	if (!clean) return state;
	const s = structuredClone(state);
	new Ctx(s).emit({ type: 'chat', player, text: clean });
	s.version++;
	return s;
}

/**
 * What player `me` (or a spectator, -1) may see: everything but the deck, the rng, other
 * players' cards and the cards they drew. Once the game is over every hand is shown, and
 * `revealAll` shows everything (a replay).
 */
export function conquestView(state: CqState, me: number, revealAll = false): CqView {
	const { rng: _rng, deck, players, log, ...rest } = state;
	const open = revealAll || state.phase === 'ended';
	return {
		...structuredClone(rest),
		deckCount: deck.length,
		players: players.map(({ cards, ...p }, i) => ({
			...p,
			cardCount: cards.length,
			...(open || i === me ? { cards: structuredClone(cards) } : {})
		})),
		log: log.map((e) =>
			e.type === 'cardDrawn' && e.player !== me && !revealAll
				? { ...e, card: null }
				: structuredClone(e)
		),
		me
	};
}
