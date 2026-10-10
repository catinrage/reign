import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
	type AvatarId,
	type FriendRequest,
	type Match,
	type MatchHistory,
	type MatchPlayer,
	type Me,
	type PublicUser,
	type SavedMap,
	MAX_SAVED_MAPS,
	cleanNickname,
	cleanUsername,
	isAvatar,
	passwordProblem,
	usernameProblem
} from '../shared/accounts';
import { type CustomMap, validateCustomMap } from '../shared/board/maps';
import type { CharacterId } from '../shared/rules/characters';
import type { PlayerColor } from '../shared/rules/config';
import type { Db } from './db';

/**
 * Accounts, sign-in sessions, friends and the record of games played, on top of the database.
 * Every method that can fail for a reason the player should see throws an AccountError.
 */

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
/** Sign-ins last this long without a visit. */
export const SESSION_DAYS = 30;
/** How many games the history shows. */
/** A row of `matches` as the history reads it. */
interface MatchRow {
	id: string;
	code: string;
	mode: string;
	map_name: string;
	points_to_win: number;
	status: string;
	started_at: Date;
	ended_at: Date | null;
	turns: number;
	replay: boolean;
}

const MATCH_COLUMNS = `m.id::text as id, m.code, m.mode, m.map_name, m.points_to_win, m.status, m.started_at, m.ended_at, m.turns,
	exists(select 1 from match_replays r where r.match_id = m.id) as replay`;

const HISTORY_LIMIT = 50;

export class AccountError extends Error {}

type UserRow = { id: string; username: string; nickname: string; avatar: string; created_at: Date | string };

const USER_COLS = 'id::text as id, username, nickname, avatar, created_at';

function iso(t: Date | string | null): string | null {
	return t == null ? null : new Date(t).toISOString();
}

function publicUser(r: UserRow): PublicUser {
	return { id: r.id, username: r.username, nickname: r.nickname, avatar: (isAvatar(r.avatar) ? r.avatar : 'knight') as AvatarId };
}

function me(r: UserRow): Me {
	return { ...publicUser(r), createdAt: iso(r.created_at)! };
}

export async function hashPassword(pw: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scryptAsync(pw, salt, 32, SCRYPT);
	return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
	const [kind, salt, key] = stored.split('$');
	if (kind !== 'scrypt' || !salt || !key) return false;
	const want = Buffer.from(key, 'base64');
	const got = await scryptAsync(pw, Buffer.from(salt, 'base64'), want.length, SCRYPT);
	return timingSafeEqual(want, got);
}

/** Sessions are kept by the hash of their token, so a leaked table can't sign anyone in. */
function tokenHash(token: string) {
	return createHash('sha256').update(token).digest('hex');
}

export interface ProfileChange {
	username?: string;
	nickname?: string;
	avatar?: string;
	password?: string;
	/** Needed to change the password. */
	currentPassword?: string;
}

/** A seat at the start of a game, for the record. */
export interface SeatRecord {
	userId: string | null;
	name: string;
	color: PlayerColor;
	isBot: boolean;
	character: CharacterId | null;
}

/** A map from a player, checked the way the map maker checks it; throws when it can't be kept. */
function cleanMap(input: unknown): CustomMap {
	const m = input as Partial<CustomMap> | null;
	if (!m || typeof m !== 'object' || !Array.isArray(m.tiles)) throw new AccountError('That map is empty.');
	const map: CustomMap = {
		name: cleanNickname(m.name) || 'Custom map',
		tiles: m.tiles.slice(0, 1000).map((t) => ({ q: Number(t?.q), r: Number(t?.r), terrain: t?.terrain ?? null }))
	};
	const problem = validateCustomMap(map);
	if (problem) throw new AccountError(problem);
	return map;
}

function parseTiles(tiles: unknown): CustomMap['tiles'] {
	const list = typeof tiles === 'string' ? JSON.parse(tiles) : tiles;
	return Array.isArray(list) ? list : [];
}

function mapKey(m: CustomMap) {
	return JSON.stringify([m.name, m.tiles.map((t) => [t.q, t.r, t.terrain])]);
}

export class Accounts {
	constructor(public db: Db) {}

	// ------------------------------------------------------------ sign-up and sign-in

	async register(input: { username?: unknown; nickname?: unknown; password?: unknown; avatar?: unknown }) {
		const username = cleanUsername(input.username);
		const problem = usernameProblem(username) ?? passwordProblem(input.password);
		if (problem) throw new AccountError(problem);
		const nickname = cleanNickname(input.nickname) || username.slice(0, 18);
		const avatar = isAvatar(input.avatar) ? input.avatar : 'knight';
		const hash = await hashPassword(input.password as string);
		const rows = await this.db.query<UserRow>(
			`insert into users (username, nickname, avatar, password_hash) values ($1, $2, $3, $4)
			 on conflict (username) do nothing returning ${USER_COLS}`,
			[username, nickname, avatar, hash]
		);
		if (!rows.length) throw new AccountError('That username is taken.');
		return { user: me(rows[0]), token: await this.newSession(rows[0].id) };
	}

	async login(input: { username?: unknown; password?: unknown }) {
		const username = cleanUsername(input.username);
		const [row] = await this.db.query<UserRow & { password_hash: string }>(
			`select ${USER_COLS}, password_hash from users where username = $1`,
			[username]
		);
		const ok = row && typeof input.password === 'string' && (await checkPassword(input.password, row.password_hash));
		if (!ok) throw new AccountError('Wrong username or password.');
		return { user: me(row), token: await this.newSession(row.id) };
	}

	private async newSession(userId: string) {
		const token = randomBytes(32).toString('base64url');
		await this.db.query('insert into sessions (token_hash, user_id) values ($1, $2)', [tokenHash(token), userId]);
		return token;
	}

	/** The player a session token belongs to, or null when it's unknown or has expired. */
	async userForSession(token: string | undefined | null): Promise<Me | null> {
		if (!token) return null;
		const [row] = await this.db.query<UserRow>(
			`update sessions s set last_seen = now() from users u
			 where s.token_hash = $1 and s.user_id = u.id and s.last_seen > now() - interval '${SESSION_DAYS} days'
			 returning u.id::text as id, u.username, u.nickname, u.avatar, u.created_at`,
			[tokenHash(token)]
		);
		return row ? me(row) : null;
	}

	async logout(token: string) {
		await this.db.query('delete from sessions where token_hash = $1', [tokenHash(token)]);
	}

	async user(id: string): Promise<Me | null> {
		const [row] = await this.db.query<UserRow>(`select ${USER_COLS} from users where id = $1`, [id]);
		return row ? me(row) : null;
	}

	async byUsername(username: string): Promise<PublicUser | null> {
		const [row] = await this.db.query<UserRow>(`select ${USER_COLS} from users where username = $1`, [
			cleanUsername(username)
		]);
		return row ? publicUser(row) : null;
	}

	/** Change any of username, nickname, avatar and password. Returns the updated player. */
	async updateProfile(id: string, change: ProfileChange, keepSession?: string): Promise<Me> {
		const sets: string[] = [];
		const params: unknown[] = [];
		const set = (col: string, value: unknown) => {
			params.push(value);
			sets.push(`${col} = $${params.length}`);
		};
		if (change.username !== undefined) {
			const username = cleanUsername(change.username);
			const problem = usernameProblem(username);
			if (problem) throw new AccountError(problem);
			set('username', username);
		}
		if (change.nickname !== undefined) {
			const nickname = cleanNickname(change.nickname);
			if (!nickname) throw new AccountError('Pick a nickname.');
			set('nickname', nickname);
		}
		if (change.avatar !== undefined) {
			if (!isAvatar(change.avatar)) throw new AccountError('Pick one of the avatars.');
			set('avatar', change.avatar);
		}
		if (change.password !== undefined) {
			const problem = passwordProblem(change.password);
			if (problem) throw new AccountError(problem);
			const [row] = await this.db.query<{ password_hash: string }>('select password_hash from users where id = $1', [id]);
			if (!row || !(await checkPassword(String(change.currentPassword ?? ''), row.password_hash))) {
				throw new AccountError('Your current password is wrong.');
			}
			set('password_hash', await hashPassword(change.password));
		}
		if (sets.length) {
			params.push(id);
			try {
				await this.db.query(`update users set ${sets.join(', ')} where id = $${params.length}`, params);
			} catch (e) {
				if ((e as { code?: string }).code === '23505') throw new AccountError('That username is taken.');
				throw e;
			}
			// A new password signs out every other device.
			if (change.password !== undefined) {
				await this.db.query('delete from sessions where user_id = $1 and token_hash <> $2', [
					id,
					keepSession ? tokenHash(keepSession) : ''
				]);
			}
		}
		const user = await this.user(id);
		if (!user) throw new AccountError('That account is gone.');
		return user;
	}

	// ------------------------------------------------------------ friends

	/** Friends (accepted both ways) and requests still waiting, with the other player's profile. */
	async friendships(id: string): Promise<{ friends: PublicUser[]; requests: FriendRequest[] }> {
		const rows = await this.db.query<UserRow & { incoming: boolean; accepted_at: Date | null; since: Date }>(
			`select u.id::text as id, u.username, u.nickname, u.avatar, u.created_at,
			        f.askee = $1 as incoming, f.accepted_at, f.created_at as since
			 from friendships f join users u on u.id = case when f.asker = $1 then f.askee else f.asker end
			 where f.asker = $1 or f.askee = $1
			 order by lower(u.nickname)`,
			[id]
		);
		return {
			friends: rows.filter((r) => r.accepted_at).map(publicUser),
			requests: rows
				.filter((r) => !r.accepted_at)
				.map((r) => ({ user: publicUser(r), incoming: r.incoming, at: iso(r.since)! }))
		};
	}

	async friendIds(id: string): Promise<string[]> {
		const rows = await this.db.query<{ id: string }>(
			`select (case when asker = $1 then askee else asker end)::text as id from friendships
			 where (asker = $1 or askee = $1) and accepted_at is not null`,
			[id]
		);
		return rows.map((r) => r.id);
	}

	async areFriends(a: string, b: string): Promise<boolean> {
		const rows = await this.db.query(
			`select 1 from friendships where accepted_at is not null
			 and ((asker = $1 and askee = $2) or (asker = $2 and askee = $1))`,
			[a, b]
		);
		return rows.length > 0;
	}

	/**
	 * Ask a player to be friends. If they had already asked you, you are friends now. Returns the
	 * other player and whether the friendship is made.
	 */
	async requestFriend(id: string, username: unknown): Promise<{ other: PublicUser; accepted: boolean }> {
		const other = await this.byUsername(String(username ?? ''));
		if (!other) throw new AccountError('Nobody has that username.');
		if (other.id === id) throw new AccountError("That's you!");
		return this.db.transaction(async (q) => {
			const [existing] = await q<{ asker: string; accepted_at: Date | null }>(
				`select asker::text as asker, accepted_at from friendships
				 where (asker = $1 and askee = $2) or (asker = $2 and askee = $1)`,
				[id, other.id]
			);
			if (existing?.accepted_at) throw new AccountError(`You and ${other.nickname} are already friends.`);
			if (existing && existing.asker === id) throw new AccountError(`You already asked ${other.nickname}.`);
			if (existing) {
				await q('update friendships set accepted_at = now() where asker = $1 and askee = $2', [other.id, id]);
				return { other, accepted: true };
			}
			await q('insert into friendships (asker, askee) values ($1, $2)', [id, other.id]);
			return { other, accepted: false };
		});
	}

	/** Accept a request from `other`. */
	async acceptFriend(id: string, other: string) {
		const rows = await this.db.query(
			'update friendships set accepted_at = now() where asker = $1 and askee = $2 and accepted_at is null returning 1',
			[other, id]
		);
		if (!rows.length) throw new AccountError('That request is gone.');
	}

	/** Decline a request, take one back, or stop being friends: whichever there is. */
	async removeFriend(id: string, other: string) {
		await this.db.query(
			'delete from friendships where (asker = $1 and askee = $2) or (asker = $2 and askee = $1)',
			[id, other]
		);
	}

	// ------------------------------------------------------------ maps

	/** The maps a player made, oldest first (the order the map list shows them in). */
	async maps(userId: string): Promise<SavedMap[]> {
		const rows = await this.db.query<{ id: string; name: string; tiles: unknown }>(
			'select id::text as id, name, tiles from maps where user_id = $1 order by created_at, id',
			[userId]
		);
		return rows.map((r) => ({ id: r.id, map: { name: r.name, tiles: parseTiles(r.tiles) } }));
	}

	/** Keep a new map, or replace one of the player's maps when `id` is given. */
	async saveMap(userId: string, input: unknown, id?: string): Promise<SavedMap> {
		const map = cleanMap(input);
		if (id) {
			const rows = await this.db.query<{ id: string }>(
				`update maps set name = $3, tiles = $4::jsonb, updated_at = now() where id = $1 and user_id = $2 returning id::text as id`,
				[id, userId, map.name, JSON.stringify(map.tiles)]
			);
			if (!rows.length) throw new AccountError('That map is gone.');
			return { id: rows[0].id, map };
		}
		const [{ count }] = await this.db.query<{ count: string }>('select count(*) as count from maps where user_id = $1', [userId]);
		if (Number(count) >= MAX_SAVED_MAPS) throw new AccountError(`You can keep up to ${MAX_SAVED_MAPS} maps. Delete one first.`);
		const [row] = await this.db.query<{ id: string }>(
			'insert into maps (user_id, name, tiles) values ($1, $2, $3::jsonb) returning id::text as id',
			[userId, map.name, JSON.stringify(map.tiles)]
		);
		return { id: row.id, map };
	}

	async deleteMap(userId: string, id: string) {
		await this.db.query('delete from maps where id = $1 and user_id = $2', [id, userId]);
	}

	/**
	 * Bring maps saved in a browser before accounts onto the account. Maps it already has (same
	 * name and tiles) and maps that aren't valid are skipped. Returns every map the player has.
	 */
	async importMaps(userId: string, input: unknown): Promise<SavedMap[]> {
		const have = new Set((await this.maps(userId)).map((m) => mapKey(m.map)));
		for (const raw of Array.isArray(input) ? input.slice(0, MAX_SAVED_MAPS) : []) {
			let map: CustomMap;
			try {
				map = cleanMap(raw);
			} catch {
				continue;
			}
			if (have.has(mapKey(map))) continue;
			try {
				await this.saveMap(userId, map);
			} catch {
				break;
			}
			have.add(mapKey(map));
		}
		return this.maps(userId);
	}

	// ------------------------------------------------------------ match history

	/** A game started: write it down with everyone at the table. Returns the match id. */
	async matchStarted(m: { code: string; mode: string; mapName: string; pointsToWin: number; seats: SeatRecord[] }) {
		return this.db.transaction(async (q) => {
			const [row] = await q<{ id: string }>(
				`insert into matches (code, mode, map_name, points_to_win) values ($1, $2, $3, $4) returning id::text as id`,
				[m.code, m.mode, m.mapName, m.pointsToWin]
			);
			for (const [i, s] of m.seats.entries()) {
				await q(
					`insert into match_players (match_id, seat, user_id, name, color, is_bot, character)
					 values ($1, $2, $3, $4, $5, $6, $7)`,
					[row.id, i, s.userId, s.name, s.color, s.isBot, s.character]
				);
			}
			return row.id;
		});
	}

	/**
	 * A game finished: everyone's points. The winner places first; the others place by points, and
	 * players level on points share a place.
	 */
	async matchFinished(id: string, turns: number, winner: number, points: number[], characters: (CharacterId | null)[] = []) {
		const place = (seat: number) =>
			seat === winner ? 1 : 2 + points.filter((p, i) => i !== winner && i !== seat && p > points[seat]).length;
		await this.db.transaction(async (q) => {
			await q(`update matches set status = 'finished', ended_at = now(), turns = $2 where id = $1`, [id, turns]);
			for (const [seat, p] of points.entries()) {
				await q(
					'update match_players set points = $3, place = $4, character = coalesce($5, character) where match_id = $1 and seat = $2',
					[id, seat, p, place(seat), characters[seat] ?? null]
				);
			}
		});
	}

	/** A game stopped before anyone won. */
	async matchAbandoned(id: string, turns: number, points: number[], characters: (CharacterId | null)[] = []) {
		await this.db.transaction(async (q) => {
			await q(`update matches set status = 'abandoned', ended_at = now(), turns = $2 where id = $1 and status = 'playing'`, [
				id,
				turns
			]);
			for (const [seat, p] of points.entries()) {
				await q('update match_players set points = $3, character = coalesce($4, character) where match_id = $1 and seat = $2', [
					id,
					seat,
					p,
					characters[seat] ?? null
				]);
			}
		});
	}

	/** Games still marked as running when the server starts were cut off by the restart. */
	async closeStaleMatches() {
		await this.db.query(`update matches set status = 'abandoned', ended_at = coalesce(ended_at, now()) where status = 'playing'`);
	}

	/** A player's latest games and totals. */
	async history(userId: string): Promise<MatchHistory | null> {
		const user = await this.user(userId);
		if (!user) return null;
		const [stats] = await this.db.query<{ played: string; finished: string; won: string }>(
			`select count(*) as played,
			        count(*) filter (where m.status = 'finished') as finished,
			        count(*) filter (where m.status = 'finished' and p.place = 1) as won
			 from match_players p join matches m on m.id = p.match_id where p.user_id = $1`,
			[userId]
		);
		const matchRows = await this.db.query<MatchRow>(
			`select ${MATCH_COLUMNS}
			 from matches m join match_players p on p.match_id = m.id
			 where p.user_id = $1 order by m.started_at desc, m.id desc limit ${HISTORY_LIMIT}`,
			[userId]
		);
		const matches = await this.matchesFrom(matchRows);
		return {
			user: publicUser({ ...user, created_at: user.createdAt }),
			stats: { played: Number(stats?.played ?? 0), finished: Number(stats?.finished ?? 0), won: Number(stats?.won ?? 0) },
			matches
		};
	}

	/** Matches as the interface shows them, with everyone who sat at each table. */
	private async matchesFrom(matchRows: MatchRow[]): Promise<Match[]> {
		const ids = matchRows.map((m) => m.id);
		const playerRows = ids.length
			? await this.db.query<{
					match_id: string;
					seat: number;
					name: string;
					color: string;
					is_bot: boolean;
					character: string | null;
					points: number;
					place: number | null;
					uid: string | null;
					username: string | null;
					nickname: string | null;
					avatar: string | null;
				}>(
					`select p.match_id::text as match_id, p.seat, p.name, p.color, p.is_bot, p.character, p.points, p.place,
					        u.id::text as uid, u.username, u.nickname, u.avatar
					 from match_players p left join users u on u.id = p.user_id
					 where p.match_id = any($1::bigint[]) order by p.match_id, p.seat`,
					[ids]
				)
			: [];
		const byMatch = new Map<string, MatchPlayer[]>();
		for (const r of playerRows) {
			const list = byMatch.get(r.match_id) ?? [];
			list.push({
				user: r.uid ? publicUser({ id: r.uid, username: r.username!, nickname: r.nickname!, avatar: r.avatar!, created_at: '' }) : null,
				name: r.name,
				color: r.color as PlayerColor,
				isBot: r.is_bot,
				character: r.character as CharacterId | null,
				points: r.points,
				place: r.place
			});
			byMatch.set(r.match_id, list);
		}
		return matchRows.map((m) => ({
			id: Number(m.id),
			code: m.code,
			mode: m.mode as Match['mode'],
			mapName: m.map_name,
			pointsToWin: m.points_to_win,
			status: m.status as Match['status'],
			startedAt: iso(m.started_at)!,
			endedAt: iso(m.ended_at),
			turns: m.turns,
			players: byMatch.get(m.id) ?? [],
			replay: !!m.replay
		}));
	}

	// ------------------------------------------------------------ replays

	/** Keep a finished (or abandoned) game's replay, already gzipped. */
	async saveReplay(matchId: string, version: number, steps: number, gz: Uint8Array) {
		await this.db.query(
			`insert into match_replays (match_id, version, steps, data) values ($1, $2, $3, $4)
			 on conflict (match_id) do update set version = $2, steps = $3, data = $4, created_at = now()`,
			[matchId, version, steps, gz]
		);
	}

	/**
	 * A game's replay for `userId` to watch: they sat at that table, or a friend of theirs did.
	 * Null when there is none (games from before replays were kept) or it isn't theirs to see.
	 */
	async replay(userId: string, matchId: string): Promise<Uint8Array | null> {
		if (!/^\d{1,18}$/.test(matchId)) return null;
		const [allowed] = await this.db.query<{ ok: boolean }>(
			`select exists(
				select 1 from match_players p where p.match_id = $1 and p.user_id is not null and (
					p.user_id = $2 or exists(
						select 1 from friendships f where f.accepted_at is not null and
						((f.asker = $2 and f.askee = p.user_id) or (f.askee = $2 and f.asker = p.user_id))
					)
				)
			) as ok`,
			[matchId, userId]
		);
		if (!allowed?.ok) return null;
		const [row] = await this.db.query<{ data: Uint8Array }>('select data from match_replays where match_id = $1', [matchId]);
		return row?.data ?? null;
	}
}
