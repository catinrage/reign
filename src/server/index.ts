import { createReadStream, existsSync, statSync } from 'node:fs';
import { type IncomingMessage, createServer } from 'node:http';
import { gzip } from 'node:zlib';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Me } from '../shared/accounts';
import type { ClientMessage, RoomSummary } from '../shared/protocol';
import type { Recorder } from '../shared/replay';
import type { GameState } from '../shared/rules/types';
import { type GameKind, isGameKind } from '../shared/games';
import { missionResult } from '../shared/rules/campaign';
import { totalPoints } from '../shared/rules/engine';
import { Accounts } from './accounts';
import { SESSION_COOKIE, handleApi, originAllowed, readCookie } from './api';
import { openDb } from './db';
import { Hub } from './hub';
import { Room, send } from './room';

const PORT = Number(process.env.PORT ?? 8787);
const STATIC_DIR = resolve(process.cwd(), 'dist/client');
/** Dev cheats: on for the local dev server (`pnpm dev` passes --dev), never in production. */
const CHEATS = process.argv.includes('--dev') && process.env.NODE_ENV !== 'production';

const rooms = new Map<string, Room>();
/** Codes of games cancelled because everyone left, and when, so a late rejoin hears why. */
const cancelled = new Map<string, number>();
const CANCELLED_MEMORY_MS = 1000 * 60 * 60;

const db = await openDb().catch((e) => {
	console.error(`Can't open the database${process.env.DATABASE_URL ? ' at DATABASE_URL' : ''}:`, e?.message ?? e);
	process.exit(1);
});
const accounts = new Accounts(db);
const hub = new Hub(accounts);
await accounts.closeStaleMatches();

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.ico': 'image/x-icon',
	'.mp3': 'audio/mpeg',
	'.ogg': 'audio/ogg'
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', 'http://x');
	if (url.pathname.startsWith('/api/')) {
		await handleApi(req, res, accounts, hub, openRooms);
		return;
	}
	if (url.pathname === '/health') {
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
	}
	if (!existsSync(STATIC_DIR)) {
		res.writeHead(200, { 'content-type': 'text/plain' });
		return res.end('Reign server is running. Run `pnpm build` to serve the client from here.');
	}
	let file = normalize(join(STATIC_DIR, decodeURIComponent(url.pathname)));
	if (!file.startsWith(STATIC_DIR)) {
		res.writeHead(403);
		return res.end();
	}
	if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
	const ext = extname(file);
	res.writeHead(200, {
		'content-type': MIME[ext] ?? 'application/octet-stream',
		'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
	});
	createReadStream(file).pipe(res);
});

/**
 * A page hosted on another site (see api.ts) can't send its sign-in in a cookie or a header to
 * the WebSocket, so it offers it as a subprotocol: `reign` and `reign-token.<token>`. The server
 * picks `reign`, which the browser needs to see back.
 */
const TOKEN_PROTOCOL = 'reign-token.';

const wss = new WebSocketServer({
	server,
	path: '/ws',
	maxPayload: 64 * 1024,
	handleProtocols: (protocols) => (protocols.has('reign') ? 'reign' : false)
});

/** The token a page from another site sent with the connection, if any. */
function protocolToken(req: IncomingMessage): string | null {
	for (const p of String(req.headers['sec-websocket-protocol'] ?? '').split(',')) {
		const s = p.trim();
		if (s.startsWith(TOKEN_PROTOCOL)) return s.slice(TOKEN_PROTOCOL.length) || null;
	}
	return null;
}

function newCode(): string {
	const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	for (;;) {
		let code = '';
		for (let i = 0; i < 5; i++) code += letters[Math.floor(Math.random() * letters.length)];
		if (!rooms.has(code)) return code;
	}
}

/** The most tables the public rooms list shows at once. */
const ROOMS_LISTED = 60;

/** Public tables waiting for players: the fullest first, then the newest. */
function openRooms(): RoomSummary[] {
	const list: RoomSummary[] = [];
	for (const room of rooms.values()) if (room.browsable) list.push(room.summary());
	list.sort((a, b) => b.players - a.players || b.createdAt - a.createdAt);
	return list.slice(0, ROOMS_LISTED);
}

/** A new table, with its games written into the match history. */
function openRoom(kind: GameKind = 'settlement', listed = false): Room {
	const room = new Room(newCode(), CHEATS, kind);
	room.listed = listed;
	let match: Promise<string | null> | null = null;
	const points = () => room.game!.players.map((_, i) => totalPoints(room.game!, i));
	// Reign Extended drafts characters after the game starts, so they're written down at the end.
	const characters = () => (room.game ? room.game.players.map((p) => p.character) : []);
	const failed = (e: unknown) => {
		console.error(`[room ${room.code}] match history:`, e);
		return null;
	};
	// The game's replay goes with its match, once the game is over (won or given up).
	const keepReplay = (id: string, rec: Recorder<GameState> | null) => {
		if (!rec?.size) return;
		const replay = rec.replay();
		return new Promise<Buffer>((done, fail) => gzip(JSON.stringify(replay), (e, gz) => (e ? fail(e) : done(gz)))).then((gz) =>
			accounts.saveReplay(id, replay.v, replay.steps.length, gz)
		);
	};
	room.listener = {
		gameStarted(r) {
			const g = r.game;
			match = r.seats.some((s) => s.userId)
				? accounts
						.matchStarted({
							code: r.code,
							mode: g!.mode,
							mapName: g!.mapName,
							pointsToWin: g!.pointsToWin,
							seats: r.seats.map((s, i) => ({
								userId: s.userId,
								name: s.name,
								color: s.color,
								isBot: s.isBot,
								character: g?.players[i]?.character ?? null
							}))
						})
						.catch(failed)
				: null;
			// Nobody's history lists a game of bots alone, so it isn't recorded either.
			if (!match) r.recorder = null;
			void hub.roomChanged(r);
		},
		gameEnded(r) {
			const scores = points();
			const g = r.game!;
			// Taken now: Play again starts the next game's recording before this one is saved.
			const rec = r.recorder;
			r.recorder = null;
			match
				?.then(async (id) => {
					if (!id) return;
					await accounts.matchFinished(id, g.turn, g.winner ?? g.current, scores, characters());
					await keepReplay(id, rec);
				})
				.catch(failed);
			match = null;
			// A campaign mission won goes on the player's campaign (not one a bot finished for them).
			const result = missionResult(g);
			const seat = g.campaign ? r.seats[g.campaign.hero] : undefined;
			const hero = seat && !seat.left ? seat.userId : null;
			if (result?.won && hero) accounts.missionWon(hero, g.campaign!.mission, result).catch(failed);
			void hub.roomChanged(r);
		},
		disposed(r) {
			if (r.playing) {
				const turn = r.game!.turn;
				const scores = points();
				const chars = characters();
				const rec = r.recorder;
				r.recorder = null;
				match
					?.then(async (id) => {
						if (!id) return;
						await accounts.matchAbandoned(id, turn, scores, chars);
						await keepReplay(id, rec);
					})
					.catch(failed);
			}
			match = null;
		}
	};
	rooms.set(room.code, room);
	return room;
}

/** Another site's page may not open a game connection with this player's cookie. */
function sameOrigin(origin: string | undefined, host: string | undefined) {
	if (!origin || !host) return true;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

/** A ping's `n` to send back with the pong: a number, or nothing. */
function pingId(n: unknown): number | undefined {
	return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

wss.on('connection', (ws: WebSocket, req) => {
	let room: Room | null = null;
	let seat: ReturnType<Room['join']> | null = null;
	let user: Me | null = null;
	// The cookie only counts from the game's own site; a token sent on purpose from any allowed one.
	const fromToken = protocolToken(req);
	const origin = req.headers.origin;
	const session = fromToken ?? readCookie(req, SESSION_COOKIE);
	const trusted = fromToken
		? !origin || originAllowed(origin)
		: sameOrigin(origin, req.headers['x-forwarded-host']?.toString() ?? req.headers.host);
	const signedIn = trusted
		? accounts.userForSession(session).catch((e) => {
				console.error('[ws] session check failed', e);
				return null;
			})
		: Promise.resolve(null);
	// Messages wait in line until the sign-in is checked.
	let line = signedIn.then(async (u) => {
		if (!u) {
			send(ws, { t: 'unauthorized' });
			ws.close(4001, 'sign in first');
			return;
		}
		if (ws.readyState !== ws.OPEN) return;
		user = u;
		await hub.connected(ws, u, session!);
	});

	function handle(msg: ClientMessage) {
		if (!user) return;
		if (msg.t === 'peek') {
			const code = String(msg.code ?? '').toUpperCase();
			const peek = rooms.get(code)?.peek(msg.token, user.id) ?? { open: false, players: [] };
			return send(ws, { t: 'peek', code, ...peek });
		}
		if (msg.t === 'create' || msg.t === 'join') {
			if (room) {
				room.disconnect(ws);
				cancelIfAbandoned(room);
			}
			if (msg.t === 'create') room = openRoom(isGameKind(msg.game) ? msg.game : 'settlement', msg.listed === true);
			else {
				const code = String(msg.code ?? '').toUpperCase();
				room = rooms.get(code) ?? null;
				if (!room) {
					void hub.setRoom(ws, null);
					const message = cancelled.has(code)
						? 'That game was cancelled when everyone left it.'
						: "That game doesn't exist (or it ended).";
					return send(ws, { t: 'error', message });
				}
			}
			// The profile may have changed since this connection opened.
			user = hub.user(ws) ?? user;
			// A game already under way can still be watched by anyone with its code.
			if (room.started && !room.hasSeat(msg.token, user.id)) {
				room.watch(ws);
				seat = null;
				void hub.setRoom(ws, room);
				return;
			}
			seat = room.join(ws, user.nickname, msg.token, { id: user.id, nickname: user.nickname, avatar: user.avatar, dice: user.dice });
			if (typeof seat === 'string') {
				send(ws, { t: 'error', message: seat });
				room = null;
				seat = null;
			}
			void hub.setRoom(ws, room);
			return;
		}
		if (msg.t === 'invite') {
			return void hub.invite(ws, String(msg.user)).then((why) => why && send(ws, { t: 'error', message: why }));
		}
		if (msg.t === 'declineInvite') return hub.decline(ws, String(msg.id));
		if (room && !seat && msg.t === 'leave') {
			// A spectator stops watching.
			room.disconnect(ws);
			room = null;
			void hub.setRoom(ws, null);
			return;
		}
		if (!room || !seat || typeof seat === 'string') return;
		try {
			room.handle(seat, msg, ws);
		} catch (e) {
			console.error(e);
			send(ws, { t: 'error', message: 'Something went wrong on the server.' });
		}
		if (msg.t === 'leave') {
			cancelIfAbandoned(room);
			room = null;
			seat = null;
			void hub.setRoom(ws, null);
		}
	}

	ws.on('message', (raw) => {
		let msg: ClientMessage;
		try {
			msg = JSON.parse(String(raw));
		} catch {
			return;
		}
		// Pings skip the line, so the round trip they time is the network's alone.
		if (msg?.t === 'ping') return send(ws, { t: 'pong', n: pingId(msg.n) });
		line = line.then(() => handle(msg)).catch((e) => console.error(e));
	});

	ws.on('close', () => {
		line = line.then(() => {
			if (room) {
				room.disconnect(ws);
				cancelIfAbandoned(room);
			}
			return hub.disconnected(ws);
		});
	});
});

/** Cancel a game nobody is at any more (see Room.abandoned). */
function cancelIfAbandoned(room: Room, now = Date.now()) {
	if (rooms.get(room.code) !== room || !room.abandoned(now)) return;
	room.dispose();
	rooms.delete(room.code);
	if (room.started) cancelled.set(room.code, now);
}

setInterval(() => {
	const now = Date.now();
	for (const room of rooms.values()) cancelIfAbandoned(room, now);
	for (const [code, at] of cancelled) if (now - at > CANCELLED_MEMORY_MS) cancelled.delete(code);
}, 15_000);

server.listen(PORT, () =>
	console.log(`Reign server listening on http://localhost:${PORT}${CHEATS ? ' (dev cheats on)' : ''}`)
);

// Exit on a stop signal. As PID 1 in a container Node would otherwise ignore it until killed.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(0));
