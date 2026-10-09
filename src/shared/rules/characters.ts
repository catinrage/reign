/**
 * Reign Extended characters. Each player drafts one when the game starts; its trait bends one
 * rule for them. Traits are data plus a few small hooks in the rules (costs, trade ratios, the
 * robber, the dice, discards, trades, Largest Army and Longest Road), so new characters are cheap
 * to add.
 */

export const CHARACTERS = [
	'merchant',
	'mason',
	'scholar',
	'veteran',
	'rogue',
	'steward',
	'shepherd',
	'explorer',
	'seer',
	'alchemist',
	'bard',
	'witch',
	'cartographer',
	'baron',
	'abbess',
	'jester'
] as const;
export type CharacterId = (typeof CHARACTERS)[number];

export interface CharacterInfo {
	name: string;
	/** A short epithet shown under the name. */
	title: string;
	/** The trait's name. */
	trait: string;
	/** What the trait does, in one sentence. */
	text: string;
}

export const CHARACTER_INFO: Record<CharacterId, CharacterInfo> = {
	merchant: {
		name: 'Odo',
		title: 'the Merchant',
		trait: 'Silver Tongue',
		text: 'Trades with the bank at 3:1 for every resource, harbor or not.'
	},
	mason: {
		name: 'Brunhild',
		title: 'the Mason',
		trait: 'Stonecraft',
		text: 'Cities cost one less Ore.'
	},
	scholar: {
		name: 'Ysolde',
		title: 'the Scholar',
		trait: 'Well Read',
		text: 'Development cards cost no Wool.'
	},
	veteran: {
		name: 'Gareth',
		title: 'the Veteran',
		trait: 'Old Campaigner',
		text: 'Starts the game with one Knight already in their army.'
	},
	rogue: {
		name: 'Wren',
		title: 'the Rogue',
		trait: 'Light Fingers',
		text: 'Steals two cards instead of one when moving the robber.'
	},
	steward: {
		name: 'Aldous',
		title: 'the Steward',
		trait: 'Deep Coffers',
		// Filled in by traitText: three cards over the table's hand limit.
		text: 'Only discards on a 7 when holding three cards more than everyone else may.'
	},
	shepherd: {
		name: 'Maebh',
		title: 'the Shepherd',
		trait: 'Flock Keeper',
		text: 'Takes one Wool from the bank whenever anyone rolls a 7.'
	},
	explorer: {
		name: 'Corin',
		title: 'the Explorer',
		trait: 'Trailblazer',
		text: 'Can claim Longest Road with only 4 roads.'
	},
	seer: {
		name: 'Morwen',
		title: 'the Seer',
		trait: 'Second Sight',
		text: 'Takes a resource of choice from the bank whenever anyone rolls a 2 or a 12.'
	},
	alchemist: {
		name: 'Osric',
		title: 'the Alchemist',
		trait: 'Transmutation',
		text: 'Can pay Brick as Ore and Ore as Brick when building.'
	},
	bard: {
		name: 'Fenwick',
		title: 'the Bard',
		trait: 'Good Company',
		text: 'Whoever trades with the Bard takes a bonus resource of choice from the bank, once per turn.'
	},
	witch: {
		name: 'Hilde',
		title: 'the Hedge Witch',
		trait: 'Hexed Purse',
		text: 'Whoever robs the Witch gives her a card instead of taking one. The robber still blocks her tile.'
	},
	cartographer: {
		name: 'Elowen',
		title: 'the Cartographer',
		trait: 'Charted Coasts',
		text: 'Trades at any harbor her roads reach, with no settlement there.'
	},
	baron: {
		name: 'Leofric',
		title: 'the Baron',
		trait: 'Toll Roads',
		text: 'Anyone who builds a road touching his roads pays him a random card.'
	},
	abbess: {
		name: 'Mother Agnes',
		title: 'the Abbess',
		trait: 'Alms',
		text: 'Whenever a 7 makes others discard, takes one of the discarded cards at random.'
	},
	jester: {
		name: 'Pip',
		title: 'the Jester',
		trait: 'Underdog',
		text: 'Takes a resource of choice from the bank at the start of each turn while alone in last place.'
	}
};

/** Cards the Steward holds on a 7 beyond the table's hand limit. */
export const STEWARD_EXTRA = 3;

/** What a character's trait does at a table with this hand limit, with the real numbers in. */
export function traitText(id: CharacterId, handLimit = 7): string {
	if (id === 'steward') return `Only discards on a 7 when holding more than ${handLimit + STEWARD_EXTRA} cards (everyone else: ${handLimit}).`;
	return CHARACTER_INFO[id].text;
}

export function isCharacter(id: unknown): id is CharacterId {
	return typeof id === 'string' && (CHARACTERS as readonly string[]).includes(id);
}
