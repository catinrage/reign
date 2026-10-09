import type { MapChoice } from './board/maps';
import type { Cheat } from './rules/cheats';
import type { CharacterId } from './rules/characters';
import type { PlayerColor } from './rules/config';
import type { GameMode, GameSettings } from './rules/modes';
import type { Action, GameView } from './rules/types';

export interface LobbySeat {
	id: string;
	name: string;
	color: PlayerColor;
	isBot: boolean;
	connected: boolean;
	isHost: boolean;
	/** The character this seat plays in Reign Extended (each one at most once per table). */
	character: CharacterId | null;
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
	seats: LobbySeat[];
	started: boolean;
	maxPlayers: number;
	/** Every player at the table has the game menu open, so bots wait too. */
	paused: boolean;
	/** Seconds each turn may last (0 = no limit), picked by the host before the game starts. */
	turnTime: number;
	/** Mode, map and points to win, picked by the host before the game starts. */
	settings: GameSettings;
	/** The current turn's clock, or null when turns are unlimited or no game is running. */
	clock: TurnClock | null;
}

export type ClientMessage =
	| { t: 'create'; name: string; token?: string }
	| { t: 'join'; code: string; name: string; token?: string }
	| { t: 'setName'; name: string }
	| { t: 'setColor'; color: PlayerColor }
	| { t: 'addBot' }
	| { t: 'removeSeat'; seat: string }
	| { t: 'setTurnTime'; seconds: number }
	| { t: 'setMode'; mode: GameMode }
	| { t: 'setMap'; map: MapChoice }
	| { t: 'setPointsToWin'; points: number }
	| { t: 'setCharacter'; character: CharacterId }
	| { t: 'start' }
	| { t: 'action'; action: Action }
	| { t: 'chat'; text: string }
	| { t: 'pause'; paused: boolean }
	| { t: 'cheat'; cheat: Cheat }
	| { t: 'leave' }
	| { t: 'ping' };

export type ServerMessage =
	/** `cheats` is set when the server runs as the local dev server and accepts dev cheats. */
	| { t: 'welcome'; code: string; seat: string; token: string; cheats?: boolean }
	| { t: 'lobby'; lobby: LobbyInfo }
	| { t: 'game'; view: GameView; clock: TurnClock | null }
	| { t: 'error'; message: string }
	| { t: 'pong' };

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
/** Turn time limits the host can pick, in seconds; 0 is unlimited. */
export const TURN_TIMES = [0, 30, 60, 90, 120, 180];
