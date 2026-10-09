/**
 * Static game data. Resources, terrains, costs and decks live here as data so later
 * phases can add new resources, tiles and buildings without touching the engine's flow.
 */

export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceCounts = Record<Resource, number>;

export const TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'] as const;
export type Terrain = (typeof TERRAINS)[number];

export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
	forest: 'wood',
	hills: 'brick',
	pasture: 'sheep',
	fields: 'wheat',
	mountains: 'ore',
	desert: null
};

export const RESOURCE_LABEL: Record<Resource, string> = {
	wood: 'Lumber',
	brick: 'Brick',
	sheep: 'Wool',
	wheat: 'Grain',
	ore: 'Ore'
};

export const PLAYER_COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'purple', 'pink'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export type BuildKind = 'road' | 'settlement' | 'city' | 'devCard';

export const COSTS: Record<BuildKind, Partial<ResourceCounts>> = {
	road: { wood: 1, brick: 1 },
	settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
	city: { wheat: 2, ore: 3 },
	devCard: { sheep: 1, wheat: 1, ore: 1 }
};

export const PIECE_LIMITS = { road: 15, settlement: 5, city: 4 } as const;

export const BANK_PER_RESOURCE = 19;
/** A table of five or six (Reign Extended on a bigger island) gets a bigger bank and deck. */
export const BANK_PER_RESOURCE_LARGE = 24;
/** And seven or eight bigger still. */
export const BANK_PER_RESOURCE_HUGE = 29;

export const DEV_CARDS = [
	'knight',
	'roadBuilding',
	'yearOfPlenty',
	'monopoly',
	'victoryPoint'
] as const;
export type DevCardType = (typeof DEV_CARDS)[number];

export const DEV_DECK: Record<DevCardType, number> = {
	knight: 14,
	roadBuilding: 2,
	yearOfPlenty: 2,
	monopoly: 2,
	victoryPoint: 5
};

/** The deck for a table of seven or eight. */
export const DEV_DECK_HUGE: Record<DevCardType, number> = {
	knight: 26,
	roadBuilding: 4,
	yearOfPlenty: 4,
	monopoly: 4,
	victoryPoint: 5
};

/** The deck for a table of five or six. */
export const DEV_DECK_LARGE: Record<DevCardType, number> = {
	knight: 20,
	roadBuilding: 3,
	yearOfPlenty: 3,
	monopoly: 3,
	victoryPoint: 5
};

export const DEV_CARD_LABEL: Record<DevCardType, string> = {
	knight: 'Knight',
	roadBuilding: 'Road Building',
	yearOfPlenty: 'Year of Plenty',
	monopoly: 'Monopoly',
	victoryPoint: 'Victory Point'
};

export const DEV_CARD_TEXT: Record<DevCardType, string> = {
	knight: 'Move the robber and steal one card from a player next to it.',
	roadBuilding: 'Place two roads for free.',
	yearOfPlenty: 'Take any two resources from the bank.',
	monopoly: 'Name a resource. Every other player gives you all of theirs.',
	victoryPoint: 'Worth one victory point. Kept hidden until you win.'
};

/** The classic 19-tile island. */
export const STANDARD_TERRAIN_POOL: Terrain[] = [
	...Array<Terrain>(4).fill('forest'),
	...Array<Terrain>(4).fill('pasture'),
	...Array<Terrain>(4).fill('fields'),
	...Array<Terrain>(3).fill('hills'),
	...Array<Terrain>(3).fill('mountains'),
	'desert'
];

export const STANDARD_NUMBER_POOL = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export type PortKind = Resource | 'any';
export const STANDARD_PORT_POOL: PortKind[] = [
	'any',
	'any',
	'any',
	'any',
	'wood',
	'brick',
	'sheep',
	'wheat',
	'ore'
];

export const VICTORY_POINTS_TO_WIN = 10;
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;
export const DISCARD_THRESHOLD = 7;

/** Number of dots shown under a number token: its odds out of 36. */
export function pips(n: number | null): number {
	if (n === null) return 0;
	return 6 - Math.abs(7 - n);
}

export function emptyResources(): ResourceCounts {
	return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function totalResources(r: Partial<ResourceCounts>): number {
	let n = 0;
	for (const k of RESOURCES) n += r[k] ?? 0;
	return n;
}

export function hasResources(have: ResourceCounts, need: Partial<ResourceCounts>): boolean {
	return RESOURCES.every((k) => have[k] >= (need[k] ?? 0));
}
