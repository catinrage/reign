import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Live, Overview, AdminUsers, AdminMatches, AdminUserDetail } from '../src/shared/admin';
import { Accounts } from '../src/server/accounts';
import { setAdmins } from '../src/server/admin';
import { Analytics, cleanPing } from '../src/server/analytics';
import { handleApi } from '../src/server/api';
import { type Db, openDb } from '../src/server/db';
import { Hub } from '../src/server/hub';

/** The admin panel's API: who gets in, the pings guests' pages send, and the numbers. */

let db: Db;
let accounts: Accounts;
let server: Server;
let base = '';

const run = Math.random().toString(36).slice(2, 6);
const boss = `boss_${run}`;
const pleb = `pleb_${run}`;
const json = { 'content-type': 'application/json' };

beforeAll(async () => {
	db = await openDb(process.env.TEST_DATABASE_URL ?? 'memory://');
	accounts = new Accounts(db);
	const hub = new Hub(accounts);
	const analytics = new Analytics(db, accounts);
	setAdmins([boss]);
	server = createServer((req, res) => void handleApi(req, res, accounts, hub, { admin: { analytics, rooms: () => [] } }));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
	server?.close();
	await db?.close();
});

async function signUp(username: string) {
	const res = await fetch(`${base}/api/register`, {
		method: 'POST',
		headers: json,
		body: JSON.stringify({ username, password: 'correct horse battery' })
	});
	expect(res.status).toBe(200);
	return res.headers.get('set-cookie')!.split(';')[0];
}

const ping = (body: object, headers: Record<string, string> = {}) =>
	fetch(`${base}/api/ping`, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) });

describe('the admin API', () => {
	let bossCookie = '';
	let plebCookie = '';

	beforeAll(async () => {
		bossCookie = await signUp(boss);
		plebCookie = await signUp(pleb);
	});

	it('lets only the admins in, and only with the cookie', async () => {
		expect((await fetch(`${base}/api/admin/me`)).status).toBe(401);
		expect((await fetch(`${base}/api/admin/me`, { headers: { cookie: plebCookie } })).status).toBe(404);
		expect((await fetch(`${base}/api/admin/me`, { headers: { cookie: bossCookie } })).status).toBe(200);
		// The same admin with a token, as a copy on another site would send it, doesn't get in.
		const res = await fetch(`${base}/api/login`, {
			method: 'POST',
			headers: { ...json, 'x-reign-auth': 'token' },
			body: JSON.stringify({ username: boss, password: 'correct horse battery' })
		});
		const { token } = await res.json();
		expect((await fetch(`${base}/api/admin/me`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(404);
		// Changes aren't taken at all.
		const post = await fetch(`${base}/api/admin/users`, { method: 'POST', headers: { ...json, cookie: bossCookie }, body: '{}' });
		expect(post.status).toBe(405);
	});

	it('counts guests from their pings, and their games against bots', async () => {
		const guest = `guest-${run}-aaaaaaaaaaaa`;
		expect((await ping({ client: guest, platform: 'itch', guest: true, where: 'menu', hello: true })).status).toBe(200);
		await ping({
			client: guest,
			platform: 'itch',
			guest: true,
			where: 'game',
			game: { id: 'g1abc', mode: 'classic', mission: null, bots: 3, status: 'playing', turns: 0 }
		});
		await ping({
			client: guest,
			platform: 'itch',
			guest: true,
			where: 'game',
			game: { id: 'g1abc', mode: 'classic', mission: null, bots: 3, status: 'won', turns: 41 }
		});
		// A signed-in page, with its cookie.
		await ping({ client: `user-${run}-bbbbbbbbbbbb`, platform: 'web', guest: false, where: 'menu', hello: true }, { cookie: plebCookie });
		// Junk is ignored but still answered.
		expect((await ping({ client: 'x', platform: 'mars' })).status).toBe(200);

		const o: Overview = await (await fetch(`${base}/api/admin/overview`, { headers: { cookie: bossCookie } })).json();
		expect(o.totals.users).toBeGreaterThanOrEqual(2);
		expect(o.totals.guestGames).toBeGreaterThanOrEqual(1);
		expect(o.guestOutcomes.won).toBeGreaterThanOrEqual(1);
		expect(o.days).toHaveLength(30);
		const today = o.days[o.days.length - 1];
		expect(today.activeGuests).toBeGreaterThanOrEqual(1);
		expect(today.activeUsers).toBeGreaterThanOrEqual(1);
		expect(today.newUsers).toBeGreaterThanOrEqual(2);
		expect(o.platforms.find((p) => p.platform === 'itch')?.guests).toBeGreaterThanOrEqual(1);
		expect(o.live.guestsOnline).toBeGreaterThanOrEqual(1);

		const live: Live = await (await fetch(`${base}/api/admin/live`, { headers: { cookie: bossCookie } })).json();
		const mine = live.clients.find((c) => c.platform === 'web' && c.username === pleb);
		expect(mine?.guest).toBe(false);
	});

	it('lists players and games, and shows a player', async () => {
		const users: AdminUsers = await (await fetch(`${base}/api/admin/users?q=${run}`, { headers: { cookie: bossCookie } })).json();
		expect(users.users.map((u) => u.username).sort()).toEqual([boss, pleb]);
		const plebRow = users.users.find((u) => u.username === pleb)!;
		expect(plebRow.platforms).toEqual(['web']);

		const id = await accounts.matchStarted({
			code: 'ABCDE',
			mode: 'classic',
			mapName: 'Classic',
			pointsToWin: 10,
			seats: [
				{ userId: plebRow.id, name: pleb, color: 'red', isBot: false, character: null },
				{ userId: null, name: 'Bot', color: 'blue', isBot: true, character: null }
			]
		});
		await accounts.matchFinished(id, 30, 0, [10, 6]);
		await accounts.saveReplay(id, 1, 5, new Uint8Array([1, 2, 3]));

		const games: AdminMatches = await (await fetch(`${base}/api/admin/matches?status=finished`, { headers: { cookie: bossCookie } })).json();
		expect(games.matches.some((m) => String(m.id) === id && m.replay)).toBe(true);
		const detail: AdminUserDetail = await (await fetch(`${base}/api/admin/users/${plebRow.id}`, { headers: { cookie: bossCookie } })).json();
		expect(detail.user.played).toBe(1);
		expect(detail.user.won).toBe(1);
		expect(detail.matches[0].id).toBe(Number(id));
		const one = await fetch(`${base}/api/admin/matches/${id}`, { headers: { cookie: bossCookie } });
		expect((await one.json()).match.code).toBe('ABCDE');

		// The admin may watch anyone's replay; someone who wasn't at the table and isn't a friend can't.
		expect((await fetch(`${base}/api/replays/${id}`, { headers: { cookie: bossCookie } })).status).toBe(200);
		const stranger = await signUp(`strg_${run}`);
		expect((await fetch(`${base}/api/replays/${id}`, { headers: { cookie: stranger } })).status).toBe(404);
	});
});

describe('pings', () => {
	it('keeps what a page may say and drops the rest', () => {
		expect(cleanPing({ client: 'short', platform: 'web' })).toBeNull();
		expect(cleanPing({ client: 'a'.repeat(20), platform: 'nope' })).toBeNull();
		const p = cleanPing({
			client: 'a'.repeat(20),
			platform: 'crazygames',
			guest: true,
			where: 'game',
			game: { id: 'abcd', mode: 'weird', bots: 99, status: 'hacked', turns: -5, mission: '<script>' }
		});
		expect(p?.game).toEqual({ id: 'abcd', mode: 'classic', mission: null, bots: 8, status: 'playing', turns: 0 });
		// A signed-in page's games are on the server already: only guests tell theirs.
		expect(cleanPing({ client: 'a'.repeat(20), platform: 'web', guest: false, game: { id: 'abcd' } })?.game).toBeUndefined();
	});
});
