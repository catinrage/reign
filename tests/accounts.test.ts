import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { AccountError, Accounts } from '../src/server/accounts';
import { type Db, openDb } from '../src/server/db';
import { Room } from '../src/server/room';
import type { ServerMessage } from '../src/shared/protocol';

let db: Db;
let accounts: Accounts;

beforeAll(async () => {
	// TEST_DATABASE_URL runs these against a real Postgres server instead of PGlite.
	db = await openDb(process.env.TEST_DATABASE_URL ?? 'memory://');
	accounts = new Accounts(db);
}, 120_000);

afterAll(() => db?.close());

let n = 0;
const run = Math.random().toString(36).slice(2, 6);
/** A fresh player with a unique username. */
async function player(nickname = 'Ada', avatar = 'owl') {
	const username = `p${run}${++n}_${nickname.toLowerCase()}`;
	return accounts.register({ username, nickname, password: 'secret12', avatar });
}

describe('sign-up and sign-in', () => {
	it('signs up, signs in and finds the player by session', async () => {
		const { user, token } = await player('Komeil', 'fox');
		expect(user).toMatchObject({ nickname: 'Komeil', avatar: 'fox' });
		expect(user.username).toMatch(/^p\w+_komeil$/);
		expect(await accounts.userForSession(token)).toMatchObject({ id: user.id });

		const again = await accounts.login({ username: user.username.toUpperCase(), password: 'secret12' });
		expect(again.user.id).toBe(user.id);
		expect(again.token).not.toBe(token);
	});

	it('refuses taken usernames, bad usernames, short passwords and wrong passwords', async () => {
		const { user } = await player();
		await expect(accounts.register({ username: user.username, password: 'secret12' })).rejects.toThrow('taken');
		await expect(accounts.register({ username: 'no spaces', password: 'secret12' })).rejects.toThrow(AccountError);
		await expect(accounts.register({ username: 'x', password: 'secret12' })).rejects.toThrow(AccountError);
		await expect(accounts.register({ username: 'shortpw', password: '123' })).rejects.toThrow(AccountError);
		await expect(accounts.login({ username: user.username, password: 'wrong!!' })).rejects.toThrow('Wrong');
		await expect(accounts.login({ username: 'nobody_here', password: 'secret12' })).rejects.toThrow('Wrong');
	});

	it('keeps passwords hashed and sessions by hash', async () => {
		const { user, token } = await player();
		const [row] = await db.query<{ password_hash: string }>('select password_hash from users where id = $1', [user.id]);
		expect(row.password_hash).not.toContain('secret12');
		const sessions = await db.query<{ token_hash: string }>('select token_hash from sessions where user_id = $1', [user.id]);
		expect(sessions.map((s) => s.token_hash)).not.toContain(token);
	});

	it('signs out', async () => {
		const { token } = await player();
		await accounts.logout(token);
		expect(await accounts.userForSession(token)).toBeNull();
		expect(await accounts.userForSession('made-up')).toBeNull();
	});
});

describe('profile', () => {
	it('changes nickname, avatar and username', async () => {
		const { user } = await player('Bram');
		const changed = await accounts.updateProfile(user.id, { nickname: 'Bram the Bold', avatar: 'knight', username: `${user.username}_x` });
		expect(changed).toMatchObject({ nickname: 'Bram the Bold', avatar: 'knight', username: `${user.username}_x` });
	});

	it("won't take someone else's username or an unknown avatar", async () => {
		const a = await player();
		const b = await player();
		await expect(accounts.updateProfile(b.user.id, { username: a.user.username })).rejects.toThrow('taken');
		await expect(accounts.updateProfile(b.user.id, { avatar: 'dragon' })).rejects.toThrow(AccountError);
	});

	it('changes the password only with the current one, and signs out other devices', async () => {
		const { user, token } = await player();
		const other = await accounts.login({ username: user.username, password: 'secret12' });
		await expect(accounts.updateProfile(user.id, { password: 'newpass1', currentPassword: 'nope' })).rejects.toThrow('current password');
		await accounts.updateProfile(user.id, { password: 'newpass1', currentPassword: 'secret12' }, token);
		expect(await accounts.userForSession(token)).not.toBeNull();
		expect(await accounts.userForSession(other.token)).toBeNull();
		await expect(accounts.login({ username: user.username, password: 'secret12' })).rejects.toThrow();
		await accounts.login({ username: user.username, password: 'newpass1' });
	});
});

describe('friends', () => {
	it('asks, accepts and removes', async () => {
		const a = (await player('Ada')).user;
		const b = (await player('Bram')).user;
		const asked = await accounts.requestFriend(a.id, b.username);
		expect(asked.accepted).toBe(false);
		expect((await accounts.friendships(a.id)).requests).toMatchObject([{ user: { id: b.id }, incoming: false }]);
		expect((await accounts.friendships(b.id)).requests).toMatchObject([{ user: { id: a.id }, incoming: true }]);
		await expect(accounts.requestFriend(a.id, b.username)).rejects.toThrow('already asked');

		await accounts.acceptFriend(b.id, a.id);
		expect(await accounts.areFriends(a.id, b.id)).toBe(true);
		expect((await accounts.friendships(a.id)).friends.map((f) => f.id)).toEqual([b.id]);
		expect(await accounts.friendIds(b.id)).toEqual([a.id]);
		await expect(accounts.requestFriend(b.id, a.username)).rejects.toThrow('already friends');

		await accounts.removeFriend(b.id, a.id);
		expect(await accounts.areFriends(a.id, b.id)).toBe(false);
		expect((await accounts.friendships(a.id)).friends).toEqual([]);
	});

	it('two players asking each other become friends', async () => {
		const a = (await player()).user;
		const b = (await player()).user;
		await accounts.requestFriend(a.id, b.username);
		const back = await accounts.requestFriend(b.id, a.username);
		expect(back.accepted).toBe(true);
		expect(await accounts.areFriends(a.id, b.id)).toBe(true);
	});

	it("can't befriend yourself or nobody, and a declined request is gone", async () => {
		const a = (await player()).user;
		const b = (await player()).user;
		await expect(accounts.requestFriend(a.id, a.username)).rejects.toThrow("That's you");
		await expect(accounts.requestFriend(a.id, 'ghost_user')).rejects.toThrow('Nobody');
		await accounts.requestFriend(a.id, b.username);
		await accounts.removeFriend(b.id, a.id);
		await expect(accounts.acceptFriend(b.id, a.id)).rejects.toThrow('gone');
	});
});

describe('match history', () => {
	const seat = (userId: string | null, name: string, color: 'red' | 'blue' | 'yellow') => ({
		userId,
		name,
		color,
		isBot: !userId,
		character: null
	});

	it('records a finished game with places, and counts wins', async () => {
		const a = (await player('Ada')).user;
		const b = (await player('Bram')).user;
		const id = await accounts.matchStarted({
			code: 'ABCDE',
			mode: 'classic',
			mapName: 'Classic',
			pointsToWin: 10,
			seats: [seat(a.id, 'Ada', 'red'), seat(null, 'Cleo', 'blue'), seat(b.id, 'Bram', 'yellow')]
		});
		let h = (await accounts.history(a.id))!;
		expect(h.matches[0]).toMatchObject({ status: 'playing', code: 'ABCDE' });

		await accounts.matchFinished(id, 31, 2, [7, 7, 10]);
		h = (await accounts.history(a.id))!;
		expect(h.stats).toEqual({ played: 1, finished: 1, won: 0 });
		const m = h.matches[0];
		expect(m).toMatchObject({ status: 'finished', turns: 31 });
		expect(m.players.map((p) => [p.name, p.points, p.place])).toEqual([
			['Ada', 7, 2],
			['Cleo', 7, 2],
			['Bram', 10, 1]
		]);
		expect(m.players[1]).toMatchObject({ isBot: true, user: null });
		expect(m.players[2].user).toMatchObject({ id: b.id, nickname: 'Bram' });
		expect((await accounts.history(b.id))!.stats).toEqual({ played: 1, finished: 1, won: 1 });
	});

	it('marks games cut short as abandoned, and games left running at a restart', async () => {
		const a = (await player()).user;
		const one = await accounts.matchStarted({ code: 'AAAAA', mode: 'classic', mapName: 'Classic', pointsToWin: 10, seats: [seat(a.id, 'A', 'red'), seat(null, 'Bot', 'blue')] });
		await accounts.matchAbandoned(one, 4, [3, 2]);
		await accounts.matchStarted({ code: 'BBBBB', mode: 'extended', mapName: 'Grand Realm', pointsToWin: 12, seats: [seat(a.id, 'A', 'red'), seat(null, 'Bot', 'blue')] });
		await accounts.closeStaleMatches();
		const h = (await accounts.history(a.id))!;
		expect(h.matches.map((m) => m.status)).toEqual(['abandoned', 'abandoned']);
		expect(h.stats).toEqual({ played: 2, finished: 0, won: 0 });
		expect(h.matches.find((m) => m.code === 'AAAAA')!.players[0].points).toBe(3);
	});
});

describe('saved maps', () => {
	/** Every hex within two steps of the center: 19 joined tiles, all random. */
	function island(name: string, terrain: string | null = null) {
		const tiles = [];
		for (let q = -2; q <= 2; q++)
			for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) tiles.push({ q, r, terrain });
		return { name, tiles };
	}

	it('saves, renames and deletes a map, only for its owner', async () => {
		const a = (await player()).user;
		const b = (await player()).user;
		const saved = await accounts.saveMap(a.id, island('Twin Bays'));
		expect(saved.map.tiles).toHaveLength(19);
		expect(await accounts.maps(a.id)).toEqual([saved]);
		expect(await accounts.maps(b.id)).toEqual([]);

		await accounts.saveMap(a.id, island('Twin Coves'), saved.id);
		expect((await accounts.maps(a.id)).map((m) => m.map.name)).toEqual(['Twin Coves']);
		await expect(accounts.saveMap(b.id, island('Stolen'), saved.id)).rejects.toThrow(AccountError);
		await accounts.deleteMap(b.id, saved.id);
		expect(await accounts.maps(a.id)).toHaveLength(1);
		await accounts.deleteMap(a.id, saved.id);
		expect(await accounts.maps(a.id)).toEqual([]);
	});

	it('turns away maps the map maker would not allow', async () => {
		const a = (await player()).user;
		await expect(accounts.saveMap(a.id, { name: 'Tiny', tiles: [{ q: 0, r: 0, terrain: null }] })).rejects.toThrow('at least');
		await expect(accounts.saveMap(a.id, island('All sand', 'desert'))).rejects.toThrow('produce');
		await expect(accounts.saveMap(a.id, null)).rejects.toThrow(AccountError);
		expect(await accounts.maps(a.id)).toEqual([]);
	});

	it('brings browser maps onto the account once, skipping copies and broken maps', async () => {
		const a = (await player()).user;
		await accounts.saveMap(a.id, island('Old Isle'));
		const maps = await accounts.importMaps(a.id, [island('Old Isle'), island('New Isle'), island('New Isle'), { name: 'Broken' }, 'nope']);
		expect(maps.map((m) => m.map.name)).toEqual(['Old Isle', 'New Isle']);
		expect(await accounts.importMaps(a.id, 'not a list')).toHaveLength(2);
	});
});

describe('signed-in players at a table', () => {
	function fakeSocket() {
		const sent: ServerMessage[] = [];
		const ws = { readyState: 1, OPEN: 1, send: (data: string) => sent.push(JSON.parse(data)) };
		return { ws: ws as unknown as WebSocket, sent };
	}
	const ada = { id: '1', nickname: 'Ada', avatar: 'owl' as const };

	it('sits players under their nickname with their avatar, and gives them their seat back', () => {
		const room = new Room('QWERT');
		const first = fakeSocket();
		const seat = room.join(first.ws, 'ignored', undefined, ada);
		if (typeof seat === 'string') throw new Error(seat);
		expect(room.lobbyInfo().seats[0]).toMatchObject({ name: 'Ada', avatar: 'owl', userId: '1' });
		// Another browser, no seat token: same account, same seat.
		const second = fakeSocket();
		expect(room.join(second.ws, 'x', undefined, ada)).toBe(seat);
		expect(room.seats).toHaveLength(1);
		// Someone else's token doesn't hand them this seat.
		const bram = room.join(fakeSocket().ws, 'Bram', seat.token, { id: '2', nickname: 'Bram', avatar: 'fox' });
		expect(bram).not.toBe(seat);
		// Names come from the profile, not from setName.
		room.handle(seat, { t: 'setName', name: 'Hacker' }, first.ws);
		expect(room.seats[0].name).toBe('Ada');
		room.updateUser('1', 'Ada Prime', 'queen');
		expect(room.lobbyInfo().seats[0]).toMatchObject({ name: 'Ada Prime', avatar: 'queen' });
		room.dispose();
	});

	it('tells its listener when a game starts and ends', () => {
		vi.useFakeTimers();
		const room = new Room('ZXCVB');
		const events: string[] = [];
		room.listener = {
			gameStarted: () => events.push('started'),
			gameEnded: () => events.push('ended'),
			disposed: () => events.push('disposed')
		};
		const me = fakeSocket();
		const seat = room.join(me.ws, 'Ada', undefined, ada);
		if (typeof seat === 'string') throw new Error(seat);
		room.handle(seat, { t: 'addBot' }, me.ws);
		room.handle(seat, { t: 'start' }, me.ws);
		expect(events).toEqual(['started']);
		const myIndex = room.seats.indexOf(seat);
		room.cheats = true;
		room.handle(seat, { t: 'cheat', cheat: { type: 'finishSetup' } }, me.ws);
		room.handle(seat, { t: 'cheat', cheat: { type: 'win', player: myIndex } }, me.ws);
		expect(room.game!.phase).toBe('ended');
		expect(events).toEqual(['started', 'ended']);
		room.dispose();
		expect(events).toEqual(['started', 'ended', 'disposed']);
		vi.useRealTimers();
	});
});
