/**
 * Conquest's warlords: drafted before the armies are placed, each leads a player's armies with a
 * trait that bends one rule for them (the way Settlement's characters do). Traits are data plus
 * small hooks in the rules: the dice of a battle, the armies a turn brings, what a set is worth,
 * fortifying, taking territories and seeing through the fog.
 */

export const WARLORDS = [
	'aldric',
	'morwen',
	'kael',
	'tobin',
	'ysra',
	'dunstan',
	'rowan',
	'brannoc',
	'gorm',
	'vey'
] as const;
export type WarlordId = (typeof WARLORDS)[number];

export interface WarlordInfo {
	name: string;
	/** A short epithet shown under the name. */
	title: string;
	/** The trait's name. */
	trait: string;
	/** What the trait does, in one sentence. */
	text: string;
}

export const WARLORD_INFO: Record<WarlordId, WarlordInfo> = {
	aldric: { name: 'Aldric', title: 'the Siegemaster', trait: 'Siegecraft', text: 'Attacking a stronghold of 5 armies or more with three dice, his highest die wins a tie.' },
	morwen: { name: 'Morwen', title: 'the Ironwall', trait: 'Shieldwall', text: 'Defends with three dice wherever she has three armies or more.' },
	kael: { name: 'Kael', title: 'the Horselord', trait: 'Swift Riders', text: 'Fortifies twice each turn.' },
	tobin: { name: 'Tobin', title: 'the Quartermaster', trait: 'Full Stores', text: 'Every set of cards he trades brings 3 more armies.' },
	ysra: { name: 'Ysra', title: 'the Corsair', trait: 'Sea Raiders', text: 'Attacking across a sea lane, she faces only one die.' },
	dunstan: { name: 'Dunstan', title: 'the Mountain King', trait: 'Mountain Hold', text: 'Gets 1 more army each turn for every two mountain or hill territories he holds.' },
	rowan: { name: 'Rowan', title: 'the Woodwarden', trait: 'Ambush', text: 'Attackers roll two dice at most against her forests and jungles.' },
	brannoc: { name: 'Brannoc', title: 'the Warchief', trait: 'Plunder', text: 'The first territory he takes each turn gets an army more.' },
	gorm: { name: 'Gorm', title: 'the Gravewarden', trait: 'Restless Dead', text: 'Gets 1 more army at his next turn if he lost three territories or more since his last.' },
	vey: { name: 'Vey', title: 'the Spymistress', trait: 'Eyes Everywhere', text: 'Sees every army on the map through the fog of war.' }
};

/** Dunstan's lands, Rowan's woods. */
export const HIGH_GROUND = ['mountains', 'hills'] as const;
export const WOODLAND = ['forest', 'jungle', 'taiga'] as const;

/** Aldric's siegecraft works against territories with this many armies or more. */
export const STRONGHOLD = 5;
/** Tobin's sets bring this many more armies. */
export const FULL_STORES = 3;
/** Brannoc's plunder in the first territory he takes each turn. */
export const PLUNDER = 1;
/** Gorm's restless dead: an army for every this many territories lost, this many at most. */
export const RESTLESS_PER = 3;
export const RESTLESS_MOST = 1;

export function isWarlord(id: unknown): id is WarlordId {
	return WARLORDS.includes(id as WarlordId);
}
