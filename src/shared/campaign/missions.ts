import type { MapChoice } from '../board/maps';
import type { CharacterId } from '../rules/characters';
import type { ResourceCounts } from '../rules/config';
import type { CampaignBan } from '../rules/campaign';
import type { GameMode, GameSettings } from '../rules/modes';

/**
 * The solo campaign, "The Shattered Crown": missions against bots, each a story chapter on an
 * island of its own with its own rules. Everything a mission is lives here as data; the rules it
 * adds to a game are in ../rules/campaign.ts and the game is dealt by ./start.ts.
 *
 * Every string in here is English text the client shows through t().
 */

/** An optional goal for a star (the first star is for the win itself). */
export type CampaignGoal =
	/** Win by the end of this round. */
	| { kind: 'rounds'; max: number }
	/** Hold the Longest Road when you win. */
	| { kind: 'longestRoad' }
	| { kind: 'largestArmy' }
	/** Own at least this many cities when you win. */
	| { kind: 'cities'; n: number }
	| { kind: 'workshops'; n: number }
	/** Lose no more than this many cards to thieves (the robber, powers, events) all game. */
	| { kind: 'lostAtMost'; n: number }
	/** Never throw cards away on a 7. */
	| { kind: 'noDiscard' };

/** When a story beat is spoken. Each beat is spoken once, the first time its moment comes. */
export type BeatWhen =
	/** Setup is over and the first real turn starts. */
	| { on: 'main' }
	/** This round has begun. */
	| { on: 'round'; n: number }
	/** This many rounds are left of the round limit, counting the current one. */
	| { on: 'roundsLeft'; n: number }
	| { on: 'heroPoints'; n: number }
	/** The hero is this many points (default 2) from winning, as far as the table can see. */
	| { on: 'heroNear'; n?: number }
	/** A rival has this many points showing (the beat is about them). */
	| { on: 'rivalPoints'; n: number }
	| { on: 'rivalNear'; n?: number }
	| { on: 'longestRoad'; who: 'hero' | 'rival' }
	| { on: 'largestArmy'; who: 'hero' | 'rival' }
	/** A rival stole from the hero (the beat is about the thief). */
	| { on: 'heroRobbed' }
	/** The hero stole from a rival (the beat is about the victim). */
	| { on: 'rivalRobbed' }
	/** The hero's first city. */
	| { on: 'heroCity' }
	/** Rivals took their first tribute. */
	| { on: 'tribute' }
	/** The game is over (won: only after a win, or only after a loss). */
	| { on: 'end'; won?: boolean };

export interface Beat {
	when: BeatWhen;
	/**
	 * Who says it: the narrator (Aldous), the mission's boss, the rival the moment is about
	 * ('them': the one who robbed you, took the road...), or a rival by character.
	 */
	speaker: 'narrator' | 'boss' | 'them' | CharacterId;
	line: string;
}

export interface Rival {
	/** Who they are: the bot is seated under this character's name and face. */
	character: CharacterId;
	/** The rival the mission is about: they win ties when time runs out. */
	boss?: boolean;
	/** Cards from the bank before setup. */
	start?: Partial<ResourceCounts>;
	/** Victory point cards in hand from the start, hidden like any other. */
	vp?: number;
}

export interface Mission {
	id: string;
	act: number;
	title: string;
	/** Where it happens: the island's name, shown in the game as its map. */
	place: string;
	/** The story before the mission, a paragraph a string. */
	intro: string[];
	/** The story's next line after a win, and after a loss. */
	victory: string;
	defeat: string;
	mode: GameMode;
	/** Reign Extended's island and switches; Classic deals the standard island. */
	map?: MapChoice;
	settings?: Partial<Omit<GameSettings, 'mode' | 'map' | 'pointsToWin'>>;
	/** Deals the island, so it comes out the same every attempt. */
	seed: number;
	points: number;
	hero?: {
		/** Reign Extended: the character the hero plays. */
		character?: CharacterId;
		start?: Partial<ResourceCounts>;
		/** Where the hero sits: first to place and roll, last, or by lot (the default). */
		seat?: 'first' | 'last';
	};
	rivals: Rival[];
	bans?: CampaignBan[];
	/** Win by the end of this round, or lose. */
	roundLimit?: number;
	/** Every `every` rounds the boss (or every rival) takes a card from the bank. */
	tribute?: { every: number; all?: boolean };
	/** The goals for the second and third stars. */
	goals: CampaignGoal[];
	beats: Beat[];
}

export interface Act {
	n: number;
	title: string;
	text: string;
}

export const ACTS: Act[] = [
	{ n: 1, title: 'The Mudflats', text: 'A storm, a beach, an old steward and a claim nobody believes.' },
	{ n: 2, title: 'The Wider Sea', text: 'Guilds, omens and strangers with strange gifts.' },
	{ n: 3, title: 'The Usurper', text: 'The last shards, and the one who has been watching all along.' }
];

/** The narrator: the old Queen's steward. */
export const NARRATOR: CharacterId = 'steward';

export const PROLOGUE = [
	'The Queen of the Isles is dead, and the Crown of Reign broke into five shards as she fell. Each shard went to someone who now means to rule: a baron, a seer, a witch, a rogue, and one more who keeps out of sight.',
	'Whoever holds all five rules the isles. You hold nothing at all, except the word of an old steward who swears you carry the Queen\'s blood.'
];

export const MISSIONS: Mission[] = [
	{
		id: 'washed-ashore',
		act: 1,
		title: 'Washed Ashore',
		place: 'Mudflat Isle',
		intro: [
			'The storm took the ship, the cargo and most of the crew. It left you, a soaked old man named Aldous, and a beach of grey mud.',
			"Aldous swears you are the dead Queen's last blood, and that the shards of her broken crown are waiting for someone with the nerve to gather them. First, though, you need a roof.",
			'The only other soul here is Maebh, a shepherd who thinks the mudflats are hers. Build faster than she does, and the island will listen to you.'
		],
		victory: "Maebh shakes your muddy hand. \"Fine. It's yours, heir or not.\" Over her shoulder, Aldous is already studying a map of the next island.",
		defeat: "Maebh's sheep graze over your foundations. Aldous wrings out his cloak and says the tide will turn again tomorrow.",
		mode: 'classic',
		seed: 1101,
		points: 6,
		hero: { start: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, seat: 'first' },
		rivals: [{ character: 'shepherd', boss: true }],
		goals: [{ kind: 'rounds', max: 14 }, { kind: 'cities', n: 1 }],
		beats: [
			{
				when: { on: 'main' },
				speaker: 'narrator',
				line: 'Every roll pays the tiles that carry its number. The 6s and 8s come up most, so build beside them and your hands will fill.'
			},
			{
				when: { on: 'heroCity' },
				speaker: 'narrator',
				line: 'A city! It pays twice what a settlement does. The Queen built her first one on a beach just like this.'
			},
			{ when: { on: 'rivalPoints', n: 4 }, speaker: 'shepherd', line: 'Four points already. My sheep and I have done this before, you know.' },
			{ when: { on: 'heroRobbed' }, speaker: 'shepherd', line: 'Sorry! The robber goes where the wool is short.' },
			{ when: { on: 'heroNear', n: 1 }, speaker: 'shepherd', line: "Wait, you're nearly there? Nobody told me this was a race!" },
			{ when: { on: 'round', n: 9 }, speaker: 'narrator', line: 'Half the day is gone. A quick win earns a second star, Aldous reminds you.' }
		]
	},
	{
		id: 'millers-grudge',
		act: 1,
		title: "The Miller's Grudge",
		place: 'Millbrook',
		intro: [
			"Word travels fast across the water. In Millbrook, Odo the Merchant has heard that a nobody from the mudflats claims the Queen's blood, and Odo does not like competition.",
			"He owns the mill, the market and most of the village's debts. By sunrise, nobody in Millbrook will trade so much as a sheep with you.",
			"Corin the Explorer is passing through, mapping roads that never get finished. Beat them both with what your own land gives you, and what the bank will swap."
		],
		victory: 'The villagers line up at your door with sacks of grain. Odo counts his empty ledger twice and leaves on the evening boat.',
		defeat: "Odo raises the mill's price again, and the whole village pays it. Aldous says a grudge is only a debt you haven't collected yet.",
		mode: 'classic',
		seed: 2207,
		points: 8,
		hero: { seat: 'first' },
		rivals: [{ character: 'merchant', boss: true }, { character: 'explorer' }],
		bans: ['playerTrade'],
		goals: [{ kind: 'rounds', max: 16 }, { kind: 'longestRoad' }],
		beats: [
			{
				when: { on: 'main' },
				speaker: 'narrator',
				line: "Nobody here will trade with you, but the bank still will: four of a kind for any card you like, and better at a harbor you've settled."
			},
			{ when: { on: 'rivalPoints', n: 4 }, speaker: 'merchant', line: 'Business is good! Well, mine is.' },
			{ when: { on: 'longestRoad', who: 'rival' }, speaker: 'them', line: 'Look at that road. Every cart on the island passes my way now.' },
			{ when: { on: 'longestRoad', who: 'hero' }, speaker: 'merchant', line: 'Your road cuts straight across my best toll. Rude.' },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'Nothing personal. Well, a little personal.' },
			{ when: { on: 'rivalRobbed' }, speaker: 'them', line: 'Hey! I was saving those!' },
			{ when: { on: 'heroNear' }, speaker: 'merchant', line: "Winning without a single trade? It isn't natural!" }
		]
	},
	{
		id: 'thieves-crossing',
		act: 1,
		title: "Thieves' Crossing",
		place: 'The Crossing',
		intro: [
			'The Crossing is where every road in the eastern isles meets, and where every purse in the eastern isles goes missing.',
			"Wren the Rogue runs the thieves' guild here. The guild won't sell development cards to a stranger, and every fourth round Wren's people bring in a card of \"tribute\" from the bank.",
			'Brunhild the Mason is building here too, and pays the guild to leave her alone. Out-build them both, and keep a tight grip on your cards.'
		],
		victory: 'Wren tips an imaginary hat. "A stranger who kept their purse at the Crossing. That\'s a first." Then Wren is gone, and so is Aldous\'s pocket watch.',
		defeat: 'You wake to find the Crossing richer and your pockets lighter. Wren has left a note: "Better luck next time, heir."',
		mode: 'classic',
		seed: 3313,
		points: 10,
		rivals: [{ character: 'rogue', boss: true }, { character: 'mason' }],
		bans: ['devCards'],
		tribute: { every: 4 },
		goals: [{ kind: 'rounds', max: 20 }, { kind: 'lostAtMost', n: 4 }],
		beats: [
			{ when: { on: 'main' }, speaker: 'rogue', line: "Welcome to the Crossing! Hold on to your cards. Or don't, I'm not fussy." },
			{
				when: { on: 'round', n: 3 },
				speaker: 'narrator',
				line: "On a 7, anyone holding more than seven cards throws half away, and Wren's friends love a fat purse. Spend your cards before you end your turn."
			},
			{ when: { on: 'tribute' }, speaker: 'rogue', line: 'A little tribute for the guild. Thank you, everyone.' },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: "Lovely. I'll take good care of it." },
			{ when: { on: 'rivalRobbed' }, speaker: 'them', line: 'Thief! At the Crossing, of all places!' },
			{ when: { on: 'longestRoad', who: 'rival' }, speaker: 'them', line: 'My road, my toll. Pay up or go around.' },
			{ when: { on: 'rivalNear' }, speaker: 'them', line: 'Two more points and the Crossing is mine.' }
		]
	},
	{
		id: 'barons-shard',
		act: 1,
		title: "The Baron's Shard",
		place: "Leofric's Hold",
		intro: [
			"The first shard of the crown sits on Baron Leofric's mantelpiece, between a stuffed boar and a portrait of Baron Leofric.",
			"Leofric has ruled this island for years. He starts with a victory point nobody can see and a little more in his coffers than anyone else. Gareth, his old knight, and Brunhild, his builder, play for themselves, but they won't make it easy.",
			"The Baron is patient, but not forever: win within 24 rounds, or he'll call your claim a joke and the whole of the isles will laugh along."
		],
		victory: "Leofric hands over the shard as if it burns. It's warm, and it hums. Aldous goes very quiet, then says: \"Four more. And they will all have heard about this one.\"",
		defeat: "The Baron's banners go up all over the island. \"An heir?\" he laughs at dinner. \"An heir to mud.\" Aldous says to try again before the laughter spreads.",
		mode: 'classic',
		seed: 4421,
		points: 10,
		roundLimit: 24,
		rivals: [
			{ character: 'baron', boss: true, start: { wheat: 1, ore: 1 }, vp: 1 },
			{ character: 'veteran' },
			{ character: 'mason' }
		],
		goals: [{ kind: 'rounds', max: 18 }, { kind: 'largestArmy' }],
		beats: [
			{ when: { on: 'main' }, speaker: 'baron', line: "An heir, they tell me. How quaint. Do sit down, this won't take long." },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'The Baron sends his regards.' },
			{ when: { on: 'rivalRobbed' }, speaker: 'them', line: "You'll answer for that at the Baron's court!" },
			{ when: { on: 'largestArmy', who: 'rival' }, speaker: 'them', line: 'My knights hold the field. Yield, or be ridden over.' },
			{ when: { on: 'largestArmy', who: 'hero' }, speaker: 'veteran', line: 'Not bad. The Baron never let me raise an army that size.' },
			{ when: { on: 'rivalPoints', n: 8 }, speaker: 'them', line: "Eight points. I'd start packing, if I were you." },
			{
				when: { on: 'roundsLeft', n: 5 },
				speaker: 'narrator',
				line: "Five rounds left before the Baron's patience runs out. Whatever you're saving for, build it now."
			},
			{ when: { on: 'heroNear' }, speaker: 'baron', line: 'Gareth! Brunhild! Do something!' }
		]
	}
];

export function missionById(id: string): Mission | undefined {
	return MISSIONS.find((m) => m.id === id);
}

/** The mission after this one, if there is one yet. */
export function nextMission(id: string): Mission | undefined {
	const i = MISSIONS.findIndex((m) => m.id === id);
	return i >= 0 ? MISSIONS[i + 1] : undefined;
}

/** A mission is open once the one before it has been won (the first always is). */
export function missionOpen(id: string, won: (id: string) => boolean): boolean {
	const i = MISSIONS.findIndex((m) => m.id === id);
	return i === 0 || (i > 0 && won(MISSIONS[i - 1].id));
}
