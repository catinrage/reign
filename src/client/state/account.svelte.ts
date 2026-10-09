import type { AvatarId, Friend, FriendRequest, FriendsInfo, MatchHistory, Me, RoomInvite, Whereabouts } from '../../shared/accounts';

/**
 * The signed-in player: their profile, friends, friend requests and invitations to tables.
 * The account API is plain HTTP under /api; friends' comings and goings and invitations arrive
 * over the game connection (see client.svelte.ts), which only opens once signed in.
 */

export class ApiError extends Error {}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`/api/${path}`, {
			method,
			credentials: 'same-origin',
			headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
			body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
		});
	} catch {
		throw new ApiError("Can't reach the server. Check your connection.");
	}
	const data = await res.json().catch(() => ({}));
	if (res.status === 401 && path !== 'login') account.signedOut();
	if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong.');
	return data as T;
}

class Account {
	/** 'loading' until the server says whether this browser is signed in. */
	status = $state<'loading' | 'out' | 'in'>('loading');
	me = $state<Me | null>(null);
	friends = $state<Friend[]>([]);
	requests = $state<FriendRequest[]>([]);
	/** Invitations to friends' tables still waiting for an answer. */
	invites = $state<RoomInvite[]>([]);
	/** Told when signing in or out: the game connection opens or closes, saved maps load. */
	private watchers: ((signedIn: boolean) => void)[] = [];

	/** Call `fn` on every sign-in and sign-out (and at once if already signed in). */
	watch(fn: (signedIn: boolean) => void) {
		this.watchers.push(fn);
		if (this.status === 'in') fn(true);
	}

	get incoming() {
		return this.requests.filter((r) => r.incoming);
	}

	get onlineFriends() {
		return this.friends.filter((f) => f.where !== 'offline');
	}

	/** Ask the server who this browser is signed in as. */
	async boot() {
		try {
			const { user } = await api<{ user: Me }>('me');
			this.signedIn(user);
		} catch {
			if (this.status === 'loading') this.signedOut();
		}
	}

	async register(input: { username: string; nickname: string; password: string; avatar: AvatarId }) {
		const { user } = await api<{ user: Me }>('register', 'POST', input);
		this.signedIn(user);
	}

	async login(username: string, password: string) {
		const { user } = await api<{ user: Me }>('login', 'POST', { username, password });
		this.signedIn(user);
	}

	async logout() {
		await api('logout', 'POST').catch(() => {});
		this.signedOut();
	}

	async updateProfile(change: { username?: string; nickname?: string; avatar?: AvatarId; password?: string; currentPassword?: string }) {
		const { user } = await api<{ user: Me }>('me', 'PATCH', change);
		this.me = user;
	}

	private signedIn(user: Me) {
		const was = this.status;
		this.me = user;
		this.status = 'in';
		if (was !== 'in') for (const fn of this.watchers) fn(true);
	}

	signedOut() {
		const was = this.status;
		this.status = 'out';
		this.me = null;
		this.friends = [];
		this.requests = [];
		this.invites = [];
		if (was === 'in') for (const fn of this.watchers) fn(false);
	}

	// ------------------------------------------------------------ friends

	setFriends(info: FriendsInfo) {
		this.friends = sortFriends(info.friends);
		this.requests = info.requests;
	}

	presence(userId: string, where: Whereabouts) {
		this.friends = sortFriends(this.friends.map((f) => (f.id === userId ? { ...f, where } : f)));
	}

	/** Ask someone to be friends. Returns their nickname, and whether you're friends already. */
	async addFriend(username: string) {
		const res = await api<{ accepted: boolean; user: Me; friends: FriendsInfo }>('friends', 'POST', { username });
		this.setFriends(res.friends);
		return { nickname: res.user.nickname, accepted: res.accepted };
	}

	async acceptFriend(id: string) {
		this.setFriends(await api<FriendsInfo>(`friends/${id}/accept`, 'POST'));
	}

	/** Decline or take back a request, or stop being friends. */
	async removeFriend(id: string) {
		this.setFriends(await api<FriendsInfo>(`friends/${id}`, 'DELETE'));
	}

	history(username?: string) {
		return api<MatchHistory>(`history${username ? `?user=${encodeURIComponent(username)}` : ''}`);
	}

	// ------------------------------------------------------------ invitations

	invited(invite: RoomInvite) {
		// A newer invitation from the same friend replaces the older one.
		this.invites = [...this.invites.filter((i) => i.from.id !== invite.from.id), invite];
	}

	dropInvite(id: string) {
		this.invites = this.invites.filter((i) => i.id !== id);
	}
}

/** Friends who are around first (in a game, at a table, in the menus), then by nickname. */
function sortFriends(list: Friend[]): Friend[] {
	const rank: Record<Whereabouts, number> = { game: 0, lobby: 0, menu: 0, offline: 1 };
	return [...list].sort((a, b) => rank[a.where] - rank[b.where] || a.nickname.localeCompare(b.nickname));
}

export const account = new Account();

export const WHEREABOUTS: Record<Whereabouts, string> = {
	offline: 'Offline',
	menu: 'Online',
	lobby: 'At a table',
	game: 'In a game'
};
