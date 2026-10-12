import type { MapChoice } from '../board/maps';
import { randomMap, type RandomShape } from '../board/random';
import { EXTRA_BUILDINGS, type BuildingRules, type ExtraBuilding } from '../rules/buildings';
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
	/** The first Event card turned over. */
	| { on: 'event' }
	/** The hero, or a rival (the beat is about them), used a character power. */
	| { on: 'power'; who: 'hero' | 'rival' }
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
	/**
	 * Reign Extended: characters bring their traits (and, with the powers setting, their powers),
	 * the hero's included if the mission gives them one. Without it characters are only faces.
	 * Defaults to on when the hero plays a character.
	 */
	traits?: boolean;
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

/** Building switches with only these on. */
function only(...on: ExtraBuilding[]): BuildingRules {
	return Object.fromEntries(EXTRA_BUILDINGS.map((b) => [b, on.includes(b)])) as BuildingRules;
}

/** An island from the random generator, the same every time for its seed. */
function grown(seed: number, tiles: number, shape: RandomShape, lakes = false): MapChoice {
	return { custom: randomMap({ seed, tiles, shape, lakes }) };
}

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
	},
	// Act II: Reign Extended, its features arriving one mission at a time.
	{
		id: 'greywater-guilds',
		act: 2,
		title: 'Greywater Guilds',
		place: 'Greywater',
		intro: [
			'Greywater is the busiest port in the isles, and its docks belong to the guilds. The new master of the dock guild is a familiar face: Odo the Merchant, who left Millbrook on the evening boat and never forgot why.',
			'Odo has stocked his warehouses before you even land: he starts with a Lumber, a Brick and an Ore. Brunhild the Mason and Osric the Alchemist sit on the guild council beside him.',
			'This is the wider sea, and it plays by Reign Extended\'s rules. You can build workshops beside your towns, pave your roads with stone and keep a storehouse that thieves can\'t empty. Out-build the guilds at their own game.'
		],
		victory: 'The council votes Odo off the docks, two to one. On the quay a jester in a patched coat juggles three apples and bows to you as if he had planned the whole thing. Aldous doesn\'t seem to notice him.',
		defeat: 'Odo has your name painted on the "do not serve" board at every warehouse. Aldous says that Greywater has a short memory, and the docks reopen at dawn.',
		mode: 'extended',
		map: { preset: 'great' },
		settings: { buildings: only('workshop', 'stoneRoad', 'storehouse'), events: { on: false, every: 1, wild: true, pulled: [] } },
		seed: 5501,
		points: 10,
		hero: { start: { wood: 1, brick: 1 }, seat: 'first' },
		rivals: [{ character: 'merchant', boss: true, start: { wood: 1, brick: 1, ore: 1 } }, { character: 'mason' }, { character: 'alchemist' }],
		goals: [{ kind: 'workshops', n: 2 }, { kind: 'rounds', max: 20 }],
		beats: [
			{ when: { on: 'main' }, speaker: 'merchant', line: 'You again! Greywater belongs to the guilds, and the guilds belong to me.' },
			{
				when: { on: 'round', n: 2 },
				speaker: 'narrator',
				line: 'A workshop sits on a tile beside one of your towns and adds a card every time that tile pays you. Two of them and the guilds will have to take you seriously.'
			},
			{
				when: { on: 'round', n: 5 },
				speaker: 'narrator',
				line: 'A storehouse keeps your last three cards safe from thieves and from a 7. Build one before your hand grows fat.'
			},
			{ when: { on: 'rivalPoints', n: 5 }, speaker: 'them', line: 'The guild looks after its own. You, I\'m afraid, are not its own.' },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'Call it a guild fee.' },
			{ when: { on: 'longestRoad', who: 'rival' }, speaker: 'them', line: 'Stone roads, my friend. Every cart in Greywater rolls on my cobbles.' },
			{ when: { on: 'heroNear' }, speaker: 'merchant', line: 'Stop them before they buy the whole port!' },
			{ when: { on: 'rivalNear' }, speaker: 'them', line: 'One more workshop and the council is mine.' }
		]
	},
	{
		id: 'omens-lagoon',
		act: 2,
		title: 'Omens over the Lagoon',
		place: 'Crescent Lagoon',
		intro: [
			'The second shard hangs from the neck of Morwen the Seer, who lives where the Crescent Lagoon turns back on itself and reads the future in the weather.',
			'Here the sky has opinions. Every round an Event card turns over: a harvest, a storm, a plague of rats, a comet. Morwen says she knows what comes next. She is right more often than is comfortable.',
			'Mother Agnes the Abbess and Fenwick the Bard have come to watch. Morwen starts with a hidden victory point she says the stars gave her. Build a tavern and you will hear the rumors too.'
		],
		victory: 'Morwen gives up the shard without a fight. "I saw this," she says, "and I saw something else. A fool, laughing last." Aldous tells her the stars are welcome to keep their riddles.',
		defeat: 'Morwen smiles as if she had read the ending the night before. Perhaps she had. Aldous says a prophecy is only a guess, and guesses can be wrong twice.',
		mode: 'extended',
		map: { preset: 'lagoon' },
		settings: { buildings: only('workshop', 'tavern'), events: { on: true, every: 1, wild: true, pulled: [] } },
		seed: 6607,
		points: 10,
		rivals: [{ character: 'seer', boss: true, start: { wheat: 1, sheep: 1 }, vp: 1 }, { character: 'abbess' }, { character: 'bard' }],
		goals: [{ kind: 'rounds', max: 18 }, { kind: 'cities', n: 2 }],
		beats: [
			{ when: { on: 'main' }, speaker: 'seer', line: 'Welcome, little heir. I have seen how this ends. Shall I spoil it?' },
			{ when: { on: 'event' }, speaker: 'seer', line: 'There. Did I not say so? The lagoon always tells me first.' },
			{
				when: { on: 'round', n: 3 },
				speaker: 'narrator',
				line: 'A tavern goes onto one of your towns. From then on you see the next Event card before it turns over, as Morwen does.'
			},
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'It was written. Well, I wrote it, just now.' },
			{ when: { on: 'rivalRobbed' }, speaker: 'them', line: 'The stars said nothing about this!' },
			{ when: { on: 'rivalPoints', n: 7 }, speaker: 'them', line: 'Seven points. The omens are very clear today.' },
			{ when: { on: 'heroNear' }, speaker: 'seer', line: 'No. No, that isn\'t what I saw at all.' },
			{ when: { on: 'end', won: true }, speaker: 'bard', line: 'I\'ll put this in a song. Something with a lagoon in it. Rhymes with... no, nothing rhymes with lagoon.' }
		]
	},
	{
		id: 'company-you-keep',
		act: 2,
		title: 'The Company You Keep',
		place: 'Twin Crowns',
		intro: [
			'On the Twin Crowns everyone has a gift. Elowen the Cartographer trades at any harbor her roads can reach. Gareth the Veteran never goes into a fight without a knight. Each of them has a power too, once a game, or again after a rest.',
			'Corin the Explorer, your old friend from Millbrook, has twisted his ankle and lends you his maps and his knack for roads. In this mission you play as Corin: Longest Road with only four roads, and the power to lay two roads for nothing.',
			'And then there is Pip the Jester, who joined your boat at Greywater and won\'t say why. He seems harmless. He also seems to be playing to win.'
		],
		victory: 'Elowen rolls up her charts and offers to sail with you. Pip applauds loudest of all, then asks Aldous, very casually, where you keep the shards at night.',
		defeat: 'Elowen\'s banners fly over both crowns. Pip is sympathetic and eats your supper. Aldous says that a gift you have never used is no gift at all: try Corin\'s power early.',
		mode: 'extended',
		map: { preset: 'twin' },
		settings: { buildings: only('workshop', 'stoneRoad'), events: { on: false, every: 1, wild: true, pulled: [] }, powers: true, powerRecharge: 6 },
		seed: 7703,
		points: 10,
		hero: { character: 'explorer' },
		rivals: [{ character: 'cartographer', boss: true }, { character: 'veteran' }, { character: 'jester' }],
		goals: [{ kind: 'rounds', max: 20 }, { kind: 'longestRoad' }],
		beats: [
			{ when: { on: 'main' }, speaker: 'jester', line: 'A game! I love games. Don\'t worry, I never win. Hardly ever.' },
			{
				when: { on: 'round', n: 2 },
				speaker: 'narrator',
				line: 'Your power is on the button by your character. Corin\'s lays two roads for free, and it comes back six rounds after you use it.'
			},
			{ when: { on: 'power', who: 'rival' }, speaker: 'them', line: 'Did you think you were the only one with a trick?' },
			{ when: { on: 'power', who: 'hero' }, speaker: 'jester', line: 'Ooh, two roads at once! Do it again! No, really, how did you do that?' },
			{ when: { on: 'longestRoad', who: 'hero' }, speaker: 'cartographer', line: 'Four roads and he calls it the longest. Corin\'s maps are cheating.' },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'Fair\'s fair. You have so many, and I have so few.' },
			{ when: { on: 'rivalNear' }, speaker: 'them', line: 'Two more points and I draw the borders.' },
			{ when: { on: 'heroNear' }, speaker: 'jester', line: 'You\'re nearly there! How exciting. How very, very exciting.' }
		]
	},
	{
		id: 'witchs-shard',
		act: 2,
		title: "The Witch's Shard",
		place: 'Hollowmere',
		intro: [
			'The third shard is in Hollowmere, a marsh of black pools where Hilde the Hedge Witch keeps it in a jar on her windowsill. Rob Hilde and her curse makes you hand her a card instead.',
			'Mother Agnes the Abbess has come with you, and in this mission you play as her: when a 7 makes others throw cards away you take one of them, and once a game you can bless a tile so it pays double twice.',
			'Hilde starts with a hidden victory point. Anyone holding more than six cards on a 7 loses half. And the marsh swallows anyone who lingers: you have 22 rounds. Pip says he\'ll cheer for both sides.'
		],
		victory: 'Hilde hands over the jar and its shard. "Three of five," she says. "Count them again tonight, heir. Count them every night." Pip is already asleep by the fire, smiling.',
		defeat: 'The marsh rises over your roads and Hilde\'s laughter carries for miles. Aldous says witches only frighten those who let their hands grow fat: keep your cards low.',
		mode: 'extended',
		map: grown(8808, 30, 'round', true),
		settings: {
			buildings: only('workshop', 'storehouse', 'tavern'),
			events: { on: true, every: 2, wild: false, pulled: [] },
			handLimit: 6,
			powers: true,
			powerRecharge: 0
		},
		seed: 8808,
		points: 10,
		roundLimit: 22,
		hero: { character: 'abbess' },
		rivals: [{ character: 'witch', boss: true, start: { ore: 1 }, vp: 1 }, { character: 'alchemist' }, { character: 'jester' }],
		goals: [{ kind: 'rounds', max: 18 }, { kind: 'lostAtMost', n: 4 }],
		beats: [
			{ when: { on: 'main' }, speaker: 'witch', line: 'An Abbess in my marsh? Mind the pools, dearie. Some of them bite.' },
			{ when: { on: 'power', who: 'rival' }, speaker: 'them', line: 'A little something I keep up my sleeve.' },
			{ when: { on: 'power', who: 'hero' }, speaker: 'witch', line: 'Blessings! In Hollowmere! I\'ll have to air the place out.' },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'Your purse is lighter. Your heart should be too.' },
			{ when: { on: 'event' }, speaker: 'witch', line: 'The weather turns when I want it to. Mostly.' },
			{
				when: { on: 'roundsLeft', n: 5 },
				speaker: 'narrator',
				line: 'Five rounds before the marsh closes over us. Spend everything.'
			},
			{ when: { on: 'rivalNear' }, speaker: 'jester', line: 'Oh dear, oh dear. Somebody is winning, and it isn\'t us.' },
			{ when: { on: 'heroNear' }, speaker: 'witch', line: 'Stop that. Stop that at once!' }
		]
	},
	// Act III: everything, and harder.
	{
		id: 'serpent-coast',
		act: 3,
		title: 'Serpent Coast',
		place: 'Serpent Coast',
		intro: [
			'Leofric the Baron did not take losing well. He has bought the whole of the Serpent Coast, a long thin strip of land, and means to take his shard back by force of masonry.',
			'Gareth the Veteran, Leofric\'s old knight, has finally had enough of him and rides with you. Here you play as Gareth: you start with a knight already in your army. The coast is long and the game runs to 12 points.',
			'Cities can become castles, guild halls or fortresses. Leofric has bribed the coast\'s guild: no development cards for you. And Pip, Aldous notices, has quietly left the boat.'
		],
		victory: 'Leofric\'s castle flies your banner, and he sails home to his boar. Aldous counts the shards in their chest: three. He counts again. Three. He doesn\'t say anything, but he sleeps with the chest after that.',
		defeat: 'The Baron\'s castles line the coast like teeth. Aldous says a long coast is a long road: take it before Leofric does.',
		mode: 'extended',
		map: { preset: 'serpent' },
		settings: {
			buildings: only('workshop', 'stoneRoad', 'castle', 'guildHall', 'fortress'),
			events: { on: false, every: 1, wild: true, pulled: [] },
			powers: true,
			powerRecharge: 6
		},
		seed: 9901,
		points: 12,
		hero: { character: 'veteran', start: { wood: 1, brick: 1 } },
		rivals: [{ character: 'baron', boss: true, start: { wood: 1, brick: 1 } }, { character: 'mason' }, { character: 'scholar' }],
		bans: ['devCards'],
		goals: [{ kind: 'longestRoad' }, { kind: 'rounds', max: 22 }],
		beats: [
			{ when: { on: 'main' }, speaker: 'baron', line: 'You again. And you\'ve stolen my knight. I have bought a coastline instead. Sit down.' },
			{
				when: { on: 'round', n: 3 },
				speaker: 'narrator',
				line: 'A castle is a city worth three points. A guild hall trades two of its goods for one. A fortress counts double knights. Choose one per city.'
			},
			{ when: { on: 'longestRoad', who: 'rival' }, speaker: 'them', line: 'Every road on this coast pays me. Every single one.' },
			{ when: { on: 'longestRoad', who: 'hero' }, speaker: 'baron', line: 'Gareth! You never built me a road like that!' },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'The Baron sends his regards. Again.' },
			{ when: { on: 'power', who: 'rival' }, speaker: 'them', line: 'Let me show you how it\'s done.' },
			{ when: { on: 'rivalPoints', n: 9 }, speaker: 'them', line: 'Nine. The coast is nearly mine.' },
			{ when: { on: 'heroNear' }, speaker: 'baron', line: 'Brunhild! Ysolde! I am not paying you to watch!' }
		]
	},
	{
		id: 'long-winter',
		act: 3,
		title: 'The Long Winter',
		place: 'Frostholm',
		intro: [
			'The fourth shard belongs to Wren the Rogue, who has taken it north to Frostholm, a ragged island where winter never quite ends.',
			'Maebh the Shepherd has come all the way from the mudflats to help, and you play as her: whenever anyone rolls a 7, she takes a Wool from the bank. You will need it. The weather is wild, a 7 strips anyone holding more than five cards, and every fourth round each of Wren\'s gang takes a card of tribute.',
			'Wren starts with a hidden victory point. You have 24 rounds before the sea freezes. And there, shivering on the dock and very pleased to see you, is Pip.'
		],
		victory: 'Wren hands over the shard with a bow. "Four. You know, I never stole a shard in my life. I always wondered who did." Pip laughs until he has to sit down.',
		defeat: 'The sea freezes with you on the wrong side of it. Wren sends a basket of your own cards back, minus a few. Aldous says that in winter the storehouse is your best friend.',
		mode: 'extended',
		map: grown(1010, 34, 'ragged'),
		settings: {
			buildings: only('workshop', 'storehouse', 'tavern', 'stoneRoad'),
			events: { on: true, every: 1, wild: true, pulled: [] },
			handLimit: 5,
			powers: true,
			powerRecharge: 6
		},
		seed: 1010,
		points: 10,
		roundLimit: 24,
		hero: { character: 'shepherd' },
		rivals: [{ character: 'rogue', boss: true, vp: 1 }, { character: 'scholar' }, { character: 'jester' }],
		tribute: { every: 4, all: true },
		goals: [{ kind: 'rounds', max: 20 }, { kind: 'lostAtMost', n: 6 }],
		beats: [
			{ when: { on: 'main' }, speaker: 'rogue', line: 'Back again? You must really like losing cards.' },
			{ when: { on: 'tribute' }, speaker: 'rogue', line: 'Winter tax. Everyone pays, especially you.' },
			{ when: { on: 'event' }, speaker: 'jester', line: 'Brrr! Is the weather always like this? How marvellous.' },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'It\'s cold. I needed something warm. Your cards will do.' },
			{ when: { on: 'rivalRobbed' }, speaker: 'them', line: 'Robbing a rogue? I\'m almost proud.' },
			{ when: { on: 'power', who: 'rival' }, speaker: 'them', line: 'Oops. Did that hurt?' },
			{
				when: { on: 'roundsLeft', n: 6 },
				speaker: 'narrator',
				line: 'Six rounds before the sea freezes. Whatever you have, build it now.'
			},
			{ when: { on: 'heroNear' }, speaker: 'rogue', line: 'Hold on, hold on. Let\'s talk about this.' }
		]
	},
	{
		id: 'isles-of-ash',
		act: 3,
		title: 'Isles of Ash',
		place: 'The Ash Isles',
		intro: [
			'The chest is open. Three shards are gone, and in their place is a little brass bell from a jester\'s cap. Pip is nowhere to be found.',
			'Aldous traces the shards to the Ash Isles, a scatter of burnt islands where Osric the Alchemist sells anything to anyone, except to you: nobody here will trade with you. Odo and Morwen are buying from him too, and they won\'t say who for.',
			'Brunhild the Mason, who has built against you four times, finally builds with you. You play as her: your cities cost one less Ore. The game runs to 12.'
		],
		victory: 'Osric gives up his ledger. Every shard he handled was sold to one buyer, signed with a little drawing of a bell. Morwen whispers: "The fool. I told you. The fool laughs last."',
		defeat: 'The ash settles over your towns, and somewhere a little bell rings. Aldous says that a city is worth two settlements, and Brunhild\'s cost less: build up, not out.',
		mode: 'extended',
		map: grown(1111, 36, 'islands'),
		settings: {
			buildings: only('workshop', 'stoneRoad', 'storehouse', 'castle', 'guildHall', 'fortress'),
			events: { on: false, every: 1, wild: true, pulled: [] },
			powers: true,
			powerRecharge: 6
		},
		seed: 1111,
		points: 12,
		hero: { character: 'mason' },
		rivals: [{ character: 'alchemist', boss: true, start: { ore: 1, brick: 1 } }, { character: 'merchant' }, { character: 'seer' }],
		bans: ['playerTrade'],
		goals: [{ kind: 'rounds', max: 22 }, { kind: 'cities', n: 3 }],
		beats: [
			{ when: { on: 'main' }, speaker: 'alchemist', line: 'Welcome to the Ash Isles. Everything here is for sale, except to you.' },
			{
				when: { on: 'round', n: 2 },
				speaker: 'narrator',
				line: 'Nobody will trade with you, but the bank will. Brunhild\'s cities are cheap: three of them would make this island yours.'
			},
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'Ash to ash, cards to me.' },
			{ when: { on: 'rivalRobbed' }, speaker: 'them', line: 'That is not how the market works!' },
			{ when: { on: 'power', who: 'rival' }, speaker: 'them', line: 'A little alchemy never hurt anyone. Much.' },
			{ when: { on: 'rivalPoints', n: 9 }, speaker: 'them', line: 'The buyer will be very pleased with me.' },
			{ when: { on: 'heroNear' }, speaker: 'merchant', line: 'Sell! Sell everything! No, wait, buy!' }
		]
	},
	{
		id: 'jesters-crown',
		act: 3,
		title: "The Jester's Crown",
		place: 'The Grand Realm',
		intro: [
			'Pip the Jester is waiting in the Grand Realm, the Queen\'s old seat, wearing a crown with four shards in it and room for one more. "Surprised?" he asks. "Nobody ever watches the fool."',
			'He has bought the help of everyone you beat: Leofric, Morwen, Hilde and Wren all play for Pip now. Pip starts with a hidden victory point and cards to spare, and every third round he takes a card of tribute.',
			'Aldous puts the Queen\'s old keys in your hand: you play as the Steward, and you only throw cards away on a 7 if you hold three more than anyone else could. Every building, every event, every power. 13 points within 28 rounds. Take the crown.'
		],
		victory: 'The crown is whole again, and it fits. Pip takes off his cap, bows very low and says that every court needs a fool. Aldous weeps openly and says that he always knew. The isles have a queen\'s heir at last.',
		defeat: 'Pip sits on the throne with his feet on the armrest, ringing his little bell. "Again?" he asks. "I do love a game." Aldous says the crown will wait for you.',
		mode: 'extended',
		map: { preset: 'realm' },
		settings: { events: { on: true, every: 1, wild: true, pulled: [] }, powers: true, powerRecharge: 4 },
		seed: 1212,
		points: 13,
		roundLimit: 28,
		hero: { character: 'steward' },
		rivals: [
			{ character: 'jester', boss: true, start: { wood: 1, brick: 1, wheat: 1 }, vp: 1 },
			{ character: 'baron' },
			{ character: 'seer' },
			{ character: 'witch' },
			{ character: 'rogue' }
		],
		tribute: { every: 3 },
		goals: [{ kind: 'rounds', max: 24 }, { kind: 'lostAtMost', n: 8 }],
		beats: [
			{ when: { on: 'main' }, speaker: 'jester', line: 'The last game! Everyone is here. Isn\'t this fun?' },
			{ when: { on: 'tribute' }, speaker: 'jester', line: 'A card for the crown. Thank you, my loyal subjects.' },
			{ when: { on: 'event' }, speaker: 'seer', line: 'I see the end now. I only wish I could tell you whose.' },
			{ when: { on: 'heroRobbed' }, speaker: 'them', line: 'Pip says to say sorry. I\'m not saying it.' },
			{ when: { on: 'power', who: 'rival' }, speaker: 'them', line: 'For the crown! Pip\'s crown, that is. Apparently.' },
			{ when: { on: 'longestRoad', who: 'hero' }, speaker: 'baron', line: 'Fine roads. Better than mine. Don\'t tell Pip I said so.' },
			{ when: { on: 'rivalNear' }, speaker: 'jester', line: 'Nearly there! Ring the bells! Well, my bell.' },
			{
				when: { on: 'roundsLeft', n: 6 },
				speaker: 'narrator',
				line: 'Six rounds left. Whatever happens, the Queen would be proud of how far you came.'
			},
			{ when: { on: 'heroNear' }, speaker: 'jester', line: 'Wait. Wait! This isn\'t how the joke goes!' }
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

/**
 * A mission is open once the one before it has been won. The first mission of every act always
 * is, so a player can start any act straight away and play its missions in order.
 */
export function missionOpen(id: string, won: (id: string) => boolean): boolean {
	const i = MISSIONS.findIndex((m) => m.id === id);
	if (i < 0) return false;
	return i === 0 || MISSIONS[i - 1].act !== MISSIONS[i].act || won(MISSIONS[i - 1].id);
}
