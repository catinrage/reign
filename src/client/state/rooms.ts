import type { RoomSummary } from '../../shared/protocol';
import { OFFLINE_BUILD } from '../offline/guest.svelte';
import { apiUrl } from './server';

/**
 * The public tables waiting for players (see GET /api/rooms). Guests can look too: the list asks
 * the real server directly, even while the guest's own games run in the page. The offline build
 * has no server, so it has no rooms to show.
 */
export const ROOMS_ONLINE = !OFFLINE_BUILD;

export async function fetchRooms(): Promise<RoomSummary[]> {
	if (!ROOMS_ONLINE) return [];
	const res = await fetch(apiUrl('rooms'), { credentials: 'omit' });
	if (!res.ok) throw new Error(`rooms: ${res.status}`);
	const data = (await res.json()) as { rooms?: RoomSummary[] };
	return Array.isArray(data.rooms) ? data.rooms : [];
}
