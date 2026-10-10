import type { WebSocket as ServerSocket } from 'ws';
import type { ClientMessage } from '../../shared/protocol';
import { Room, send } from '../../server/room';
import { msg } from '../i18n/index.svelte';
import { OFFLINE_USER } from './api';

/**
 * The game server, run inside the page for the offline build (play against bots, no accounts).
 * `LocalSocket` stands in for the browser's WebSocket to the server: it hands each message to a
 * Room living in this tab, as the real server would, and the Room answers through a fake server
 * side socket. Everything is gone when the tab closes.
 */

const rooms = new Map<string, Room>();

// Errors this server sends; like the real server's, the client shows them through tx().
const BROKEN = msg('Something went wrong.');
const GONE = msg('That game is gone. Games against bots live in one browser tab, so reloading ends them.');

function newCode(): string {
	const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	for (;;) {
		let code = '';
		for (let i = 0; i < 5; i++) code += letters[Math.floor(Math.random() * letters.length)];
		if (!rooms.has(code)) return code;
	}
}

export class LocalSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	readonly OPEN = 1;
	readyState = LocalSocket.CONNECTING;
	onopen: (() => void) | null = null;
	onmessage: ((ev: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;

	private room: Room | null = null;
	private seat: ReturnType<Room['join']> | null = null;
	/** The server's end of the line, as the Room sees it. */
	private server: ServerSocket;

	constructor() {
		const self = this;
		this.server = {
			OPEN: 1,
			get readyState() {
				return self.readyState;
			},
			// The server's answers arrive later, as they would over a real line.
			send(data: string) {
				setTimeout(() => self.readyState === LocalSocket.OPEN && self.onmessage?.({ data }), 0);
			}
		} as unknown as ServerSocket;
		setTimeout(() => {
			this.readyState = LocalSocket.OPEN;
			this.onopen?.();
		}, 0);
	}

	send(raw: string) {
		if (this.readyState !== LocalSocket.OPEN) return;
		const msg = JSON.parse(raw) as ClientMessage;
		try {
			this.handle(msg);
		} catch (e) {
			console.error(e);
			send(this.server, { t: 'error', message: BROKEN });
		}
	}

	close() {
		if (this.readyState === LocalSocket.CLOSED) return;
		this.readyState = LocalSocket.CLOSED;
		if (this.room) this.leaveRoom();
		setTimeout(() => this.onclose?.(), 0);
	}

	private leaveRoom() {
		const room = this.room!;
		room.disconnect(this.server);
		if (room.abandoned()) {
			room.dispose();
			rooms.delete(room.code);
		}
		this.room = null;
		this.seat = null;
	}

	private handle(msg: ClientMessage) {
		const ws = this.server;
		if (msg.t === 'ping') return send(ws, { t: 'pong', n: msg.n });
		if (msg.t === 'peek') {
			const code = String(msg.code ?? '').toUpperCase();
			const peek = rooms.get(code)?.peek(msg.token, OFFLINE_USER.id) ?? {
				open: false,
				players: []
			};
			return send(ws, { t: 'peek', code, ...peek });
		}
		if (msg.t === 'create' || msg.t === 'join') {
			if (this.room) this.leaveRoom();
			let room: Room | null;
			if (msg.t === 'create') {
				room = new Room(newCode());
				rooms.set(room.code, room);
			} else {
				room = rooms.get(String(msg.code ?? '').toUpperCase()) ?? null;
				if (!room) {
					return send(ws, {
						t: 'error',
						message: GONE
					});
				}
			}
			const user = {
				id: OFFLINE_USER.id,
				nickname: OFFLINE_USER.nickname,
				avatar: OFFLINE_USER.avatar,
				dice: OFFLINE_USER.dice
			};
			const seat = room.join(ws, user.nickname, msg.token, user);
			if (typeof seat === 'string') return send(ws, { t: 'error', message: seat });
			this.room = room;
			this.seat = seat;
			return;
		}
		if (!this.room || !this.seat || typeof this.seat === 'string') return;
		this.room.handle(this.seat, msg, ws);
		if (msg.t === 'leave') this.leaveRoom();
	}
}
