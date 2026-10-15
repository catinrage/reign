/**
 * Conquest's omens: from the second round on, one is drawn as each round begins and bends the war
 * until the next (the way Settlement's events do). Blessings help everyone, reprieves help whoever
 * is losing, upheavals change how armies move and fight, and calamities strike once, the moment
 * they are drawn. The host leaves them off, deals a gentle deck (no calamities) or a wild one.
 */

export const OMENS = [
	'harvestMoon',
	'musterBells',
	'mercenaries',
	'truce',
	'bloodMoon',
	'seaFog',
	'snowbound',
	'floods',
	'plague',
	'dragon'
] as const;
export type OmenId = (typeof OMENS)[number];

export type OmenTone = 'blessing' | 'reprieve' | 'upheaval' | 'calamity';

export const OMEN_TONE_LABEL: Record<OmenTone, string> = {
	blessing: 'Blessing',
	reprieve: 'Reprieve',
	upheaval: 'Upheaval',
	calamity: 'Calamity'
};

export interface OmenInfo {
	name: string;
	tone: OmenTone;
	/** What it does, in a sentence. */
	text: string;
}

export const OMEN_INFO: Record<OmenId, OmenInfo> = {
	harvestMoon: { name: 'Harvest Moon', tone: 'blessing', text: 'Every turn this round brings 2 more armies.' },
	musterBells: { name: 'Muster Bells', tone: 'blessing', text: 'Region bonuses count double this round.' },
	mercenaries: { name: 'Mercenaries', tone: 'reprieve', text: 'The smallest realm hires 5 more armies on its turn this round.' },
	truce: { name: 'Truce', tone: 'reprieve', text: 'Nobody may attack the smallest realm this round.' },
	bloodMoon: { name: 'Blood Moon', tone: 'upheaval', text: 'Attackers win ties this round.' },
	seaFog: { name: 'Sea Fog', tone: 'upheaval', text: 'Nobody may cross a sea lane this round, to attack or to move.' },
	snowbound: { name: 'Snowbound', tone: 'upheaval', text: 'One region is snowed in: nobody may attack its territories this round.' },
	floods: { name: 'Floods', tone: 'upheaval', text: 'Nobody may fortify this round.' },
	plague: { name: 'Plague', tone: 'calamity', text: 'Every territory with 10 armies or more loses a fifth of them.' },
	dragon: { name: 'Dragon', tone: 'calamity', text: 'A dragon burns the territory with the most armies: it loses half of them.' }
};

/** A gentle deck leaves the calamities out. */
export const GENTLE_TONES: OmenTone[] = ['blessing', 'reprieve', 'upheaval'];
/** Harvest Moon's armies, and the Mercenaries'. */
export const HARVEST_ARMIES = 2;
export const MERCENARY_ARMIES = 5;
/** Plague: territories with this many armies or more lose a fifth. */
export const PLAGUE_AT = 10;

/** The deck as a game carries it, when omens are on. */
export interface OmenState {
	/** Every omen in this game's deck. */
	pool: OmenId[];
	/** The draw pile, top last; dealt again from the pool when it runs out. Never sent to players. */
	deck: OmenId[];
	/** This round's omen, or null. */
	current: OmenId | null;
	/** Snowbound: the region snowed in. */
	region: number | null;
	/** Mercenaries and the Truce: the smallest realm, as the round began. */
	target: number | null;
}

/** What players see of it: not the order of the deck. */
export type OmenView = Omit<OmenState, 'deck'> & { deckCount: number };

export function isOmen(id: unknown): id is OmenId {
	return OMENS.includes(id as OmenId);
}
