import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Friend, FriendsInfo, Me, PublicUser, RoomInvite, Whereabouts } from '../shared/accounts';
import type { Accounts } from './accounts';
import { type Room, send } from './room';

/**
 * Who is online: every signed-in connection, which player it is, and which room it sits in.
 * Friends hear when a friend comes online, sits down at a table, starts a game or leaves, and
 * this is where invitations to a table go through.
 */

/** An invitation stays answerable this long. */
const INVITE_MS = 10 * 60_000;
/** The least time between two invitations to the same friend. */
const REINVITE_MS = 4000;

interface Conn {
	user: Me;
	/** The sign-in this connection came with, so signing out can close it. */
	session: string;
	room: Room | null;
}

interface Invite extends RoomInvite {
	to: string;
	at: number;
}

export class Hub {
	private conns = new Map<WebSocket, Conn>();
	private invites = new Map<string, Invite>();
	private lastInvite = new Map<string, number>();
	/** Where each player was last time their friends were told. */
	private told = new Map<string, Whereabouts>();

	constructor(private accounts: Accounts) {}

	async connected(ws: WebSocket, user: Me, session: string) {
		this.conns.set(ws, { user, session, room: null });
		send(ws, { t: 'friends', friends: await this.friendsInfo(user.id) });
		await this.changed(user.id);
	}

	async disconnected(ws: WebSocket) {
		const c = this.conns.get(ws);
		if (!c) return;
		this.conns.delete(ws);
		await this.changed(c.user.id);
	}

	user(ws: WebSocket): Me | null {
		return this.conns.get(ws)?.user ?? null;
	}

	/** The connection sat down at a table (or got up, with null). */
	async setRoom(ws: WebSocket, room: Room | null) {
		const c = this.conns.get(ws);
		if (!c || c.room === room) return;
		c.room = room;
		await this.changed(c.user.id);
	}

	/** A game started or ended at this table: the players there are somewhere new. */
	async roomChanged(room: Room) {
		const ids = new Set<string>();
		for (const c of this.conns.values()) if (c.room === room) ids.add(c.user.id);
		for (const id of ids) await this.changed(id);
	}

	/** Where a player is: in a game beats in a lobby beats in the menus. */
	where(userId: string): Whereabouts {
		let best: Whereabouts = 'offline';
		for (const c of this.conns.values()) {
			if (c.user.id !== userId) continue;
			const here: Whereabouts = !c.room ? 'menu' : c.room.started && c.room.game?.phase !== 'ended' ? 'game' : 'lobby';
			if (rank(here) > rank(best)) best = here;
		}
		return best;
	}

	private async changed(userId: string) {
		const where = this.where(userId);
		if (where === (this.told.get(userId) ?? 'offline')) return;
		if (where === 'offline') this.told.delete(userId);
		else this.told.set(userId, where);
		const friends = await this.accounts.friendIds(userId);
		for (const f of friends) this.sendTo(f, { t: 'presence', user: userId, where });
	}

	async friendsInfo(userId: string): Promise<FriendsInfo> {
		const { friends, requests } = await this.accounts.friendships(userId);
		return {
			friends: friends.map((f): Friend => ({ ...f, where: this.where(f.id) })),
			requests
		};
	}

	/** Friendships of these players changed: send each of them their list again. */
	async pushFriends(...userIds: string[]) {
		for (const id of userIds) {
			if (!this.online(id)) continue;
			const friends = await this.friendsInfo(id);
			this.sendTo(id, { t: 'friends', friends });
		}
	}

	/** The player's profile changed: their connections and their tables pick it up. */
	async profileChanged(user: Me) {
		const rooms = new Set<Room>();
		for (const c of this.conns.values()) {
			if (c.user.id !== user.id) continue;
			c.user = user;
			if (c.room) rooms.add(c.room);
		}
		for (const room of rooms) room.updateUser(user.id, user.nickname, user.avatar);
		await this.pushFriends(...(await this.accounts.friendIds(user.id)));
	}

	/** Close the connections of a sign-in (or all of a player's but one sign-in's). */
	signOut(match: { session?: string; userId?: string; except?: string }) {
		for (const [ws, c] of this.conns) {
			if (match.session && c.session !== match.session) continue;
			if (match.userId && (c.user.id !== match.userId || c.session === match.except)) continue;
			send(ws, { t: 'unauthorized' });
			ws.close(4001, 'signed out');
		}
	}

	online(userId: string) {
		for (const c of this.conns.values()) if (c.user.id === userId) return true;
		return false;
	}

	/** Invite a friend to the table this connection sits at. Returns why it can't, or null. */
	async invite(ws: WebSocket, friendId: string): Promise<string | null> {
		const c = this.conns.get(ws);
		if (!c?.room) return 'Sit down at a table first.';
		if (!(await this.accounts.areFriends(c.user.id, friendId))) return 'You can only invite friends.';
		if (!this.online(friendId)) return "They aren't online.";
		if (c.room.seats.some((s) => s.userId === friendId)) return "They're already at this table.";
		const key = `${c.user.id}>${friendId}`;
		const now = Date.now();
		if (now - (this.lastInvite.get(key) ?? 0) < REINVITE_MS) return 'Give them a moment to answer.';
		this.lastInvite.set(key, now);
		this.sweep(now);
		const invite: Invite = {
			id: randomBytes(8).toString('hex'),
			from: publicOf(c.user),
			code: c.room.code,
			to: friendId,
			at: now
		};
		this.invites.set(invite.id, invite);
		this.sendTo(friendId, { t: 'invited', invite: { id: invite.id, from: invite.from, code: invite.code } });
		return null;
	}

	/** The friend said no: the one who asked hears about it. */
	decline(ws: WebSocket, id: string) {
		const c = this.conns.get(ws);
		const invite = this.invites.get(id);
		if (!c || !invite || invite.to !== c.user.id) return;
		this.invites.delete(id);
		this.sendTo(invite.from.id, { t: 'notice', message: `${c.user.nickname} can't join right now.` });
	}

	private sweep(now: number) {
		for (const [id, i] of this.invites) if (now - i.at > INVITE_MS) this.invites.delete(id);
		for (const [k, t] of this.lastInvite) if (now - t > REINVITE_MS) this.lastInvite.delete(k);
	}

	private sendTo(userId: string, msg: Parameters<typeof send>[1]) {
		for (const [ws, c] of this.conns) if (c.user.id === userId) send(ws, msg);
	}
}

function rank(w: Whereabouts) {
	return ['offline', 'menu', 'lobby', 'game'].indexOf(w);
}

function publicOf(u: Me): PublicUser {
	return { id: u.id, username: u.username, nickname: u.nickname, avatar: u.avatar };
}
