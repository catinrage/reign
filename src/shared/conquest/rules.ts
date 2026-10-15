import { randomInt, shuffle } from '../rng';
import type { PlayerColor } from '../rules/config';
import { GENTLE_TONES, OMENS, OMEN_INFO, PLAGUE_AT, type OmenId } from './omens';
import {
	attackBlock,
	attackDiceMax,
	attackerTies,
	bestSet,
	canAttackNow,
	canEndTurnNow,
	canFortifyNow,
	cardBonusTerritory,
	conquestMap,
	defendDice,
	fortifyMoves,
	fortifyTargets,
	isSet,
	majorityGoal,
	missionDeck,
	missionDone,
	missionHold,
	neighbors,
	reinforcementsFor,
	setValue,
	startingArmies,
	mustTradeHand,
	territoriesOf,
	visibleTo,
	warlordOf
} from './queries';
import { HIGH_GROUND, PLUNDER, WARLORDS, WOODLAND, isWarlord, type WarlordId } from './warlords';
import type { RealmMap } from './realm';
import {
	CARD_SYMBOLS,
	CONQUEST_MAX_PLAYERS,
	DEFAULT_CONQUEST_SETTINGS,
	MISSION_MIN_PLAYERS,
	type ConquestCard,
	type ConquestSettings,
	type CqAction,
	type CqEvent,
	type CqResult,
	type CqState,
	type CqView,
	type Mission,
	type WinReason
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
 * Two at the table: whoever moves second starts with this many more armies, as the first move is
 * worth about that much (bot simulations: 75% wins for the first player without it, about even
 * with it under the Conquest rule).
 */
export const SECOND_PLAYER_BONUS = 6;

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
	if (settings.victory === 'missions' && n < MISSION_MIN_PLAYERS) throw new Error('Secret missions need at least three players.');
	const map = conquestMap(settings);
	const count = map.territories.length;
	const start = startingArmies(n, map, settings.start ?? 'standard');
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
			mission: null,
			warlord: null,
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
		moves: 0,
		lostSince: new Array(n).fill(0),
		draft: null,
		omens: null,
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
	if (settings.victory === 'missions') dealMissions(s);
	if (settings.omens && settings.omens !== 'off') {
		const pool = omenPool(s);
		s.omens = { pool, deck: shuffle(s, [...pool]), current: null, region: null, target: null };
	}
	for (let p = 0; p < n; p++) {
		const held = territoriesOf(s, p).length;
		const extra = n === 2 && p === 1 ? SECOND_PLAYER_BONUS : 0;
		s.reserve[p] = start - held + extra;
		s.stats.players[p].armies += extra;
		s.stats.players[p].peak = held;
		s.stats.held[p].push(held);
	}
	const ctx = new Ctx(s);
	ctx.emit({ type: 'gameStarted', players: n });
	ctx.emit({ type: 'dealt', owner: [...s.owner] });
	if (settings.warlords) startDraft(ctx);
	else afterDraft(ctx);
	return s;
}

/**
 * Warlords who can make a difference at this table: the Corsair only with sea lanes to raid
 * across, the Spymistress only in the fog, the Horselord only when moves are counted, the
 * Quartermaster only with cards, and the Mountain King and the Woodwarden only where their kind of
 * land lies. If that leaves too few, the rest come back in.
 */
function warlordPool(s: CqState): WarlordId[] {
	const map = conquestMap(s.settings);
	const lands = (kinds: readonly string[]) => map.territories.filter((t) => kinds.includes(t.terrain)).length;
	const fits: Record<WarlordId, boolean> = {
		aldric: true,
		morwen: true,
		kael: s.settings.fortify !== 'free',
		tobin: s.settings.cards !== 'none',
		ysra: map.lanes.length >= 3,
		dunstan: lands(HIGH_GROUND) >= 4,
		rowan: lands(WOODLAND) >= 4,
		brannoc: true,
		gorm: true,
		vey: !!s.settings.fog
	};
	const good = WARLORDS.filter((w) => fits[w]);
	const want = s.players.length + 2;
	return good.length >= want ? good : [...good, ...WARLORDS.filter((w) => !fits[w])].slice(0, Math.max(want, good.length));
}

/** The draft opens: the last to move picks first, from a few more warlords than there are players. */
function startDraft(ctx: Ctx) {
	const s = ctx.s;
	const n = s.players.length;
	const pool = shuffle(s, warlordPool(s)).slice(0, n + 2);
	const order = [...Array(n).keys()].reverse();
	s.phase = 'draft';
	s.draft = { pool, order, picked: 0 };
	ctx.emit({ type: 'draftStarted', order });
}

function pickWarlord(ctx: Ctx, p: number, w: WarlordId) {
	const s = ctx.s;
	const d = s.draft;
	if (!d) fail('There is no draft.');
	if (d.order[d.picked] !== p) fail("It's not your pick.");
	if (!isWarlord(w) || !d.pool.includes(w)) fail('That warlord is not on offer.');
	s.players[p].warlord = w;
	d.pool = d.pool.filter((x) => x !== w);
	d.picked++;
	ctx.emit({ type: 'warlordPicked', player: p, warlord: w });
	if (d.picked >= d.order.length) {
		s.draft = null;
		afterDraft(ctx);
	}
}

/** The warlords are picked (or there are none): everyone places their armies, or they're spread at random and the war begins. */
function afterDraft(ctx: Ctx) {
	const s = ctx.s;
	s.phase = 'deploy';
	if (s.settings.deploy !== 'random') return;
	for (let p = 0; p < s.players.length; p++) {
		const mine = territoriesOf(s, p);
		for (; s.reserve[p] > 0; s.reserve[p]--) s.armies[mine[randomInt(s, mine.length)]]++;
	}
	startPlay(ctx);
}

/** The omens in this game's deck: gentle leaves the calamities out; Sea Fog needs sea lanes, Snowbound regions. */
function omenPool(s: CqState): OmenId[] {
	const map = conquestMap(s.settings);
	return OMENS.filter((o) => {
		if (s.settings.omens === 'gentle' && !GENTLE_TONES.includes(OMEN_INFO[o].tone)) return false;
		if (o === 'seaFog' && map.lanes.length < 2) return false;
		if (o === 'snowbound' && map.regions.length < 3) return false;
		return true;
	});
}

/**
 * Deal everyone a secret mission from the shuffled missions, each a different one, and never one
 * to knock themselves out.
 */
function dealMissions(s: CqState) {
	const deck = shuffle(s, missionDeck(conquestMap(s.settings), s.players.length));
	s.players.forEach((pl, p) => {
		const i = deck.findIndex((m) => !(m.kind === 'destroy' && m.target === p));
		pl.mission = deck.splice(i, 1)[0];
	});
}

class RuleError extends Error {}

function fail(msg: string): never {
	throw new RuleError(msg);
}

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/** A state being changed, and the events the change makes (also for the dev cheats, see cheats.ts). */
export class Ctx {
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
		// A secret mission is won the moment it is done, by whatever move did it.
		if (s.phase === 'play' && s.current === player) checkMission(ctx, player);
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
	if (s.phase === 'draft') {
		if (a.type !== 'pickWarlord') fail('The warlords are being drafted.');
		return pickWarlord(ctx, p, a.warlord);
	}
	if (a.type === 'pickWarlord') fail('There is no draft.');
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
	const left = s.reserve[p];
	if (count > left)
		fail(left === 1 ? 'You have only 1 army to place.' : left ? `You have only ${left} armies to place.` : 'You have no armies left to place.');
	const back = s.placed[t];
	if (-count > back)
		fail(back === 1 ? 'You can take back only 1 army there.' : back ? `You can take back only ${back} armies there.` : 'You placed no armies there to take back.');
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
	s.moves = 0;
	const r = reinforcementsFor(s, p);
	s.lostSince[p] = 0;
	s.reserve[p] = r.total;
	s.stats.players[p].armies += r.total;
	// Five cards or more (or the table's number) and the player can't go on until they trade.
	s.mustTrade = mustTradeHand(s, s.players[p].cards);
	ctx.emit({ type: 'turnStarted', player: p, turn: s.turn, round: s.round });
	ctx.emit({ type: 'reinforcements', player: p, ...r });
}

function trade(ctx: Ctx, p: number, ids: number[]) {
	const s = ctx.s;
	if (s.settings.cards === 'none') fail('This war is fought without cards.');
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
	const armies = setValue(s, cards, p);
	const bonus = cardBonusTerritory(s, cards, p);
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
	if (!mustTradeHand(s, s.players[p].cards)) s.mustTrade = false;
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
	const block = attackBlock(s, from, to);
	if (block === 'seaFog') fail('Sea Fog: nobody may cross a sea lane this round.');
	if (block === 'snowbound') fail('That region is snowed in this round.');
	if (block === 'truce') fail('The Truce shields the smallest realm this round.');
	if (a.dice !== undefined && (!Number.isInteger(a.dice) || a.dice < 1 || a.dice > 3))
		fail('Roll one, two or three dice.');
	leaveReinforce(s);
	s.step = 'attack';
	let dice = 0;
	do {
		dice = Math.min(attackDiceMax(s, from, to), a.blitz ? 3 : (a.dice ?? 3));
		battle(ctx, p, from, to, dice);
	} while (a.blitz && s.armies[to] > 0 && s.armies[from] >= 2);
	if (s.armies[to] === 0) capture(ctx, p, from, to, dice);
}

/** One roll of the dice: highest against highest, the defender winning ties (unless a warlord or an omen says otherwise). */
function battle(ctx: Ctx, p: number, from: number, to: number, dice: number) {
	const s = ctx.s;
	const defender = s.owner[to];
	const attackRoll = roll(s, dice);
	const defendRoll = roll(s, defendDice(s, from, to));
	const ties = attackerTies(s, p, dice, to);
	let attackerLoss = 0;
	let defenderLoss = 0;
	for (let i = 0; i < Math.min(attackRoll.length, defendRoll.length); i++) {
		if (attackRoll[i] > defendRoll[i] || (i < ties && attackRoll[i] === defendRoll[i])) defenderLoss++;
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
		defenderLoss,
		...(ties ? { tiesToAttacker: ties } : {})
	});
}

function capture(ctx: Ctx, p: number, from: number, to: number, dice: number) {
	const s = ctx.s;
	const defender = s.owner[to];
	const wasConquering = s.conquered;
	s.owner[to] = p;
	s.conquered = true;
	s.stats.players[p].captured++;
	s.stats.players[defender].lost++;
	s.lostSince[defender]++;
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
		if (mustTradeHand(s, s.players[p].cards, 1)) s.mustTrade = true;
		// Anyone else sent to knock them out holds territories instead, as the classic game has it.
		s.players.forEach((pl, q) => {
			if (q !== p && pl.mission?.kind === 'destroy' && pl.mission.target === defender)
				pl.mission = { kind: 'territories', ...missionHold(conquestMap(s.settings)), instead: defender };
		});
	}
	// The Warchief's plunder: armies more in the first territory he takes each turn.
	if (warlordOf(s, p) === 'brannoc' && !wasConquering) {
		s.armies[to] += PLUNDER;
		ctx.emit({ type: 'placed', player: p, territory: to, count: PLUNDER });
	}
	const max = s.armies[from] - 1;
	const min = Math.min(dice, max);
	const win = victory(s, p);
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
			o.min !== o.max ? `Move between ${o.min} and ${o.max} armies in.` : o.min === 1 ? 'Move 1 army in.' : `Move ${o.min} armies in.`
		);
	}
	moveIn(ctx, p, o.from, o.to, count);
}

type Victory = { winner: number; reason: WinReason };

/**
 * Whether someone has won: the whole map, two thirds of it (if that is the rule), nobody else
 * left, or `actor`'s secret mission done (if that is the rule).
 */
function victory(s: CqState, actor: number): Victory | null {
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
	if (missionWon(s, actor)) return { winner: actor, reason: 'mission' };
	return null;
}

/** `p`'s secret mission is done (and the war is won by missions). */
function missionWon(s: CqState, p: number): boolean {
	const m: Mission | null = s.players[p]?.mission ?? null;
	return s.settings.victory === 'missions' && s.phase === 'play' && !!m && missionDone(s, p, m);
}

/** End the war if `p` has just done their secret mission. True if so. */
function checkMission(ctx: Ctx, p: number): boolean {
	if (!missionWon(ctx.s, p)) return false;
	gameOver(ctx, p, 'mission');
	return true;
}

export function gameOver(ctx: Ctx, winner: number, reason: WinReason) {
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
	if (s.omens?.current === 'floods') fail('Floods: nobody may fortify this round.');
	if (!isTerritory(s, from) || !isTerritory(s, to)) fail('Unknown territory.');
	if (from === to) fail('Move armies between two different territories.');
	if (s.owner[from] !== p || s.owner[to] !== p) fail('Move armies between territories of yours.');
	if (!fortifyTargets(s, from).includes(to))
		fail(s.settings.fortify === 'adjacent' ? 'Armies only move to a neighbouring territory of yours.' : 'Those territories are not joined through territories of yours.');
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
	s.moves++;
	s.step = 'fortify';
	ctx.emit({ type: 'fortified', player: p, from, to, count });
	// The last move the turn allows ends it; otherwise the player moves again, or ends it.
	if (s.moves >= fortifyMoves(s, p)) endTurn(ctx);
}

/** The turn is over: a card for a territory taken, and the next player still in begins. */
function endTurn(ctx: Ctx) {
	const s = ctx.s;
	const p = s.current;
	// The turn's last move (a fortify, armies placed when time ran out) may have done their mission.
	if (checkMission(ctx, p)) return;
	if (s.conquered && s.settings.cards !== 'none') drawCard(ctx, p);
	const n = s.players.length;
	let next = p;
	do next = (next + 1) % n;
	while (s.players[next].out && next !== p);
	// Going round past the end of the table ends a round, and the next one's omen is drawn.
	if (next <= p) {
		recordHeld(s);
		s.round++;
		drawOmen(ctx);
	}
	s.turn++;
	beginTurn(ctx, next);
}

/**
 * A new round's omen: Snowbound picks a region, Mercenaries and the Truce the smallest realm (the
 * fewest territories, then the fewest armies), and a calamity strikes at once.
 */
/** A new round's omen, off the top of the deck (or `forced`, a dev cheat: taken out of the deck if it's there). */
export function drawOmen(ctx: Ctx, forced?: OmenId) {
	const s = ctx.s;
	const o = s.omens;
	if (!o || !o.pool.length) return;
	if (!o.deck.length) o.deck = shuffle(s, [...o.pool]);
	const at = forced ? o.deck.lastIndexOf(forced) : -1;
	const omen = forced ? (at >= 0 ? o.deck.splice(at, 1)[0] : forced) : o.deck.pop()!;
	o.current = omen;
	o.region = null;
	o.target = null;
	if (omen === 'snowbound') o.region = randomInt(s, conquestMap(s.settings).regions.length);
	if (omen === 'mercenaries' || omen === 'truce') {
		const live = s.players.flatMap((pl, i) => (pl.out ? [] : [i]));
		const size = (p: number) => territoriesOf(s, p).length * 10000 + territoriesOf(s, p).reduce((n, t) => n + s.armies[t], 0);
		o.target = live.reduce((a, b) => (size(b) < size(a) ? b : a));
	}
	ctx.emit({ type: 'omen', omen, round: s.round, region: o.region, target: o.target });
	const losses: { territory: number; armies: number }[] = [];
	if (omen === 'plague')
		s.armies.forEach((a, t) => {
			if (a >= PLAGUE_AT) losses.push({ territory: t, armies: Math.floor(a / 5) });
		});
	if (omen === 'dragon') {
		const most = s.armies.reduce((m, a, t) => (a > s.armies[m] ? t : m), 0);
		if (s.armies[most] >= 2) losses.push({ territory: most, armies: Math.floor(s.armies[most] / 2) });
	}
	if (losses.length) {
		for (const l of losses) {
			s.armies[l.territory] -= l.armies;
			s.stats.players[s.owner[l.territory]].fallen += l.armies;
		}
		ctx.emit({ type: 'omenStruck', omen, losses });
	}
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
	if (s.phase === 'draft' && s.draft) {
		// Whoever's pick it was gets a warlord at random.
		const p = s.draft.order[s.draft.picked];
		ctx.emit({ type: 'turnTimedOut', player: p });
		pickWarlord(ctx, p, s.draft.pool[randomInt(s, s.draft.pool.length)]);
	} else if (s.phase === 'deploy') {
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
 * players' cards and secret missions, and the cards they drew. Once the game is over every hand
 * and mission is shown, and `revealAll` shows everything (a replay).
 */
export function conquestView(state: CqState, me: number, revealAll = false): CqView {
	const { rng: _rng, deck, players, log, omens, ...rest } = state;
	const open = revealAll || state.phase === 'ended';
	// In the fog of war a player sees armies only on and next to their own territories (spectators,
	// and everyone once the war is over, see them all).
	const seen = open || me < 0 ? null : visibleTo(state, me);
	const fogged = !!seen && seen.some((v) => !v);
	const view = structuredClone(rest);
	if (fogged) {
		view.armies = view.armies.map((a, t) => (seen![t] ? a : -1));
		view.placed = view.placed.map((a, t) => (seen![t] ? a : 0));
	}
	const sees = (t: number) => !fogged || seen![t];
	return {
		...view,
		deckCount: deck.length,
		omens: omens ? { pool: [...omens.pool], current: omens.current, region: omens.region, target: omens.target, deckCount: omens.deck.length } : null,
		fogged,
		players: players.map(({ cards, mission, ...p }, i) => ({
			...p,
			cardCount: cards.length,
			...(open || i === me ? { cards: structuredClone(cards), mission: structuredClone(mission) } : {})
		})),
		log: log.flatMap((e): CqEvent[] => {
			if (e.type === 'cardDrawn' && e.player !== me && !revealAll) return [{ ...e, card: null }];
			// What happened where they can't see stays in the fog.
			if (fogged) {
				if (e.type === 'placed' && !sees(e.territory)) return [];
				if ((e.type === 'battle' || e.type === 'occupied' || e.type === 'fortified') && !sees(e.from) && !sees(e.to)) return [];
				if (e.type === 'omenStruck') {
					const losses = e.losses.filter((l) => sees(l.territory));
					return losses.length ? [{ ...e, losses }] : [];
				}
			}
			return [structuredClone(e)];
		}),
		me
	};
}
