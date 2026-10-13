import type { ConquestSettings, CqAction, CqView } from '../../shared/conquest/types';
import type { GameKind } from '../../shared/games';
import { BEACON_GAP_MS, type ClientMessage, type LobbyInfo, type PigeonNote, type ServerMessage, type TurnClock } from '../../shared/protocol';
import type { Cheat } from '../../shared/rules/cheats';
import { hasResources, type Resource } from '../../shared/rules/config';
import { EVENT_SHOW_MS, type EventCard } from '../../shared/rules/events';
import type { Action, GameEvent, GameView } from '../../shared/rules/types';
import { CHARACTER_INFO } from '../../shared/rules/characters';
import { t, tx } from '../i18n/index.svelte';
import { account } from './account.svelte';
import { netStats } from './netStats.svelte';
import { settings } from '../ui/settings.svelte';

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

/** Cards of one resource a player got. */
interface Gain {
	player: number;
	/** null for a card this player can't see: one stolen by somebody else, say. */
	resource: Resource | null;
	amount: number;
}

/** Cards of one resource a player got, still on their way to the hand. */
interface Dealt {
	batch: number;
	player: number;
	resource: Resource | null;
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

/** The newest event card turned over in a log after event `after`, if there is one. */
function newestDrawn(log: GameEvent[], after: number) {
	for (let i = log.length - 1; i >= 0 && log[i].seq > after; i--) {
		const e = log[i];
		if (e.type === 'eventDrawn') return e;
	}
	return null;
}

/** The code of the last game this player sat down to, so the menu can offer to rejoin it. */
const LAST_GAME = 'reign:lastGame';

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

/** A beacon someone lit on the map: where, in tile radii from the island's middle. */
export interface Beacon {
	id: number;
	player: number;
	x: number;
	z: number;
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
	/** At a Conquest table: the game as this player may see it, newest first. */
	cq = $state.raw<CqView | null>(null);
	/**
	 * The state the interface shows. While dice are in the air it keeps the state from before the
	 * roll, so the hand, the plaques, the log, the prompt and the dialogs never give the result
	 * away before the dice land (see `landed`).
	 */
	view = $state.raw<GameView | null>(null);
	/** The roll whose dice are in the air, or null. */
	tossing = $state.raw<Roll | null>(null);
	/**
	 * An event card that just turned over (Reign Extended) and is being shown to the table, or
	 * null. Like dice in the air, it holds the interface's state until it has played out (see
	 * `presented`), so nothing it did shows before it does.
	 */
	presenting = $state.raw<{
		seq: number;
		card: EventCard;
		round: number;
		by?: number;
		/** Held up in the middle of the table, then played out on the board and the hands. */
		phase: 'flip' | 'effect';
	} | null>(null);
	/** The last roll the interface has shown. It stays after the turn is over. */
	lastRoll = $state.raw<Roll | null>(null);
	/**
	 * Cards on their way to a hand (dealt off the tiles by a roll or a second settlement, taken
	 * with a Monopoly, picked with a Year of Plenty, traded, stolen) that haven't reached it yet.
	 */
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
	/**
	 * Set while Play vs bots or a campaign mission sets up its table, so the menu stays up until
	 * the game is in: that lobby is only a step on the way, nobody gets to use it.
	 */
	launching = $state(false);
	/** Whether this player has the game menu open (the table pauses when everyone does). */
	menuOpen = $state(false);
	/** The current turn's clock, with `until` on this browser's clock; null when turns are unlimited. */
	clock = $state<(TurnClock & { until: number }) | null>(null);
	/** performance.now(), refreshed while a turn clock runs so the countdowns move. */
	now = $state(0);
	/** The server is the local dev server and takes dev cheats. */
	cheats = $state(false);
	/** Watching a game that started without us: no seat, and no hand is ever shown. */
	spectating = $state(false);
	/**
	 * Watching a recorded game played back in the page (see state/replay.svelte.ts). It counts as
	 * spectating, with no server room behind it.
	 */
	replaying = $state(false);
	/** Told when a replay stops being watched, however that happened. */
	onReplayEnd: (() => void) | null = null;
	/** Private notes this player wrote or was sent by pigeon in this room, oldest first. */
	pigeons = $state.raw<PigeonNote[]>([]);
	/** The newest pigeon to fly while we were here (sent or received), for the flight to play. */
	freshPigeon = $state.raw<PigeonNote | null>(null);
	/** The tile another player moving the robber points at, as the server last said. */
	aim = $state.raw<{ player: number; hex: number } | null>(null);
	/**
	 * Beacons lit on the map (Alt+click), this player's own included, newest last; `id` counts up
	 * so the scene can tell which it hasn't shown yet. Only the last few are kept.
	 */
	beacons = $state.raw<Beacon[]>([]);
	private beaconId = 0;
	private lastBeacon = -Infinity;
	/** A game this player left that is still going, with who is still at the table: they can rejoin. */
	resumable = $state<{ code: string; players: string[] } | null>(null);

	private ws: WebSocket | null = null;
	private retry = 0;
	private toastId = 0;
	private queue: ClientMessage[] = [];
	private pinger: ReturnType<typeof setInterval> | null = null;
	private ticker: ReturnType<typeof setInterval> | null = null;
	private tossTimer: ReturnType<typeof setTimeout> | undefined;
	private presentTimer: ReturnType<typeof setTimeout> | undefined;
	private dealBatch = 0;
	private autoBots = 0;
	/** A campaign mission to start as soon as the new table seats us. */
	private autoMission: string | null = null;
	/** The player backed out of a join the server is still answering: leave the room it seats us in. */
	private dropJoin = false;
	/** The trade offer last declined for this player because they hadn't the cards for it. */
	private autoDeclined: number | null = null;

	/** Stay connected (reconnect when the line drops). Off while signed out. */
	private wanted = false;

	/** Opens the line to the game server. The offline build swaps in a server inside the page. */
	openSocket = (url: string): WebSocket => new WebSocket(url);

	constructor() {
		const code = invitedRoom();
		if (code) this.joining = { code, error: null };
		netStats.connect((n) => {
			if (this.ws?.readyState !== WebSocket.OPEN) return false;
			this.send({ t: 'ping', n });
			return true;
		});
	}

	connect() {
		this.wanted = true;
		if (this.ws) return;
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		const ws = this.openSocket(`${proto}://${location.host}/ws`);
		this.ws = ws;
		this.status = 'connecting';
		ws.onopen = () => {
			this.status = 'online';
			this.retry = 0;
			const room = this.code ?? this.joining?.code;
			if (room && !this.joining?.error) this.join(room);
			else if (!room) this.peekLastGame();
			for (const m of this.queue.splice(0)) this.send(m);
		};
		ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMessage);
		ws.onclose = () => {
			if (this.ws !== ws) return;
			this.status = 'offline';
			this.ws = null;
			// A table left half set up shows its lobby once we are back, rather than an empty menu.
			this.launching = false;
			netStats.dropped();
			if (!this.wanted) return;
			const delay = Math.min(8000, 400 * 2 ** this.retry++);
			setTimeout(() => this.connect(), delay);
		};
		this.pinger ??= setInterval(() => this.send({ t: 'ping' }), 25000);
	}

	/** Close the connection for good (signing out), leaving any table first. */
	disconnect() {
		this.wanted = false;
		if (this.code) this.leave();
		this.queue = [];
		const ws = this.ws;
		this.ws = null;
		ws?.close();
		this.status = 'connecting';
	}

	private onMessage(msg: ServerMessage) {
		switch (msg.t) {
			case 'unauthorized':
				this.wanted = false;
				account.signedOut();
				break;
			case 'friends':
				account.setFriends(msg.friends);
				break;
			case 'presence':
				account.presence(msg.user, msg.where);
				break;
			case 'invited':
				account.invited(msg.invite);
				break;
			case 'notice':
				this.toast(tx(msg.message), 'info');
				break;
			case 'pong':
				netStats.pong(msg.n);
				break;
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
				// How long this player wants bots' offers kept open: theirs to pick, the table's to honor.
				this.send({ t: 'offerWait', seconds: settings.offerWait });
				if (this.autoMission) {
					this.send({ t: 'mission', mission: this.autoMission });
					this.autoMission = null;
				} else if (this.autoBots) {
					for (let i = 0; i < this.autoBots; i++) this.send({ t: 'addBot' });
					this.autoBots = 0;
					this.send({ t: 'start' });
				}
				break;
			case 'watching':
				if (this.dropJoin) {
					this.dropJoin = false;
					this.send({ t: 'leave' });
					break;
				}
				this.code = msg.code;
				this.spectating = true;
				this.pendingJoin = false;
				this.setUrl(msg.code);
				break;
			case 'lobby':
				// Stray news from a room this player has just left.
				if (!this.seat && !this.spectating) break;
				this.tellComings(this.lobby, msg.lobby);
				this.lobby = msg.lobby;
				this.setClock(msg.lobby.clock);
				// A game in progress stays behind the loading screen until its state arrives.
				if (!msg.lobby.started || this.view || this.cq) this.joining = null;
				break;
			case 'cqGame':
				if (!this.seat && !this.spectating) break;
				this.cq = msg.view;
				this.setClock(msg.clock);
				this.joining = null;
				this.launching = false;
				if (this.code) storage(LAST_GAME, this.code);
				break;
			case 'game':
				if (!this.seat && !this.spectating) break;
				this.receive(msg.view);
				this.setClock(msg.clock);
				this.joining = null;
				this.launching = false;
				if (this.code) storage(LAST_GAME, this.code);
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
			case 'beacon':
				this.addBeacon(msg.player, msg.x, msg.z);
				break;
			case 'peek':
				if (msg.open) this.resumable = { code: msg.code, players: msg.players };
				else {
					this.resumable = null;
					if (storage(LAST_GAME) === msg.code) storage(LAST_GAME, '');
				}
				break;
			case 'error':
				this.pendingJoin = false;
				this.rollAsked = false;
				// The table couldn't start on its own: its lobby shows, to see why and carry on from.
				this.launching = false;
				if (this.dropJoin) {
					this.dropJoin = false;
					break;
				}
				if (this.joining && !this.seat) this.joining = { ...this.joining, error: tx(msg.message) };
				else this.toast(tx(msg.message), 'error');
				// The game being watched is gone.
				if (this.spectating) {
					this.leave();
					break;
				}
				if (!this.seat) {
					if (this.code && storage(LAST_GAME) === this.code) {
						storage(LAST_GAME, '');
						this.resumable = null;
					}
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
		view = castNames(view);
		const prev = this.latest;
		this.latest = view;
		this.declineUnaffordable(view);
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
		const drawn = prev && after <= newestSeq(view.log) ? newestDrawn(view.log, after) : null;
		if (drawn) {
			this.presenting = { seq: drawn.seq, card: drawn.card, round: drawn.round, by: drawn.by, phase: 'flip' };
			clearTimeout(this.presentTimer);
			this.presentTimer = setTimeout(() => this.presented(drawn.seq), EVENT_SHOW_MS + 1500);
		}
		if (!this.tossing && this.presenting?.phase !== 'flip') this.show(view);
	}

	/**
	 * With "Hide offers I can't accept" on, an offer this player hasn't the cards for is declined
	 * for them straight away, as a normal answer (so whoever made it hears back and a bot needn't
	 * wait), and its card never pops up. Answered from the newest state, which the server holds too.
	 */
	private declineUnaffordable(view: GameView | null) {
		const offer = view?.trade;
		// Offers count up from 1 again in the next game.
		if (!offer) this.autoDeclined = null;
		if (!view || !offer || !settings.hideOffers || this.replaying || view.me < 0 || offer.from === view.me) return;
		if (offer.responses[view.me] !== undefined || this.autoDeclined === offer.id) return;
		const hand = view.players[view.me]?.resources;
		if (!hand || hasResources(hand, offer.want)) return;
		this.autoDeclined = offer.id;
		this.send({ t: 'action', action: { type: 'respondTrade', offerId: offer.id, accept: false } });
	}

	/** Hide (and decline) offers this player can't accept, or show them all again. */
	setHideOffers(on: boolean) {
		settings.setHideOffers(on);
		this.declineUnaffordable(this.latest);
	}

	/** How long bots keep their offers open for this player, in seconds (0: until they answer). */
	setOfferWait(seconds: number) {
		settings.setOfferWait(seconds);
		if (this.seat) this.send({ t: 'offerWait', seconds: settings.offerWait });
	}

	/**
	 * The event card `seq` has been held up long enough: the interface shows what it did while it
	 * plays out (and play still waits until it has, see `presented`).
	 */
	reveal(seq: number) {
		if (this.presenting?.seq !== seq || this.presenting.phase !== 'flip') return;
		this.presenting = { ...this.presenting, phase: 'effect' };
		if (!this.tossing && this.latest) this.show(this.latest);
	}

	/** The event card `seq` has played out at the table (or waiting for it ran out). */
	presented(seq: number) {
		if (!this.presenting || seq < this.presenting.seq) return;
		clearTimeout(this.presentTimer);
		this.presenting = null;
		if (!this.tossing && this.latest) this.show(this.latest);
	}

	/** The scene landed the dice of roll `seq` (or waiting for that ran out): show what it did. */
	landed(seq: number) {
		if (!this.tossing || seq < this.tossing.seq) return;
		clearTimeout(this.tossTimer);
		this.tossing = null;
		if (this.latest && this.presenting?.phase !== 'flip') this.show(this.latest);
	}

	/** Open a replay: its table and its first state, with nothing sent to the server. */
	startReplay(lobby: LobbyInfo, view: GameView) {
		if (this.code) this.leave();
		this.replaying = true;
		this.spectating = true;
		this.lobby = lobby;
		this.latest = null;
		this.view = null;
		this.setReplayView(view, true);
	}

	/**
	 * The replay moved on to `view`: one step forward plays like a live game (dice, cards flying),
	 * a jump (scrubbing, skipping) shows the new state at once.
	 */
	setReplayView(view: GameView, jump: boolean) {
		if (!this.replaying) return;
		if (!jump) return this.receive(view);
		clearTimeout(this.tossTimer);
		clearTimeout(this.presentTimer);
		this.tossing = null;
		this.presenting = null;
		this.dealt = [];
		view = castNames(view);
		this.latest = view;
		this.view = view;
		this.lastRoll = newestRoll(view.log);
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
		// Cards that fly to a hand: dealt off the tiles, taken with a Monopoly, picked from the bank
		// with a Year of Plenty, bought from the bank or a harbor, traded between players, given back
		// for a workshop torn down, stolen or paid as a toll (face down unless it's yours or theirs).
		const gains: Gain[] = [];
		for (const e of view.log) {
			if (e.seq <= after) continue;
			if (e.type === 'produced' || e.type === 'setupResources') gains.push(...e.gains);
			else if (e.type === 'monopoly') {
				const amount = Object.values(e.taken).reduce((a, b) => a + b, 0);
				if (amount) gains.push({ player: e.player, resource: e.resource, amount });
			} else if (e.type === 'yearOfPlenty') {
				for (const resource of e.resources) gains.push({ player: e.player, resource, amount: 1 });
			} else if (e.type === 'bankTrade') {
				gains.push({ player: e.player, resource: e.get, amount: 1 });
			} else if (e.type === 'tradeCompleted') {
				// Each side's cards go to the other.
				for (const [resource, amount] of Object.entries(e.give) as [Resource, number][])
					if (amount) gains.push({ player: e.to, resource, amount });
				for (const [resource, amount] of Object.entries(e.want) as [Resource, number][])
					if (amount) gains.push({ player: e.from, resource, amount });
			} else if (e.type === 'eventCards') {
				// An event's cards handed to a player (the ones you can see).
				for (const m of e.moves) if (m.to !== null && m.resource) gains.push({ player: m.to, resource: m.resource, amount: 1 });
			} else if (e.type === 'stole') {
				gains.push({ player: e.thief, resource: e.resource, amount: 1 });
			} else if (e.type === 'traitToll') {
				gains.push({ player: e.to, resource: e.resource, amount: 1 });
			} else if (e.type === 'tornDown') {
				for (const [resource, amount] of Object.entries(e.refund)) {
					if (amount) gains.push({ player: e.player, resource: resource as Resource, amount });
				}
			}
		}
		if (gains.length) this.deal(gains);
	}

	private deal(gains: Gain[]) {
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

	/** A dealt card reached its hand: it flew into yours, or onto another player's plaque. */
	arrived(player: number, resource: string | null) {
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

	/** During a game, say when another player leaves the table or comes back to it. */
	private tellComings(prev: LobbyInfo | null, next: LobbyInfo) {
		if (!prev || prev.code !== next.code || !prev.started || !next.started) return;
		for (const s of next.seats) {
			const was = prev.seats.find((p) => p.id === s.id);
			if (!was || s.isBot || s.id === this.seat) continue;
			if (s.left && !was.left) this.toast(t('{player} left the table. A bot plays for them until they rejoin.', { player: s.name }));
			else if (s.connected && !was.connected) this.toast(t('{player} is back at the table.', { player: s.name }), 'good');
		}
	}

	/** Ask whether the last game this player was in is still going, so the menu can offer it. */
	peekLastGame() {
		const code = storage(LAST_GAME);
		if (!code) return;
		this.send({ t: 'peek', code, token: storage(`reign:token:${code}`) ?? undefined });
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
		else if (msg.t !== 'ping' && msg.t !== 'aim' && msg.t !== 'beacon') this.queue.push(msg);
	}

	/** Show the other players the tile this player is about to move the robber to (null: none). */
	aimAt(hex: number | null) {
		this.send({ t: 'aim', hex });
	}

	/**
	 * Light a beacon at this spot on the map (in tile radii) for everyone at the table. It shows
	 * here at once; false when the last one was too recent (the server would drop it).
	 */
	beacon(x: number, z: number): boolean {
		const me = this.view?.me ?? this.cq?.me;
		if (me === undefined || me < 0 || this.replaying) return false;
		const now = performance.now();
		if (now - this.lastBeacon < BEACON_GAP_MS) return false;
		this.lastBeacon = now;
		x = Math.round(x * 100) / 100;
		z = Math.round(z * 100) / 100;
		this.addBeacon(me, x, z);
		this.send({ t: 'beacon', x, z });
		return true;
	}

	private addBeacon(player: number, x: number, z: number) {
		this.beacons = [...this.beacons.slice(-15), { id: ++this.beaconId, player, x, z }];
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

	/** The name sent with a join; the server seats signed-in players under their nickname anyway. */
	private get joinName() {
		return account.me?.nickname ?? (this.name || 'Player');
	}

	/** Open a new table for `game`. */
	create(game: GameKind = 'settlement') {
		this.pendingJoin = true;
		this.send({ t: 'create', name: this.joinName, game });
	}

	/** Create a table for `game`, fill it with bots and start right away. */
	quickPlay(bots = 3, game: GameKind = 'settlement') {
		this.autoBots = bots;
		this.launching = true;
		this.create(game);
	}

	/** A move in this table's game of Conquest. */
	cqAct(action: CqAction) {
		this.send({ t: 'cqAction', action });
	}

	/** Host: change the Conquest table's settings. */
	setConquest(settings: Partial<ConquestSettings>) {
		this.send({ t: 'setConquest', settings });
	}

	/**
	 * Play a campaign mission: at a new table of its own, or (the next mission, or the same one
	 * again, once a game is over) at the campaign table we are at.
	 */
	playMission(id: string) {
		if (this.seat && this.lobby?.mission) return this.send({ t: 'mission', mission: id });
		this.autoMission = id;
		this.launching = true;
		this.create();
	}

	join(code: string) {
		code = code.trim().toUpperCase();
		if (!code) return;
		this.pendingJoin = true;
		this.code = code;
		this.send({ t: 'join', code, name: this.joinName, token: storage(`reign:token:${code}`) ?? undefined });
	}

	/** Back out of an invite link to the main menu, while it loads or after it failed. */
	cancelJoin() {
		if (this.seat || this.spectating) return this.leave();
		if (this.pendingJoin) this.dropJoin = true;
		this.pendingJoin = false;
		this.joining = null;
		this.code = null;
		this.setUrl(null);
	}

	setMenuOpen(open: boolean) {
		if (open === this.menuOpen) return;
		this.menuOpen = open;
		if ((this.view || this.cq) && !this.replaying) this.send({ t: 'pause', paused: open });
	}

	leave() {
		this.menuOpen = false;
		// A replay has no room on the server to leave.
		if (this.replaying) {
			this.replaying = false;
			this.onReplayEnd?.();
		} else this.send({ t: 'leave' });
		this.lobby = null;
		this.latest = null;
		this.view = null;
		this.cq = null;
		clearTimeout(this.tossTimer);
		this.tossing = null;
		clearTimeout(this.presentTimer);
		this.presenting = null;
		this.lastRoll = null;
		this.dealt = [];
		this.rollAsked = false;
		this.pigeons = [];
		this.autoDeclined = null;
		this.freshPigeon = null;
		this.aim = null;
		this.beacons = [];
		this.seat = null;
		this.spectating = false;
		this.code = null;
		this.joining = null;
		this.launching = false;
		this.setClock(null);
		this.setUrl(null);
		// While anyone else is still playing, the menu offers the way back in.
		this.peekLastGame();
	}

	/** Send a private note by pigeon to the player in seat `to`. */
	sendPigeon(to: string, text: string) {
		this.send({ t: 'pigeon', to, text });
	}

	act(action: Action) {
		// Until the dice land (or an event card has played out) the interface shows the state from
		// before: nothing is played from it.
		if (this.tossing || this.presenting) return;
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
		setTimeout(() => (this.toasts = this.toasts.filter((toast) => toast.id !== id)), kind === 'error' ? 4200 : 3200);
	}

	get me(): number {
		return this.view?.me ?? this.cq?.me ?? -1;
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

/**
 * A campaign's rivals sit under their characters' names, which the server sends in English: show
 * them in the player's language, as the story does.
 */
function castNames(view: GameView): GameView {
	const cast = view.campaign?.cast;
	if (!cast?.some((c, i) => c && view.players[i]?.name === CHARACTER_INFO[c].name)) return view;
	return {
		...view,
		players: view.players.map((p, i) => {
			const c = cast[i];
			return c && p.name === CHARACTER_INFO[c].name ? { ...p, name: t(p.name) } : p;
		})
	};
}
