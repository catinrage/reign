import type { WebSocket } from 'ws';
import type { AvatarId } from '../shared/accounts';
import type {
	ClientMessage,
	LobbyInfo,
	LobbySeat,
	PigeonNote,
	ServerMessage,
	TurnClock
} from '../shared/protocol';
import { MAX_PLAYERS, MIN_PLAYERS, PIGEON_MAX_CHARS, TURN_TIMES } from '../shared/protocol';
import { type CustomMap, type MapChoice, mapName, mapTiles, presetById, validateCustomMap } from '../shared/board/maps';
import { cleanRandomOptions } from '../shared/board/random';
import { randomSeed } from '../shared/rng';
import { botAction, closeOffer } from '../shared/rules/bot';
import { isExtraBuilding } from '../shared/rules/buildings';
import { applyCheat } from '../shared/rules/cheats';
import { EVENT_SHOW_MS, cleanEventRules } from '../shared/rules/events';
import { CHARACTERS, isCharacter } from '../shared/rules/characters';
import {
	DEFAULT_SETTINGS,
	POWER_RECHARGES,
	GAME_MODES,
	characterPool,
	maxPointsFor,
	seatsFor,
	validHandLimit,
	validPointGoal,
	type GameSettings
} from '../shared/rules/modes';
import { PLAYER_COLORS, type PlayerColor } from '../shared/rules/config';
import { addChat, applyAction, createGame, timeOut } from '../shared/rules/engine';
import { Recorder } from '../shared/replay';
import type { Action, GameState } from '../shared/rules/types';
import { viewFor } from '../shared/rules/view';

interface Seat {
	id: string;
	token: string;
	name: string;
	color: PlayerColor;
	isBot: boolean;
	/** Said they are ready to start (only asked of players who aren't the host). */
	ready: boolean;
	sockets: Set<WebSocket>;
	lastSeen: number;
	/** When this seat last sent a pigeon (Date.now() time), to keep the sky from filling up. */
	lastPigeon?: number;
	/** Pressed Leave during a game (rather than losing the connection). Cleared when they rejoin. */
	left: boolean;
	/** The account sitting here (null for bots and for tables without accounts, as in tests). */
	userId: string | null;
	avatar: AvatarId | null;
}

/** The signed-in player taking a seat. */
export interface SeatUser {
	id: string;
	nickname: string;
	avatar: AvatarId;
}

/** Told when a game at the table starts, ends, or the table closes; the match history listens. */
export interface RoomListener {
	gameStarted?(room: Room): void;
	gameEnded?(room: Room): void;
	disposed?(room: Room): void;
}

/** Seconds a disconnected player can stall the table before a bot covers for them. */
const AFK_TAKEOVER_MS = 45_000;
/**
 * How long a room with nobody in it waits for someone to come back before it is cancelled, when
 * not everyone pressed Leave: a reload, a dropped connection or a phone gone to sleep shouldn't
 * end the game. The table waits for them meanwhile.
 */
export const EMPTY_GRACE_MS = 30 * 60_000;
const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dorn', 'Esme', 'Finn', 'Gale', 'Hollis'];
/** The events a roll can end with: what it produced, or on a 7 the discards it calls for. */
const ROLL_ENDS = new Set(['diceRolled', 'produced', 'nothingProduced', 'mustDiscard']);
/** The room keeps this many pigeon notes; older ones are forgotten. */
const PIGEON_KEEP = 400;
/** A player sends at most one pigeon this often. */
const PIGEON_GAP_MS = 600;
/** How long a bot points at the robber's new tile before the robber jumps there. */
const BOT_AIM_MS = 900;
/**
 * How long a bot's trade offer stays open for answers before it takes the best one it has, so a
 * person gets a fair chance to accept before another bot does, and someone who never answers
 * can't hold up the turn.
 */
export const BOT_OFFER_MS = 8000;

export class Room {
	seats: Seat[] = [];
	hostId: string | null = null;
	game: GameState | null = null;
	createdAt = Date.now();
	/** Seconds each turn may last, 0 for no limit. The host picks it in the lobby. */
	turnTime = 0;
	/** Mode, map and points to win. The host picks them in the lobby. */
	settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
	private botTimer: NodeJS.Timeout | null = null;
	/** The bot timer is only checking back later (not a move on its way), so news can cut it short. */
	private botTimerIdle = false;
	/** The open trade offer and when the table first saw it, to time a bot's offer. */
	private offerSeen: { id: number; at: number } | null = null;
	/** Until when the table is showing an event card that just turned over (see EVENT_SHOW_MS). */
	private eventShowUntil = 0;
	/** The newest log entry the table has been sent. */
	private sentSeq = 0;
	/** Dev cheat: bots move almost at once instead of pausing like a person would. */
	private fastBots = false;
	private botActionsThisTurn = 0;
	private botTurnKey = '';
	/** Seats that have the game menu open. */
	private pausedBy = new Set<string>();
	/** The seat that paused the game for everyone, or null. Anyone at the table can resume it. */
	private heldBy: string | null = null;
	/**
	 * The turn clock: the turn it is timing ('' when off), the ms left while it is stopped, and
	 * while it runs, when it runs out (Date.now() time) and the timer for that moment.
	 */
	private clock = { turn: '', left: 0, ends: 0, timer: null as NodeJS.Timeout | null };
	/** People watching a game that started without them. They see what no player hides: no hands. */
	private spectators = new Set<WebSocket>();
	/** Private notes sent by pigeon. Each is only ever sent to its writer and its reader. */
	private pigeons: PigeonNote[] = [];
	private pigeonId = 0;
	/**
	 * The tile the player moving the robber points at, shown on everyone's board. `bot` marks a
	 * bot's pick, which it then moves to.
	 */
	private aim: { player: number; hex: number; bot: boolean } | null = null;
	/** When the last player went away (Date.now() time), or 0 while someone is at the table. */
	private emptySince = 0;
	/** The last player in the lobby pressed Leave (a lobby drops seats, so it can't ask them). */
	private lobbyLeft = false;
	listener: RoomListener | null = null;
	/** Writes the current game down step by step, for watching it again once it's over. */
	recorder: Recorder | null = null;
	/** The listener has heard that the current game ended. */
	private endTold = false;

	/** `cheats` lets players use dev cheats; only the local dev server turns it on. */
	constructor(
		public code: string,
		public cheats = false
	) {}

	get started() {
		return this.game !== null;
	}

	/**
	 * The table stops when a player pauses the game for everyone, when every connected player
	 * has the menu open (a solo game vs bots), or when nobody is connected at all.
	 */
	get paused() {
		if (!this.game || this.game.phase === 'ended') return false;
		if (this.heldBy) return true;
		const humans = this.seats.filter((s) => !s.isBot && s.sockets.size > 0);
		// Nobody is at the table: it waits for them instead of the bots playing it out.
		if (!humans.length) return true;
		return humans.every((s) => this.pausedBy.has(s.id));
	}

	lobbyInfo(): LobbyInfo {
		return {
			code: this.code,
			started: this.started,
			maxPlayers: this.maxPlayers,
			paused: this.paused,
			pausedBy: this.paused ? this.heldBy : null,
			turnTime: this.turnTime,
			settings: this.settings,
			clock: this.clockInfo(),
			spectators: this.spectators.size,
			seats: this.seats.map(
				(s): LobbySeat => ({
					id: s.id,
					name: s.name,
					color: s.color,
					isBot: s.isBot,
					connected: s.isBot || s.sockets.size > 0,
					left: s.left,
					isHost: s.id === this.hostId,
					ready: this.isReady(s),
					userId: s.userId,
					avatar: s.avatar
				})
			)
		};
	}

	/** Whether `token` (or, for a signed-in player, their account) reclaims a player's seat here. */
	hasSeat(token?: string, userId?: string) {
		return this.seats.some((s) => !s.isBot && (userId && s.userId ? s.userId === userId : !!token && s.token === token));
	}

	/**
	 * Watch a game that has already started, without a seat: every hand stays hidden, as it is from
	 * any player who doesn't hold it. Spectators can't act, chat or pause.
	 */
	watch(ws: WebSocket) {
		this.spectators.add(ws);
		send(ws, { t: 'watching', code: this.code });
		this.broadcastLobby();
		if (!this.game) return;
		send(ws, { t: 'game', view: viewFor(this.game, -1), clock: this.clockInfo() });
		if (this.aim) send(ws, { t: 'aim', player: this.aim.player, hex: this.aim.hex });
	}

	/**
	 * Join with a saved token to reclaim a seat, or take a new one while in the lobby. A signed-in
	 * player gets their own seat back wherever they join from, and sits under their nickname.
	 */
	join(ws: WebSocket, name: string, token?: string, user?: SeatUser): Seat | string {
		let seat = token ? this.seats.find((s) => s.token === token && !s.isBot) : undefined;
		if (seat && user && seat.userId && seat.userId !== user.id) seat = undefined;
		if (!seat && user) seat = this.seats.find((s) => s.userId === user.id);
		if (!seat) {
			if (this.started) return 'That game has already started.';
			if (this.seats.length >= this.maxPlayers) return 'That table is full.';
			seat = {
				id: randomHex(6),
				token: randomHex(16),
				name: cleanName(name) || `Player ${this.seats.length + 1}`,
				color: this.freeColor(),
				isBot: false,
				ready: false,
				sockets: new Set(),
				lastSeen: Date.now(),
				left: false,
				userId: user?.id ?? null,
				avatar: user?.avatar ?? null
			};
			if (user) seat.name = cleanName(user.nickname) || seat.name;
			this.seats.push(seat);
		}
		seat.sockets.add(ws);
		seat.lastSeen = Date.now();
		seat.left = false;
		this.emptySince = 0;
		this.lobbyLeft = false;
		// A fresh connection starts with the menu closed; the client says so if it is open.
		this.pausedBy.delete(seat.id);
		const host = this.seats.find((s) => s.id === this.hostId && !s.isBot);
		if (!host || (host.left && host !== seat)) {
			this.hostId = seat.id;
		}
		send(ws, {
			t: 'welcome',
			code: this.code,
			seat: seat.id,
			token: seat.token,
			...(this.cheats ? { cheats: true } : {})
		});
		send(ws, { t: 'pigeons', notes: this.pigeons.filter((n) => n.from === seat!.id || n.to === seat!.id) });
		this.broadcastLobby();
		if (this.game) {
			send(ws, {
				t: 'game',
				view: viewFor(this.game, this.seatIndex(seat)),
				clock: this.clockInfo()
			});
			const aim = this.aim;
			if (aim && aim.player !== this.seatIndex(seat)) send(ws, { t: 'aim', player: aim.player, hex: aim.hex });
			// A table that waited while nobody was at it goes on.
			this.scheduleBots();
		}
		return seat;
	}

	disconnect(ws: WebSocket) {
		if (this.spectators.delete(ws)) return this.broadcastLobby();
		for (const s of this.seats) {
			if (s.sockets.delete(ws)) {
				s.lastSeen = Date.now();
				if (!s.sockets.size) this.pausedBy.delete(s.id);
			}
		}
		if (this.isEmpty()) this.emptySince ||= Date.now();
		if (!this.started) {
			// In the lobby an empty seat is just gone.
			this.seats = this.seats.filter((s) => s.isBot || s.sockets.size > 0);
			if (!this.seats.find((s) => s.id === this.hostId)) {
				this.hostId = this.seats.find((s) => !s.isBot)?.id ?? null;
			}
		}
		this.broadcastLobby();
		this.scheduleBots();
	}

	handle(seat: Seat, msg: ClientMessage, ws: WebSocket) {
		const isHost = seat.id === this.hostId;
		switch (msg.t) {
			case 'setName':
				// Signed-in players go by their nickname, changed on their profile.
				if (seat.userId || (this.started && this.game!.phase !== 'ended')) return;
				seat.name = cleanName(msg.name) || seat.name;
				return this.broadcastLobby();
			case 'setColor':
				if (this.started || !PLAYER_COLORS.includes(msg.color)) return;
				if (this.seats.some((s) => s !== seat && s.color === msg.color)) {
					return send(ws, { t: 'error', message: 'Someone already has that color.' });
				}
				seat.color = msg.color;
				return this.broadcastLobby();
			case 'addBot': {
				if (!isHost || this.started) return;
				if (this.seats.length >= this.maxPlayers) return send(ws, { t: 'error', message: 'The table is full.' });
				const used = new Set(this.seats.map((s) => s.name));
				this.seats.push({
					id: randomHex(6),
					token: randomHex(16),
					name: BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot',
					color: this.freeColor(),
					isBot: true,
					ready: true,
					sockets: new Set(),
					lastSeen: Date.now(),
					left: false,
					userId: null,
					avatar: null
				});
				return this.broadcastLobby();
			}
			case 'removeSeat':
				if (!isHost || this.started) return;
				this.seats = this.seats.filter((s) => s.id !== msg.seat || !s.isBot);
				return this.broadcastLobby();
			case 'setTurnTime':
				if (!isHost || this.started || !TURN_TIMES.includes(msg.seconds)) return;
				if (this.turnTime !== msg.seconds) this.unready();
				this.turnTime = msg.seconds;
				return this.broadcastLobby();
			case 'setMode':
				if (!isHost || this.lockedSettings || !GAME_MODES.includes(msg.mode)) return;
				{
					const full = this.tooMany({ ...this.settings, mode: msg.mode });
					if (full) return send(ws, { t: 'error', message: full });
				}
				if (this.settings.mode !== msg.mode) this.unready();
				this.settings.mode = msg.mode;
				return this.broadcastLobby();
			case 'setMap': {
				if (!isHost || this.lockedSettings) return;
				const map = cleanMap(msg.map);
				if (typeof map === 'string') return send(ws, { t: 'error', message: map });
				const full = this.tooMany({ ...this.settings, map });
				if (full) return send(ws, { t: 'error', message: full });
				if (JSON.stringify(map) !== JSON.stringify(this.settings.map)) this.unready();
				this.settings.map = map;
				return this.broadcastLobby();
			}
			case 'setPointsToWin':
				if (!isHost || this.lockedSettings || !validPointGoal(msg.points)) return;
				if (msg.points > this.pointsCap) {
					return send(ws, {
						t: 'error',
						message: `${mapName(this.settings.map)} with ${this.seats.length} players plays to at most ${this.pointsCap} points.`
					});
				}
				if (this.settings.pointsToWin !== msg.points) this.unready();
				this.settings.pointsToWin = msg.points;
				return this.broadcastLobby();
			case 'setHandLimit':
				if (!isHost || this.lockedSettings || !validHandLimit(msg.cards)) return;
				if (this.settings.handLimit !== msg.cards) this.unready();
				this.settings.handLimit = msg.cards;
				return this.broadcastLobby();
			case 'setBuilding':
				if (!isHost || this.lockedSettings || !isExtraBuilding(msg.building)) return;
				if (this.settings.buildings[msg.building] !== !!msg.on) this.unready();
				this.settings.buildings[msg.building] = !!msg.on;
				return this.broadcastLobby();
			case 'setEvents': {
				if (!isHost || this.lockedSettings) return;
				const events = cleanEventRules(msg.events);
				if (JSON.stringify(events) !== JSON.stringify(this.settings.events)) this.unready();
				this.settings.events = events;
				return this.broadcastLobby();
			}
			case 'setCharacters':
				if (!isHost || this.lockedSettings) return;
				if (this.settings.characters !== !!msg.on) this.unready();
				this.settings.characters = !!msg.on;
				return this.broadcastLobby();
			case 'setPowers':
				if (!isHost || this.lockedSettings) return;
				if (this.settings.powers !== !!msg.on) this.unready();
				this.settings.powers = !!msg.on;
				return this.broadcastLobby();
			case 'setRecharge':
				if (!isHost || this.lockedSettings || !POWER_RECHARGES.includes(msg.rounds)) return;
				if (this.settings.powerRecharge !== msg.rounds) this.unready();
				this.settings.powerRecharge = msg.rounds;
				return this.broadcastLobby();
			case 'setRepeatPicks':
				if (!isHost || this.lockedSettings) return;
				if (this.settings.repeatPicks !== !!msg.on) this.unready();
				this.settings.repeatPicks = !!msg.on;
				return this.broadcastLobby();
			case 'leaveOut': {
				if (!isHost || this.lockedSettings || !isCharacter(msg.character)) return;
				const left = new Set(this.settings.leftOut);
				if (msg.out) left.add(msg.character);
				else left.delete(msg.character);
				// Keep the roster's order so the lobby reads the same for everyone.
				const leftOut = CHARACTERS.filter((c) => left.has(c));
				if (leftOut.length === CHARACTERS.length) {
					return send(ws, { t: 'error', message: 'Keep at least one character, or turn characters off.' });
				}
				if (leftOut.join() !== this.settings.leftOut.join()) this.unready();
				this.settings.leftOut = leftOut;
				return this.broadcastLobby();
			}
			case 'setReady':
				if (this.lockedSettings || seat.isBot) return;
				seat.ready = !!msg.ready;
				return this.broadcastLobby();
			case 'start':
				if (!isHost || (this.game && this.game.phase !== 'ended')) return;
				if (this.seats.length < MIN_PLAYERS) {
					return send(ws, { t: 'error', message: 'You need at least two players. Add a bot!' });
				}
				{
					const waiting = this.seats.filter((s) => !this.isReady(s));
					if (waiting.length) {
						const names = waiting.map((s) => s.name).join(', ');
						return send(ws, { t: 'error', message: `Waiting for ${names} to be ready.` });
					}
				}
				{
					const short = this.draftShort();
					if (short) return send(ws, { t: 'error', message: short });
				}
				for (const s of this.seats) if (!s.isBot) s.ready = false;
				this.pausedBy.clear();
				this.heldBy = null;
				// Random seating order makes the first player fair.
				this.seats.sort(() => Math.random() - 0.5);
				this.game = createGame(
					this.seats.map((s) => ({ name: s.name, color: s.color, isBot: s.isBot })),
					randomSeed(),
					undefined,
					this.settings
				);
				this.endTold = false;
				this.recorder = new Recorder(this.game);
				this.listener?.gameStarted?.(this);
				this.broadcastLobby();
				this.broadcastGame();
				return this.scheduleBots();
			case 'action': {
				if (!this.game) return;
				if (this.heldBy) return send(ws, { t: 'error', message: 'The game is paused.' });
				const res = applyAction(this.game, this.seatIndex(seat), msg.action);
				if (!res.ok) return send(ws, { t: 'error', message: res.error });
				this.game = res.state;
				this.broadcastGame();
				return this.scheduleBots();
			}
			case 'chat': {
				const text = String(msg.text ?? '').trim();
				if (!text || !this.game) return;
				this.game = addChat(this.game, this.seatIndex(seat), text);
				return this.broadcastGame();
			}
			case 'pause': {
				const was = this.paused;
				if (msg.paused) this.pausedBy.add(seat.id);
				else this.pausedBy.delete(seat.id);
				if (this.paused === was) return;
				return this.pauseChanged();
			}
			case 'pauseGame': {
				if (!this.game || this.game.phase === 'ended') return;
				const held = msg.paused ? (this.heldBy ?? seat.id) : null;
				if (held === this.heldBy) return;
				this.heldBy = held;
				return this.pauseChanged();
			}
			case 'aim': {
				const g = this.game;
				const player = this.seatIndex(seat);
				if (!g || g.step !== 'moveRobber' || g.current !== player) return;
				const hex = msg.hex;
				if (hex !== null && (!Number.isInteger(hex) || !g.board.hexes[hex] || hex === g.robberHex)) return;
				return this.setAim(player, hex, false);
			}
			case 'cheat': {
				if (!this.cheats) return send(ws, { t: 'error', message: 'Cheats only work on the dev server.' });
				if (!this.game) return;
				const res = applyCheat(this.game, this.seatIndex(seat), msg.cheat);
				if (!res.ok) return send(ws, { t: 'error', message: res.error });
				if (msg.cheat.type === 'fastBots') this.fastBots = !!msg.cheat.on;
				this.game = res.state;
				this.aim = null;
				if (this.botTimer) {
					// The table changed under a bot that was about to move: let it look again.
					clearTimeout(this.botTimer);
					this.botTimer = null;
				}
				this.broadcastGame();
				return this.scheduleBots();
			}
			case 'pigeon':
				return this.sendPigeon(seat, msg.to, msg.text, ws);
			case 'leave':
				seat.sockets.delete(ws);
				if (this.started) {
					seat.left = true;
					if (isHost) this.passHost();
				} else {
					this.lobbyLeft = this.seats.every((s) => s === seat || s.isBot || !s.sockets.size);
				}
				return this.disconnect(ws);
		}
	}

	/**
	 * A private note from one player to another. Only the two of them hear of it: the note goes to
	 * the reader's connections and back to the writer's, never to anyone else, and the game log
	 * doesn't mention it. Bots can't read, so they get no pigeons.
	 */
	private sendPigeon(seat: Seat, to: string, text: unknown, ws: WebSocket) {
		const reader = this.seats.find((s) => s.id === to);
		if (!reader || reader === seat || reader.isBot || seat.isBot) {
			return send(ws, { t: 'error', message: 'Pigeons only fly to other players at the table.' });
		}
		const clean = String(text ?? '')
			.replace(/[\u0000-\u001f\u007f]/g, ' ')
			.trim()
			.slice(0, PIGEON_MAX_CHARS);
		if (!clean) return;
		const now = Date.now();
		if (seat.lastPigeon && now - seat.lastPigeon < PIGEON_GAP_MS) {
			return send(ws, { t: 'error', message: 'Your last pigeon is still taking off.' });
		}
		seat.lastPigeon = now;
		const note: PigeonNote = { id: ++this.pigeonId, from: seat.id, to: reader.id, text: clean };
		this.pigeons.push(note);
		if (this.pigeons.length > PIGEON_KEEP) this.pigeons.splice(0, this.pigeons.length - PIGEON_KEEP);
		for (const s of [seat, reader]) for (const w of s.sockets) send(w, { t: 'pigeon', note });
	}

	/** Stop the bots when the table pauses, let them go on when it resumes, and tell everyone. */
	private pauseChanged() {
		if (this.paused && this.botTimer) {
			clearTimeout(this.botTimer);
			this.botTimer = null;
		}
		this.broadcastLobby();
		this.scheduleBots();
	}

	isEmpty() {
		return this.seats.every((s) => s.isBot || s.sockets.size === 0);
	}

	/** Whether `token` holds a seat in this game, and who is still at the table. */
	peek(token?: string, userId?: string): { open: boolean; players: string[] } {
		// A signed-in player's seat is theirs by account, whichever browser holds its token.
		const holds = (s: Seat) => (userId && s.userId ? s.userId === userId : !!token && s.token === token);
		const mine = this.started && this.seats.some((s) => !s.isBot && holds(s));
		const players = this.seats.filter((s) => !s.isBot && s.sockets.size > 0).map((s) => s.name);
		return { open: mine && players.length > 0, players };
	}

	/**
	 * Nobody is left at the table, so the game is cancelled: at once when everyone pressed Leave,
	 * or once EMPTY_GRACE_MS has passed when someone only lost their connection. While even one
	 * player stays, the room stays open and the others can rejoin their seats.
	 */
	abandoned(now = Date.now()): boolean {
		if (!this.isEmpty()) return false;
		const humans = this.seats.filter((s) => !s.isBot);
		const everyoneLeft = this.started ? humans.every((s) => s.left) : this.lobbyLeft;
		return everyoneLeft || now - (this.emptySince || this.createdAt) >= EMPTY_GRACE_MS;
	}

	dispose() {
		for (const ws of this.spectators) send(ws, { t: 'error', message: 'Every player has left, so this game is over.' });
		this.spectators.clear();
		if (this.botTimer) clearTimeout(this.botTimer);
		this.stopClock();
		this.listener?.disposed?.(this);
	}

	/** A player at this table changed their profile. Names stay put while a game runs. */
	updateUser(userId: string, nickname: string, avatar: AvatarId) {
		const seat = this.seats.find((s) => s.userId === userId);
		if (!seat) return;
		seat.avatar = avatar;
		if (!this.lockedSettings) seat.name = cleanName(nickname) || seat.name;
		this.broadcastLobby();
	}

	private seatIndex(seat: Seat) {
		return this.seats.indexOf(seat);
	}

	/** Lobby settings can change before the first game and between games, never during one. */
	private get lockedSettings() {
		return !!this.game && this.game.phase !== 'ended';
	}

	/** How many players the chosen mode and island seat. */
	get maxPlayers() {
		return Math.min(MAX_PLAYERS, seatsFor(this.settings));
	}

	/** Why these settings can't seat everyone already at the table, or null if they can. */
	private tooMany(settings: GameSettings): string | null {
		const seats = Math.min(MAX_PLAYERS, seatsFor(settings));
		if (this.seats.length <= seats) return null;
		const what = settings.mode === 'extended' ? mapName(settings.map) : 'Classic';
		return `${what} seats up to ${seats} players, and ${this.seats.length} are at the table.`;
	}

	/**
	 * The host and bots are always ready; everyone else says so. Between games a player who has
	 * left doesn't hold up a rematch: a bot covers their seat, as it did while they were away.
	 */
	private isReady(s: Seat) {
		return s.isBot || s.id === this.hostId || s.ready || (this.started && !s.sockets.size);
	}

	/** The host changed what will be played, so everyone confirms again. */
	private unready() {
		for (const s of this.seats) if (!s.isBot) s.ready = false;
	}

	/** The host walked out of a game: someone still at the table hosts the rematch. */
	private passHost() {
		const next = this.seats.find((s) => !s.isBot && s.id !== this.hostId && s.sockets.size > 0);
		if (next) this.hostId = next.id;
	}

	/** Why the character draft can't seat everyone: fewer characters than players. */
	private draftShort(): string | null {
		if (this.settings.mode !== 'extended' || !this.settings.characters || this.settings.repeatPicks) return null;
		const pool = characterPool(this.settings).length;
		if (pool >= this.seats.length) return null;
		return `${this.seats.length} players need at least ${this.seats.length} characters in the draft, and ${pool} are in.`;
	}

	private freeColor(): PlayerColor {
		return PLAYER_COLORS.find((c) => !this.seats.some((s) => s.color === c)) ?? 'white';
	}

	/**
	 * The highest goal this island and table can reach (Reign Extended only; Classic always plays
	 * to 10). See maxPointsFor.
	 */
	get pointsCap() {
		if (this.settings.mode !== 'extended') return Infinity;
		return maxPointsFor(mapTiles(this.settings.map)?.length ?? 19, this.seats.length);
	}

	/** A smaller island or a fuller table lowers the goal to what it can still reach. */
	private fitPoints() {
		if (this.lockedSettings || this.settings.pointsToWin <= this.pointsCap) return;
		this.settings.pointsToWin = this.pointsCap;
		this.unready();
	}

	private broadcastLobby() {
		this.fitPoints();
		this.syncClock();
		const lobby = this.lobbyInfo();
		for (const s of this.seats) for (const ws of s.sockets) send(ws, { t: 'lobby', lobby });
		for (const ws of this.spectators) send(ws, { t: 'lobby', lobby });
	}

	/** Tell everyone but the player aiming which tile the robber is aimed at (null: none). */
	private setAim(player: number, hex: number | null, bot: boolean) {
		const was = this.aim;
		this.aim = hex === null ? null : { player, hex, bot };
		if (was ? was.player === player && was.hex === hex : hex === null) return;
		this.seats.forEach((s, i) => {
			if (i === player) return;
			for (const ws of s.sockets) send(ws, { t: 'aim', player, hex });
		});
		for (const ws of this.spectators) send(ws, { t: 'aim', player, hex });
	}

	private broadcastGame() {
		if (!this.game) return;
		// Once the robber has moved (or the turn moved on), nobody is aiming it.
		const g = this.game;
		if (this.aim && (g.step !== 'moveRobber' || g.current !== this.aim.player)) this.aim = null;
		this.recorder?.record(g);
		if (this.game.phase === 'ended' && !this.endTold) {
			this.endTold = true;
			this.listener?.gameEnded?.(this);
		}
		// A card that just turned over holds the table while everyone watches it play out.
		const newest = g.log.length ? g.log[g.log.length - 1].seq : 0;
		if (newest < this.sentSeq) this.sentSeq = 0; // a new game's log starts over
		const fresh = g.log.filter((e) => e.seq > this.sentSeq);
		if (fresh.length) this.sentSeq = fresh[fresh.length - 1].seq;
		if (fresh.some((e) => e.type === 'eventDrawn') && !this.fastBots) this.eventShowUntil = Date.now() + EVENT_SHOW_MS;
		this.syncClock();
		const clock = this.clockInfo();
		this.seats.forEach((s, i) => {
			if (!s.sockets.size) return;
			const view = viewFor(this.game!, i);
			for (const ws of s.sockets) send(ws, { t: 'game', view, clock });
		});
		if (!this.spectators.size) return;
		const view = viewFor(this.game, -1);
		for (const ws of this.spectators) send(ws, { t: 'game', view, clock });
	}

	/** What players are told: the time left, not a deadline, since their clocks differ from ours. */
	private clockInfo(): TurnClock | null {
		const c = this.clock;
		if (!c.turn) return null;
		if (!c.ends) return { left: c.left, running: false };
		return { left: Math.max(0, c.ends - Date.now()), running: true };
	}

	/**
	 * Bring the turn clock in line with the table: a new turn gets the full time, a pause freezes
	 * what is left and the end of the pause starts it again. Every change to the table is sent
	 * out through the broadcasts, so they call this first and each message carries the clock.
	 */
	private syncClock() {
		const c = this.clock;
		const g = this.game;
		const turn = this.turnTime && g && g.phase !== 'ended' ? clockTurn(g) : '';
		if (turn !== c.turn) {
			this.stopClock();
			c.turn = turn;
			// A turn that starts with an event card being shown gets that time on top.
			c.left = this.turnTime * 1000 + Math.max(0, this.eventShowUntil - Date.now());
		}
		if (!turn) return;
		if (this.paused) this.stopClock();
		else if (!c.ends) {
			c.ends = Date.now() + c.left;
			c.timer = setTimeout(() => this.timeUp(), c.left);
		}
	}

	/** Stop the clock, keeping the time it had left. */
	private stopClock() {
		const c = this.clock;
		if (c.timer) clearTimeout(c.timer);
		if (c.ends) c.left = Math.max(0, c.ends - Date.now());
		c.timer = null;
		c.ends = 0;
	}

	/**
	 * The turn ran out of time: play only the steps it can't end without (the roll, the robber,
	 * setup placements, discards still owed), never an optional move, and end it.
	 */
	private timeUp() {
		const c = this.clock;
		c.timer = null;
		c.ends = 0;
		c.left = 0;
		if (!this.game || this.game.phase === 'ended') return;
		let g = timeOut(this.game);
		for (let i = 0; i < 20 && g.phase !== 'ended' && clockTurn(g) === c.turn; i++) {
			const move = forcedMove(g);
			const res = move && applyAction(g, move.player, move.action);
			if (res?.ok) {
				g = res.state;
				continue;
			}
			// Should never happen, but the table must not get stuck: try ending the turn outright.
			const end = applyAction(g, g.current, { type: 'endTurn' });
			if (!end.ok) {
				console.warn(`[room ${this.code}] timed-out turn stuck at ${g.step}`);
				break;
			}
			g = end.state;
		}
		// A turn that still can't move on gets a fresh clock rather than one that has run out.
		if (clockTurn(g) === c.turn) c.turn = '';
		this.game = g;
		this.broadcastGame();
		this.scheduleBots();
	}

	/** Bots (and stand-ins for players who dropped) act one step at a time, with a human-ish pause. */
	private scheduleBots() {
		if (this.botTimer && this.botTimerIdle) {
			clearTimeout(this.botTimer);
			this.botTimer = null;
		}
		if (this.botTimer || !this.game || this.game.phase === 'ended' || this.paused) return;
		const next = this.nextBotMove();
		if (!next) {
			// A bot waiting on answers to its offer closes it once its time is up; and someone may go
			// AFK later. Check back.
			const g = this.game;
			const offer = g.trade && this.offerSeen && this.controlled(g.trade.from) ? this.offerSeen : null;
			const wait = offer ? Math.max(50, offer.at + BOT_OFFER_MS - Date.now()) : 5000;
			if (offer || this.seats.some((s) => !s.isBot && s.sockets.size === 0)) {
				this.botTimerIdle = true;
				this.botTimer = setTimeout(() => {
					this.botTimer = null;
					this.scheduleBots();
				}, Math.min(wait, 5000));
			}
			return;
		}
		this.botTimerIdle = false;
		const last = this.game.log[this.game.log.length - 1];
		let delay = 650 + Math.random() * 500;
		// After a roll, whatever it ended with, bots give the dice time to land before moving on.
		if (last && ROLL_ENDS.has(last.type)) delay += 1300;
		if (last?.type === 'turnStarted') delay += 400;
		if (next.action.type === 'respondTrade') delay += 600;
		// Nobody moves while an event card is being shown.
		delay = Math.max(delay, this.eventShowUntil - Date.now() + 300);
		// A bot that has pointed at the robber's tile moves it there after a moment.
		if (this.botAim(next.player) !== null) delay = BOT_AIM_MS;
		if (this.fastBots) delay = 60;
		this.botTimer = setTimeout(() => {
			this.botTimer = null;
			if (!this.game || this.paused) return;
			// An event card turned over since this move was planned: wait for it to play out.
			if (Date.now() < this.eventShowUntil && !this.fastBots) return this.scheduleBots();
			let move = this.nextBotMove();
			if (move?.action.type === 'moveRobber' && !this.fastBots) {
				const aimed = this.botAim(move.player);
				if (aimed === null) {
					// Like a person would, the bot first points at the tile (everyone sees it light
					// up), and moves the robber there on its next go.
					this.setAim(move.player, move.action.hex, true);
					return this.scheduleBots();
				}
				move = { player: move.player, action: { type: 'moveRobber', hex: aimed } };
			}
			if (move) {
				const res = applyAction(this.game, move.player, move.action);
				if (res.ok) this.game = res.state;
				else {
					// A bot should never get stuck: fall back to ending the turn.
					const end = applyAction(this.game, move.player, { type: 'endTurn' });
					if (end.ok) this.game = end.state;
					else console.warn(`[room ${this.code}] bot failed: ${res.error}`);
				}
				if (move.player === this.game.current) this.botActionsThisTurn++;
				this.broadcastGame();
			}
			this.scheduleBots();
		}, delay);
	}

	/** The tile a bot moving the robber has pointed at, if it still can move it there. */
	private botAim(player: number): number | null {
		const g = this.game;
		const aim = this.aim;
		if (!g || !aim?.bot || aim.player !== player || g.step !== 'moveRobber' || g.current !== player) return null;
		return aim.hex !== g.robberHex && g.board.hexes[aim.hex] ? aim.hex : null;
	}

	private nextBotMove() {
		const g = this.game!;
		const turnKey = `${g.turn}:${g.current}`;
		if (turnKey !== this.botTurnKey) {
			this.botTurnKey = turnKey;
			this.botActionsThisTurn = 0;
		}
		if (g.trade && g.trade.id !== this.offerSeen?.id) this.offerSeen = { id: g.trade.id, at: Date.now() };
		// Out-of-turn answers first (discards, trade replies), then the active player.
		for (let i = 0; i < this.seats.length; i++) {
			if (i === g.current || !this.controlled(i)) continue;
			const action = botAction(g, i);
			if (action) return { player: i, action };
		}
		if (this.controlled(g.current)) {
			const action = botAction(g, g.current, this.botActionsThisTurn);
			if (action) return { player: g.current, action };
			// Its own offer, still short of answers: once its time is up it takes the best it has.
			const waited = this.offerSeen && Date.now() - this.offerSeen.at >= (this.fastBots ? 0 : BOT_OFFER_MS);
			if (g.trade?.from === g.current && waited) return { player: g.current, action: closeOffer(g, g.current) };
		}
		return null;
	}

	/** Whether bot logic plays a seat: a bot, a player who left, or one away long enough. */
	private controlled(i: number): boolean {
		const s = this.seats[i];
		if (s.isBot || s.left) return true;
		return s.sockets.size === 0 && Date.now() - s.lastSeen > AFK_TAKEOVER_MS;
	}
}

/** `bytes` random bytes as hex. Web Crypto, so the offline build can run rooms in the browser too. */
function randomHex(bytes: number): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function send(ws: WebSocket, msg: ServerMessage) {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** What the turn clock times: each pick in the character draft, each setup placement (the snake's double one too), then each turn. */
function clockTurn(g: GameState): string {
	if (g.phase === 'draft') return `draft ${g.draft!.picked}`;
	return g.phase === 'setup' ? `setup ${g.setupIndex}` : `${g.turn}:${g.current}`;
}

/** The next step a timed-out turn can't end without, and whose it is. Never an optional move. */
function forcedMove(g: GameState): { player: number; action: Action } | null {
	// An open offer is withdrawn.
	if (g.trade) return { player: g.trade.from, action: { type: 'cancelTrade' } };
	if (g.step === 'roll') return { player: g.current, action: { type: 'rollDice' } };
	if (g.step === 'main') return { player: g.current, action: { type: 'endTurn' } };
	// Discards still owed, setup placements, the robber, the steal and a Royal Decree's pick:
	// what a bot would pick.
	const who =
		g.step === 'discard'
			? Number(Object.keys(g.pendingDiscards)[0])
			: g.step === 'eventChoice'
				? (g.events?.choice?.player ?? g.current)
				: g.current;
	const action = botAction(g, who);
	return action && { player: who, action };
}

/** A map choice from a client, checked; or why it can't be played. */
function cleanMap(map: MapChoice): MapChoice | string {
	if (map && 'preset' in map && typeof map.preset === 'string') {
		return presetById(map.preset) ? { preset: map.preset } : 'Unknown map.';
	}
	if (!map || !('custom' in map) || !map.custom || !Array.isArray(map.custom.tiles)) return 'That map is empty.';
	const custom: CustomMap = {
		name: cleanName(map.custom.name) || 'Custom map',
		tiles: map.custom.tiles.slice(0, 1000).map((t) => ({ q: Number(t?.q), r: Number(t?.r), terrain: t?.terrain ?? null }))
	};
	if (map.custom.random) custom.random = cleanRandomOptions(map.custom.random);
	return validateCustomMap(custom) ?? { custom };
}

function cleanName(name: unknown): string {
	return String(name ?? '')
		.replace(/[^\p{L}\p{N} _.'-]/gu, '')
		.trim()
		.slice(0, 18);
}
