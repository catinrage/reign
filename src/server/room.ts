import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import type {
	ClientMessage,
	LobbyInfo,
	LobbySeat,
	ServerMessage,
	TurnClock
} from '../shared/protocol';
import { MAX_PLAYERS, MIN_PLAYERS, TURN_TIMES } from '../shared/protocol';
import { type MapChoice, presetById, validateCustomMap } from '../shared/board/maps';
import { randomSeed } from '../shared/rng';
import { botAction } from '../shared/rules/bot';
import { applyCheat } from '../shared/rules/cheats';
import { CHARACTERS, type CharacterId, isCharacter } from '../shared/rules/characters';
import { DEFAULT_SETTINGS, GAME_MODES, POINT_GOALS, type GameSettings } from '../shared/rules/modes';
import { PLAYER_COLORS, type PlayerColor } from '../shared/rules/config';
import { addChat, applyAction, createGame, timeOut } from '../shared/rules/engine';
import type { Action, GameState } from '../shared/rules/types';
import { viewFor } from '../shared/rules/view';

interface Seat {
	id: string;
	token: string;
	name: string;
	color: PlayerColor;
	isBot: boolean;
	character: CharacterId | null;
	/** Said they are ready to start (only asked of players who aren't the host). */
	ready: boolean;
	sockets: Set<WebSocket>;
	lastSeen: number;
}

/** Seconds a disconnected player can stall the table before a bot covers for them. */
const AFK_TAKEOVER_MS = 45_000;
const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dorn', 'Esme', 'Finn', 'Gale', 'Hollis'];
/** The events a roll can end with: what it produced, or on a 7 the discards it calls for. */
const ROLL_ENDS = new Set(['diceRolled', 'produced', 'nothingProduced', 'mustDiscard']);

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
	/** Dev cheat: bots move almost at once instead of pausing like a person would. */
	private fastBots = false;
	private botActionsThisTurn = 0;
	private botTurnKey = '';
	/** Seats that have the game menu open. */
	private pausedBy = new Set<string>();
	/**
	 * The turn clock: the turn it is timing ('' when off), the ms left while it is stopped, and
	 * while it runs, when it runs out (Date.now() time) and the timer for that moment.
	 */
	private clock = { turn: '', left: 0, ends: 0, timer: null as NodeJS.Timeout | null };

	/** `cheats` lets players use dev cheats; only the local dev server turns it on. */
	constructor(
		public code: string,
		public cheats = false
	) {}

	get started() {
		return this.game !== null;
	}

	/** The table pauses only when every connected player has the menu open (a solo game vs bots). */
	get paused() {
		if (!this.game || this.game.phase === 'ended') return false;
		const humans = this.seats.filter((s) => !s.isBot && s.sockets.size > 0);
		return humans.length > 0 && humans.every((s) => this.pausedBy.has(s.id));
	}

	lobbyInfo(): LobbyInfo {
		return {
			code: this.code,
			started: this.started,
			maxPlayers: MAX_PLAYERS,
			paused: this.paused,
			turnTime: this.turnTime,
			settings: this.settings,
			clock: this.clockInfo(),
			seats: this.seats.map(
				(s): LobbySeat => ({
					id: s.id,
					name: s.name,
					color: s.color,
					isBot: s.isBot,
					connected: s.isBot || s.sockets.size > 0,
					isHost: s.id === this.hostId,
					character: s.character,
					ready: this.isReady(s)
				})
			)
		};
	}

	/** Join with a saved token to reclaim a seat, or take a new one while in the lobby. */
	join(ws: WebSocket, name: string, token?: string): Seat | string {
		let seat = token ? this.seats.find((s) => s.token === token && !s.isBot) : undefined;
		if (!seat) {
			if (this.started) return 'That game has already started.';
			if (this.seats.length >= MAX_PLAYERS) return 'That table is full.';
			seat = {
				id: randomBytes(6).toString('hex'),
				token: randomBytes(16).toString('hex'),
				name: cleanName(name) || `Player ${this.seats.length + 1}`,
				color: this.freeColor(),
				isBot: false,
				character: this.freeCharacter(),
				ready: false,
				sockets: new Set(),
				lastSeen: Date.now()
			};
			this.seats.push(seat);
		}
		seat.sockets.add(ws);
		seat.lastSeen = Date.now();
		// A fresh connection starts with the menu closed; the client says so if it is open.
		this.pausedBy.delete(seat.id);
		if (!this.hostId || !this.seats.find((s) => s.id === this.hostId && !s.isBot)) {
			this.hostId = seat.id;
		}
		send(ws, {
			t: 'welcome',
			code: this.code,
			seat: seat.id,
			token: seat.token,
			...(this.cheats ? { cheats: true } : {})
		});
		this.broadcastLobby();
		if (this.game) {
			send(ws, {
				t: 'game',
				view: viewFor(this.game, this.seatIndex(seat)),
				clock: this.clockInfo()
			});
		}
		return seat;
	}

	disconnect(ws: WebSocket) {
		for (const s of this.seats) {
			if (s.sockets.delete(ws)) {
				s.lastSeen = Date.now();
				if (!s.sockets.size) this.pausedBy.delete(s.id);
			}
		}
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
				if (this.started && this.game!.phase !== 'ended') return;
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
				if (this.seats.length >= MAX_PLAYERS) return send(ws, { t: 'error', message: 'The table is full.' });
				const used = new Set(this.seats.map((s) => s.name));
				this.seats.push({
					id: randomBytes(6).toString('hex'),
					token: randomBytes(16).toString('hex'),
					name: BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot',
					color: this.freeColor(),
					isBot: true,
					character: this.freeCharacter(),
					ready: true,
					sockets: new Set(),
					lastSeen: Date.now()
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
				if (this.settings.mode !== msg.mode) this.unready();
				this.settings.mode = msg.mode;
				return this.broadcastLobby();
			case 'setMap': {
				if (!isHost || this.lockedSettings) return;
				const map = cleanMap(msg.map);
				if (typeof map === 'string') return send(ws, { t: 'error', message: map });
				if (JSON.stringify(map) !== JSON.stringify(this.settings.map)) this.unready();
				this.settings.map = map;
				return this.broadcastLobby();
			}
			case 'setPointsToWin':
				if (!isHost || this.lockedSettings || !POINT_GOALS.includes(msg.points)) return;
				if (this.settings.pointsToWin !== msg.points) this.unready();
				this.settings.pointsToWin = msg.points;
				return this.broadcastLobby();
			case 'setCharacter':
				if (this.lockedSettings || !isCharacter(msg.character)) return;
				if (this.seats.some((s) => s !== seat && s.character === msg.character)) {
					return send(ws, { t: 'error', message: 'Someone already plays that character.' });
				}
				seat.character = msg.character;
				return this.broadcastLobby();
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
				for (const s of this.seats) if (!s.isBot) s.ready = false;
				this.pausedBy.clear();
				// Random seating order makes the first player fair.
				this.seats.sort(() => Math.random() - 0.5);
				this.game = createGame(
					this.seats.map((s) => ({ name: s.name, color: s.color, isBot: s.isBot, character: s.character })),
					randomSeed(),
					undefined,
					this.settings
				);
				this.broadcastLobby();
				this.broadcastGame();
				return this.scheduleBots();
			case 'action': {
				if (!this.game) return;
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
				if (this.paused && this.botTimer) {
					clearTimeout(this.botTimer);
					this.botTimer = null;
				}
				this.broadcastLobby();
				return this.scheduleBots();
			}
			case 'cheat': {
				if (!this.cheats) return send(ws, { t: 'error', message: 'Cheats only work on the dev server.' });
				if (!this.game) return;
				const res = applyCheat(this.game, this.seatIndex(seat), msg.cheat);
				if (!res.ok) return send(ws, { t: 'error', message: res.error });
				if (msg.cheat.type === 'fastBots') this.fastBots = !!msg.cheat.on;
				this.game = res.state;
				if (this.botTimer) {
					// The table changed under a bot that was about to move: let it look again.
					clearTimeout(this.botTimer);
					this.botTimer = null;
				}
				this.broadcastGame();
				return this.scheduleBots();
			}
			case 'leave':
				seat.sockets.delete(ws);
				return this.disconnect(ws);
		}
	}

	isEmpty() {
		return this.seats.every((s) => s.isBot || s.sockets.size === 0);
	}

	lastActivity() {
		return Math.max(this.createdAt, ...this.seats.map((s) => (s.sockets.size ? Date.now() : s.lastSeen)));
	}

	dispose() {
		if (this.botTimer) clearTimeout(this.botTimer);
		this.stopClock();
	}

	private seatIndex(seat: Seat) {
		return this.seats.indexOf(seat);
	}

	/** Lobby settings can change before the first game and between games, never during one. */
	private get lockedSettings() {
		return !!this.game && this.game.phase !== 'ended';
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

	/** A character nobody at the table plays yet, picked at random. */
	private freeCharacter(): CharacterId | null {
		const free = CHARACTERS.filter((c) => !this.seats.some((s) => s.character === c));
		return free.length ? free[Math.floor(Math.random() * free.length)] : null;
	}

	private freeColor(): PlayerColor {
		return PLAYER_COLORS.find((c) => !this.seats.some((s) => s.color === c)) ?? 'white';
	}

	private broadcastLobby() {
		this.syncClock();
		const lobby = this.lobbyInfo();
		for (const s of this.seats) for (const ws of s.sockets) send(ws, { t: 'lobby', lobby });
	}

	private broadcastGame() {
		if (!this.game) return;
		this.syncClock();
		const clock = this.clockInfo();
		this.seats.forEach((s, i) => {
			if (!s.sockets.size) return;
			const view = viewFor(this.game!, i);
			for (const ws of s.sockets) send(ws, { t: 'game', view, clock });
		});
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
			c.left = this.turnTime * 1000;
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
		if (this.botTimer || !this.game || this.game.phase === 'ended' || this.paused) return;
		const next = this.nextBotMove();
		if (!next) {
			// Someone may go AFK later; check back.
			if (this.seats.some((s) => !s.isBot && s.sockets.size === 0)) {
				this.botTimer = setTimeout(() => {
					this.botTimer = null;
					this.scheduleBots();
				}, 5000);
			}
			return;
		}
		const last = this.game.log[this.game.log.length - 1];
		let delay = 650 + Math.random() * 500;
		// After a roll, whatever it ended with, bots give the dice time to land before moving on.
		if (last && ROLL_ENDS.has(last.type)) delay += 1300;
		if (last?.type === 'turnStarted') delay += 400;
		if (next.action.type === 'respondTrade') delay += 600;
		if (this.fastBots) delay = 60;
		this.botTimer = setTimeout(() => {
			this.botTimer = null;
			if (!this.game || this.paused) return;
			const move = this.nextBotMove();
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

	private nextBotMove() {
		const g = this.game!;
		const turnKey = `${g.turn}:${g.current}`;
		if (turnKey !== this.botTurnKey) {
			this.botTurnKey = turnKey;
			this.botActionsThisTurn = 0;
		}
		const controlled = (i: number) => {
			const s = this.seats[i];
			return s.isBot || (s.sockets.size === 0 && Date.now() - s.lastSeen > AFK_TAKEOVER_MS);
		};
		// Out-of-turn answers first (discards, trade replies), then the active player.
		for (let i = 0; i < this.seats.length; i++) {
			if (i === g.current || !controlled(i)) continue;
			const action = botAction(g, i);
			if (action) return { player: i, action };
		}
		if (controlled(g.current)) {
			const action = botAction(g, g.current, this.botActionsThisTurn);
			if (action) return { player: g.current, action };
		}
		return null;
	}
}

export function send(ws: WebSocket, msg: ServerMessage) {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** What the turn clock times: each setup placement (the snake's double one too), then each turn. */
function clockTurn(g: GameState): string {
	return g.phase === 'setup' ? `setup ${g.setupIndex}` : `${g.turn}:${g.current}`;
}

/** The next step a timed-out turn can't end without, and whose it is. Never an optional move. */
function forcedMove(g: GameState): { player: number; action: Action } | null {
	// An open offer is withdrawn.
	if (g.trade) return { player: g.trade.from, action: { type: 'cancelTrade' } };
	if (g.step === 'roll') return { player: g.current, action: { type: 'rollDice' } };
	if (g.step === 'main') return { player: g.current, action: { type: 'endTurn' } };
	// Discards still owed, setup placements, the robber and the steal: what a bot would pick.
	const who = g.step === 'discard' ? Number(Object.keys(g.pendingDiscards)[0]) : g.current;
	const action = botAction(g, who);
	return action && { player: who, action };
}

/** A map choice from a client, checked; or why it can't be played. */
function cleanMap(map: MapChoice): MapChoice | string {
	if (map && 'preset' in map && typeof map.preset === 'string') {
		return presetById(map.preset) ? { preset: map.preset } : 'Unknown map.';
	}
	if (!map || !('custom' in map) || !map.custom || !Array.isArray(map.custom.tiles)) return 'That map is empty.';
	const custom = {
		name: cleanName(map.custom.name) || 'Custom map',
		tiles: map.custom.tiles.slice(0, 200).map((t) => ({ q: Number(t?.q), r: Number(t?.r), terrain: t?.terrain ?? null }))
	};
	return validateCustomMap(custom) ?? { custom };
}

function cleanName(name: unknown): string {
	return String(name ?? '')
		.replace(/[^\p{L}\p{N} _.'-]/gu, '')
		.trim()
		.slice(0, 18);
}
