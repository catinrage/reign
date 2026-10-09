/**
 * Reign Extended characters. Each player picks one in the lobby; its trait bends one rule for
 * them. Traits are data plus a few small hooks in the rules (costs, trade ratios, the robber,
 * discards, Largest Army and Longest Road), so new characters are cheap to add.
 */

export const CHARACTERS = [
	'merchant',
	'mason',
	'scholar',
	'veteran',
	'rogue',
	'steward',
	'shepherd',
	'explorer'
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
		text: 'Only discards on a 7 when holding more than 9 cards.'
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
	}
};

export function isCharacter(id: unknown): id is CharacterId {
	return typeof id === 'string' && (CHARACTERS as readonly string[]).includes(id);
}
