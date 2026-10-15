import type { PlayerColor } from '../rules/config';

/**
 * Conquest: Reign's game of territorial war, played on the Realm (see realm.ts). Its own rules,
 * state and actions; nothing here is shared with Settlement's resources, roads or cards.
 *
 * A turn goes: reinforce (place the turn's armies, trade in card sets), attack (as often as you
 * like, dice against dice, defenders winning ties; a captured territory must be occupied), then
 * fortify (one move between connected territories of yours), and the turn passes.
 */

/** The picture on a conquest card. Three alike, or one of each, make a set; a wild card stands in for any. */
export const CARD_SYMBOLS = ['footman', 'knight', 'catapult'] as const;
export type CardSymbol = (typeof CARD_SYMBOLS)[number] | 'wild';

export interface ConquestCard {
	/** Unique in the game. */
	id: number;
	/** The territory pictured (null on a wild card): trading it in while you hold it adds two armies there. */
	territory: number | null;
	symbol: CardSymbol;
}

/** How many armies a set of cards is worth: rising with every set anyone trades, or fixed by its pictures. */
export type CardRule = 'escalating' | 'fixed';
/**
 * Win by taking every territory, by holding two thirds of the Realm, or by completing a secret
 * mission of your own (taking every territory still wins too).
 */
export type VictoryRule = 'domination' | 'majority' | 'missions';

/**
 * A secret mission, dealt to each player when the war is won by missions.
 * - `regions`: hold every territory of these regions (indexes), and of `extra` more of your choice.
 * - `territories`: hold `count` territories with at least `armies` armies on each. `instead` is the
 *   player a mission to knock out was against, who someone else knocked out first.
 * - `destroy`: knock player `target` out of the war.
 */
export type Mission =
	| { kind: 'regions'; regions: number[]; extra: number }
	| { kind: 'territories'; count: number; armies: number; instead?: number }
	| { kind: 'destroy'; target: number };

/** Secret missions need a table of at least this many. */
export const MISSION_MIN_PLAYERS = 3;
/** The armies everyone starts with: placed by the players, all at once, or spread at random. */
export type DeployRule = 'placed' | 'random';

/** Everything the host sets up in the lobby that changes a game of Conquest. */
export interface ConquestSettings {
	/** The map's id (see maps in realm.ts); only the Realm so far. */
	map: string;
	cards: CardRule;
	victory: VictoryRule;
	deploy: DeployRule;
}

export const DEFAULT_CONQUEST_SETTINGS: ConquestSettings = {
	map: 'realm',
	cards: 'escalating',
	victory: 'domination',
	deploy: 'placed'
};

/** Conquest seats two to six. */
export const CONQUEST_MAX_PLAYERS = 6;

export interface CqPlayer {
	name: string;
	color: PlayerColor;
	isBot: boolean;
	cards: ConquestCard[];
	/** Their secret mission, when the war is won by missions (null otherwise). */
	mission: Mission | null;
	/** Lost their last territory. */
	out: boolean;
}

/**
 * - `deploy`: before the first turn, everyone places their starting armies at once.
 * - `play`: turns, one player after another.
 */
export type CqPhase = 'deploy' | 'play' | 'ended';

/**
 * Where the current player's turn is.
 * - `reinforce`: placing this turn's armies (`reserve`) and trading in sets. Once every army is
 *   down, an attack, a fortify or ending the turn moves on (armies placed can be taken back until then).
 * - `attack`: attacking, or not; `endAttack` moves on to fortifying.
 * - `occupy`: a territory was just taken; armies must move in (`occupy` says how many may).
 * - `fortify`: one move between connected territories, or none, ends the turn.
 */
export type CqStep = 'reinforce' | 'attack' | 'occupy' | 'fortify';

/** A territory just taken, and how many armies can move into it from where the attack came. */
export interface Occupation {
	from: number;
	to: number;
	/** At least as many as dice in the attack that took it. */
	min: number;
	/** All but one of the armies left in `from`. */
	max: number;
}

/** What each player did over the game, for the end-of-game window. Nothing in it is secret. */
export interface CqPlayerStats {
	/** Armies they got: turns' reinforcements, card sets and the starting armies. */
	armies: number;
	/** Armies they got from card sets. */
	fromCards: number;
	/** Territories they captured. */
	captured: number;
	/** Territories they lost to others. */
	lost: number;
	/** Enemy armies their attacks and defences destroyed. */
	killed: number;
	/** Armies of theirs that fell. */
	fallen: number;
	/** Dice rolled in attacks and defences. */
	attacks: number;
	defences: number;
	/** Card sets traded in. */
	sets: number;
	/** The most territories they held at once. */
	peak: number;
	/** Turn they were knocked out on, or null. */
	outTurn: number | null;
	/** Who knocked them out. */
	outBy: number | null;
}

export interface CqStats {
	players: CqPlayerStats[];
	/** Each player's territories at the end of each round, for the end-of-game chart. */
	held: number[][];
}

export interface CqState {
	game: 'conquest';
	/** Bumped on every change. */
	version: number;
	rng: number;
	settings: ConquestSettings;
	players: CqPlayer[];
	/** Per territory: who holds it. */
	owner: number[];
	/**
	 * Per territory: armies on it. At least one, except a territory just taken, which stands empty
	 * until armies move in (see `occupy`; the table shows them moved in already, see armiesMovedIn).
	 */
	armies: number[];
	phase: CqPhase;
	step: CqStep;
	/** The player whose turn it is (during `deploy`: the first player). */
	current: number;
	/** Turns played so far, counting this one (0 during `deploy`). */
	turn: number;
	/** Rounds: everyone still in has had a turn. 0 during `deploy`. */
	round: number;
	/** Per player: armies they still have to place (during `deploy` everyone; then the current player). */
	reserve: number[];
	/** Per territory: armies the current player put there this step and can still take back. */
	placed: number[];
	/** Cards still to draw, top last. Never sent to players. */
	deck: ConquestCard[];
	/** Cards traded in, shuffled back into the deck when it runs out. */
	discard: ConquestCard[];
	/** Sets traded in so far this game, by everyone (the escalating value goes by it). */
	trades: number;
	/** The current player took a territory this turn, so they draw a card when it ends. */
	conquered: boolean;
	occupy: Occupation | null;
	/** The current player holds too many cards to go on (5 or more), and has to trade a set first. */
	mustTrade: boolean;
	winner: number | null;
	stats: CqStats;
	log: CqEvent[];
	nextEventSeq: number;
}

type Ev<T extends string, P> = { seq: number; type: T } & P;

/** How the war was won: the whole Realm, two thirds of it, everyone else out, or a secret mission. */
export type WinReason = 'domination' | 'majority' | 'lastStanding' | 'mission';

/** The dice of one battle, highest first, and what each side lost. */
export interface Battle {
	player: number;
	defender: number;
	from: number;
	to: number;
	attack: number[];
	defend: number[];
	attackerLoss: number;
	defenderLoss: number;
}

export type CqEvent =
	| Ev<'gameStarted', { players: number }>
	/** Territories were dealt out: who got which. */
	| Ev<'dealt', { owner: number[] }>
	| Ev<'deployDone', { player: number }>
	| Ev<'turnStarted', { player: number; turn: number; round: number }>
	/** A turn's armies: for the territories held, each region held whole, and in all. */
	| Ev<'reinforcements', { player: number; territories: number; base: number; regions: { region: number; bonus: number }[]; total: number }>
	/** Armies put down (a negative count: taken back). */
	| Ev<'placed', { player: number; territory: number; count: number }>
	/** A set of cards traded in for armies; `bonus` is the territory that got two more, if any. */
	| Ev<'cardsTraded', { player: number; cards: ConquestCard[]; armies: number; bonus: number | null }>
	| Ev<'battle', Battle>
	/** `defender` lost `to` to `player`. */
	| Ev<'captured', { player: number; defender: number; from: number; to: number }>
	| Ev<'occupied', { player: number; from: number; to: number; count: number }>
	| Ev<'attackEnded', { player: number }>
	| Ev<'fortified', { player: number; from: number; to: number; count: number }>
	/** A card drawn for taking a territory this turn: null for everyone but who drew it. */
	| Ev<'cardDrawn', { player: number; card: ConquestCard | null }>
	/** `player` lost their last territory to `by`, who takes their cards. */
	| Ev<'eliminated', { player: number; by: number; cards: number }>
	| Ev<'turnTimedOut', { player: number }>
	| Ev<'gameOver', { winner: number; reason: WinReason }>
	| Ev<'chat', { player: number; text: string }>;

export type CqAction =
	/** Put armies down on a territory of yours (a negative count takes back ones placed this step). */
	| { type: 'place'; territory: number; count: number }
	/** Trade in a set of three cards (by id) for armies. */
	| { type: 'trade'; cards: number[] }
	/**
	 * Attack `to` from `from`, rolling `dice` (the most allowed when left out). With `blitz` the
	 * attack goes on, roll after roll, until the territory falls or `from` can attack no more.
	 */
	| { type: 'attack'; from: number; to: number; dice?: number; blitz?: boolean }
	/** Move armies into the territory just taken. */
	| { type: 'occupy'; count: number }
	| { type: 'endAttack' }
	/** Move armies between two of your territories joined through yours; ends the turn. */
	| { type: 'fortify'; from: number; to: number; count: number }
	| { type: 'endTurn' };

export type CqResult = { ok: true; state: CqState; events: CqEvent[] } | { ok: false; error: string };

export interface CqPlayerView extends Omit<CqPlayer, 'cards' | 'mission'> {
	cardCount: number;
	/** Only your own (or everyone's once the game is over). */
	cards?: ConquestCard[];
	/** Only your own (or everyone's once the game is over). */
	mission?: Mission | null;
}

/** What one player (or a spectator, `me` -1) may see: no one else's cards, nor the deck. */
export interface CqView extends Omit<CqState, 'rng' | 'deck' | 'players'> {
	deckCount: number;
	players: CqPlayerView[];
	me: number;
}
