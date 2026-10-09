import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage } from '../shared/protocol';
import { Room, send } from './room';

const PORT = Number(process.env.PORT ?? 8787);
const STATIC_DIR = resolve(process.cwd(), 'dist/client');
const ROOM_IDLE_MS = 1000 * 60 * 60 * 3;
/** Dev cheats: on for the local dev server (`pnpm dev` passes --dev), never in production. */
const CHEATS = process.argv.includes('--dev') && process.env.NODE_ENV !== 'production';

const rooms = new Map<string, Room>();

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
	'.ico': 'image/x-icon',
	'.mp3': 'audio/mpeg',
	'.ogg': 'audio/ogg'
};

const server = createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://x');
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

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

function newCode(): string {
	const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	for (;;) {
		let code = '';
		for (let i = 0; i < 5; i++) code += letters[Math.floor(Math.random() * letters.length)];
		if (!rooms.has(code)) return code;
	}
}

wss.on('connection', (ws: WebSocket) => {
	let room: Room | null = null;
	let seat: ReturnType<Room['join']> | null = null;

	ws.on('message', (raw) => {
		let msg: ClientMessage;
		try {
			msg = JSON.parse(String(raw));
		} catch {
			return;
		}
		if (msg.t === 'ping') return send(ws, { t: 'pong' });
		if (msg.t === 'create' || msg.t === 'join') {
			if (room) room.disconnect(ws);
			if (msg.t === 'create') {
				room = new Room(newCode(), CHEATS);
				rooms.set(room.code, room);
			} else {
				room = rooms.get(String(msg.code ?? '').toUpperCase()) ?? null;
				if (!room) return send(ws, { t: 'error', message: "That game doesn't exist (or it ended)." });
			}
			seat = room.join(ws, msg.name, msg.token);
			if (typeof seat === 'string') {
				send(ws, { t: 'error', message: seat });
				room = null;
				seat = null;
			}
			return;
		}
		if (!room || !seat || typeof seat === 'string') return;
		try {
			room.handle(seat, msg, ws);
		} catch (e) {
			console.error(e);
			send(ws, { t: 'error', message: 'Something went wrong on the server.' });
		}
	});

	ws.on('close', () => room?.disconnect(ws));
});

setInterval(() => {
	const now = Date.now();
	for (const [code, room] of rooms) {
		if (room.isEmpty() && now - room.lastActivity() > (room.started ? ROOM_IDLE_MS : 60_000 * 10)) {
			room.dispose();
			rooms.delete(code);
		}
	}
}, 60_000);

server.listen(PORT, () =>
	console.log(`Reign server listening on http://localhost:${PORT}${CHEATS ? ' (dev cheats on)' : ''}`)
);

// Exit on a stop signal. As PID 1 in a container Node would otherwise ignore it until killed.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(0));
