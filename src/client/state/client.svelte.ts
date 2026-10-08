import type { ClientMessage, LobbyInfo, ServerMessage } from '../../shared/protocol';
import type { Action, GameView } from '../../shared/rules/types';

/**
 * The one connection to the game server plus everything the interface renders from.
 * Reconnects on its own and reclaims the seat with the token saved for that room.
 */

function storage(key: string, value?: string): string | null {
	try {
		if (value === undefined) return localStorage.getItem(key);
		localStorage.setItem(key, value);
	} catch {
		/* private mode */
	}
	return null;
}

export interface Toast {
	id: number;
	text: string;
	kind: 'error' | 'info' | 'good';
}

class GameClient {
	status = $state<'connecting' | 'online' | 'offline'>('connecting');
	lobby = $state<LobbyInfo | null>(null);
	view = $state.raw<GameView | null>(null);
	seat = $state<string | null>(null);
	code = $state<string | null>(null);
	name = $state<string>(storage('reign:name') ?? '');
	toasts = $state<Toast[]>([]);
	pendingJoin = $state(false);

	private ws: WebSocket | null = null;
	private retry = 0;
	private toastId = 0;
	private queue: ClientMessage[] = [];
	private pinger: ReturnType<typeof setInterval> | null = null;
	private autoBots = 0;

	connect() {
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		const ws = new WebSocket(`${proto}://${location.host}/ws`);
		this.ws = ws;
		this.status = 'connecting';
		ws.onopen = () => {
			this.status = 'online';
			this.retry = 0;
			const room = this.code ?? new URLSearchParams(location.search).get('room');
			if (room) this.join(room);
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
				this.code = msg.code;
				this.seat = msg.seat;
				this.pendingJoin = false;
				storage(`reign:token:${msg.code}`, msg.token);
				this.setUrl(msg.code);
				if (this.autoBots) {
					for (let i = 0; i < this.autoBots; i++) this.send({ t: 'addBot' });
					this.autoBots = 0;
					this.send({ t: 'start' });
				}
				break;
			case 'lobby':
				this.lobby = msg.lobby;
				break;
			case 'game':
				this.view = msg.view;
				break;
			case 'error':
				this.pendingJoin = false;
				this.toast(msg.message, 'error');
				if (!this.seat) {
					this.code = null;
					this.setUrl(null);
				}
				break;
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
		else if (msg.t !== 'ping') this.queue.push(msg);
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

	leave() {
		this.send({ t: 'leave' });
		this.lobby = null;
		this.view = null;
		this.seat = null;
		this.code = null;
		this.setUrl(null);
	}

	act(action: Action) {
		this.send({ t: 'action', action });
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

	get inviteLink(): string {
		const url = new URL(location.origin + location.pathname);
		if (this.code) url.searchParams.set('room', this.code);
		return url.toString();
	}
}

export const client = new GameClient();
