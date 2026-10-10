import type { CustomMap } from './board/maps';
import type { CharacterId } from './rules/characters';
import type { PlayerColor } from './rules/config';
import type { GameMode } from './rules/modes';

/**
 * Accounts: what the server and the interface share about players, their friends and the games
 * they played. The server keeps all of it in the database; see src/server/accounts.ts.
 */

/** The premade voxel avatars a player can wear. The art is in src/client/scene/avatars.ts. */
export const AVATARS = [
	'knight',
	'archer',
	'wizard',
	'queen',
	'pirate',
	'monk',
	'bard',
	'farmer',
	'fox',
	'owl',
	'bear',
	'frog'
] as const;
export type AvatarId = (typeof AVATARS)[number];

export const AVATAR_NAMES: Record<AvatarId, string> = {
	knight: 'Knight',
	archer: 'Archer',
	wizard: 'Wizard',
	queen: 'Queen',
	pirate: 'Pirate',
	monk: 'Monk',
	bard: 'Bard',
	farmer: 'Farmer',
	fox: 'Fox',
	owl: 'Owl',
	bear: 'Bear',
	frog: 'Frog'
};

export function isAvatar(a: unknown): a is AvatarId {
	return typeof a === 'string' && (AVATARS as readonly string[]).includes(a);
}

/** Usernames are how friends find each other: lowercase letters, digits and underscores. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const NICKNAME_MAX = 18;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 200;

/** Why a username can't be used, or null when it can. Usernames are stored lowercase. */
export function usernameProblem(name: string): string | null {
	if (name.length < USERNAME_MIN) return `Usernames need at least ${USERNAME_MIN} characters.`;
	if (name.length > USERNAME_MAX) return `Usernames can be at most ${USERNAME_MAX} characters.`;
	if (!/^[a-z0-9_]+$/.test(name)) return 'Usernames use only letters, digits and underscores.';
	return null;
}

export function cleanUsername(name: unknown): string {
	return String(name ?? '')
		.trim()
		.toLowerCase();
}

/** A nickname as shown at the table: letters, digits, spaces and a little punctuation. */
export function cleanNickname(name: unknown): string {
	return String(name ?? '')
		.replace(/[^\p{L}\p{N} _.'-]/gu, '')
		.trim()
		.slice(0, NICKNAME_MAX);
}

export function passwordProblem(pw: unknown): string | null {
	if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) return `Passwords need at least ${PASSWORD_MIN} characters.`;
	if (pw.length > PASSWORD_MAX) return 'That password is too long.';
	return null;
}

/** A player as others see them. */
export interface PublicUser {
	id: string;
	username: string;
	nickname: string;
	avatar: AvatarId;
}

/** The signed-in player. */
export interface Me extends PublicUser {
	createdAt: string;
}

/** Where a friend is right now. */
export type Whereabouts = 'offline' | 'menu' | 'lobby' | 'game';

export interface Friend extends PublicUser {
	where: Whereabouts;
}

export interface FriendRequest {
	user: PublicUser;
	/** They asked you (incoming) or you asked them (outgoing). */
	incoming: boolean;
	at: string;
}

export interface FriendsInfo {
	friends: Friend[];
	requests: FriendRequest[];
}

/** An invitation from a friend to join their table. */
export interface RoomInvite {
	id: string;
	from: PublicUser;
	code: string;
}

export interface MatchPlayer {
	/** Null for bots (and for players whose account is gone). */
	user: PublicUser | null;
	name: string;
	color: PlayerColor;
	isBot: boolean;
	character: CharacterId | null;
	points: number;
	/** 1 for the winner, then by points. Null when the game didn't finish. */
	place: number | null;
}

export interface Match {
	id: number;
	code: string;
	mode: GameMode;
	mapName: string;
	pointsToWin: number;
	status: 'playing' | 'finished' | 'abandoned';
	startedAt: string;
	endedAt: string | null;
	turns: number;
	players: MatchPlayer[];
	/** The game was recorded and can be watched again (games from before replays were kept can't). */
	replay: boolean;
}

export interface MatchStats {
	played: number;
	finished: number;
	won: number;
}

/** A map made in the map maker, kept on the player's account. */
export interface SavedMap {
	id: string;
	map: CustomMap;
}

/** The most maps one account keeps. */
export const MAX_SAVED_MAPS = 200;

export interface MatchHistory {
	user: PublicUser;
	stats: MatchStats;
	matches: Match[];
}
