import type { AvatarId, Match, PublicUser, Whereabouts } from './accounts';
import type { GameKind } from './games';
import type { GameMode } from './rules/modes';

/**
 * The admin panel (/admin, see server/admin.ts) and the pings every copy of the game sends the
 * server (see client/state/telemetry.ts), so it can count guests too, who otherwise never reach it.
 */

/** The sites a copy of the game runs on (see client/platform). */
export const PLATFORMS = ['web', 'itch', 'crazygames'] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(p: unknown): p is Platform {
	return PLATFORMS.includes(p as Platform);
}

/** A guest's game against bots in their own page, as their ping tells it. */
export interface GuestGameReport {
	/** The game's id in that page, so its end finds its start. */
	id: string;
	mode: GameMode;
	/** The campaign mission played, or null. */
	mission: string | null;
	bots: number;
	status: 'playing' | 'won' | 'lost' | 'quit';
	turns: number;
}

/** What a page tells the server, once a minute while it's open and when a guest game starts or ends. */
export interface Ping {
	/** A random id the browser keeps, so a visitor counts once however often they come. */
	client: string;
	platform: Platform;
	/** Playing as a guest (bots in the page) rather than signed in. */
	guest: boolean;
	/** Whether a game is on the table right now. */
	where: 'menu' | 'game';
	/** The page just opened: a new visit. */
	hello?: boolean;
	game?: GuestGameReport;
}

/** One day's numbers for the charts. */
export interface DayStats {
	/** YYYY-MM-DD (UTC). */
	day: string;
	newUsers: number;
	/** Games on the server (with at least one signed-in player). */
	games: number;
	/** Guests' games against bots in their page. */
	guestGames: number;
	/** Browsers that opened the game, signed in and as guests. */
	activeUsers: number;
	activeGuests: number;
}

/** A player online right now, from the game connection. */
export interface OnlinePlayer {
	user: PublicUser;
	where: Whereabouts;
	/** The table they sit at, if any. */
	room: string | null;
}

/** A table on the server right now. */
export interface LiveRoom {
	code: string;
	game: GameKind;
	mode: GameMode;
	/** 'lobby' until the game starts, 'playing', then 'ended' until everyone leaves. */
	state: 'lobby' | 'playing' | 'ended';
	listed: boolean;
	mission: string | null;
	createdAt: number;
	turn: number;
	spectators: number;
	seats: {
		name: string;
		avatar: AvatarId | null;
		isBot: boolean;
		userId: string | null;
		connected: boolean;
		points: number | null;
	}[];
}

/** A page open right now (it pinged in the last few minutes). */
export interface LiveClient {
	platform: Platform;
	guest: boolean;
	where: 'menu' | 'game';
	/** The signed-in player's username, if any. */
	username: string | null;
	since: number;
	game: { mode: GameMode; mission: string | null; bots: number; turns: number } | null;
}

export interface Overview {
	now: number;
	totals: {
		users: number;
		usersCrazyGames: number;
		games: number;
		gamesFinished: number;
		guestGames: number;
		replays: number;
		/** Browsers ever seen, and how many of them never signed in. */
		visitors: number;
		guestVisitors: number;
	};
	recent: {
		newUsers24h: number;
		newUsers7d: number;
		games24h: number;
		guestGames24h: number;
		/** Browsers seen in the last day, week and month. */
		active24h: number;
		active7d: number;
		active30d: number;
	};
	live: {
		/** Signed-in players with the game connection open. */
		usersOnline: number;
		usersInGame: number;
		/** Guests' pages open, and how many have a game on the table. */
		guestsOnline: number;
		guestsInGame: number;
		roomsPlaying: number;
		roomsLobby: number;
	};
	days: DayStats[];
	/** Browsers seen in the last 7 days, by site and guest or not. */
	platforms: { platform: Platform; guests: number; users: number }[];
	/** Games of the last 30 days by mode (server and guest games). */
	modes: { mode: string; games: number; guestGames: number }[];
	/** How guests' games ended, last 30 days. */
	guestOutcomes: { won: number; lost: number; quit: number; playing: number };
	/** Campaign missions guests and players started, last 30 days. */
	missions: { mission: string; played: number; won: number }[];
}

export interface Live {
	now: number;
	rooms: LiveRoom[];
	online: OnlinePlayer[];
	clients: LiveClient[];
}

/** A row of the users list. */
export interface AdminUser {
	id: string;
	username: string;
	nickname: string;
	avatar: AvatarId;
	createdAt: string;
	/** The last time any of their sign-ins was used. */
	lastSeen: string | null;
	crazyGames: boolean;
	played: number;
	won: number;
	friends: number;
	campaignStars: number;
	where: Whereabouts;
	platforms: Platform[];
}

export interface AdminUsers {
	users: AdminUser[];
	total: number;
}

export interface AdminUserDetail {
	user: AdminUser;
	matches: Match[];
	sessions: number;
	maps: number;
	campaign: { mission: string; stars: number; bestRound: number }[];
}

export interface AdminMatches {
	matches: Match[];
	total: number;
}
