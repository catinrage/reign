import type { RealmTerrain } from './realm';

/**
 * Made-up names for a random world's territories, regions and the world itself, in the spirit of
 * the Realm's (Wolfden, Goldmeadow, Anvil Pass): a root and an ending that suit the land, or a
 * name of a few syllables for the far-off sands and isles. The same random draws give the same names.
 */

type Rand = () => number;
const pickOf = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length];

/** Word-made names: a root and an ending, by the lie of the land. */
const WORDS: Partial<Record<RealmTerrain, { roots: string[]; ends: string[] }>> = {
	snow: {
		roots: ['Frost', 'Rime', 'Ice', 'Snow', 'Hoar', 'Winter', 'White', 'Cold', 'Glacier', 'Storm'],
		ends: ['holt', 'fell', 'gate', 'mere', 'reach', 'watch', 'peak', 'heim', 'vale', ' Shore']
	},
	taiga: {
		roots: ['Wolf', 'Pine', 'Elk', 'Bear', 'Raven', 'Fir', 'Lynx', 'Grey', 'Owl', 'Black'],
		ends: ['den', 'wood', 'march', 'holt', 'mere', 'run', 'fell', 'hollow', 'ridge', 'stead']
	},
	forest: {
		roots: ['Oak', 'Thorn', 'Elder', 'Moss', 'Fern', 'Briar', 'Ash', 'Hazel', 'Rowan', 'Willow'],
		ends: ['wick', 'hollow', 'wood', 'vale', 'mere', 'dell', 'glen', 'heart', 'moor', 'shaw']
	},
	jungle: {
		roots: ['Jade', 'Vine', 'Parrot', 'Emerald', 'Orchid', 'Mango', 'Tiger', 'Coral', 'Palm', 'Serpent'],
		ends: [' Isle', ' Cove', 'reach', ' Bay', 'haven', ' Reef', 'keep', ' Strand', 'port', ' Lagoon']
	},
	mountains: {
		roots: ['Iron', 'Stone', 'Grim', 'Anvil', 'High', 'Eagle', 'Storm', 'Granite', 'Dragon', 'Thunder'],
		ends: ['helm', 'crag', ' Pass', 'hold', 'peak', 'spire', 'watch', 'forge', 'tor', 'fall']
	},
	hills: {
		roots: ['Copper', 'Barrow', 'Kettle', 'Shepherd', 'Bell', 'Heather', 'Wind', 'Flint', 'Red', 'Long'],
		ends: ['crag', 'down', 'ridge', 'top', 'hill', 'brow', 'knoll', 'combe', 'fold', 'ley']
	},
	fields: {
		roots: ['Gold', 'Mill', 'Harvest', 'Barley', 'Corn', 'Wheat', 'Hay', 'Sheaf', 'Honey', 'Plough'],
		ends: ['meadow', 'brook', 'field', 'ford', ' Downs', 'stead', 'acre', 'worth', 'ton', 'bury']
	},
	meadow: {
		roots: ['Crown', 'River', 'Green', 'Clover', 'Daisy', 'Fair', 'Bright', 'Merry', 'Swan', 'Lark'],
		ends: ['haven', 'bend', 'shire', 'mead', 'ford', 'dale', 'well', 'bridge', 'lea', 'wick']
	}
};

/** Syllable-made names for the far, dry lands: Sunspire's neighbours, the Oasis of Ilm. */
const SYLLABLES = {
	first: ['Ka', 'Sa', 'Za', 'Mi', 'Qa', 'Ra', 'I', 'A', 'Na', 'Du', 'Te', 'Sha', 'Ve', 'Lo', 'Ze', 'O'],
	middle: ['', 'ra', 'ze', 'mi', 'ha', 'lo', 'ri', 'du', 'na', 'si'],
	last: ['m', 'n', 'r', 'kesh', 'dun', 'mar', 'zir', 'd', 'l', 'th', 's', 'lim', 'bar']
};
const DRY_ENDS = ['spire', 'watch', 'rock', 'wind', 'dune', 'haven'];

function syllables(rand: Rand): string {
	return pickOf(rand, SYLLABLES.first) + pickOf(rand, SYLLABLES.middle) + pickOf(rand, SYLLABLES.last);
}

/** A territory's name for its terrain, not one of `taken`. */
export function territoryName(rand: Rand, terrain: RealmTerrain, taken: Set<string>): string {
	for (let attempt = 0; attempt < 60; attempt++) {
		let name: string;
		if (terrain === 'desert' || terrain === 'badlands') {
			const r = rand();
			name = r < 0.35 ? `${pickOf(rand, ['Sun', 'Dune', 'Red', 'Scorch', 'Salt', 'Amber'])}${pickOf(rand, DRY_ENDS)}` : r < 0.5 ? `Oasis of ${syllables(rand)}` : syllables(rand);
		} else {
			const w = WORDS[terrain] ?? WORDS.meadow!;
			name = pickOf(rand, w.roots) + pickOf(rand, w.ends);
		}
		if (!taken.has(name)) {
			taken.add(name);
			return name;
		}
	}
	// Every likely name gone (a huge world): numbered, so still one of a kind.
	const name = `${syllables(rand)} ${taken.size}`;
	taken.add(name);
	return name;
}

/** Regions are named for their lands: the Iron Peaks, the Ember Sands, the Jade Isles. */
const REGION_WORDS: Record<string, { roots: string[]; ends: string[] }> = {
	cold: { roots: ['Frost', 'Rime', 'White', 'Winter', 'Ice', 'Hoar', 'Snow', 'Glacier', 'North', 'Wolf'], ends: ['march', ' Wastes', ' Reach', ' Fells', ' Tundra'] },
	wood: { roots: ['Elder', 'Green', 'Thorn', 'Deep', 'Old', 'Briar', 'Oak', 'Shadow', 'Moss', 'Hollow'], ends: ['wood', ' Wilds', ' Weald', ' Hollows', ' Forest'] },
	high: { roots: ['Iron', 'Grey', 'Storm', 'Giant', 'Dragon', 'Thunder', 'Anvil', 'Eagle', 'Granite', 'Cloud'], ends: ['peaks', ' Highlands', ' Spires', ' Crags', ' Heights'] },
	low: { roots: ['Heart', 'Gold', 'Fair', 'River', 'Sun', 'Green', 'Harvest', 'Middle', 'King', 'Wheat'], ends: ['lands', ' Vale', ' Shires', ' Fields', ' Downs'] },
	dry: { roots: ['Ember', 'Amber', 'Red', 'Copper', 'Ash', 'Scorch', 'Salt', 'Bone', 'Ochre', 'Brass'], ends: [' Sands', ' Wastes', ' Barrens', ' Dunes', ' Expanse'] },
	isle: { roots: ['Sapphire', 'Jade', 'Pearl', 'Coral', 'Azure', 'Turquoise', 'Gull', 'Storm', 'Amber', 'Siren'], ends: [' Isles', ' Shoals', ' Archipelago', ' Reefs', ' Keys'] }
};

/** The kind of region a mix of terrains makes. */
export function regionKind(terrains: RealmTerrain[], islands: boolean): keyof typeof REGION_WORDS {
	if (islands) return 'isle';
	const count = (...ts: RealmTerrain[]) => terrains.filter((t) => ts.includes(t)).length;
	const kinds: [keyof typeof REGION_WORDS, number][] = [
		['cold', count('snow', 'taiga')],
		['wood', count('forest', 'jungle')],
		['high', count('mountains', 'hills')],
		['low', count('fields', 'meadow')],
		['dry', count('desert', 'badlands')]
	];
	return kinds.sort((a, b) => b[1] - a[1])[0][0];
}

/** A region's name for its kind of land, not one of `taken` and on a root none of them uses. */
export function regionName(rand: Rand, kind: keyof typeof REGION_WORDS, taken: Set<string>): string {
	const w = REGION_WORDS[kind];
	const used = (root: string) => [...taken].some((n) => n.startsWith(root));
	for (let attempt = 0; attempt < 40; attempt++) {
		const root = pickOf(rand, w.roots);
		if (attempt < 30 && used(root)) continue;
		const name = root + pickOf(rand, w.ends);
		if (!taken.has(name)) {
			taken.add(name);
			return name;
		}
	}
	const name = `${syllables(rand)} ${pickOf(rand, w.ends).trim()}`;
	taken.add(name);
	return name;
}

/** The world's own name. */
export function worldName(rand: Rand): string {
	return `${pickOf(rand, ['The Realm of', 'The Kingdoms of', 'The Lands of', 'The Reach of', 'The Shield of'])} ${syllables(rand)}`;
}
