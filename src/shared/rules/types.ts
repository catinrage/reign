import type { Board } from '../board/topology';
import type { BuildingRules, CityPath } from './buildings';
import type { CampaignState } from './campaign';
import type { CharacterId } from './characters';
import type { DevCardType, PlayerColor, Resource, ResourceCounts, Terrain } from './config';
import type { EventCard, EventsState, EventsView } from './events';
import type { GameMode } from './modes';
import type { GameStats } from './stats';

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
	/** Reign Extended: the turn this player last used their character's power, or null. */
	powerUsed: number | null;
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
	| 'roadBuilding'
	/** Royal Decree: the player in last place picks the round's event card. */
	| 'eventChoice'
	/** The Seer's Foresight: she has rolled three times and keeps one. */
	| 'chooseRoll';

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
	 * and how many have picked. With `repeats`, a picked character stays on offer to later
	 * pickers. Null when there is no draft.
	 */
	draft: { pool: CharacterId[]; order: number[]; picked: number; repeats?: boolean } | null;
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
	/** Indexed by edge id: whether the road there is paved with stone (Reign Extended). */
	stoneRoads: boolean[];
	/** Indexed by vertex id: whether the settlement or city there has a storehouse (Reign Extended). */
	storehouses: boolean[];
	/** Indexed by vertex id: whether the settlement or city there has a tavern (Reign Extended). */
	taverns: boolean[];
	/** Indexed by vertex id: the path the city there took, if any (Reign Extended). */
	cityPaths: (CityPath | null)[];
	/** Indexed by vertex id: the goods the guild hall there trades with the bank at 2:1. */
	guildGoods: (Resource | null)[];
	/** Reign Extended's Events deck and this round's card; null when the game has no events. */
	events: EventsState | null;
	/**
	 * The turn each piece went up on (0: during setup), keyed by `builtKey`: a city keeps the
	 * settlement's entry beside its own, and a stone road the road's. The board's tooltips show it.
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
	/** Reign Extended: whether characters have their powers in this game. */
	powers: boolean;
	/** Rounds before a used power is ready again; 0: once per game. */
	powerRecharge: number;
	/** Where the robber started (the desert), for the Shepherd's Drive Off. */
	robberHome: number;
	/** Who moved the robber last, or null while it hasn't moved. */
	robberMover: number | null;
	/** The Witch's Hex: rolls each hexed player still collects nothing from. */
	hexed: Record<number, number>;
	/** The Abbess's Blessing: times each blessed tile still pays double. */
	blessed: Record<number, number>;
	/** The Baron's Land Grant: corners (vertex ids) only their claimant may build a settlement on. */
	claims: Record<number, number>;
	/** The Seer's Foresight: the three rolls she chooses from. */
	rollChoices: [number, number][] | null;
	longestRoadHolder: number | null;
	largestArmyHolder: number | null;
	winner: number | null;
	/** Numbers for the end-of-game window, kept from the start; players see them once it's over. */
	stats: GameStats;
	/** A solo campaign mission's rules and story, or null in any other game. */
	campaign: CampaignState | null;
	log: GameEvent[];
	nextEventSeq: number;
}

type Ev<T extends string, P> = { seq: number; type: T } & P;

export type GameEvent =
	| Ev<'gameStarted', { players: number }>
	| Ev<'turnStarted', { player: number; turn: number }>
	/** The turn clock ran out; the steps the turn still needed were played for them. */
	| Ev<'turnTimedOut', { player: number }>
	/**
	 * `at` is a vertex, an edge, or for a workshop the hex it stands on. `paid` is what the player
	 * handed the bank for it (nothing when it was free). A guild hall says the goods it trades.
	 */
	| Ev<
			'built',
			{
				player: number;
				kind: BuiltKind;
				at: number;
				free: boolean;
				paid: Partial<ResourceCounts>;
				resource?: Resource;
			}
	  >
	/** A player tore down their workshop on `hex`; `refund` is what the bank gave back (nothing if it ran out). */
	| Ev<'tornDown', { player: number; hex: number; refund: Partial<ResourceCounts> }>
	| Ev<'setupResources', { player: number; gains: ResourceGain[] }>
	| Ev<'diceRolled', { player: number; dice: [number, number] }>
	/** `hexed`: players who would have collected but are under the Witch's Hex. */
	| Ev<'produced', { gains: ResourceGain[]; blocked: number[]; shortages: Resource[]; hexed?: number[] }>
	| Ev<'nothingProduced', { total: number }>
	| Ev<'mustDiscard', { players: Record<number, number> }>
	/** The cards a player threw back to the bank on a 7. */
	| Ev<'discarded', { player: number; count: number; resources: Partial<ResourceCounts> }>
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
	/** card is null for viewers other than the buyer; `paid` is what they handed the bank. */
	| Ev<'devCardBought', { player: number; card: DevCardType | null; paid: Partial<ResourceCounts> }>
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
	/**
	 * A character's power went off. What it picked, where it applies: a player, a tile (and a
	 * second one for the Cartographer), a corner, a number, the new terrain, or the cards traded.
	 */
	| Ev<'powerUsed', {
			player: number;
			character: CharacterId;
			target?: number;
			hex?: number;
			hex2?: number;
			vertex?: number;
			number?: number;
			terrain?: Terrain;
			give?: Partial<ResourceCounts>;
			get?: Partial<ResourceCounts>;
	  }>
	/** The Seer rolled three times; she keeps one with `keepRoll`. */
	| Ev<'rollChoices', { player: number; rolls: [number, number][] }>
	/** The Jester pooled every hand and dealt it back: how many cards each player held before and after. */
	| Ev<'mischief', { player: number; before: number[]; after: number[] }>
	| Ev<'gameOver', { winner: number; points: number[] }>
	| Ev<'chat', { player: number; text: string }>
	/** A new event card flipped for the round (`by`: who picked it, for a Royal Decree). */
	| Ev<'eventDrawn', { card: EventCard; round: number; by?: number }>
	/**
	 * Cards an event moved between hands and the bank (null). `resource` is null for viewers who
	 * neither gave nor got the card. A Bandit Uprising says where the robber went; a Tournament who won.
	 */
	| Ev<'eventCards', { card: EventCard; moves: EventMove[]; hex?: number; champion?: number }>
	/** Two tiles swapped number tokens. */
	| Ev<'earthquake', { hexes: [number, number] }>
	/** The solo campaign: a line of the story, said by a seat's rival or (null) the narrator. */
	| Ev<'campaignLine', { speaker: number | null; line: string }>
	/** The solo campaign: a rival took a card of tribute from the bank as a round began. */
	| Ev<'tribute', { player: number; resource: Resource }>
	/** A dev cheat was used (only possible on the local dev server). */
	| Ev<'cheat', { player: number; text: string }>;

/** A card an event moved: from a player or the bank (null) to a player or the bank. */
export interface EventMove {
	from: number | null;
	to: number | null;
	resource: Resource | null;
}

/**
 * A stone road is built on top of a road (`at` is its edge), a storehouse or a tavern onto a
 * building and a city path onto a city (their vertex).
 */
export type BuiltKind = 'road' | 'settlement' | 'city' | 'workshop' | 'stoneRoad' | 'storehouse' | 'tavern' | CityPath;

export interface ResourceGain {
	player: number;
	hex: number;
	resource: Resource;
	amount: number;
	/** The extra card from the player's workshop on the tile. */
	workshop?: true;
	/** Doubled by the Abbess's Blessing on the tile. */
	blessed?: true;
}

export type Action =
	| { type: 'pickCharacter'; character: CharacterId }
	| { type: 'placeSettlement'; vertex: number }
	| { type: 'placeRoad'; edge: number }
	| { type: 'buildCity'; vertex: number }
	| { type: 'buildWorkshop'; hex: number }
	| { type: 'paveRoad'; edge: number }
	| { type: 'buildStorehouse'; vertex: number }
	| { type: 'buildTavern'; vertex: number }
	/** A guild hall names the goods it trades. */
	| { type: 'buildCityPath'; vertex: number; path: CityPath; resource?: Resource }
	| { type: 'tearDownWorkshop'; hex: number }
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
	| { type: 'takePick'; resource: Resource }

	/** Royal Decree: the player in last place picks the round's card. */
	| { type: 'chooseEvent'; card: EventCard }
	/** Bountiful Year: take your resource from the bank. */
	| { type: 'claimBounty'; resource: Resource }
	/** Use your character's power; which of the fields it needs depends on the power. */
	| {
			type: 'usePower';
			target?: number;
			hex?: number;
			hex2?: number;
			vertex?: number;
			number?: number;
			terrain?: Terrain;
			give?: Partial<ResourceCounts>;
			get?: Partial<ResourceCounts>;
	  }
	/** The Seer keeps one of her three rolls. */
	| { type: 'keepRoll'; index: number };

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
	powerUsed: number | null;
	publicPoints: number;
	/** Only present for yourself (or for everyone once the game is over). */
	resources?: ResourceCounts;
	devCards?: DevCard[];
	totalPoints?: number;
}

export interface GameView
	extends Omit<GameState, 'rng' | 'devDeck' | 'players' | 'log' | 'events' | 'stats'> {
	devDeckCount: number;
	/** Only once the game is over: they tell who stole what. */
	stats?: GameStats;
	events: EventsView | null;
	players: PlayerView[];
	log: GameEvent[];
	/** Index of the viewer, or -1 for a spectator. */
	me: number;
}
