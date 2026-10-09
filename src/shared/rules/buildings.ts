import type { Resource, ResourceCounts } from './config';

/**
 * Reign Extended buildings beyond the settlement and the city. The host switches each one on or
 * off in the lobby, and Classic never has any. This file holds their data (names, what they do,
 * limits); the rules live in the engine and queries, and the bots know how to use each one.
 */
export const EXTRA_BUILDINGS = ['workshop', 'stoneRoad', 'storehouse', 'castle', 'guildHall', 'fortress'] as const;
export type ExtraBuilding = (typeof EXTRA_BUILDINGS)[number];
/** Which extra buildings a game has. */
export type BuildingRules = Record<ExtraBuilding, boolean>;

export interface BuildingInfo {
	name: string;
	/** One of them, as the build menu calls it. */
	label: string;
	/** What it does, in a sentence or two. */
	text: string;
}

export const BUILDING_INFO: Record<ExtraBuilding, BuildingInfo> = {
	workshop: {
		name: 'Workshops',
		label: 'Workshop',
		text: 'Built on a tile beside your settlement or city: one per tile, three each. Whenever the tile pays you, its workshop adds one more card. Tear one down for a Lumber back to build it somewhere better.'
	},
	stoneRoad: {
		name: 'Stone roads',
		label: 'Stone road',
		text: 'Pave one of your roads with stone and it counts as two roads towards the Longest Road.'
	},
	storehouse: {
		name: 'Storehouses',
		label: 'Storehouse',
		text: "Added onto one of your settlements or cities, one each. It keeps three of your cards safe: nothing takes your last three at random (not the robber, a thief, a toll or an event), and on a 7 they don't count towards your hand."
	},
	castle: {
		name: 'Castles',
		label: 'Castle',
		text: 'A path for one of your cities: it becomes a castle, worth 3 points instead of 2. It still produces like a city.'
	},
	guildHall: {
		name: 'Guild halls',
		label: 'Guild hall',
		text: 'A path for one of your cities: it becomes a guild hall for the goods you choose, and you trade those with the bank at 2:1.'
	},
	fortress: {
		name: 'Fortresses',
		label: 'Fortress',
		text: 'A path for one of your cities, one each: it becomes a fortress, and your knights count double towards the Largest Army.'
	}
};

/**
 * A city can grow down one of three paths (Reign Extended): a castle for points, a guild hall for
 * trade, a fortress for knights. Each city takes one path, for good, and keeps producing like a
 * city whichever it takes.
 */
export const CITY_PATHS = ['castle', 'guildHall', 'fortress'] as const;
export type CityPath = (typeof CITY_PATHS)[number];

export function isCityPath(kind: unknown): kind is CityPath {
	return typeof kind === 'string' && (CITY_PATHS as readonly string[]).includes(kind);
}

/** What a castle is worth, where a city is worth 2. */
export const CASTLE_POINTS = 3;

/** How many times over a fortress counts its owner's knights towards the Largest Army. */
export const FORTRESS_KNIGHTS = 2;

/** Each player builds at most this many workshops. */
export const WORKSHOP_LIMIT = 3;

/** What tearing down one of your workshops gives back, so you can build it somewhere better. */
export const WORKSHOP_REFUND: Partial<ResourceCounts> = { wood: 1 };

/** Cards a player's storehouse keeps safe from the robber, thieves, tolls, events and discards. */
export const STOREHOUSE_SAFE = 3;

/** A workshop is named after the work of its tile. */
export const WORKSHOP_NAME: Record<Resource, string> = {
	wood: 'Sawmill',
	brick: 'Kiln',
	sheep: 'Sheepfold',
	wheat: 'Mill',
	ore: 'Mine Shaft'
};

/** Every extra building on (or every one off). */
export function allBuildings(on = true): BuildingRules {
	return Object.fromEntries(EXTRA_BUILDINGS.map((b) => [b, on])) as BuildingRules;
}

export function isExtraBuilding(id: unknown): id is ExtraBuilding {
	return typeof id === 'string' && (EXTRA_BUILDINGS as readonly string[]).includes(id);
}

/** Switches as given (a lobby's settings, say): anything unknown is dropped and a missing one is on. */
export function cleanBuildingRules(rules: unknown): BuildingRules {
	const out = allBuildings(true);
	if (rules && typeof rules === 'object') {
		for (const b of EXTRA_BUILDINGS) {
			const v = (rules as Record<string, unknown>)[b];
			if (typeof v === 'boolean') out[b] = v;
		}
	}
	return out;
}
