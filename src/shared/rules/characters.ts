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

/**
 * When a power can be used on its owner's turn: before the roll, after it, or either. Powers are
 * worth about one development card each and never scale with the table or the stage of the game.
 */
export type PowerTiming = 'roll' | 'main' | 'either';

/** What a power needs picked before it goes off. */
export type PowerTarget = 'none' | 'player' | 'vertex' | 'hex' | 'twoHexes' | 'number' | 'trade';

export interface PowerInfo {
	name: string;
	text: string;
	when: PowerTiming;
	target: PowerTarget;
}

export const POWER_INFO: Record<CharacterId, PowerInfo> = {
	merchant: { name: 'Market Day', text: 'Trade up to 4 cards with the bank at 1:1.', when: 'main', target: 'trade' },
	mason: { name: 'Master Builder', text: 'Turn one of your settlements into a city for a single Ore.', when: 'main', target: 'vertex' },
	scholar: { name: 'Eureka', text: 'Take a free development card. It can be played this same turn.', when: 'either', target: 'none' },
	veteran: {
		name: 'Call to Arms',
		text: 'Play a free Knight: it moves the robber and counts toward Largest Army, on top of any card this turn.',
		when: 'either',
		target: 'none'
	},
	rogue: { name: 'Pickpocket', text: 'Steal 2 cards from any one player, no robber needed.', when: 'main', target: 'player' },
	steward: {
		name: 'Tithe',
		text: 'Name a number: your tiles with it pay you as if it were rolled, up to 3 cards.',
		when: 'main',
		target: 'number'
	},
	shepherd: {
		name: 'Drive Off',
		text: 'Chase the robber back to the desert and take a card from whoever last moved it.',
		when: 'either',
		target: 'none'
	},
	explorer: { name: 'Pathfinder', text: 'Build 2 roads for free.', when: 'either', target: 'none' },
	seer: { name: 'Foresight', text: 'Instead of rolling once, roll three times and keep the roll you like.', when: 'roll', target: 'none' },
	alchemist: {
		name: 'Transmute Land',
		text: 'Turn one tile into a different terrain for the rest of the game (not the desert).',
		when: 'either',
		target: 'hex'
	},
	bard: { name: 'Encore', text: 'Everyone collects the last roll again.', when: 'main', target: 'none' },
	witch: { name: 'Hex', text: 'Hex a player: they collect nothing from the next two rolls.', when: 'either', target: 'player' },
	cartographer: {
		name: 'Redraw the Map',
		text: 'Swap the numbers on two tiles beside your settlements or cities.',
		when: 'either',
		target: 'twoHexes'
	},
	baron: {
		name: 'Land Grant',
		text: 'Claim an empty corner: only you can build a settlement there.',
		when: 'either',
		target: 'vertex'
	},
	abbess: { name: 'Blessing', text: 'Bless a tile: it pays double the next two times it produces.', when: 'either', target: 'hex' },
	jester: { name: 'Mischief', text: "Pool every player's hand and deal the cards back out evenly.", when: 'main', target: 'none' }
};

/** Most cards the Merchant's Market Day trades, and the Steward's Tithe pays. */
export const MARKET_DAY_CARDS = 4;
export const TITHE_CAP = 3;
/** Rolls the Witch's Hex lasts, and times the Abbess's Blessing pays double. */
export const HEX_ROLLS = 2;
export const BLESSINGS = 2;
/** Rolls the Seer's Foresight shows her. */
export const FORESIGHT_ROLLS = 3;

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
