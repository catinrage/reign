import type { CustomMap } from '../../../shared/board/maps';

/** Maps made in the editor, kept in this browser. */
const KEY = 'reign:maps';

function load(): CustomMap[] {
	try {
		const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
}

export const savedMaps = $state<{ list: CustomMap[] }>({ list: load() });

function persist() {
	try {
		localStorage.setItem(KEY, JSON.stringify(savedMaps.list));
	} catch {
		/* private mode */
	}
}

/** Save a map, replacing the one at `index` when editing; returns its index. */
export function saveMap(map: CustomMap, index: number | null = null): number {
	const copy = $state.snapshot(map) as CustomMap;
	if (index !== null && savedMaps.list[index]) savedMaps.list[index] = copy;
	else {
		savedMaps.list.push(copy);
		index = savedMaps.list.length - 1;
	}
	persist();
	return index;
}

export function deleteMap(index: number) {
	savedMaps.list.splice(index, 1);
	persist();
}
