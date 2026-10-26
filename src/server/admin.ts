import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Me } from '../shared/accounts';
import type { Live, LiveRoom } from '../shared/admin';
import type { Accounts } from './accounts';
import type { Analytics } from './analytics';
import type { Hub } from './hub';

/**
 * The admin panel's API, under /api/admin (the page itself is /admin, see client/admin). Only
 * the players named in ADMIN_USERS (usernames, comma separated) get in, and only with the
 * game's own cookie, signed in on the server's own site: a token kept by a copy of the game on
 * another site never opens it. Anyone else gets "Nothing here", as for a path that doesn't exist.
 */

const ADMINS = new Set(
	(process.env.ADMIN_USERS ?? '')
		.split(',')
		.map((u) => u.trim().toLowerCase())
		.filter(Boolean)
);

/** Test hook: who the admins are. */
export function setAdmins(usernames: string[]) {
	ADMINS.clear();
	for (const u of usernames) ADMINS.add(u.toLowerCase());
}

export function isAdmin(user: Me | null, byCookie: boolean): boolean {
	return !!user && byCookie && ADMINS.has(user.username.toLowerCase());
}

export interface AdminSources {
	analytics: Analytics;
	/** Every table on the server right now. */
	rooms(): LiveRoom[];
}

const PAGE = 50;

function json(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
	res.end(JSON.stringify(body));
}

function int(v: string | null, max = 1e6) {
	const x = Math.floor(Number(v));
	return Number.isFinite(x) && x > 0 ? Math.min(x, max) : 0;
}

/** Handle /api/admin/<path> for an admin. */
export async function handleAdmin(
	path: string,
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	accounts: Accounts,
	hub: Hub,
	src: AdminSources
) {
	if (req.method !== 'GET') return json(res, 405, { error: 'Use GET.' });
	const where = (id: string) => hub.where(id);

	if (path === 'me') return json(res, 200, { ok: true });

	if (path === 'live' || path === 'overview') {
		const now = Date.now();
		const rooms = src.rooms();
		const online = hub.everyone().map((o) => ({
			user: { id: o.user.id, username: o.user.username, nickname: o.user.nickname, avatar: o.user.avatar, dice: o.user.dice },
			where: o.where,
			room: o.room
		}));
		const clients = src.analytics.liveClients(now);
		if (path === 'live') return json(res, 200, { now, rooms, online, clients } satisfies Live);
		const guests = clients.filter((c) => c.guest);
		return json(
			res,
			200,
			await src.analytics.overview(
				{
					usersOnline: online.length,
					usersInGame: online.filter((o) => o.where === 'game').length,
					guestsOnline: guests.length,
					guestsInGame: guests.filter((c) => c.where === 'game').length,
					roomsPlaying: rooms.filter((r) => r.state === 'playing').length,
					roomsLobby: rooms.filter((r) => r.state === 'lobby').length
				},
				now
			)
		);
	}

	if (path === 'users') {
		const sort = url.searchParams.get('sort');
		const q = (url.searchParams.get('q') ?? '').trim().slice(0, 40);
		return json(
			res,
			200,
			await src.analytics.users(q, int(url.searchParams.get('offset')), PAGE, where, sort === 'seen' || sort === 'games' ? sort : 'new')
		);
	}
	const user = /^users\/(\d+)$/.exec(path);
	if (user) {
		const detail = await src.analytics.user(user[1], where);
		return detail ? json(res, 200, detail) : json(res, 404, { error: 'No such player.' });
	}

	if (path === 'matches') {
		return json(res, 200, await src.analytics.matches(int(url.searchParams.get('offset')), PAGE, url.searchParams.get('status')));
	}
	const match = /^matches\/(\d+)$/.exec(path);
	if (match) {
		const m = await accounts.match(match[1]);
		return m ? json(res, 200, { match: m }) : json(res, 404, { error: 'No such game.' });
	}

	json(res, 404, { error: 'Nothing here.' });
}
