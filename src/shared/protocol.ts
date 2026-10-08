import type { PlayerColor } from './rules/config';
import type { Action, GameView } from './rules/types';

export interface LobbySeat {
	id: string;
	name: string;
	color: PlayerColor;
	isBot: boolean;
	connected: boolean;
	isHost: boolean;
}

export interface LobbyInfo {
	code: string;
	seats: LobbySeat[];
	started: boolean;
	maxPlayers: number;
}

export type ClientMessage =
	| { t: 'create'; name: string; token?: string }
	| { t: 'join'; code: string; name: string; token?: string }
	| { t: 'setName'; name: string }
	| { t: 'setColor'; color: PlayerColor }
	| { t: 'addBot' }
	| { t: 'removeSeat'; seat: string }
	| { t: 'start' }
	| { t: 'action'; action: Action }
	| { t: 'chat'; text: string }
	| { t: 'leave' }
	| { t: 'ping' };

export type ServerMessage =
	| { t: 'welcome'; code: string; seat: string; token: string }
	| { t: 'lobby'; lobby: LobbyInfo }
	| { t: 'game'; view: GameView }
	| { t: 'error'; message: string }
	| { t: 'pong' };

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
