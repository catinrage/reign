/** The admin API: the server's own site, with its cookie (a token from elsewhere never gets in). */

export class Unauthorized extends Error {}
export class NotAdmin extends Error {}

export async function get<T>(path: string): Promise<T> {
	const res = await fetch(`/api/admin/${path}`, { credentials: 'same-origin' });
	const data = await res.json().catch(() => ({}));
	if (res.status === 401) throw new Unauthorized(data.error ?? 'Sign in first.');
	if (res.status === 404 && path === 'me') throw new NotAdmin('This account is not an admin.');
	if (!res.ok) throw new Error(data.error ?? `The server said ${res.status}.`);
	return data as T;
}

export async function signIn(username: string, password: string) {
	const res = await fetch('/api/login', {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ username, password })
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? 'Could not sign in.');
}

export async function signOut() {
	await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
}

export function ago(t: string | number | null): string {
	if (t == null) return '—';
	const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	if (s < 86400 * 60) return `${Math.floor(s / 86400)} d ago`;
	return new Date(t).toLocaleDateString();
}

export function when(t: string | number | null): string {
	return t == null ? '—' : new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function duration(from: string | number, to: string | number | null): string {
	const m = Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000);
	return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** The main game's page, opened on a game's replay (see client/app.ts). */
export function replayLink(id: number | string) {
	return `/?replay=${id}`;
}
