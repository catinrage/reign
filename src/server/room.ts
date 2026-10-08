import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientMessage, LobbyInfo, LobbySeat, ServerMessage } from '../shared/protocol';
import { MAX_PLAYERS, MIN_PLAYERS } from '../shared/protocol';
import { randomSeed } from '../shared/rng';
import { botAction } from '../shared/rules/bot';
import { PLAYER_COLORS, type PlayerColor } from '../shared/rules/config';
import { addChat, applyAction, createGame } from '../shared/rules/engine';
import type { GameState } from '../shared/rules/types';
import { viewFor } from '../shared/rules/view';

interface Seat {
	id: string;
	token: string;
	name: string;
	color: PlayerColor;
	isBot: boolean;
	sockets: Set<WebSocket>;
	lastSeen: number;
}

/** Seconds a disconnected player can stall the table before a bot covers for them. */
const AFK_TAKEOVER_MS = 45_000;
const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dorn', 'Esme', 'Finn', 'Gale', 'Hollis'];

export class Room {
	seats: Seat[] = [];
	hostId: string | null = null;
	game: GameState | null = null;
	createdAt = Date.now();
	private botTimer: NodeJS.Timeout | null = null;
	private botActionsThisTurn = 0;
	private botTurnKey = '';
	/** Seats that have the game menu open. */
	private pausedBy = new Set<string>();

	constructor(public code: string) {}

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
			seats: this.seats.map(
				(s): LobbySeat => ({
					id: s.id,
					name: s.name,
					color: s.color,
					isBot: s.isBot,
					connected: s.isBot || s.sockets.size > 0,
					isHost: s.id === this.hostId
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
		send(ws, { t: 'welcome', code: this.code, seat: seat.id, token: seat.token });
		this.broadcastLobby();
		if (this.game) send(ws, { t: 'game', view: viewFor(this.game, this.seatIndex(seat)) });
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
					sockets: new Set(),
					lastSeen: Date.now()
				});
				return this.broadcastLobby();
			}
			case 'removeSeat':
				if (!isHost || this.started) return;
				this.seats = this.seats.filter((s) => s.id !== msg.seat || !s.isBot);
				return this.broadcastLobby();
			case 'start':
				if (!isHost || (this.game && this.game.phase !== 'ended')) return;
				if (this.seats.length < MIN_PLAYERS) {
					return send(ws, { t: 'error', message: 'You need at least two players. Add a bot!' });
				}
				this.pausedBy.clear();
				// Random seating order makes the first player fair.
				this.seats.sort(() => Math.random() - 0.5);
				this.game = createGame(
					this.seats.map((s) => ({ name: s.name, color: s.color, isBot: s.isBot })),
					randomSeed()
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
	}

	private seatIndex(seat: Seat) {
		return this.seats.indexOf(seat);
	}

	private freeColor(): PlayerColor {
		return PLAYER_COLORS.find((c) => !this.seats.some((s) => s.color === c)) ?? 'white';
	}

	private broadcastLobby() {
		const lobby = this.lobbyInfo();
		for (const s of this.seats) for (const ws of s.sockets) send(ws, { t: 'lobby', lobby });
	}

	private broadcastGame() {
		if (!this.game) return;
		this.seats.forEach((s, i) => {
			if (!s.sockets.size) return;
			const view = viewFor(this.game!, i);
			for (const ws of s.sockets) send(ws, { t: 'game', view });
		});
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
		if (last?.type === 'diceRolled') delay += 1300;
		if (last?.type === 'turnStarted') delay += 400;
		if (next.action.type === 'respondTrade') delay += 600;
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

function cleanName(name: unknown): string {
	return String(name ?? '')
		.replace(/[^\p{L}\p{N} _.'-]/gu, '')
		.trim()
		.slice(0, 18);
}
