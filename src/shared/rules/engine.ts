import { generateBoard, generateStandardBoard } from '../board/generate';
import { mapName, mapTiles } from '../board/maps';
import { type Board, getTopology } from '../board/topology';
import { nextRandom, randomInt, shuffle } from '../rng';
import {
	BANK_PER_RESOURCE,
	BANK_PER_RESOURCE_HUGE,
	BANK_PER_RESOURCE_LARGE,
	DEV_CARDS,
	DEV_DECK,
	DEV_DECK_HUGE,
	DEV_DECK_LARGE,
	DISCARD_THRESHOLD,
	LARGEST_ARMY_MIN,
	PIECE_LIMITS,
	RESOURCES,
	TERRAIN_RESOURCE,
	VICTORY_POINTS_TO_WIN,
	emptyResources,
	hasResources,
	totalResources,
	type BuildKind,
	type DevCardType,
	type PlayerColor,
	type Resource,
	type ResourceCounts
} from './config';
import { WORKSHOP_LIMIT, allBuildings, cleanBuildingRules } from './buildings';
import type { CharacterId } from './characters';
import { chooseEvent, claimBounty, cleanEventRules, eventYield, newEvents, startRound, tilePays } from './events';
import { DEFAULT_SETTINGS, characterPool, pieceLimits, type GameSettings } from './modes';
import {
	builtKey,
	canPlaceRoad,
	canPlaceSettlement,
	aloneLast,
	discardLimit,
	holderOf,
	longestRoad,
	longestRoadMin,
	paymentFor,
	playersOnHex,
	publicPoints,
	roadSpots,
	tradeRatios,
	workshopCount
} from './queries';
import type {
	Action,
	GameEvent,
	GameState,
	PlayerState,
	ResourceGain,
	TradeOffer
} from './types';

export interface NewPlayer {
	name: string;
	color: PlayerColor;
	isBot: boolean;
	/** Reign Extended only; ignored in Classic. */
	character?: CharacterId | null;
}

export const LOG_LIMIT = 80;

/**
 * Deal a new game. Classic always plays the standard island to 10 points with no characters.
 * Reign Extended deals the chosen map (unless a board is given) and opens the character draft,
 * unless the host turned characters off or the players come with characters already (tests and
 * dev tools).
 */
export function createGame(
	players: NewPlayer[],
	seed: number,
	board?: Board,
	settings: Partial<GameSettings> = {}
): GameState {
	const rngHolder = { rng: seed | 0 };
	const opts = { ...DEFAULT_SETTINGS, ...settings };
	const extended = opts.mode === 'extended';
	const tiles = extended ? mapTiles(opts.map) : null;
	const b = board ?? (tiles ? generateBoard(tiles, rngHolder) : generateStandardBoard(rngHolder));
	const topo = getTopology(b);
	// Five or six players share a bigger bank and deck, as in the 5-6 player extension, and
	// seven or eight a bigger one still.
	const n = players.length;
	const counts = n > 6 ? DEV_DECK_HUGE : n > 4 ? DEV_DECK_LARGE : DEV_DECK;
	const bank = n > 6 ? BANK_PER_RESOURCE_HUGE : n > 4 ? BANK_PER_RESOURCE_LARGE : BANK_PER_RESOURCE;
	const deck: DevCardType[] = [];
	for (const c of DEV_CARDS) for (let i = 0; i < counts[c]; i++) deck.push(c);
	shuffle(rngHolder, deck);
	const desert = b.hexes.findIndex((h) => h.terrain === 'desert');
	const pool = extended ? characterPool(opts) : [];
	const drafting = pool.length >= n && !players.some((p) => p.character);
	const state: GameState = {
		version: 0,
		rng: rngHolder.rng,
		mode: opts.mode,
		pointsToWin: extended ? opts.pointsToWin : VICTORY_POINTS_TO_WIN,
		handLimit: extended ? opts.handLimit : DISCARD_THRESHOLD,
		mapName: tiles ? mapName(opts.map) : 'Classic Isle',
		board: b,
		players: players.map(
			(p): PlayerState => ({
				name: p.name,
				color: p.color,
				isBot: p.isBot,
				character: extended ? (p.character ?? null) : null,
				resources: emptyResources(),
				devCards: [],
				knightsPlayed: 0,
				piecesLeft: extended ? pieceLimits(opts.pointsToWin) : { ...PIECE_LIMITS },
				longestRoad: 0
			})
		),
		phase: drafting ? 'draft' : 'setup',
		step: drafting ? 'pickCharacter' : 'setupSettlement',
		// The draft runs backwards from the first player, who places first and so picks last.
		current: drafting ? n - 1 : 0,
		turn: 0,
		draft: drafting ? { pool, order: players.map((_, i) => n - 1 - i), picked: 0 } : null,
		setupIndex: 0,
		setupLastSettlement: null,
		dice: null,
		robberHex: desert >= 0 ? desert : 0,
		buildings: topo.vertices.map(() => null),
		roads: topo.edges.map(() => null),
		buildingRules: extended ? cleanBuildingRules(opts.buildings) : allBuildings(false),
		workshops: b.hexes.map(() => null),
		stoneRoads: topo.edges.map(() => false),
		// The deck is shuffled from a seed of its own, so it leaves the island and dice as they were.
		events: extended ? newEvents(cleanEventRules(opts.events), { rng: (seed ^ 0x2f6b1d) | 0 }) : null,
		builtTurns: {},
		bank: { wood: bank, brick: bank, sheep: bank, wheat: bank, ore: bank },
		devDeck: deck,
		devCardPlayedThisTurn: false,
		roadBuildingLeft: 0,
		resumeStep: 'main',
		pendingDiscards: {},
		stealCandidates: [],
		trade: null,
		picks: {},
		bardTurn: -1,
		alms: [],
		longestRoadHolder: null,
		largestArmyHolder: null,
		winner: null,
		log: [],
		nextEventSeq: 1
	};
	const ctx = new Ctx(state);
	ctx.emit({ type: 'gameStarted', players: players.length });
	if (drafting) ctx.emit({ type: 'draftStarted', order: state.draft!.order });
	else {
		for (const pl of state.players) characterArrives(pl);
		ctx.emit({ type: 'turnStarted', player: 0, turn: 0 });
	}
	return state;
}

/** What a character brings to the table the moment it's theirs: the Veteran's Knight. */
function characterArrives(pl: PlayerState) {
	if (pl.character === 'veteran') pl.knightsPlayed = 1;
}

/** Copy everything but the board, which never changes and keys the topology cache. */
function cloneState(s: GameState): GameState {
	const { board, ...rest } = s;
	return { ...structuredClone(rest), board };
}

class RuleError extends Error {}

function fail(msg: string): never {
	throw new RuleError(msg);
}

/** Fail with a rule's error message (false: the action doesn't fit the moment). */
function check(result: string | null | false) {
	if (result === false) fail("You can't do that right now.");
	if (result) fail(result);
}

class Ctx {
	events: GameEvent[] = [];
	constructor(public s: GameState) {}
	/** `emit` for code outside the engine (the Events deck). */
	readonly emitter = (e: DistributiveOmit<GameEvent, 'seq'>) => this.emit(e);
	emit(e: DistributiveOmit<GameEvent, 'seq'>) {
		const ev = { ...e, seq: this.s.nextEventSeq++ } as GameEvent;
		this.events.push(ev);
		this.s.log.push(ev);
		// Every piece goes up through a 'built' event, so new kinds of building get a date too.
		if (ev.type === 'built') this.s.builtTurns[builtKey(ev.kind, ev.at)] = this.s.turn;
		if (this.s.log.length > LOG_LIMIT) this.s.log.splice(0, this.s.log.length - LOG_LIMIT);
	}
}

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type ApplyResult =
	| { ok: true; state: GameState; events: GameEvent[] }
	| { ok: false; error: string };

/** Validate and apply one action. Never mutates the input state. */
export function applyAction(state: GameState, player: number, action: Action): ApplyResult {
	if (state.phase === 'ended') return { ok: false, error: 'The game is over.' };
	const s = cloneState(state);
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

/** Chat goes through the log so it survives reconnects. */
export function addChat(state: GameState, player: number, text: string): GameState {
	const s = cloneState(state);
	new Ctx(s).emit({ type: 'chat', player, text: text.slice(0, 200) });
	s.version++;
	return s;
}

/**
 * The current player ran out of time. The log says so, and free roads still owed from Road
 * Building are given up: the room then plays only the steps the turn can't end without, and
 * building isn't one of them.
 */
export function timeOut(state: GameState): GameState {
	const s = cloneState(state);
	new Ctx(s).emit({ type: 'turnTimedOut', player: s.current });
	if (s.step === 'roadBuilding') {
		s.roadBuildingLeft = 0;
		s.step = s.resumeStep;
	}
	s.version++;
	return s;
}

function dispatch(ctx: Ctx, p: number, a: Action) {
	const s = ctx.s;
	if (!s.players[p]) fail('Unknown player.');

	// Actions that other players may take out of turn.
	if (a.type === 'discard') return discard(ctx, p, a.resources);
	if (a.type === 'respondTrade') return respondTrade(ctx, p, a.offerId, a.accept);
	if (a.type === 'takePick') return takePick(ctx, p, a.resource);
	// Reign Extended events: the player in last place picks a Royal Decree, anyone takes their bounty.
	if (a.type === 'chooseEvent') return check(s.step === 'eventChoice' && chooseEvent(s, ctx.emitter, p, a.card));
	if (a.type === 'claimBounty') return check(s.phase === 'main' && claimBounty(s, ctx.emitter, p, a.resource));

	if (p !== s.current) fail("It's not your turn.");
	if ((s.phase === 'draft') !== (a.type === 'pickCharacter')) {
		fail(s.phase === 'draft' ? 'Pick your character first.' : 'The character draft is over.');
	}

	switch (a.type) {
		case 'pickCharacter':
			return pickCharacter(ctx, p, a.character);
		case 'placeSettlement':
			return s.phase === 'setup' ? setupSettlement(ctx, p, a.vertex) : buildSettlement(ctx, p, a.vertex);
		case 'placeRoad':
			if (s.phase === 'setup') return setupRoad(ctx, p, a.edge);
			if (s.step === 'roadBuilding') return freeRoad(ctx, p, a.edge);
			return buildRoad(ctx, p, a.edge);
		case 'buildCity':
			return buildCity(ctx, p, a.vertex);
		case 'buildWorkshop':
			return buildWorkshop(ctx, p, a.hex);
		case 'paveRoad':
			return paveRoad(ctx, p, a.edge);
		case 'rollDice':
			return roll(ctx, p);
		case 'moveRobber':
			return moveRobber(ctx, p, a.hex);
		case 'steal':
			return steal(ctx, p, a.victim);
		case 'buyDevCard':
			return buyDevCard(ctx, p);
		case 'playKnight':
		case 'playRoadBuilding':
		case 'playYearOfPlenty':
		case 'playMonopoly':
			return playDevCard(ctx, p, a);
		case 'bankTrade':
			return bankTrade(ctx, p, a.give, a.get);
		case 'offerTrade':
			return offerTrade(ctx, p, a.give, a.want);
		case 'confirmTrade':
			return confirmTrade(ctx, p, a.offerId, a.with);
		case 'cancelTrade':
			return cancelTrade(ctx, p);
		case 'endTurn':
			return endTurn(ctx, p);
		default:
			fail('Unknown action.');
	}
}

// ---------------------------------------------------------------- draft

function pickCharacter(ctx: Ctx, p: number, character: CharacterId) {
	const s = ctx.s;
	const d = s.draft!;
	if (!d.pool.includes(character)) fail("That character isn't in this game.");
	if (s.players.some((pl) => pl.character === character)) fail('Someone already picked that character.');
	s.players[p].character = character;
	characterArrives(s.players[p]);
	ctx.emit({ type: 'characterPicked', player: p, character });
	d.picked++;
	if (d.picked < d.order.length) {
		s.current = d.order[d.picked];
		return;
	}
	// Everyone has a character: setup starts with the player who picked last.
	s.phase = 'setup';
	s.step = 'setupSettlement';
	s.current = 0;
	ctx.emit({ type: 'turnStarted', player: 0, turn: 0 });
}

// ---------------------------------------------------------------- setup

function setupOrder(s: GameState): number[] {
	const n = s.players.length;
	const forward = [...Array(n).keys()];
	return [...forward, ...forward.reverse()];
}

function setupSettlement(ctx: Ctx, p: number, vertex: number) {
	const s = ctx.s;
	if (s.step !== 'setupSettlement') fail('Place a road next to your settlement first.');
	if (!canPlaceSettlement(s, p, vertex, true)) fail("You can't build a settlement there.");
	s.buildings[vertex] = { owner: p, kind: 'settlement' };
	s.players[p].piecesLeft.settlement--;
	s.setupLastSettlement = vertex;
	ctx.emit({ type: 'built', player: p, kind: 'settlement', at: vertex, free: true });

	const secondRound = s.setupIndex >= s.players.length;
	if (secondRound) {
		const topo = getTopology(s.board);
		const gains: ResourceGain[] = [];
		for (const h of topo.vertices[vertex].hexes) {
			const res = TERRAIN_RESOURCE[s.board.hexes[h].terrain];
			if (!res || s.bank[res] <= 0) continue;
			s.bank[res]--;
			s.players[p].resources[res]++;
			gains.push({ player: p, hex: h, resource: res, amount: 1 });
		}
		if (gains.length) ctx.emit({ type: 'setupResources', player: p, gains });
	}
	s.step = 'setupRoad';
}

function setupRoad(ctx: Ctx, p: number, edge: number) {
	const s = ctx.s;
	if (s.step !== 'setupRoad') fail('Place a settlement first.');
	if (!canPlaceRoad(s, p, edge, s.setupLastSettlement))
		fail('The road has to touch the settlement you just placed.');
	s.roads[edge] = p;
	s.players[p].piecesLeft.road--;
	ctx.emit({ type: 'built', player: p, kind: 'road', at: edge, free: true });
	updateLongestRoad(ctx);

	s.setupIndex++;
	s.setupLastSettlement = null;
	const order = setupOrder(s);
	if (s.setupIndex >= order.length) {
		s.phase = 'main';
		s.step = 'roll';
		s.current = 0;
		s.turn = 1;
		ctx.emit({ type: 'turnStarted', player: 0, turn: 1 });
		startRound(s, ctx.emitter);
		turnBegins(ctx);
	} else {
		s.step = 'setupSettlement';
		const next = order[s.setupIndex];
		if (next !== s.current) {
			s.current = next;
			ctx.emit({ type: 'turnStarted', player: next, turn: 0 });
		}
	}
}

// ---------------------------------------------------------------- dice & robber

function roll(ctx: Ctx, p: number) {
	const s = ctx.s;
	if (s.step !== 'roll') fail("You can't roll right now.");
	const d1 = 1 + randomInt(s, 6);
	const d2 = 1 + randomInt(s, 6);
	s.dice = [d1, d2];
	ctx.emit({ type: 'diceRolled', player: p, dice: [d1, d2] });
	const total = d1 + d2;
	// The Seer's second sight: a card of choice on a 2 or a 12, whoever rolled it.
	if (total === 2 || total === 12) {
		const seer = holderOf(s, 'seer');
		if (seer >= 0) owePick(ctx, seer, 'seer');
	}
	if (total === 7) {
		const pending: Record<number, number> = {};
		s.players.forEach((pl, i) => {
			const n = totalResources(pl.resources);
			if (n > discardLimit(s, i)) pending[i] = Math.floor(n / 2);
		});
		// The Shepherd's flock: a Wool from the bank on every 7.
		s.players.forEach((pl, i) => {
			if (pl.character !== 'shepherd' || s.bank.sheep <= 0) return;
			s.bank.sheep--;
			pl.resources.sheep++;
			ctx.emit({ type: 'traitGain', player: i, character: 'shepherd', resource: 'sheep' });
		});
		// Migrating Herds: pastures pay on a 7 too.
		if (s.events?.current === 'migratingHerds') produce(ctx, total);
		if (s.events) s.events.comet = false;
		s.pendingDiscards = pending;
		s.alms = [];
		s.resumeStep = 'main';
		if (Object.keys(pending).length) {
			s.step = 'discard';
			ctx.emit({ type: 'mustDiscard', players: pending });
		} else {
			s.step = 'moveRobber';
		}
		return;
	}
	produce(ctx, total);
	// A Comet pays out one roll twice.
	if (s.events) s.events.comet = false;
	s.step = 'main';
}

function produce(ctx: Ctx, total: number) {
	const s = ctx.s;
	const topo = getTopology(s.board);
	const owed: ResourceGain[] = [];
	const blocked: number[] = [];
	s.board.hexes.forEach((hex, h) => {
		if (!tilePays(s, hex, total)) return;
		const res = TERRAIN_RESOURCE[hex.terrain];
		if (!res) return;
		// Reign Extended events can double what a tile pays.
		const k = eventYield(s, res);
		if (h === s.robberHex) {
			if (topo.hexes[h].vertices.some((v) => s.buildings[v])) blocked.push(h);
			return;
		}
		for (const v of topo.hexes[h].vertices) {
			const b = s.buildings[v];
			if (b) owed.push({ player: b.owner, hex: h, resource: res, amount: (b.kind === 'city' ? 2 : 1) * k });
		}
		// A workshop adds a card for its owner, who always has a building on the tile.
		const w = s.workshops[h];
		if (w !== null) owed.push({ player: w, hex: h, resource: res, amount: k, workshop: true });
	});
	// Bank shortage: if the bank can't pay everyone a resource, nobody gets it,
	// unless only one player is owed it, who then takes what is left.
	const shortages: Resource[] = [];
	const gains: ResourceGain[] = [];
	for (const res of RESOURCES) {
		const forRes = owed.filter((g) => g.resource === res);
		if (!forRes.length) continue;
		const need = forRes.reduce((n, g) => n + g.amount, 0);
		if (need <= s.bank[res]) {
			gains.push(...forRes);
			continue;
		}
		shortages.push(res);
		const owners = new Set(forRes.map((g) => g.player));
		if (owners.size === 1) {
			let left = s.bank[res];
			for (const g of forRes) {
				const amount = Math.min(left, g.amount);
				left -= amount;
				if (amount > 0) gains.push({ ...g, amount });
			}
		}
	}
	for (const g of gains) {
		s.bank[g.resource] -= g.amount;
		s.players[g.player].resources[g.resource] += g.amount;
	}
	if (gains.length || blocked.length) ctx.emit({ type: 'produced', gains, blocked, shortages });
	else ctx.emit({ type: 'nothingProduced', total });
}

function discard(ctx: Ctx, p: number, res: Partial<ResourceCounts>) {
	const s = ctx.s;
	if (s.step !== 'discard' || !(p in s.pendingDiscards)) fail("You don't need to discard.");
	const need = s.pendingDiscards[p];
	const clean = sanitize(res);
	if (totalResources(clean) !== need) fail(`Choose exactly ${need} cards to discard.`);
	if (!hasResources(s.players[p].resources, clean)) fail("You don't have those cards.");
	transfer(s.players[p].resources, s.bank, clean);
	delete s.pendingDiscards[p];
	ctx.emit({ type: 'discarded', player: p, count: need });
	if (s.players[p].character !== 'abbess') for (const r of RESOURCES) for (let i = 0; i < (clean[r] ?? 0); i++) (s.alms ??= []).push(r);
	if (Object.keys(s.pendingDiscards).length === 0) {
		giveAlms(ctx);
		s.step = 'moveRobber';
	}
}

/** The Abbess's alms: one of the cards the others just discarded, at random, back from the bank. */
function giveAlms(ctx: Ctx) {
	const s = ctx.s;
	const abbess = holderOf(s, 'abbess');
	const alms = (s.alms ?? []).filter((r) => s.bank[r] > 0);
	s.alms = [];
	if (abbess < 0 || !alms.length) return;
	const res = alms[randomInt(s, alms.length)];
	s.bank[res]--;
	s.players[abbess].resources[res]++;
	ctx.emit({ type: 'traitGain', player: abbess, character: 'abbess', resource: res });
}

/** A trait owes this player a resource of their choice, taken whenever they like. */
function owePick(ctx: Ctx, p: number, character: CharacterId) {
	const s = ctx.s;
	((s.picks ??= {})[p] ??= []).push(character);
	ctx.emit({ type: 'pickOwed', player: p, character });
}

function takePick(ctx: Ctx, p: number, res: Resource) {
	const s = ctx.s;
	if (s.phase === 'draft') fail('Pick your character first.');
	const owed = s.picks?.[p];
	if (!owed?.length) fail('Nothing is owed to you.');
	if (!RESOURCES.includes(res)) fail('Pick a resource.');
	if (s.bank[res] <= 0) fail('The bank is out of that resource.');
	const character = owed.shift()!;
	if (!owed.length) delete s.picks[p];
	s.bank[res]--;
	s.players[p].resources[res]++;
	ctx.emit({ type: 'traitGain', player: p, character, resource: res });
	checkWin(ctx);
}

/** One random card from `from`'s hand to `to`, because of a trait. */
function traitToll(ctx: Ctx, from: number, to: number, character: CharacterId) {
	const s = ctx.s;
	const hand: Resource[] = [];
	for (const r of RESOURCES) for (let i = 0; i < s.players[from].resources[r]; i++) hand.push(r);
	if (!hand.length) return;
	const res = hand[randomInt(s, hand.length)];
	s.players[from].resources[res]--;
	s.players[to].resources[res]++;
	ctx.emit({ type: 'traitToll', from, to, character, resource: res });
}

function moveRobber(ctx: Ctx, p: number, hex: number) {
	const s = ctx.s;
	if (s.step !== 'moveRobber') fail("You can't move the robber now.");
	if (!s.board.hexes[hex]) fail('Pick a tile on the island.');
	if (hex === s.robberHex) fail('The robber has to move to a different tile.');
	s.robberHex = hex;
	ctx.emit({ type: 'robberMoved', player: p, hex });
	const victims = playersOnHex(s, hex, p).filter(
		(v) => totalResources(s.players[v].resources) > 0
	);
	if (victims.length === 0) {
		ctx.emit({ type: 'nothingToSteal', player: p });
		s.step = s.resumeStep;
	} else if (victims.length === 1) {
		doSteal(ctx, p, victims[0]);
	} else {
		s.stealCandidates = victims;
		s.step = 'steal';
	}
}

function steal(ctx: Ctx, p: number, victim: number) {
	const s = ctx.s;
	if (s.step !== 'steal') fail("You can't steal right now.");
	if (!s.stealCandidates.includes(victim)) fail("You can't steal from that player.");
	doSteal(ctx, p, victim);
}

function doSteal(ctx: Ctx, p: number, victim: number) {
	const s = ctx.s;
	// The Rogue takes a second card if there is one.
	const times = s.players[p].character === 'rogue' ? 2 : 1;
	for (let k = 0; k < times; k++) {
		// The Witch's purse bites back: the thief pays her instead.
		if (s.players[victim].character === 'witch') {
			traitToll(ctx, p, victim, 'witch');
			continue;
		}
		const hand: Resource[] = [];
		for (const r of RESOURCES) for (let i = 0; i < s.players[victim].resources[r]; i++) hand.push(r);
		if (!hand.length) break;
		const res = hand[randomInt(s, hand.length)];
		s.players[victim].resources[res]--;
		s.players[p].resources[res]++;
		ctx.emit({ type: 'stole', thief: p, victim, resource: res });
	}
	s.stealCandidates = [];
	s.step = s.resumeStep;
}

// ---------------------------------------------------------------- building

function requireMain(s: GameState) {
	if (s.step === 'roll') fail('Roll the dice first.');
	if (s.step !== 'main') fail("You can't do that right now.");
}

function pay(s: GameState, p: number, kind: BuildKind) {
	const cards = paymentFor(s, p, kind, s.players[p].resources);
	if (!cards) fail("You don't have enough resources.");
	transfer(s.players[p].resources, s.bank, cards);
}

/** The Baron's toll on a road that touches one of his. */
function roadToll(ctx: Ctx, p: number, edge: number) {
	const s = ctx.s;
	const baron = holderOf(s, 'baron');
	if (baron < 0 || baron === p) return;
	const topo = getTopology(s.board);
	const e = topo.edges[edge];
	const touches = [e.a, e.b].some((v) => topo.vertices[v].edges.some((o) => o !== edge && s.roads[o] === baron));
	if (touches) traitToll(ctx, p, baron, 'baron');
}

function buildRoad(ctx: Ctx, p: number, edge: number) {
	const s = ctx.s;
	requireMain(s);
	if (s.players[p].piecesLeft.road <= 0) fail('You have no roads left.');
	if (!canPlaceRoad(s, p, edge)) fail("You can't build a road there.");
	pay(s, p, 'road');
	s.roads[edge] = p;
	s.players[p].piecesLeft.road--;
	ctx.emit({ type: 'built', player: p, kind: 'road', at: edge, free: false });
	roadToll(ctx, p, edge);
	updateLongestRoad(ctx);
	checkWin(ctx);
}

function freeRoad(ctx: Ctx, p: number, edge: number) {
	const s = ctx.s;
	if (!canPlaceRoad(s, p, edge)) fail("You can't build a road there.");
	s.roads[edge] = p;
	s.players[p].piecesLeft.road--;
	s.roadBuildingLeft--;
	ctx.emit({ type: 'built', player: p, kind: 'road', at: edge, free: true });
	roadToll(ctx, p, edge);
	updateLongestRoad(ctx);
	if (
		s.roadBuildingLeft <= 0 ||
		s.players[p].piecesLeft.road <= 0 ||
		roadSpots(s, p).length === 0
	) {
		s.roadBuildingLeft = 0;
		s.step = s.resumeStep;
	}
	checkWin(ctx);
}

function buildSettlement(ctx: Ctx, p: number, vertex: number) {
	const s = ctx.s;
	requireMain(s);
	if (s.players[p].piecesLeft.settlement <= 0) fail('You have no settlements left.');
	if (!canPlaceSettlement(s, p, vertex, false)) fail("You can't build a settlement there.");
	pay(s, p, 'settlement');
	s.buildings[vertex] = { owner: p, kind: 'settlement' };
	s.players[p].piecesLeft.settlement--;
	ctx.emit({ type: 'built', player: p, kind: 'settlement', at: vertex, free: false });
	// A new settlement can cut someone else's road.
	updateLongestRoad(ctx);
	checkWin(ctx);
}

function buildCity(ctx: Ctx, p: number, vertex: number) {
	const s = ctx.s;
	requireMain(s);
	const b = s.buildings[vertex];
	if (!b || b.owner !== p || b.kind !== 'settlement') fail('Cities replace one of your settlements.');
	if (s.players[p].piecesLeft.city <= 0) fail('You have no cities left.');
	pay(s, p, 'city');
	s.buildings[vertex] = { owner: p, kind: 'city' };
	s.players[p].piecesLeft.city--;
	s.players[p].piecesLeft.settlement++;
	ctx.emit({ type: 'built', player: p, kind: 'city', at: vertex, free: false });
	checkWin(ctx);
}

function buildWorkshop(ctx: Ctx, p: number, hex: number) {
	const s = ctx.s;
	requireMain(s);
	if (!s.buildingRules.workshop) fail('Workshops are not part of this game.');
	const tile = Number.isInteger(hex) ? s.board.hexes[hex] : undefined;
	if (!tile) fail('Pick a tile on the island.');
	if (!TERRAIN_RESOURCE[tile.terrain]) fail('Workshops go on tiles that produce something.');
	if (s.workshops[hex] !== null) fail('That tile already has a workshop.');
	if (!playersOnHex(s, hex).includes(p)) fail('Build it on a tile beside one of your settlements or cities.');
	if (workshopCount(s, p) >= WORKSHOP_LIMIT) fail(`You can build at most ${WORKSHOP_LIMIT} workshops.`);
	pay(s, p, 'workshop');
	s.workshops[hex] = p;
	ctx.emit({ type: 'built', player: p, kind: 'workshop', at: hex, free: false });
}

function paveRoad(ctx: Ctx, p: number, edge: number) {
	const s = ctx.s;
	requireMain(s);
	if (!s.buildingRules.stoneRoad) fail('Stone roads are not part of this game.');
	if (!Number.isInteger(edge) || s.roads[edge] === undefined) fail('Pick a road on the island.');
	if (s.roads[edge] !== p) fail('Pave one of your own roads.');
	if (s.stoneRoads[edge]) fail('That road is already paved.');
	pay(s, p, 'stoneRoad');
	s.stoneRoads[edge] = true;
	ctx.emit({ type: 'built', player: p, kind: 'stoneRoad', at: edge, free: false });
	updateLongestRoad(ctx);
	checkWin(ctx);
}

// ---------------------------------------------------------------- development cards

function buyDevCard(ctx: Ctx, p: number) {
	const s = ctx.s;
	requireMain(s);
	if (s.devDeck.length === 0) fail('The development deck is empty.');
	pay(s, p, 'devCard');
	const card = s.devDeck.pop()!;
	s.players[p].devCards.push({ type: card, boughtTurn: s.turn });
	ctx.emit({ type: 'devCardBought', player: p, card });
	checkWin(ctx);
}

function playDevCard(
	ctx: Ctx,
	p: number,
	a: Extract<
		Action,
		{ type: 'playKnight' | 'playRoadBuilding' | 'playYearOfPlenty' | 'playMonopoly' }
	>
) {
	const s = ctx.s;
	if (s.step !== 'roll' && s.step !== 'main') fail("You can't play a card right now.");
	if (s.devCardPlayedThisTurn) fail('You can only play one development card per turn.');
	const type: DevCardType =
		a.type === 'playKnight'
			? 'knight'
			: a.type === 'playRoadBuilding'
				? 'roadBuilding'
				: a.type === 'playYearOfPlenty'
					? 'yearOfPlenty'
					: 'monopoly';
	const pl = s.players[p];
	const idx = pl.devCards.findIndex((c) => c.type === type && c.boughtTurn < s.turn);
	if (idx < 0) {
		if (pl.devCards.some((c) => c.type === type)) fail("You can't play a card on the turn you bought it.");
		fail("You don't have that card.");
	}

	if (a.type === 'playYearOfPlenty') {
		const want = sanitize(countList(a.resources));
		if (totalResources(want) !== 2) fail('Pick two resources.');
		if (!hasResources(s.bank, want)) fail("The bank doesn't have those resources.");
	}
	if (a.type === 'playRoadBuilding') {
		if (pl.piecesLeft.road <= 0 || roadSpots(s, p).length === 0) fail('You have nowhere to build a road.');
	}

	pl.devCards.splice(idx, 1);
	s.devCardPlayedThisTurn = true;
	ctx.emit({ type: 'devCardPlayed', player: p, card: type });
	const resume = s.step as 'roll' | 'main';

	switch (a.type) {
		case 'playKnight':
			pl.knightsPlayed++;
			updateLargestArmy(ctx);
			s.resumeStep = resume;
			s.step = 'moveRobber';
			break;
		case 'playRoadBuilding':
			s.resumeStep = resume;
			s.roadBuildingLeft = 2;
			s.step = 'roadBuilding';
			break;
		case 'playYearOfPlenty': {
			const want = sanitize(countList(a.resources));
			transfer(s.bank, pl.resources, want);
			ctx.emit({ type: 'yearOfPlenty', player: p, resources: [...a.resources] });
			break;
		}
		case 'playMonopoly': {
			if (!RESOURCES.includes(a.resource)) fail('Pick a resource.');
			const taken: Record<number, number> = {};
			s.players.forEach((other, i) => {
				if (i === p) return;
				const n = other.resources[a.resource];
				if (n > 0) {
					taken[i] = n;
					other.resources[a.resource] = 0;
					pl.resources[a.resource] += n;
				}
			});
			ctx.emit({ type: 'monopoly', player: p, resource: a.resource, taken });
			break;
		}
	}
	checkWin(ctx);
}

// ---------------------------------------------------------------- trading

function bankTrade(ctx: Ctx, p: number, give: Resource, get: Resource) {
	const s = ctx.s;
	requireMain(s);
	if (!RESOURCES.includes(give) || !RESOURCES.includes(get) || give === get) fail('Pick two different resources.');
	const ratio = tradeRatios(s, p)[give];
	if (s.players[p].resources[give] < ratio) fail(`You need ${ratio} of that to trade.`);
	if (s.bank[get] <= 0) fail("The bank is out of that resource.");
	s.players[p].resources[give] -= ratio;
	s.bank[give] += ratio;
	s.bank[get]--;
	s.players[p].resources[get]++;
	ctx.emit({ type: 'bankTrade', player: p, give, giveCount: ratio, get });
}

function offerTrade(ctx: Ctx, p: number, give: Partial<ResourceCounts>, want: Partial<ResourceCounts>) {
	const s = ctx.s;
	requireMain(s);
	const g = sanitize(give);
	const w = sanitize(want);
	if (totalResources(g) === 0 || totalResources(w) === 0) fail('A trade needs something on both sides.');
	if (RESOURCES.some((r) => (g[r] ?? 0) > 0 && (w[r] ?? 0) > 0)) fail("You can't give and ask for the same resource.");
	if (!hasResources(s.players[p].resources, g)) fail("You don't have what you're offering.");
	const offer: TradeOffer = {
		id: (s.trade?.id ?? s.version) + 1,
		from: p,
		give: g,
		want: w,
		responses: {}
	};
	s.trade = offer;
	ctx.emit({ type: 'tradeOffered', offer: structuredClone(offer) });
}

function respondTrade(ctx: Ctx, p: number, offerId: number, accept: boolean) {
	const s = ctx.s;
	if (!s.trade || s.trade.id !== offerId) fail('That offer is no longer open.');
	if (p === s.trade.from) fail("You can't answer your own offer.");
	if (accept && !hasResources(s.players[p].resources, s.trade.want)) fail("You don't have what they're asking for.");
	s.trade.responses[p] = accept ? 'accept' : 'decline';
}

function confirmTrade(ctx: Ctx, p: number, offerId: number, other: number) {
	const s = ctx.s;
	requireMain(s);
	const t = s.trade;
	if (!t || t.id !== offerId || t.from !== p) fail('That offer is no longer open.');
	if (t.responses[other] !== 'accept') fail("That player hasn't accepted.");
	if (!hasResources(s.players[p].resources, t.give)) fail("You no longer have what you offered.");
	if (!hasResources(s.players[other].resources, t.want)) fail('They no longer have what you asked for.');
	transfer(s.players[p].resources, s.players[other].resources, t.give);
	transfer(s.players[other].resources, s.players[p].resources, t.want);
	s.trade = null;
	ctx.emit({ type: 'tradeCompleted', from: p, to: other, give: t.give, want: t.want });
	// The Bard's good company: his trading partner takes a bonus card, once per turn.
	const bard = holderOf(s, 'bard');
	if ((bard === p || bard === other) && s.bardTurn !== s.turn) {
		s.bardTurn = s.turn;
		owePick(ctx, bard === p ? other : p, 'bard');
	}
}

function cancelTrade(ctx: Ctx, p: number) {
	const s = ctx.s;
	if (!s.trade || s.trade.from !== p) fail('There is no offer to cancel.');
	s.trade = null;
	ctx.emit({ type: 'tradeCancelled', from: p });
}

// ---------------------------------------------------------------- turn flow

function endTurn(ctx: Ctx, p: number) {
	const s = ctx.s;
	requireMain(s);
	s.trade = null;
	s.dice = null;
	s.devCardPlayedThisTurn = false;
	s.current = (p + 1) % s.players.length;
	s.turn++;
	s.step = 'roll';
	ctx.emit({ type: 'turnStarted', player: s.current, turn: s.turn });
	// A new round: Reign Extended flips its next event card.
	if (s.current === 0) startRound(s, ctx.emitter);
	turnBegins(ctx);
	checkWin(ctx);
}

/** What a player's turn brings before the roll: the Jester's catch-up card. */
function turnBegins(ctx: Ctx) {
	const s = ctx.s;
	const p = s.current;
	if (s.players[p].character === 'jester' && aloneLast(s, p)) owePick(ctx, p, 'jester');
}

function updateLongestRoad(ctx: Ctx) {
	const s = ctx.s;
	const lengths = s.players.map((_, i) => longestRoad(s, i));
	lengths.forEach((l, i) => (s.players[i].longestRoad = l));
	// A road only counts once it is long enough for that player (the Explorer needs fewer).
	const counted = lengths.map((l, i) => (l >= longestRoadMin(s, i) ? l : 0));
	const max = Math.max(...counted);
	const prev = s.longestRoadHolder;
	let holder = prev;
	if (max === 0) holder = null;
	else if (prev !== null && counted[prev] === max) holder = prev;
	else {
		const top = counted.flatMap((l, i) => (l === max ? [i] : []));
		holder = top.length === 1 ? top[0] : null;
	}
	if (holder !== prev) {
		s.longestRoadHolder = holder;
		ctx.emit({ type: 'longestRoad', player: holder, length: holder === null ? Math.max(...lengths) : lengths[holder] });
	}
}

function updateLargestArmy(ctx: Ctx) {
	const s = ctx.s;
	const prev = s.largestArmyHolder;
	const best = prev === null ? LARGEST_ARMY_MIN - 1 : s.players[prev].knightsPlayed;
	s.players.forEach((pl, i) => {
		if (i !== s.largestArmyHolder && pl.knightsPlayed > best && pl.knightsPlayed >= LARGEST_ARMY_MIN) {
			s.largestArmyHolder = i;
		}
	});
	if (s.largestArmyHolder !== prev) {
		const h = s.largestArmyHolder!;
		ctx.emit({ type: 'largestArmy', player: h, knights: s.players[h].knightsPlayed });
	}
}

export function totalPoints(s: GameState, p: number): number {
	return publicPoints(s, p) + s.players[p].devCards.filter((c) => c.type === 'victoryPoint').length;
}

/** You can only win on your own turn, so only the current player is checked. */
function checkWin(ctx: Ctx) {
	const s = ctx.s;
	if (s.phase !== 'main') return;
	if (totalPoints(s, s.current) >= s.pointsToWin) {
		s.phase = 'ended';
		s.winner = s.current;
		s.trade = null;
		ctx.emit({
			type: 'gameOver',
			winner: s.current,
			points: s.players.map((_, i) => totalPoints(s, i))
		});
	}
}

// ---------------------------------------------------------------- utils

function sanitize(r: Partial<ResourceCounts>): Partial<ResourceCounts> {
	const out: Partial<ResourceCounts> = {};
	for (const k of RESOURCES) {
		const v = Math.floor(Number(r?.[k] ?? 0));
		if (!Number.isFinite(v) || v < 0) fail('Invalid amount.');
		if (v > 0) out[k] = v;
	}
	return out;
}

function countList(list: Resource[]): Partial<ResourceCounts> {
	const out: Partial<ResourceCounts> = {};
	for (const r of list) {
		if (!RESOURCES.includes(r)) fail('Pick a resource.');
		out[r] = (out[r] ?? 0) + 1;
	}
	return out;
}

function transfer(from: ResourceCounts, to: ResourceCounts, amounts: Partial<ResourceCounts>) {
	for (const r of RESOURCES) {
		const n = amounts[r] ?? 0;
		from[r] -= n;
		to[r] += n;
	}
}

export { nextRandom };
