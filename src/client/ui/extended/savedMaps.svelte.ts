import type { SavedMap } from '../../../shared/accounts';
import type { CustomMap } from '../../../shared/board/maps';
import { account, api } from '../../state/account.svelte';
import { client } from '../../state/client.svelte';

/**
 * Maps made in the editor, kept on the player's account. The list changes at once and the
 * server catches up in the background, one request at a time, so an edit made right after a
 * save still lands on the right map. Maps a browser kept before accounts (localStorage
 * `reign:maps`) move onto the account the first time someone signs in there.
 */
const OLD_KEY = 'reign:maps';

export const savedMaps = $state<{ list: CustomMap[] }>({ list: [] });

/** The server's id for each map in the list (null until its first save comes back). */
let refs: { id: string | null }[] = [];
/** Server requests, run in order. */
let queue: Promise<unknown> = Promise.resolve();
/** Bumped on every sign-in and sign-out, so answers meant for an earlier account are dropped. */
let generation = 0;

function later(job: () => Promise<unknown>) {
	const gen = generation;
	queue = queue
		.then(() => (gen === generation ? job() : undefined))
		.catch((e) => {
			if (gen !== generation) return;
			client.toast(`Couldn't save your maps: ${(e as Error).message}`, 'error');
			// Show what the server really has.
			return load(gen);
		});
}

function show(maps: SavedMap[]) {
	savedMaps.list = maps.map((m) => m.map);
	refs = maps.map((m) => ({ id: m.id }));
}

function oldMaps(): CustomMap[] {
	try {
		const list = JSON.parse(localStorage.getItem(OLD_KEY) ?? '[]');
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
}

async function load(gen: number) {
	const old = oldMaps();
	const { maps } = old.length
		? await api<{ maps: SavedMap[] }>('maps/import', 'POST', { maps: old })
		: await api<{ maps: SavedMap[] }>('maps');
	if (gen !== generation) return;
	if (old.length) {
		try {
			localStorage.removeItem(OLD_KEY);
		} catch {
			/* private mode */
		}
	}
	show(maps);
}

account.watch((signedIn) => {
	generation++;
	show([]);
	if (signedIn) later(() => load(generation));
});

/** Save a map, replacing the one at `index` when editing; returns its index. */
export function saveMap(map: CustomMap, index: number | null = null): number {
	const copy = $state.snapshot(map) as CustomMap;
	let ref: { id: string | null };
	if (index !== null && savedMaps.list[index]) {
		savedMaps.list[index] = copy;
		ref = refs[index];
	} else {
		savedMaps.list.push(copy);
		index = savedMaps.list.length - 1;
		ref = { id: null };
		refs.push(ref);
	}
	later(async () => {
		const saved = ref.id
			? await api<SavedMap>(`maps/${ref.id}`, 'PUT', { map: copy })
			: await api<SavedMap>('maps', 'POST', { map: copy });
		ref.id = saved.id;
	});
	return index;
}

export function deleteMap(index: number) {
	const [ref] = refs.splice(index, 1);
	savedMaps.list.splice(index, 1);
	if (ref) later(async () => ref.id && (await api(`maps/${ref.id}`, 'DELETE')));
}
