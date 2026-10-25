import type { AvatarId, DiceStyleId, FriendsInfo, RoomInvite, Whereabouts } from './accounts';
import type { MapChoice } from './board/maps';
import type { ExtraBuilding } from './rules/buildings';
import type { Cheat } from './rules/cheats';
import type { EventRules } from './rules/events';
import type { HouseRules } from './rules/house';
import type { CharacterId } from './rules/characters';
import type { PlayerColor } from './rules/config';
import type { GameMode, GameSettings } from './rules/modes';
import type { Action, GameView } from './rules/types';
import type { GameKind } from './games';

export interface LobbySeat {
	id: string;
	name: string;
	color: PlayerColor;
	isBot: boolean;
	connected: boolean;
	/** Pressed Leave during the game; a bot plays the seat until they rejoin. */
	left: boolean;
	isHost: boolean;
	/**
	 * Ready to start. The host can only start once every other player is ready; the host and
	 * bots always count as ready. Cleared when a game starts and when the host changes a setting.
	 */
	ready: boolean;
	/** The account of the player in this seat (null for bots). */
	userId: string | null;
	avatar: AvatarId | null;
	/** The dice this player throws, which everyone sees when they roll (null: the classic dice). */
	dice: DiceStyleId | null;
}

/**
 * The current turn's clock. It carries the time left rather than a deadline, so it doesn't matter
 * that the server's and the players' clocks disagree.
 */
export interface TurnClock {
	/** Milliseconds left in the turn when the message was sent. */
	left: number;
	/** False while the table is paused: the time left stays put until play resumes. */
	running: boolean;
}

export interface LobbyInfo {
	code: string;
	/** The game this table plays, picked when it was opened. */
	game: GameKind;
	seats: LobbySeat[];
	started: boolean;
	maxPlayers: number;
	/**
	 * The table is stopped: a player paused the game, or every player at the table has the game
	 * menu open (a game vs bots). Bots and the turn clock wait.
	 */
	paused: boolean;
	/** The seat of the player who paused the game for everyone, or null. Anyone can resume. */
	pausedBy: string | null;
	/** Seconds each turn may last (0 = no limit), picked by the host before the game starts. */
	turnTime: number;
	/** Settlement: mode, map and points to win, picked by the host before the game starts. */
	settings: GameSettings;
	/** The current turn's clock, or null when turns are unlimited or no game is running. */
	clock: TurnClock | null;
	/** How many people are watching the game without a seat. */
	spectators: number;
	/** The solo campaign mission this table plays, or null. */
	mission: string | null;
}

/**
 * A private note carried by pigeon from one player to another. The server hands it to the two of
 * them and nobody else: the rest of the table never learns that a pigeon flew.
 */
export interface PigeonNote {
	/** Rises with every note in the room, so it orders them and tells new ones apart. */
	id: number;
	/** Seat ids of the writer and the reader. */
	from: string;
	to: string;
	text: string;
}

export type ClientMessage =
	/** Open a table for `game` (Settlement when left out). */
	| { t: 'create'; name: string; token?: string; game?: GameKind }
	| { t: 'join'; code: string; name: string; token?: string }
	| { t: 'setName'; name: string }
	| { t: 'setColor'; color: PlayerColor }
	| { t: 'addBot' }
	| { t: 'removeSeat'; seat: string }
	| { t: 'setTurnTime'; seconds: number }
	| { t: 'setMode'; mode: GameMode }
	| { t: 'setMap'; map: MapChoice }
	/** Host: the points to win, in either mode. */
	| { t: 'setPointsToWin'; points: number }
	/** Host: the hand limit on a 7, in either mode (a house rule). */
	| { t: 'setHandLimit'; cards: number }
	/** Host: Reign Extended players draft characters when the game starts, or play without. */
	| { t: 'setCharacters'; on: boolean }
	/** Host: characters come with their powers as well as their traits, or with traits only. */
	| { t: 'setPowers'; on: boolean }
	/** Host: rounds before a used power is ready again (0: once per game); one of POWER_RECHARGES. */
	| { t: 'setRecharge'; rounds: number }
	/** Host: a character someone drafted stays on offer to later pickers, or not. */
	| { t: 'setRepeatPicks'; on: boolean }
	/** Host: leave a character out of the draft, or put it back. */
	| { t: 'leaveOut'; character: CharacterId; out: boolean }
	/** Reign Extended: put one of the extra buildings in the game, or take it out. */
	| { t: 'setBuilding'; building: ExtraBuilding; on: boolean }
	/** Host: Reign Extended's Events deck (on or off, how often, gentle or wild, cards pulled). */
	| { t: 'setEvents'; events: EventRules }
	/** Host: house rules for either mode, the bank's size and the development deck's mix. */
	| { t: 'setHouseRules'; house: HouseRules }
	| { t: 'setReady'; ready: boolean }
	| { t: 'start' }
	/** Play a solo campaign mission at this table (alone with its rivals), or play it again. */
	| { t: 'mission'; mission: string }
	| { t: 'action'; action: Action }
	| { t: 'chat'; text: string }
	/** The game menu opened or closed. */
	| { t: 'pause'; paused: boolean }
	/** Pause the game for everyone, or resume it. */
	| { t: 'pauseGame'; paused: boolean }
	| { t: 'cheat'; cheat: Cheat }
	/** Send a private note by pigeon to the player in seat `to`. */
	| { t: 'pigeon'; to: string; text: string }
	/** The tile under the pointer of the player moving the robber (null when it's on none). */
	| { t: 'aim'; hex: number | null }
	/**
	 * Alt+click (a long press on touch): a beacon at this spot on the map for everyone at the table.
	 * `x` and `z` are in tile radii from the island's middle, as the board is laid out for everyone.
	 */
	| { t: 'beacon'; x: number; z: number }
	| { t: 'leave' }
	/** Is the game at `code` still open, and does `token` still hold a seat there? */
	| { t: 'peek'; code: string; token?: string }
	/** Invite a friend (by account id) to this table. */
	| { t: 'invite'; user: string }
	| { t: 'declineInvite'; id: string }
	/**
	 * This player's own setting: how long a bot keeps its trade offer open for them to answer, in
	 * seconds, one of OFFER_WAITS (0: until they answer). Sent on every join and whenever it changes.
	 */
	| { t: 'offerWait'; seconds: number }
	/** Keeps the line open; `n` asks for a pong carrying it back, to time the round trip. */
	| { t: 'ping'; n?: number };

export type ServerMessage =
	/** `cheats` is set when the server runs as the local dev server and accepts dev cheats. */
	| { t: 'welcome'; code: string; seat: string; token: string; cheats?: boolean }
	| { t: 'lobby'; lobby: LobbyInfo }
	| { t: 'game'; view: GameView; clock: TurnClock | null }
	/** The game had already started, so this connection watches it without a seat (no hands shown). */
	| { t: 'watching'; code: string }
	| { t: 'error'; message: string }
	/** Every note this player wrote or was sent in this room, on joining (or rejoining) it. */
	| { t: 'pigeons'; notes: PigeonNote[] }
	/** A pigeon this player sent, or one that is flying in to them. */
	| { t: 'pigeon'; note: PigeonNote }
	/** The tile `player` is about to move the robber to, as they point at it (null: none now). */
	| { t: 'aim'; player: number; hex: number | null }
	/** `player` lit a beacon at this spot on the map (see the client message). */
	| { t: 'beacon'; player: number; x: number; z: number }
	/**
	 * The answer to a peek: `open` when the game is still going and the token holds a seat in it,
	 * with the names of the players still at the table.
	 */
	| { t: 'peek'; code: string; open: boolean; players: string[] }
	/** Something to tell the player that isn't an error. */
	| { t: 'notice'; message: string }
	/** The connection has no valid sign-in: show the sign-in screen. */
	| { t: 'unauthorized' }
	/** Friends and friend requests, sent on connecting and whenever they change. */
	| { t: 'friends'; friends: FriendsInfo }
	/** A friend came online, sat down at a table, started a game or left. */
	| { t: 'presence'; user: string; where: Whereabouts }
	/** A friend invites this player to their table. */
	| { t: 'invited'; invite: RoomInvite }
	/** The answer to a ping, with its `n`. */
	| { t: 'pong'; n?: number };

/** The most any table seats; how many a game actually takes depends on the mode and island. */
export const MAX_PLAYERS = 8;
/** Classic and the standard-size islands seat four. */
export const CLASSIC_PLAYERS = 4;
export const MIN_PLAYERS = 2;
/** Turn time limits the host can pick, in seconds; 0 is unlimited. */
export const TURN_TIMES = [0, 30, 60, 90, 120, 180];
/**
 * How long a bot's trade offer stays open for a person to answer, in seconds, as each player
 * picks in their own Settings; 0 waits until they answer. The first is the default.
 */
export const OFFER_WAITS = [8, 15, 30, 0];
/** How long a beacon stays lit on the map. */
export const BEACON_MS = 3000;
/** The least time between two beacons from one player; any sooner are dropped. */
export const BEACON_GAP_MS = 400;
/** How far from the island's middle a beacon can be, in tile radii (the biggest islands reach about 20). */
export const BEACON_REACH = 60;
/** The longest note a pigeon carries. */
export const PIGEON_MAX_CHARS = 240;
