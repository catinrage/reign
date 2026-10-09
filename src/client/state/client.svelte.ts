import type { ClientMessage, LobbyInfo, PigeonNote, ServerMessage, TurnClock } from '../../shared/protocol';
import type { Cheat } from '../../shared/rules/cheats';
import type { Resource } from '../../shared/rules/config';
import type { Action, GameEvent, GameView, ResourceGain } from '../../shared/rules/types';

/**
 * The one connection to the game server plus everything the interface renders from.
 * Reconnects on its own and reclaims the seat with the token saved for that room.
 */

/** How long the interface waits for the scene to land the dice before it shows the roll anyway. */
const TOSS_TIMEOUT_MS = 4000;
/** How long dealt cards may take to reach their hands before they are counted anyway. */
const DEAL_TIMEOUT_MS = 5000;

export interface Roll {
	seq: number;
	player: number;
	dice: [number, number];
}

/** Cards of one resource dealt on the board to a player, still on their way to the hand. */
interface Dealt {
	batch: number;
	player: number;
	resource: Resource;
	left: number;
}

function newestSeq(log: GameEvent[]): number {
	return log.length ? log[log.length - 1].seq : -1;
}

/** The newest roll in a log after event `after`, if there is one. */
function newestRoll(log: GameEvent[], after = -1): Roll | null {
	for (let i = log.length - 1; i >= 0 && log[i].seq > after; i--) {
		const e = log[i];
		if (e.type === 'diceRolled') return { seq: e.seq, player: e.player, dice: e.dice };
	}
	return null;
}

function storage(key: string, value?: string): string | null {
	try {
		if (value === undefined) return localStorage.getItem(key);
		localStorage.setItem(key, value);
	} catch {
		/* private mode */
	}
	return null;
}

/** A room code from an invite link (`?room=ABCDE`), or null. */
function invitedRoom(): string | null {
	if (typeof location === 'undefined') return null;
	const code = new URLSearchParams(location.search).get('room')?.trim().toUpperCase() ?? '';
	return /^[A-Z]{5}$/.test(code) ? code : null;
}

/** An invite link being followed: the room it names and, once the server says no, why. */
export interface Joining {
	code: string;
	error: string | null;
}

export interface Toast {
	id: number;
	text: string;
	kind: 'error' | 'info' | 'good';
}

class GameClient {
	status = $state<'connecting' | 'online' | 'offline'>('connecting');
	lobby = $state<LobbyInfo | null>(null);
	/** The newest state from the server. The 3D scene plays it the moment it arrives. */
	latest = $state.raw<GameView | null>(null);
	/**
	 * The state the interface shows. While dice are in the air it keeps the state from before the
	 * roll, so the hand, the plaques, the log, the prompt and the dialogs never give the result
	 * away before the dice land (see `landed`).
	 */
	view = $state.raw<GameView | null>(null);
	/** The roll whose dice are in the air, or null. */
	tossing = $state.raw<Roll | null>(null);
	/** The last roll the interface has shown. It stays after the turn is over. */
	lastRoll = $state.raw<Roll | null>(null);
	/** Cards dealt on the board (a roll, a second settlement) that haven't reached a hand yet. */
	dealt = $state.raw<Dealt[]>([]);
	/** This player asked for a roll and the server hasn't answered yet. */
	rollAsked = $state(false);
	seat = $state<string | null>(null);
	code = $state<string | null>(null);
	name = $state<string>(storage('reign:name') ?? '');
	toasts = $state<Toast[]>([]);
	pendingJoin = $state(false);
	/**
	 * Set while an invite link (or a reload inside a room) is taking this player to their table, so
	 * the interface shows a loading screen instead of the main menu. Cleared once the table is in.
	 */
	joining = $state<Joining | null>(null);
	/** Whether this player has the game menu open (the table pauses when everyone does). */
	menuOpen = $state(false);
	/** The current turn's clock, with `until` on this browser's clock; null when turns are unlimited. */
	clock = $state<(TurnClock & { until: number }) | null>(null);
	/** performance.now(), refreshed while a turn clock runs so the countdowns move. */
	now = $state(0);
	/** The server is the local dev server and takes dev cheats. */
	cheats = $state(false);
	/** Private notes this player wrote or was sent by pigeon in this room, oldest first. */
	pigeons = $state.raw<PigeonNote[]>([]);
	/** The newest pigeon to fly while we were here (sent or received), for the flight to play. */
	freshPigeon = $state.raw<PigeonNote | null>(null);
	/** The tile another player moving the robber points at, as the server last said. */
	aim = $state.raw<{ player: number; hex: number } | null>(null);

	private ws: WebSocket | null = null;
	private retry = 0;
	private toastId = 0;
	private queue: ClientMessage[] = [];
	private pinger: ReturnType<typeof setInterval> | null = null;
	private ticker: ReturnType<typeof setInterval> | null = null;
	private tossTimer: ReturnType<typeof setTimeout> | undefined;
	private dealBatch = 0;
	private autoBots = 0;
	/** The player backed out of a join the server is still answering: leave the room it seats us in. */
	private dropJoin = false;

	constructor() {
		const code = invitedRoom();
		if (code) this.joining = { code, error: null };
	}

	connect() {
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		const ws = new WebSocket(`${proto}://${location.host}/ws`);
		this.ws = ws;
		this.status = 'connecting';
		ws.onopen = () => {
			this.status = 'online';
			this.retry = 0;
			const room = this.code ?? this.joining?.code;
			if (room && !this.joining?.error) this.join(room);
			for (const m of this.queue.splice(0)) this.send(m);
		};
		ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMessage);
		ws.onclose = () => {
			this.status = 'offline';
			this.ws = null;
			const delay = Math.min(8000, 400 * 2 ** this.retry++);
			setTimeout(() => this.connect(), delay);
		};
		this.pinger ??= setInterval(() => this.send({ t: 'ping' }), 25000);
	}

	private onMessage(msg: ServerMessage) {
		switch (msg.t) {
			case 'welcome':
				if (this.dropJoin) {
					this.dropJoin = false;
					this.send({ t: 'leave' });
					break;
				}
				this.code = msg.code;
				this.seat = msg.seat;
				this.pendingJoin = false;
				this.cheats = !!msg.cheats;
				storage(`reign:token:${msg.code}`, msg.token);
				this.setUrl(msg.code);
				if (this.menuOpen) this.send({ t: 'pause', paused: true });
				if (this.autoBots) {
					for (let i = 0; i < this.autoBots; i++) this.send({ t: 'addBot' });
					this.autoBots = 0;
					this.send({ t: 'start' });
				}
				break;
			case 'lobby':
				// Stray news from a room this player has just left.
				if (!this.seat) break;
				this.lobby = msg.lobby;
				this.setClock(msg.lobby.clock);
				// A game in progress stays behind the loading screen until its state arrives.
				if (!msg.lobby.started || this.view) this.joining = null;
				break;
			case 'game':
				if (!this.seat) break;
				this.receive(msg.view);
				this.setClock(msg.clock);
				this.joining = null;
				break;
			case 'pigeons':
				this.pigeons = msg.notes;
				break;
			case 'pigeon':
				if (this.pigeons.some((n) => n.id === msg.note.id)) break;
				this.pigeons = [...this.pigeons, msg.note];
				this.freshPigeon = msg.note;
				break;
			case 'aim':
				this.aim = msg.hex === null ? null : { player: msg.player, hex: msg.hex };
				break;
			case 'error':
				this.pendingJoin = false;
				this.rollAsked = false;
				if (this.dropJoin) {
					this.dropJoin = false;
					break;
				}
				if (this.joining && !this.seat) this.joining = { ...this.joining, error: msg.message };
				else this.toast(msg.message, 'error');
				if (!this.seat) {
					this.code = null;
					this.setUrl(null);
				}
				break;
		}
	}

	/**
	 * A new state goes to the scene at once, and to the interface too, unless the interface is
	 * holding the state from before a roll whose dice are still in the air. Then it gets the newest
	 * state when they land.
	 */
	private receive(view: GameView) {
		const prev = this.latest;
		this.latest = view;
		if (view.step !== 'roll' || view.current !== view.me) this.rollAsked = false;
		// The robber moved (or the turn went on): nobody is aiming it any more.
		if (this.aim && (view.step !== 'moveRobber' || view.current !== this.aim.player)) this.aim = null;
		// Only a roll made since the last state is tossed (a new game starts its log over).
		const after = prev ? newestSeq(prev.log) : Infinity;
		const roll = after <= newestSeq(view.log) ? newestRoll(view.log, after) : null;
		if (roll) {
			this.tossing = roll;
			clearTimeout(this.tossTimer);
			this.tossTimer = setTimeout(() => this.landed(roll.seq), TOSS_TIMEOUT_MS);
		}
		if (!this.tossing) this.show(view);
	}

	/** The scene landed the dice of roll `seq` (or waiting for that ran out): show what it did. */
	landed(seq: number) {
		if (!this.tossing || seq < this.tossing.seq) return;
		clearTimeout(this.tossTimer);
		this.tossing = null;
		if (this.latest) this.show(this.latest);
	}

	/** Hand a state to the interface. Cards it deals on the board count once they reach a hand. */
	private show(view: GameView) {
		const prev = this.view;
		this.view = view;
		const after = prev ? newestSeq(prev.log) : Infinity;
		const sameGame = after <= newestSeq(view.log);
		this.lastRoll = newestRoll(view.log) ?? (sameGame ? this.lastRoll : null);
		if (!sameGame) {
			this.dealt = [];
			return;
		}
		const gains: ResourceGain[] = [];
		for (const e of view.log) {
			if (e.seq > after && (e.type === 'produced' || e.type === 'setupResources')) {
				gains.push(...e.gains);
			}
		}
		if (gains.length) this.deal(gains);
	}

	private deal(gains: ResourceGain[]) {
		const batch = ++this.dealBatch;
		this.dealt = [
			...this.dealt,
			...gains.map((g) => ({ batch, player: g.player, resource: g.resource, left: g.amount }))
		];
		// Cards that haven't arrived by then (in a hidden tab, say) are counted anyway.
		setTimeout(() => {
			this.dealt = this.dealt.filter((d) => d.batch !== batch);
		}, DEAL_TIMEOUT_MS);
	}

	/** A dealt card reached its hand: it flew into yours, or rose from its tile for another. */
	arrived(player: number, resource: string) {
		const i = this.dealt.findIndex((d) => d.player === player && d.resource === resource);
		if (i < 0) return;
		this.dealt = this.dealt.flatMap((d, k) =>
			k !== i ? [d] : d.left > 1 ? [{ ...d, left: d.left - 1 }] : []
		);
	}

	/** Dealt cards still on their way to a player's hand: of one resource, or all of them. */
	onTheWay(player: number, resource?: Resource): number {
		let n = 0;
		for (const d of this.dealt) {
			if (d.player === player && (!resource || d.resource === resource)) n += d.left;
		}
		return n;
	}

	/** The server sends the time left (not a deadline: clocks differ), so the deadline is set here. */
	private setClock(c: TurnClock | null) {
		this.now = performance.now();
		this.clock = c && { ...c, until: this.now + c.left };
		if (c?.running) this.ticker ??= setInterval(() => (this.now = performance.now()), 100);
		else if (this.ticker) {
			clearInterval(this.ticker);
			this.ticker = null;
		}
	}

	private setUrl(code: string | null) {
		const url = new URL(location.href);
		if (code) url.searchParams.set('room', code);
		else url.searchParams.delete('room');
		history.replaceState(null, '', url);
	}

	send(msg: ClientMessage) {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
		// Where the pointer was is no use once the connection is back.
		else if (msg.t !== 'ping' && msg.t !== 'aim') this.queue.push(msg);
	}

	/** Show the other players the tile this player is about to move the robber to (null: none). */
	aimAt(hex: number | null) {
		this.send({ t: 'aim', hex });
	}

	/** Pause the game for everyone at the table, or resume it. */
	pauseGame(paused: boolean) {
		this.send({ t: 'pauseGame', paused });
	}

	setName(name: string) {
		this.name = name;
		storage('reign:name', name);
		if (this.lobby && !this.lobby.started) this.send({ t: 'setName', name });
	}

	create() {
		this.pendingJoin = true;
		this.send({ t: 'create', name: this.name || 'Player' });
	}

	/** Create a table, fill it with bots and start right away. */
	quickPlay(bots = 3) {
		this.autoBots = bots;
		this.create();
	}

	join(code: string) {
		code = code.trim().toUpperCase();
		if (!code) return;
		this.pendingJoin = true;
		this.code = code;
		this.send({ t: 'join', code, name: this.name || 'Player', token: storage(`reign:token:${code}`) ?? undefined });
	}

	/** Back out of an invite link to the main menu, while it loads or after it failed. */
	cancelJoin() {
		if (this.seat) return this.leave();
		if (this.pendingJoin) this.dropJoin = true;
		this.pendingJoin = false;
		this.joining = null;
		this.code = null;
		this.setUrl(null);
	}

	setMenuOpen(open: boolean) {
		if (open === this.menuOpen) return;
		this.menuOpen = open;
		if (this.view) this.send({ t: 'pause', paused: open });
	}

	leave() {
		this.menuOpen = false;
		this.send({ t: 'leave' });
		this.lobby = null;
		this.latest = null;
		this.view = null;
		clearTimeout(this.tossTimer);
		this.tossing = null;
		this.lastRoll = null;
		this.dealt = [];
		this.rollAsked = false;
		this.pigeons = [];
		this.freshPigeon = null;
		this.aim = null;
		this.seat = null;
		this.code = null;
		this.joining = null;
		this.setClock(null);
		this.setUrl(null);
	}

	/** Send a private note by pigeon to the player in seat `to`. */
	sendPigeon(to: string, text: string) {
		this.send({ t: 'pigeon', to, text });
	}

	act(action: Action) {
		// Until the dice land the interface shows the state from before the roll: nothing is played
		// from it.
		if (this.tossing) return;
		if (action.type === 'rollDice') {
			if (this.rollAsked) return;
			this.rollAsked = true;
		}
		this.send({ t: 'action', action });
	}

	cheat(cheat: Cheat) {
		this.send({ t: 'cheat', cheat });
	}

	toast(text: string, kind: Toast['kind'] = 'info') {
		const id = ++this.toastId;
		this.toasts = [...this.toasts, { id, text, kind }];
		setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), kind === 'error' ? 4200 : 3200);
	}

	get me(): number {
		return this.view?.me ?? -1;
	}

	get isHost(): boolean {
		return !!this.lobby?.seats.find((s) => s.id === this.seat)?.isHost;
	}

	/** Milliseconds left in the current turn, or null when turns are unlimited. */
	get timeLeft(): number | null {
		const c = this.clock;
		if (!c) return null;
		return c.running ? Math.max(0, c.until - this.now) : c.left;
	}

	get inviteLink(): string {
		const url = new URL(location.origin + location.pathname);
		if (this.code) url.searchParams.set('room', this.code);
		return url.toString();
	}
}

export const client = new GameClient();
