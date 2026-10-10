import type { AvatarId, Me, SavedMap } from '../../shared/accounts';
import { AVATARS, NICKNAME_MAX, isAvatar, isDiceStyle } from '../../shared/accounts';
import type { CustomMap } from '../../shared/board/maps';
import { msg } from '../i18n/index.svelte';

/**
 * The account API for the offline build: no sign-in, one local player whose profile and saved
 * maps stay in this browser's localStorage. Answers the same paths as the server's /api.
 */

const PROFILE_KEY = 'reign:offline:me';
const MAPS_KEY = 'reign:offline:maps';

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

function write(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* private mode */
	}
}

function newId() {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadMe(): Me {
	const saved = read<Partial<Me>>(PROFILE_KEY, {});
	return {
		id: 'local-player',
		username: 'you',
		nickname: typeof saved.nickname === 'string' && saved.nickname.trim() ? saved.nickname : 'You',
		avatar: isAvatar(saved.avatar) ? saved.avatar : (AVATARS[0] as AvatarId),
		dice: isDiceStyle(saved.dice) ? saved.dice : 'classic',
		createdAt: saved.createdAt ?? new Date().toISOString()
	};
}

/** The one player of the offline build. The local server seats them under this name and face. */
export const OFFLINE_USER: Me = loadMe();

export async function offlineApi<T>(path: string, method: string, body?: any): Promise<T> {
	const maps = () => read<SavedMap[]>(MAPS_KEY, []);
	if (path === 'me') {
		if (method === 'PATCH') {
			if (typeof body?.nickname === 'string') {
				const nickname = body.nickname.trim().slice(0, NICKNAME_MAX);
				if (nickname) OFFLINE_USER.nickname = nickname;
			}
			if (isAvatar(body?.avatar)) OFFLINE_USER.avatar = body.avatar;
			if (isDiceStyle(body?.dice)) OFFLINE_USER.dice = body.dice;
			write(PROFILE_KEY, OFFLINE_USER);
		}
		return { user: { ...OFFLINE_USER } } as T;
	}
	if (path === 'logout') return {} as T;
	if (path === 'maps') {
		if (method === 'POST') {
			const saved: SavedMap = { id: newId(), map: body.map as CustomMap };
			write(MAPS_KEY, [...maps(), saved]);
			return saved as T;
		}
		return { maps: maps() } as T;
	}
	if (path === 'maps/import' && method === 'POST') {
		const list = [...maps(), ...(body.maps as CustomMap[]).map((map) => ({ id: newId(), map }))];
		write(MAPS_KEY, list);
		return { maps: list } as T;
	}
	const map = /^maps\/([^/]+)$/.exec(path);
	if (map) {
		const id = map[1];
		if (method === 'PUT') {
			const saved: SavedMap = { id, map: body.map as CustomMap };
			write(
				MAPS_KEY,
				maps().map((m) => (m.id === id ? saved : m))
			);
			return saved as T;
		}
		if (method === 'DELETE') {
			write(
				MAPS_KEY,
				maps().filter((m) => m.id !== id)
			);
			return {} as T;
		}
	}
	// Shown through tx() by api() in account.svelte.ts.
	throw new Error(msg('Not available when playing offline.'));
}
