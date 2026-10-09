import type { Board } from '../board/topology';
import type { BuildingRules } from './buildings';
import type { CharacterId } from './characters';
import type { DevCardType, PlayerColor, Resource, ResourceCounts } from './config';
import type { GameMode } from './modes';

export interface DevCard {
	type: DevCardType;
	/** Turn number it was bought on; it can't be played that same turn. */
	boughtTurn: number;
}

export interface PlayerState {
	name: string;
	color: PlayerColor;
	isBot: boolean;
	/** Reign Extended: the character this player drafted, whose trait bends a rule for them. */
	character: CharacterId | null;
	resources: ResourceCounts;
	devCards: DevCard[];
	knightsPlayed: number;
	piecesLeft: { road: number; settlement: number; city: number };
	longestRoad: number;
}

export interface Building {
	owner: number;
	kind: 'settlement' | 'city';
}

export type TurnStep =
	| 'pickCharacter'
	| 'setupSettlement'
	| 'setupRoad'
	| 'roll'
	| 'discard'
	| 'moveRobber'
	| 'steal'
	| 'main'
	| 'roadBuilding';

export interface TradeOffer {
	id: number;
	from: number;
	give: Partial<ResourceCounts>;
	want: Partial<ResourceCounts>;
	/** Per player: undefined = no answer yet. */
	responses: Record<number, 'accept' | 'decline'>;
}

export interface GameState {
	version: number;
	rng: number;
	mode: GameMode;
	/** Victory points needed to win: always 10 in Classic, the host's pick in Reign Extended. */
	pointsToWin: number;
	/** A 7 makes players holding more cards than this discard half (Classic: 7). */
	handLimit: number;
	/** Name of the map the island was dealt from. */
	mapName: string;
	board: Board;
	players: PlayerState[];
	/** Reign Extended starts with the character draft, then setup as usual. */
	phase: 'draft' | 'setup' | 'main' | 'ended';
	step: TurnStep;
	current: number;
	turn: number;
	/**
	 * Reign Extended's character draft: the characters on offer, who picks in what order (the
	 * reverse of the first round of setup, so whoever places the first settlement picks last),
	 * and how many have picked. Null when there is no draft.
	 */
	draft: { pool: CharacterId[]; order: number[]; picked: number } | null;
	/** Setup: index into the snake order 0..n-1, n-1..0. */
	setupIndex: number;
	setupLastSettlement: number | null;
	dice: [number, number] | null;
	robberHex: number;
	/** Indexed by vertex id. */
	buildings: (Building | null)[];
	/** Indexed by edge id; owner index. */
	roads: (number | null)[];
	/** Reign Extended: which extra buildings the host put in the game (all off in Classic). */
	buildingRules: BuildingRules;
	/** Indexed by hex id: who owns the workshop on that tile, if anyone. */
	workshops: (number | null)[];
	/**
	 * The turn each piece went up on (0: during setup), keyed by `builtKey`: a city keeps the
	 * settlement's entry beside its own. The board's tooltips show it.
	 */
	builtTurns: Record<string, number>;
	bank: ResourceCounts;
	devDeck: DevCardType[];
	devCardPlayedThisTurn: boolean;
	roadBuildingLeft: number;
	/** Step to return to after a knight or road building played before rolling. */
	resumeStep: 'roll' | 'main';
	pendingDiscards: Record<number, number>;
	stealCandidates: number[];
	trade: TradeOffer | null;
	/**
	 * Reign Extended: resources of choice a player is owed by a trait (the Seer's 2s and 12s, the
	 * Jester's catch-up, the Bard's trading partners), one entry per card, naming the trait's
	 * character. Players take them whenever they like with `takePick`; nothing waits on them.
	 */
	picks: Record<number, CharacterId[]>;
	/** The turn the Bard last handed out a trading bonus (once per turn). */
	bardTurn: number;
	/** Cards discarded on the current 7 by anyone but the Abbess, for her alms. */
	alms: Resource[];
	longestRoadHolder: number | null;
	largestArmyHolder: number | null;
	winner: number | null;
	log: GameEvent[];
	nextEventSeq: number;
}

type Ev<T extends string, P> = { seq: number; type: T } & P;

export type GameEvent =
	| Ev<'gameStarted', { players: number }>
	| Ev<'turnStarted', { player: number; turn: number }>
	/** The turn clock ran out; the steps the turn still needed were played for them. */
	| Ev<'turnTimedOut', { player: number }>
	/** `at` is a vertex, an edge, or for a workshop the hex it stands on. */
	| Ev<'built', { player: number; kind: BuiltKind; at: number; free: boolean }>
	| Ev<'setupResources', { player: number; gains: ResourceGain[] }>
	| Ev<'diceRolled', { player: number; dice: [number, number] }>
	| Ev<'produced', { gains: ResourceGain[]; blocked: number[]; shortages: Resource[] }>
	| Ev<'nothingProduced', { total: number }>
	| Ev<'mustDiscard', { players: Record<number, number> }>
	| Ev<'discarded', { player: number; count: number }>
	| Ev<'robberMoved', { player: number; hex: number }>
	/** resource is null for viewers who weren't part of the theft. */
	| Ev<'stole', { thief: number; victim: number; resource: Resource | null }>
	/** A character's trait handed a player something from the bank. */
	| Ev<'traitGain', { player: number; character: CharacterId; resource: Resource }>
	/** A trait owes a player a resource of their choice (`character` is the trait's). */
	| Ev<'pickOwed', { player: number; character: CharacterId }>
	/**
	 * A card passed between players because of a trait: the Witch's purse (the robber's thief pays
	 * her) or the Baron's toll. resource is null for viewers who weren't part of it.
	 */
	| Ev<'traitToll', { from: number; to: number; character: CharacterId; resource: Resource | null }>
	/** The character draft opened; `order` is who picks first to last. */
	| Ev<'draftStarted', { order: number[] }>
	| Ev<'characterPicked', { player: number; character: CharacterId }>
	| Ev<'nothingToSteal', { player: number }>
	| Ev<'devCardBought', { player: number; card: DevCardType | null }>
	| Ev<'devCardPlayed', { player: number; card: DevCardType }>
	| Ev<'yearOfPlenty', { player: number; resources: Resource[] }>
	| Ev<'monopoly', { player: number; resource: Resource; taken: Record<number, number> }>
	| Ev<'bankTrade', { player: number; give: Resource; giveCount: number; get: Resource }>
	| Ev<'tradeOffered', { offer: TradeOffer }>
	| Ev<'tradeCompleted', {
			from: number;
			to: number;
			give: Partial<ResourceCounts>;
			want: Partial<ResourceCounts>;
	  }>
	| Ev<'tradeCancelled', { from: number }>
	| Ev<'longestRoad', { player: number | null; length: number }>
	| Ev<'largestArmy', { player: number | null; knights: number }>
	| Ev<'gameOver', { winner: number; points: number[] }>
	| Ev<'chat', { player: number; text: string }>
	/** A dev cheat was used (only possible on the local dev server). */
	| Ev<'cheat', { player: number; text: string }>;

export type BuiltKind = 'road' | 'settlement' | 'city' | 'workshop';

export interface ResourceGain {
	player: number;
	hex: number;
	resource: Resource;
	amount: number;
	/** The extra card from the player's workshop on the tile. */
	workshop?: true;
}

export type Action =
	| { type: 'pickCharacter'; character: CharacterId }
	| { type: 'placeSettlement'; vertex: number }
	| { type: 'placeRoad'; edge: number }
	| { type: 'buildCity'; vertex: number }
	| { type: 'buildWorkshop'; hex: number }
	| { type: 'rollDice' }
	| { type: 'discard'; resources: Partial<ResourceCounts> }
	| { type: 'moveRobber'; hex: number }
	| { type: 'steal'; victim: number }
	| { type: 'buyDevCard' }
	| { type: 'playKnight' }
	| { type: 'playRoadBuilding' }
	| { type: 'playYearOfPlenty'; resources: [Resource, Resource] }
	| { type: 'playMonopoly'; resource: Resource }
	| { type: 'bankTrade'; give: Resource; get: Resource }
	| { type: 'offerTrade'; give: Partial<ResourceCounts>; want: Partial<ResourceCounts> }
	| { type: 'respondTrade'; offerId: number; accept: boolean }
	| { type: 'confirmTrade'; offerId: number; with: number }
	| { type: 'cancelTrade' }
	| { type: 'endTurn' }
	/** Take a resource a trait owes you (see GameState.picks); allowed at any time. */
	| { type: 'takePick'; resource: Resource };

export type ActionResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

/** What one player is allowed to see. Other players' hands become counts. */
export interface PlayerView {
	name: string;
	color: PlayerColor;
	isBot: boolean;
	character: CharacterId | null;
	resourceCount: number;
	devCardCount: number;
	knightsPlayed: number;
	piecesLeft: { road: number; settlement: number; city: number };
	longestRoad: number;
	publicPoints: number;
	/** Only present for yourself (or for everyone once the game is over). */
	resources?: ResourceCounts;
	devCards?: DevCard[];
	totalPoints?: number;
}

export interface GameView
	extends Omit<GameState, 'rng' | 'devDeck' | 'players' | 'log'> {
	devDeckCount: number;
	players: PlayerView[];
	log: GameEvent[];
	/** Index of the viewer, or -1 for a spectator. */
	me: number;
}
