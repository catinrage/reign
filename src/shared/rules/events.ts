import { getTopology } from '../board/topology';
import { randomInt, shuffle } from '../rng';
import { RESOURCES, TERRAIN_RESOURCE, pips, totalResources, type Resource } from './config';
import { publicPoints, safeCards, tavernOf } from './queries';
import type { BoardHex } from '../board/topology';
import type { EventMove, GameEvent, GameState } from './types';

/**
 * Reign Extended's Events deck: one card flips at the start of each round (or every other round)
 * and bends the rules until the next round starts. The host switches the deck on or off, picks
 * gentle (no card that takes from anyone) or wild, and can pull any single card out.
 *
 * Cards tied to content that isn't built yet (the Dragon, the Pirate, the Volcano, Gold Mines,
 * the Wandering Trader) join the deck when that content does.
 */
export const EVENT_CARDS = [
	'harvestFestival',
	'bountifulYear',
	'travelingFair',
	'migratingHerds',
	'royalWedding',
	'royalDecree',
	'comet',
	'earthquake',
	'tournament',
	'stormAtSea',
	'plagueOfRats',
	'taxCollector',
	'banditUprising'
] as const;
export type EventCard = (typeof EVENT_CARDS)[number];

/** Good cards help everyone, catch-up ones the player behind, chaos shakes things up, harsh hurts. */
export type EventTone = 'good' | 'catchUp' | 'chaos' | 'rivalry' | 'harsh';

export const TONE_LABEL: Record<EventTone, string> = {
	good: 'Blessing',
	catchUp: 'Catch-up',
	chaos: 'Chaos',
	rivalry: 'Rivalry',
	harsh: 'Hardship'
};

export interface EventInfo {
	name: string;
	tone: EventTone;
	/** What it does, in a sentence. */
	text: string;
	/** Whether it lasts the round (rather than happening once, the moment it flips). */
	lasts: boolean;
}

export const EVENT_INFO: Record<EventCard, EventInfo> = {
	harvestFestival: { name: 'Harvest Festival', tone: 'good', lasts: true, text: 'Fields pay double this round.' },
	bountifulYear: { name: 'Bountiful Year', tone: 'good', lasts: true, text: 'Everyone takes one resource of their choice from the bank this round.' },
	travelingFair: { name: 'Traveling Fair', tone: 'good', lasts: true, text: 'Everyone may trade 2:1 with the bank this round.' },
	migratingHerds: { name: 'Migrating Herds', tone: 'good', lasts: true, text: 'Pastures also pay on a 7 this round.' },
	royalWedding: { name: 'Royal Wedding', tone: 'catchUp', lasts: false, text: 'Everyone gives a random card to the player in last place.' },
	royalDecree: { name: 'Royal Decree', tone: 'catchUp', lasts: true, text: "The player in last place picks this round's event from three cards." },
	comet: { name: 'Comet', tone: 'chaos', lasts: true, text: 'The next roll pays out twice.' },
	earthquake: { name: 'Earthquake', tone: 'chaos', lasts: false, text: 'Two number tokens (never a 6 or an 8) swap places for good.' },
	tournament: { name: 'Tournament', tone: 'rivalry', lasts: false, text: 'Whoever has played the most knights takes a random card from every other player.' },
	stormAtSea: { name: 'Storm at Sea', tone: 'harsh', lasts: true, text: 'No harbor trades this round.' },
	plagueOfRats: { name: 'Plague of Rats', tone: 'harsh', lasts: false, text: 'Everyone holding more than 5 cards loses one at random.' },
	taxCollector: { name: 'Tax Collector', tone: 'harsh', lasts: false, text: 'Everyone pays the bank one random card per city.' },
	banditUprising: { name: 'Bandit Uprising', tone: 'harsh', lasts: false, text: 'The robber jumps to the busiest tile and takes a card from everyone there.' }
};

/** A gentle deck keeps out every card that takes cards from someone. */
const GENTLE_TONES: EventTone[] = ['good', 'catchUp', 'chaos'];
/** Plague of Rats: players holding more than this lose a card. */
export const PLAGUE_LIMIT = 5;

/**
 * How long the table shows a card that turns over: the card held up in the middle of the table,
 * then what it does played out on the board and the hands. Play waits for it, as it waits for
 * dice to land: bots hold off, the turn clock starts late and the interface holds its state.
 */
export const EVENT_FLIP_MS = 3000;
export const EVENT_EFFECT_MS = 2800;
export const EVENT_SHOW_MS = EVENT_FLIP_MS + EVENT_EFFECT_MS;

/** What the host sets in the lobby. */
export interface EventRules {
	on: boolean;
	/** A card every round (1) or every other round (2). */
	every: 1 | 2;
	/** Wild puts every card in; gentle only the good, catch-up and chaos ones. */
	wild: boolean;
	/** Cards the host took out of the deck. */
	pulled: EventCard[];
}

export const DEFAULT_EVENT_RULES: EventRules = { on: true, every: 1, wild: true, pulled: [] };
export const NO_EVENTS: EventRules = { ...DEFAULT_EVENT_RULES, on: false };

/** The deck as a game carries it. Null in Classic and whenever the host turned events off. */
export interface EventsState {
	every: 1 | 2;
	/** Every card in this game's deck. */
	pool: EventCard[];
	/** The draw pile, top card last. It's dealt again from the pool when it runs out. */
	deck: EventCard[];
	/** This round's card, or null in a round without one. */
	current: EventCard | null;
	/** Royal Decree: the player in last place picks this round's card from these. */
	choice: { player: number; cards: EventCard[]; resume: 'roll' | 'main' } | null;
	/** Bountiful Year: players who haven't taken their resource yet. */
	bounty: number[];
	/** Comet: the next roll still pays out twice. */
	comet: boolean;
}

/**
 * What players see of the deck: how many cards are left in it, not their order. A player with a
 * tavern hears the rumor of the next card to turn over (null for everyone else).
 */
export type EventsView = Omit<EventsState, 'deck'> & { deckCount: number; rumor: EventCard | null };

export function isEventCard(id: unknown): id is EventCard {
	return typeof id === 'string' && (EVENT_CARDS as readonly string[]).includes(id);
}

/** Rules as given (a lobby's settings, say), with anything unknown dropped. */
export function cleanEventRules(rules: unknown): EventRules {
	const r = (rules && typeof rules === 'object' ? rules : {}) as Partial<Record<keyof EventRules, unknown>>;
	return {
		on: typeof r.on === 'boolean' ? r.on : DEFAULT_EVENT_RULES.on,
		every: r.every === 2 ? 2 : 1,
		wild: typeof r.wild === 'boolean' ? r.wild : DEFAULT_EVENT_RULES.wild,
		pulled: Array.isArray(r.pulled) ? EVENT_CARDS.filter((c) => (r.pulled as unknown[]).includes(c)) : []
	};
}

/** Whether a card can be in a deck of this kind (before the host pulls any). */
export function inDeckKind(card: EventCard, wild: boolean): boolean {
	return wild || GENTLE_TONES.includes(EVENT_INFO[card].tone);
}

/** The cards a game with these rules deals its deck from (empty when events are off). */
export function eventPool(rules: EventRules): EventCard[] {
	if (!rules.on) return [];
	return EVENT_CARDS.filter((c) => inDeckKind(c, rules.wild) && !rules.pulled.includes(c));
}

/** A new game's deck, shuffled; null when there's none. */
export function newEvents(rules: EventRules, rng: { rng: number }): EventsState | null {
	const pool = eventPool(rules);
	if (!pool.length) return null;
	return { every: rules.every, pool, deck: shuffle(rng, [...pool]), current: null, choice: null, bounty: [], comet: false };
}

/** The round a turn belongs to: turns 1..n are round 1, where n is the number of players. */
export function roundOf(turn: number, players: number): number {
	return Math.floor((Math.max(1, turn) - 1) / players) + 1;
}

/** Whether a round flips a card. */
export function flipsIn(round: number, every: 1 | 2): boolean {
	return (round - 1) % every === 0;
}

/** The next round after `round` that flips a card. */
export function nextFlip(round: number, every: 1 | 2): number {
	let r = round + 1;
	while (!flipsIn(r, every)) r++;
	return r;
}

/** The card a round's rules follow, if any (a Royal Decree still being decided bends nothing). */
export function activeEvent(s: { events?: Pick<EventsState, 'current'> | null }): EventCard | null {
	return s.events?.current ?? null;
}

type Emit = (e: GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'seq'> : never) : never) => void;

/**
 * A round starts (just before its first player rolls): last round's card stops, and a new one
 * flips if this round has one.
 */
export function startRound(s: GameState, emit: Emit) {
	const ev = s.events;
	if (!ev) return;
	ev.current = null;
	ev.bounty = [];
	ev.comet = false;
	ev.choice = null;
	const round = roundOf(s.turn, s.players.length);
	if (!flipsIn(round, ev.every)) return;
	flip(s, emit, draw(s), round);
}

/** Flip a given card as this round's event: the dev cheat, and the round's draw. */
export function flip(s: GameState, emit: Emit, card: EventCard, round = roundOf(s.turn, s.players.length), by?: number) {
	const ev = s.events!;
	ev.current = card;
	ev.bounty = [];
	ev.comet = false;
	emit({ type: 'eventDrawn', card, round, ...(by !== undefined ? { by } : {}) });
	resolve(s, emit, card);
}

/** The top card of the deck, dealing the pool out again when it's empty. */
function draw(s: GameState, except: EventCard[] = []): EventCard {
	const ev = s.events!;
	let card: EventCard | undefined;
	for (let i = ev.deck.length - 1; i >= 0 && !card; i--) if (!except.includes(ev.deck[i])) card = ev.deck.splice(i, 1)[0];
	if (!card) {
		ev.deck = shuffle(s, ev.pool.filter((c) => !except.includes(c)));
		card = ev.deck.pop() ?? ev.pool[0];
	}
	// A Royal Decree's draws top the deck up once its three cards are out (see `resolve`).
	if (!except.length) topUp(s);
	return card;
}

/**
 * Taverns hear the rumor of the next card, so while anyone has one the deck is never left empty:
 * the pool is dealt out again as soon as the last card is drawn, rather than when the next one
 * is (leaving out `except`, cards on their way back under it). Without a tavern the deck is dealt
 * when it's needed, as it always was.
 */
export function topUp(s: GameState, except: EventCard[] = []) {
	const ev = s.events;
	if (!ev || ev.deck.length || !s.taverns?.some(Boolean)) return;
	ev.deck = shuffle(s, ev.pool.filter((c) => !except.includes(c)));
}

/** The rumor this player hears at their tavern: the next card to turn over (null without one). */
export function rumorFor(s: Pick<GameState, 'events' | 'taverns' | 'buildings'>, p: number): EventCard | null {
	if (!s.events || p < 0 || tavernOf(s, p) === null) return null;
	return s.events.deck.at(-1) ?? null;
}

/** What a card does the moment it flips. Cards that last the round work through the queries. */
function resolve(s: GameState, emit: Emit, card: EventCard) {
	const ev = s.events!;
	const n = s.players.length;
	switch (card) {
		case 'bountifulYear':
			ev.bounty = s.players.map((_, i) => i);
			break;
		case 'comet':
			ev.comet = true;
			break;
		case 'royalDecree': {
			// The player behind picks from three cards off the top; the other two go back under.
			const player = lastPlace(s);
			const cards: EventCard[] = [];
			for (let k = 0; k < 3; k++) {
				const c = draw(s, ['royalDecree', ...cards]);
				if (c === 'royalDecree' || cards.includes(c)) break;
				cards.push(c);
			}
			// The two cards not picked go back under the deck, so a top-up leaves all three out.
			topUp(s, cards);
			if (!cards.length) break;
			ev.current = null;
			ev.choice = { player, cards, resume: s.step === 'main' ? 'main' : 'roll' };
			s.step = 'eventChoice';
			break;
		}
		case 'royalWedding': {
			const to = lastPlace(s);
			const moves: EventMove[] = [];
			for (let k = 1; k < n; k++) {
				const from = (to + k) % n;
				const r = randomCard(s, from);
				if (!r) continue;
				s.players[from].resources[r]--;
				s.players[to].resources[r]++;
				moves.push({ from, to, resource: r });
			}
			emit({ type: 'eventCards', card, moves });
			break;
		}
		case 'tournament': {
			const most = Math.max(...s.players.map((p) => p.knightsPlayed));
			const top = s.players.flatMap((p, i) => (p.knightsPlayed === most ? [i] : []));
			// A tie, or nobody with a knight: no champion, and nobody pays.
			if (most === 0 || top.length !== 1) {
				emit({ type: 'eventCards', card, moves: [] });
				break;
			}
			const to = top[0];
			const moves: EventMove[] = [];
			for (let k = 1; k < n; k++) {
				const from = (to + k) % n;
				const r = randomCard(s, from);
				if (!r) continue;
				s.players[from].resources[r]--;
				s.players[to].resources[r]++;
				moves.push({ from, to, resource: r });
			}
			emit({ type: 'eventCards', card, moves, champion: to });
			break;
		}
		case 'plagueOfRats': {
			const moves: EventMove[] = [];
			s.players.forEach((p, i) => {
				// A storehouse's cards don't count.
				if (totalResources(p.resources) - safeCards(s, i) <= PLAGUE_LIMIT) return;
				const r = randomCard(s, i)!;
				p.resources[r]--;
				s.bank[r]++;
				moves.push({ from: i, to: null, resource: r });
			});
			emit({ type: 'eventCards', card, moves });
			break;
		}
		case 'taxCollector': {
			const moves: EventMove[] = [];
			s.players.forEach((p, i) => {
				const cities = s.buildings.filter((b) => b?.owner === i && b.kind === 'city').length;
				for (let k = 0; k < cities; k++) {
					const r = randomCard(s, i);
					if (!r) break;
					p.resources[r]--;
					s.bank[r]++;
					moves.push({ from: i, to: null, resource: r });
				}
			});
			emit({ type: 'eventCards', card, moves });
			break;
		}
		case 'banditUprising': {
			const hex = busiestTile(s);
			const moves: EventMove[] = [];
			if (hex !== null) {
				s.robberHex = hex;
				for (const i of playersAround(s, hex)) {
					const r = randomCard(s, i);
					if (!r) continue;
					s.players[i].resources[r]--;
					s.bank[r]++;
					moves.push({ from: i, to: null, resource: r });
				}
			}
			emit({ type: 'eventCards', card, moves, ...(hex !== null ? { hex } : {}) });
			break;
		}
		case 'earthquake': {
			const swap = quakeTiles(s);
			if (!swap) break;
			const [a, b] = swap;
			const hexes = s.board.hexes.map((h) => ({ ...h }));
			[hexes[a].number, hexes[b].number] = [hexes[b].number, hexes[a].number];
			// A new board, since earlier states share the old one.
			s.board = { ...s.board, hexes };
			emit({ type: 'earthquake', hexes: [a, b] });
			break;
		}
	}
}

/** Royal Decree: the player in last place picks this round's card. */
export function chooseEvent(s: GameState, emit: Emit, p: number, card: EventCard): string | null {
	const ev = s.events;
	if (!ev?.choice) return 'There is no event to choose.';
	if (ev.choice.player !== p) return 'The player in last place picks the event.';
	if (!ev.choice.cards.includes(card)) return 'Pick one of the three cards.';
	// The cards not picked go back under the deck.
	ev.deck.unshift(...ev.choice.cards.filter((c) => c !== card));
	s.step = ev.choice.resume;
	ev.choice = null;
	flip(s, emit, card, roundOf(s.turn, s.players.length), p);
	return null;
}

/** Bountiful Year: a player takes their resource from the bank. */
export function claimBounty(s: GameState, emit: Emit, p: number, resource: Resource): string | null {
	const ev = s.events;
	if (!ev?.bounty.includes(p)) return 'You have nothing to take.';
	if (!RESOURCES.includes(resource)) return 'Pick a resource.';
	if (s.bank[resource] <= 0) return 'The bank is out of that resource.';
	ev.bounty = ev.bounty.filter((i) => i !== p);
	s.bank[resource]--;
	s.players[p].resources[resource]++;
	emit({ type: 'eventCards', card: 'bountifulYear', moves: [{ from: null, to: p, resource }] });
	return null;
}

// ---------------------------------------------------------------- what cards bend

/** How many times a tile's cards are paid this roll: the Harvest Festival and the Comet double. */
export function eventYield(s: Pick<GameState, 'events'>, res: Resource): number {
	let k = 1;
	if (s.events?.current === 'harvestFestival' && res === 'wheat') k *= 2;
	if (s.events?.comet) k *= 2;
	return k;
}

/** Whether a tile pays on this roll: its number, or a pasture on a 7 while the herds migrate. */
export function tilePays(s: Pick<GameState, 'events'>, hex: BoardHex, total: number): boolean {
	if (hex.number === total) return true;
	return total === 7 && s.events?.current === 'migratingHerds' && hex.terrain === 'pasture';
}

/** A bank rate bent by this round's card: the fair makes every rate 2, a storm closes harbors. */
export function eventRatio(current: EventCard | null, harbor: number, base: number): number {
	if (current === 'travelingFair') return Math.min(2, harbor);
	if (current === 'stormAtSea') return base;
	return harbor;
}

// ---------------------------------------------------------------- helpers

/**
 * The player in last place: fewest points everyone can see, then fewest cards in hand, then the
 * one who comes last in the turn order.
 */
export function lastPlace(s: GameState): number {
	let best = 0;
	let key = [Infinity, Infinity];
	s.players.forEach((p, i) => {
		const pts = publicPoints(s, i);
		const cards = totalResources(p.resources);
		if (pts < key[0] || (pts === key[0] && cards <= key[1])) {
			best = i;
			key = [pts, cards];
		}
	});
	return best;
}

/**
 * A random card from this player's hand, for the robber, a thief, a toll or an event to take: null
 * when they hold no more cards than their storehouse keeps safe.
 */
export function randomCard(s: GameState, p: number): Resource | null {
	const hand: Resource[] = [];
	for (const r of RESOURCES) for (let i = 0; i < s.players[p].resources[r]; i++) hand.push(r);
	return hand.length > safeCards(s, p) ? hand[randomInt(s, hand.length)] : null;
}

function playersAround(s: GameState, hex: number): number[] {
	const topo = getTopology(s.board);
	const set = new Set<number>();
	for (const v of topo.hexes[hex].vertices) {
		const b = s.buildings[v];
		if (b) set.add(b.owner);
	}
	return [...set].sort((a, b) => a - b);
}

/**
 * Bandit Uprising: the tile with the most buildings round it (a city counts twice), then the one
 * that pays most often. Never the tile the robber is already on; null if no tile has a building.
 */
export function busiestTile(s: Pick<GameState, 'board' | 'buildings' | 'robberHex'>): number | null {
	const topo = getTopology(s.board);
	let best: number | null = null;
	let bestScore = 0;
	s.board.hexes.forEach((hex, h) => {
		if (h === s.robberHex || !TERRAIN_RESOURCE[hex.terrain]) return;
		let n = 0;
		for (const v of topo.hexes[h].vertices) {
			const b = s.buildings[v];
			if (b) n += b.kind === 'city' ? 2 : 1;
		}
		if (!n) return;
		const score = n * 100 + pips(hex.number);
		if (score > bestScore) {
			best = h;
			bestScore = score;
		}
	});
	return best;
}

/** Earthquake: two tiles with different numbers, neither a 6 nor an 8. */
function quakeTiles(s: GameState): [number, number] | null {
	const ok = s.board.hexes.flatMap((h, i) => (h.number !== null && h.number !== 6 && h.number !== 8 ? [i] : []));
	if (ok.length < 2) return null;
	for (let tries = 0; tries < 20; tries++) {
		const a = ok[randomInt(s, ok.length)];
		const b = ok[randomInt(s, ok.length)];
		if (s.board.hexes[a].number !== s.board.hexes[b].number) return [a, b];
	}
	return null;
}
