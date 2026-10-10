import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The database: PostgreSQL. With DATABASE_URL set (Docker compose, Render) the server talks to
 * that Postgres. Without it (a plain `pnpm dev`) it runs PGlite, Postgres compiled to
 * WebAssembly, inside the server process and keeps the data in ./data/db, so nothing else has to
 * be installed. Tests use PGlite in memory. Both speak the same SQL.
 */
export interface Db {
	query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
	/** Run statements in one transaction. */
	transaction<T>(fn: (q: Db['query']) => Promise<T>): Promise<T>;
	close(): Promise<void>;
}

/** Open the database: a Postgres URL, a folder for PGlite, or 'memory://' for a throwaway one. */
export async function openDb(url = process.env.DATABASE_URL): Promise<Db> {
	const db = url && /^postgres(ql)?:/.test(url) ? await openPostgres(url) : await openPglite(url);
	await migrate(db);
	return db;
}

async function openPostgres(url: string): Promise<Db> {
	const { default: pg } = await import('pg');
	// Timestamps go to the interface as ISO strings either way.
	const pool = new pg.Pool({ connectionString: url, max: 10 });
	pool.on('error', (e) => console.error('[db]', e.message));
	return {
		async query(sql, params) {
			return (await pool.query(sql, params as unknown[])).rows;
		},
		async transaction(fn) {
			const c = await pool.connect();
			try {
				await c.query('begin');
				const out = await fn(async (sql, params) => (await c.query(sql, params as unknown[])).rows);
				await c.query('commit');
				return out;
			} catch (e) {
				await c.query('rollback').catch(() => {});
				throw e;
			} finally {
				c.release();
			}
		},
		close: () => pool.end()
	};
}

async function openPglite(where?: string): Promise<Db> {
	const { PGlite } = await import('@electric-sql/pglite');
	let dir = where || resolve(process.cwd(), 'data/db');
	if (dir !== 'memory://') mkdirSync(dir, { recursive: true });
	const pg = await PGlite.create(dir);
	// PGlite runs one statement at a time, so transactions queue behind each other.
	let chain: Promise<unknown> = Promise.resolve();
	const query: Db['query'] = async (sql, params) => (await pg.query(sql, params as unknown[])).rows as never;
	return {
		query,
		transaction(fn) {
			const run = chain.then(() => pg.transaction((tx) => fn(async (sql, params) => (await tx.query(sql, params as unknown[])).rows as never)));
			chain = run.catch(() => {});
			return run;
		},
		close: () => pg.close()
	};
}

/**
 * The schema, one step per change. A database remembers how many steps it has run and runs only
 * the new ones, so steps are only ever added at the end, never edited.
 */
const MIGRATIONS = [
	`create table users (
		id bigserial primary key,
		username text not null unique,
		nickname text not null,
		avatar text not null,
		password_hash text not null,
		created_at timestamptz not null default now()
	);
	create table sessions (
		token_hash text primary key,
		user_id bigint not null references users(id) on delete cascade,
		created_at timestamptz not null default now(),
		last_seen timestamptz not null default now()
	);
	create index sessions_user on sessions(user_id);
	create table friendships (
		-- One row per pair, asker first. Accepted friendships have accepted_at set.
		asker bigint not null references users(id) on delete cascade,
		askee bigint not null references users(id) on delete cascade,
		created_at timestamptz not null default now(),
		accepted_at timestamptz,
		primary key (asker, askee),
		check (asker <> askee)
	);
	create index friendships_askee on friendships(askee);
	create table matches (
		id bigserial primary key,
		code text not null,
		mode text not null,
		map_name text not null,
		points_to_win int not null,
		status text not null default 'playing',
		started_at timestamptz not null default now(),
		ended_at timestamptz,
		turns int not null default 0
	);
	create table match_players (
		match_id bigint not null references matches(id) on delete cascade,
		seat int not null,
		user_id bigint references users(id) on delete set null,
		name text not null,
		color text not null,
		is_bot boolean not null,
		character text,
		points int not null default 0,
		place int,
		primary key (match_id, seat)
	);
	create index match_players_user on match_players(user_id);`,
	`create table maps (
		id bigserial primary key,
		user_id bigint not null references users(id) on delete cascade,
		name text not null,
		tiles jsonb not null,
		created_at timestamptz not null default now(),
		updated_at timestamptz not null default now()
	);
	create index maps_user on maps(user_id);`,
	`create table match_replays (
		match_id bigint primary key references matches(id) on delete cascade,
		version int not null,
		steps int not null,
		-- The replay as gzipped JSON, served to the browser as it is.
		data bytea not null,
		created_at timestamptz not null default now()
	);`
];

async function migrate(db: Db) {
	await db.query('create table if not exists schema_version (version int not null)');
	const [row] = await db.query<{ version: number }>('select version from schema_version');
	let version = row?.version ?? 0;
	if (!row) await db.query('insert into schema_version (version) values (0)');
	for (; version < MIGRATIONS.length; version++) {
		const step = MIGRATIONS[version];
		await db.transaction(async (q) => {
			for (const sql of splitSql(step)) await q(sql);
			await q('update schema_version set version = $1', [version + 1]);
		});
	}
}

/** Statements one by one (prepared queries take one statement at a time). */
function splitSql(sql: string): string[] {
	return sql
		.replace(/--[^\n]*/g, '')
		.split(';')
		.map((s) => s.trim())
		.filter(Boolean);
}
