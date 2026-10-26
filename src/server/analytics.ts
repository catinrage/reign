import type { AvatarId, Whereabouts } from '../shared/accounts';
import {
	type AdminMatches,
	type AdminUser,
	type AdminUserDetail,
	type AdminUsers,
	type DayStats,
	type GuestGameReport,
	type LiveClient,
	type Overview,
	type Ping,
	type Platform,
	isPlatform
} from '../shared/admin';
import { GAME_MODES, type GameMode } from '../shared/rules/modes';
import type { Accounts } from './accounts';
import type { Db } from './db';

/**
 * The numbers behind the admin panel. Signed-in play is on the server already (accounts, matches,
 * replays); guests play against bots inside their own page, so all the server knows of them is
 * what their pages tell it: a ping once a minute while the game is open, and a word when one of
 * their games starts or ends (see client/state/telemetry.ts). Those are what a page says about
 * itself, so they're counts to read trends from, not records to trust one by one.
 */

/** A page that pinged this recently is open right now (it pings every minute while visible). */
export const LIVE_MS = 150_000;
/** The most pages kept in memory as open; past that, the oldest go. */
const LIVE_MAX = 20_000;
/** The least time between two pings from one page that are written down (game news always is). */
const PING_EVERY_MS = 20_000;
/** Days the charts cover. */
const DAYS = 30;

const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

interface Open {
	platform: Platform;
	guest: boolean;
	where: 'menu' | 'game';
	userId: string | null;
	username: string | null;
	since: number;
	at: number;
	written: number;
	game: GuestGameReport | null;
}

type Num = string | number | null;
const n = (v: Num | undefined) => Number(v ?? 0);

/** A ping as it came, checked and trimmed, or null when it isn't one. */
export function cleanPing(body: Record<string, unknown>): Ping | null {
	if (typeof body.client !== 'string' || !CLIENT_ID.test(body.client) || !isPlatform(body.platform)) return null;
	const ping: Ping = {
		client: body.client,
		platform: body.platform,
		guest: body.guest === true,
		where: body.where === 'game' ? 'game' : 'menu',
		hello: body.hello === true
	};
	const g = body.game as Record<string, unknown> | undefined;
	if (ping.guest && g && typeof g === 'object' && typeof g.id === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(g.id)) {
		ping.game = {
			id: g.id,
			mode: GAME_MODES.includes(g.mode as GameMode) ? (g.mode as GameMode) : 'classic',
			mission: typeof g.mission === 'string' && /^[a-z0-9_-]{1,40}$/i.test(g.mission) ? g.mission : null,
			bots: Math.max(0, Math.min(8, Math.floor(Number(g.bots) || 0))),
			status: (['playing', 'won', 'lost', 'quit'] as const).find((s) => s === g.status) ?? 'playing',
			turns: Math.max(0, Math.min(10_000, Math.floor(Number(g.turns) || 0)))
		};
	}
	return ping;
}

export class Analytics {
	private open = new Map<string, Open>();

	constructor(
		private db: Db,
		private accounts: Accounts
	) {}

	/** A page said it's open (see Ping). `userId` is who its sign-in belongs to, if it has one. */
	async ping(p: Ping, user: { id: string; username: string } | null, now = Date.now()) {
		const guest = !user;
		let o = this.open.get(p.client);
		const news = !o || !!p.hello || !!p.game || o.where !== p.where || o.guest !== guest;
		if (o && !news && now - o.written < PING_EVERY_MS) {
			o.at = now;
			return;
		}
		if (!o) {
			if (this.open.size >= LIVE_MAX) this.sweep(now, true);
			o = { platform: p.platform, guest, where: p.where, userId: null, username: null, since: now, at: now, written: 0, game: null };
			this.open.set(p.client, o);
		}
		Object.assign(o, { platform: p.platform, guest, where: p.where, userId: user?.id ?? null, username: user?.username ?? null, at: now, written: now });
		if (p.game) o.game = p.game.status === 'playing' ? p.game : null;
		else if (p.where === 'menu') o.game = null;

		await this.db.query(
			`insert into clients (id, platform, user_id) values ($1, $2, $3)
			 on conflict (id) do update set last_seen = now(), platform = $2, user_id = coalesce($3, clients.user_id),
			 visits = clients.visits + $4`,
			[p.client, p.platform, user?.id ?? null, p.hello ? 1 : 0]
		);
		await this.db.query(
			`insert into client_days (day, client_id, guest, platform) values ((now() at time zone 'utc')::date, $1, $2, $3)
			 on conflict (day, client_id) do update set guest = client_days.guest and $2`,
			[p.client, guest, p.platform]
		);
		const g = p.game;
		if (g && guest) {
			const over = g.status !== 'playing';
			await this.db.query(
				`insert into guest_games (client_id, local_id, platform, mode, mission, bots, status, won, turns, ended_at)
				 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${over ? 'now()' : 'null'})
				 on conflict (client_id, local_id) do update set status = $7, won = $8, turns = greatest(guest_games.turns, $9),
				 ended_at = ${over ? 'coalesce(guest_games.ended_at, now())' : 'guest_games.ended_at'}
				 where guest_games.status = 'playing'`,
				[p.client, g.id, p.platform, g.mode, g.mission, g.bots, g.status, over ? g.status === 'won' : null, g.turns]
			);
		}
	}

	private sweep(now: number, full = false) {
		for (const [id, o] of this.open) if (now - o.at > LIVE_MS) this.open.delete(id);
		if (full && this.open.size >= LIVE_MAX) {
			const oldest = [...this.open].sort((a, b) => a[1].at - b[1].at).slice(0, this.open.size - LIVE_MAX + 1);
			for (const [id] of oldest) this.open.delete(id);
		}
	}

	/** The pages open right now. */
	liveClients(now = Date.now()): LiveClient[] {
		this.sweep(now);
		return [...this.open.values()]
			.sort((a, b) => a.since - b.since)
			.map((o) => ({
				platform: o.platform,
				guest: o.guest,
				where: o.where,
				username: o.username,
				since: o.since,
				game: o.game && { mode: o.game.mode, mission: o.game.mission, bots: o.game.bots, turns: o.game.turns }
			}));
	}

	// ------------------------------------------------------------ the numbers

	async overview(live: Overview['live'], now = Date.now()): Promise<Overview> {
		const one = async (sql: string) => (await this.db.query<Record<string, Num>>(sql))[0] ?? {};
		const t = await one(`select
			(select count(*) from users) as users,
			(select count(*) from users where crazygames_id is not null) as cg,
			(select count(*) from matches) as games,
			(select count(*) from matches where status = 'finished') as finished,
			(select count(*) from guest_games) as guest_games,
			(select count(*) from match_replays) as replays,
			(select count(*) from clients) as visitors,
			(select count(*) from clients where user_id is null) as guest_visitors,
			(select count(*) from users where created_at > now() - interval '1 day') as nu1,
			(select count(*) from users where created_at > now() - interval '7 days') as nu7,
			(select count(*) from matches where started_at > now() - interval '1 day') as g1,
			(select count(*) from guest_games where started_at > now() - interval '1 day') as gg1,
			(select count(*) from clients where last_seen > now() - interval '1 day') as a1,
			(select count(*) from clients where last_seen > now() - interval '7 days') as a7,
			(select count(*) from clients where last_seen > now() - interval '30 days') as a30`);

		const since = `(now() at time zone 'utc')::date - ${DAYS - 1}`;
		const perDay = async (sql: string) => {
			const rows = await this.db.query<{ day: string; a: Num; b?: Num }>(sql);
			return new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
		};
		const [users, games, guestGames, active] = await Promise.all([
			perDay(`select to_char((created_at at time zone 'utc')::date, 'YYYY-MM-DD') as day, count(*) as a
				from users where (created_at at time zone 'utc')::date >= ${since} group by 1`),
			perDay(`select to_char((started_at at time zone 'utc')::date, 'YYYY-MM-DD') as day, count(*) as a
				from matches where (started_at at time zone 'utc')::date >= ${since} group by 1`),
			perDay(`select to_char((started_at at time zone 'utc')::date, 'YYYY-MM-DD') as day, count(*) as a
				from guest_games where (started_at at time zone 'utc')::date >= ${since} group by 1`),
			perDay(`select to_char(day, 'YYYY-MM-DD') as day, count(*) filter (where not guest) as a, count(*) filter (where guest) as b
				from client_days where day >= ${since} group by 1`)
		]);
		const days: DayStats[] = [];
		const today = new Date(now);
		for (let i = DAYS - 1; i >= 0; i--) {
			const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10);
			days.push({
				day,
				newUsers: n(users.get(day)?.a),
				games: n(games.get(day)?.a),
				guestGames: n(guestGames.get(day)?.a),
				activeUsers: n(active.get(day)?.a),
				activeGuests: n(active.get(day)?.b)
			});
		}

		const platformRows = await this.db.query<{ platform: string; guests: Num; users: Num }>(
			`select platform, count(*) filter (where guest) as guests, count(*) filter (where not guest) as users from (
				select client_id, bool_and(guest) as guest, max(platform) as platform from client_days
				where day >= (now() at time zone 'utc')::date - 6 group by client_id) c group by platform`
		);
		const modeRows = await this.db.query<{ mode: string; games: Num; guest_games: Num }>(
			`select mode, sum(g) as games, sum(gg) as guest_games from (
				select mode, 1 as g, 0 as gg from matches where started_at > now() - interval '30 days'
				union all select mode, 0, 1 from guest_games where started_at > now() - interval '30 days') x
			 group by mode order by 2 desc`
		);
		const outcome = await one(`select
			count(*) filter (where status = 'won') as won, count(*) filter (where status = 'lost') as lost,
			count(*) filter (where status = 'quit') as quit, count(*) filter (where status = 'playing') as playing
			from guest_games where started_at > now() - interval '30 days'`);
		const missionRows = await this.db.query<{ mission: string; played: Num; won: Num }>(
			`select mission, count(*) as played, count(*) filter (where won) as won from guest_games
			 where mission is not null and started_at > now() - interval '30 days' group by mission order by 2 desc limit 20`
		);

		return {
			now,
			totals: {
				users: n(t.users),
				usersCrazyGames: n(t.cg),
				games: n(t.games),
				gamesFinished: n(t.finished),
				guestGames: n(t.guest_games),
				replays: n(t.replays),
				visitors: n(t.visitors),
				guestVisitors: n(t.guest_visitors)
			},
			recent: {
				newUsers24h: n(t.nu1),
				newUsers7d: n(t.nu7),
				games24h: n(t.g1),
				guestGames24h: n(t.gg1),
				active24h: n(t.a1),
				active7d: n(t.a7),
				active30d: n(t.a30)
			},
			live,
			days,
			platforms: platformRows
				.filter((r) => isPlatform(r.platform))
				.map((r) => ({ platform: r.platform as Platform, guests: n(r.guests), users: n(r.users) })),
			modes: modeRows.map((r) => ({ mode: r.mode, games: n(r.games), guestGames: n(r.guest_games) })),
			guestOutcomes: { won: n(outcome.won), lost: n(outcome.lost), quit: n(outcome.quit), playing: n(outcome.playing) },
			missions: missionRows.map((r) => ({ mission: r.mission, played: n(r.played), won: n(r.won) }))
		};
	}

	/** Players, newest first, or those whose name holds `q`. */
	async users(
		q: string,
		offset: number,
		limit: number,
		where: (id: string) => Whereabouts,
		sort: 'new' | 'seen' | 'games' = 'new'
	): Promise<AdminUsers> {
		const filter = q ? `where u.username ilike $1 or u.nickname ilike $1` : '';
		const params = q ? [`%${q.replace(/[\\%_]/g, '\\$&')}%`] : [];
		const order = { new: 'u.created_at desc', seen: 'last_seen desc nulls last', games: 'played desc, u.created_at desc' }[sort];
		const rows = await this.db.query<UserRow>(
			`${USER_SELECT} ${filter} order by ${order}, u.id desc limit ${limit} offset ${offset}`,
			params
		);
		const [total] = await this.db.query<{ c: Num }>(`select count(*) as c from users u ${filter}`, params);
		return { users: rows.map((r) => adminUser(r, where)), total: n(total?.c) };
	}

	async user(id: string, where: (id: string) => Whereabouts): Promise<AdminUserDetail | null> {
		if (!/^\d{1,18}$/.test(id)) return null;
		const [row] = await this.db.query<UserRow>(`${USER_SELECT} where u.id = $1`, [id]);
		if (!row) return null;
		const [extra] = await this.db.query<{ sessions: Num; maps: Num }>(
			`select (select count(*) from sessions where user_id = $1) as sessions, (select count(*) from maps where user_id = $1) as maps`,
			[id]
		);
		const campaign = await this.db.query<{ mission: string; stars: number; best_round: number }>(
			'select mission, stars, best_round from campaign_progress where user_id = $1 order by won_at',
			[id]
		);
		const history = await this.accounts.history(id);
		return {
			user: adminUser(row, where),
			matches: history?.matches ?? [],
			sessions: n(extra?.sessions),
			maps: n(extra?.maps),
			campaign: campaign.map((c) => ({ mission: c.mission, stars: c.stars, bestRound: c.best_round }))
		};
	}

	async matches(offset: number, limit: number, status: string | null): Promise<AdminMatches> {
		const pick = status === 'playing' || status === 'finished' || status === 'abandoned' ? status : null;
		const [total] = await this.db.query<{ c: Num }>(`select count(*) as c from matches where $1::text is null or status = $1`, [pick]);
		return { matches: await this.accounts.recentMatches(pick, limit, offset), total: n(total?.c) };
	}
}

type UserRow = {
	id: string;
	username: string;
	nickname: string;
	avatar: string;
	created_at: Date | string;
	last_seen: Date | string | null;
	crazygames: boolean;
	played: Num;
	won: Num;
	friends: Num;
	stars: Num;
	platforms: string[] | null;
};

const USER_SELECT = `select u.id::text as id, u.username, u.nickname, u.avatar, u.created_at, u.crazygames_id is not null as crazygames,
	(select max(last_seen) from sessions s where s.user_id = u.id) as last_seen,
	(select count(*) from match_players p where p.user_id = u.id) as played,
	(select count(*) from match_players p join matches m on m.id = p.match_id where p.user_id = u.id and m.status = 'finished' and p.place = 1) as won,
	(select count(*) from friendships f where f.accepted_at is not null and (f.asker = u.id or f.askee = u.id)) as friends,
	(select coalesce(sum(stars), 0) from campaign_progress c where c.user_id = u.id) as stars,
	(select array_agg(distinct platform) from clients c where c.user_id = u.id) as platforms
	from users u`;

function adminUser(r: UserRow, where: (id: string) => Whereabouts): AdminUser {
	return {
		id: r.id,
		username: r.username,
		nickname: r.nickname,
		avatar: r.avatar as AvatarId,
		createdAt: new Date(r.created_at).toISOString(),
		lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null,
		crazyGames: !!r.crazygames,
		played: n(r.played),
		won: n(r.won),
		friends: n(r.friends),
		campaignStars: n(r.stars),
		where: where(r.id),
		platforms: (r.platforms ?? []).filter(isPlatform)
	};
}
