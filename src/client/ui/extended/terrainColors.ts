import type { Terrain } from '../../../shared/rules/config';
import { msg } from '../../i18n/index.svelte';

/** Flat tile colors for 2D map previews and the editor, picked from the island's own palette. */
export const TERRAIN_CSS: Record<Terrain | 'random', string> = {
	forest: '#2f7f27',
	hills: '#c95a32',
	pasture: '#8fd246',
	fields: '#ebb424',
	mountains: '#8c8e96',
	desert: '#f0d79c',
	random: '#e9dcc0'
};

/** Terrain names in English: shown with t(TERRAIN_NAME[terrain]). */
export const TERRAIN_NAME: Record<Terrain | 'random', string> = {
	forest: msg('Forest'),
	hills: msg('Hills'),
	pasture: msg('Pasture'),
	fields: msg('Fields'),
	mountains: msg('Mountains'),
	desert: msg('Desert'),
	random: msg('Random')
};
