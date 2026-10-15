import type { Component } from 'svelte';
import type { GameMode } from '../../../shared/rules/modes';
import { CQ_PIXEL } from '../conquest/icons';
import CqBattle from './conquest/Battle.svelte';
import CqCards from './conquest/Cards.svelte';
import CqMissions from './conquest/Missions.svelte';
import CqRealm from './conquest/Realm.svelte';
import CqTurn from './conquest/Turn.svelte';
import { msg } from '../../i18n/index.svelte';
import { PIXEL } from '../pixel';
import Bonus from './classic/Bonus.svelte';
import Building from './classic/Building.svelte';
import DevCards from './classic/DevCards.svelte';
import Goal from './classic/Goal.svelte';
import Island from './classic/Island.svelte';
import Online from './classic/Online.svelte';
import Robber from './classic/Robber.svelte';
import Setup from './classic/Setup.svelte';
import Trading from './classic/Trading.svelte';
import Turn from './classic/Turn.svelte';
import Buildings from './extended/Buildings.svelte';
import Characters from './extended/Characters.svelte';
import Events from './extended/Events.svelte';
import MapMaker from './extended/MapMaker.svelte';
import Maps from './extended/Maps.svelte';
import Overview from './extended/Overview.svelte';
import { TUT_ICON } from './icons';

/**
 * The tutorial's table of contents. Each chapter is one page component; the tutorial shell draws
 * the chapter list, the page frame and the next/back buttons. To explain a new Reign Extended
 * feature, write a page in ./extended and add one line here.
 */
/** The tutorial's books: Settlement's two modes, and Conquest. */
export const TUTORIAL_MODES = ['classic', 'extended', 'conquest'] as const;
export type TutorialMode = GameMode | 'conquest';
export const TUTORIAL_MODE_NAME: Record<TutorialMode, string> = {
	classic: msg('Classic'),
	extended: msg('Reign Extended'),
	conquest: msg('Conquest')
};

export interface Chapter {
	id: string;
	mode: TutorialMode;
	/** Marked with msg(); shown through t(). */
	title: string;
	/** One line under the title, saying what the chapter covers. Marked with msg(); shown through t(). */
	lede: string;
	icon: string;
	page: Component;
}

export const CHAPTERS: Chapter[] = [
	{
		id: 'goal',
		mode: 'classic',
		title: msg('The goal'),
		lede: msg('Settle an island, gather its riches and be the first to reach ten points.'),
		icon: PIXEL.crown,
		page: Goal
	},
	{
		id: 'island',
		mode: 'classic',
		title: msg('The island'),
		lede: msg('Every tile yields a resource whenever its number is rolled.'),
		icon: TUT_ICON.isle,
		page: Island
	},
	{
		id: 'setup',
		mode: 'classic',
		title: msg('Setting up'),
		lede: msg('Before the first roll, everyone places two settlements and two roads.'),
		icon: TUT_ICON.flag,
		page: Setup
	},
	{
		id: 'turn',
		mode: 'classic',
		title: msg('Your turn'),
		lede: msg('Roll, trade, build, then pass the dice.'),
		icon: PIXEL.die,
		page: Turn
	},
	{
		id: 'building',
		mode: 'classic',
		title: msg('Building'),
		lede: msg('Spend resources on roads, settlements, cities and development cards.'),
		icon: PIXEL.hammer,
		page: Building
	},
	{
		id: 'trading',
		mode: 'classic',
		title: msg('Trading'),
		lede: msg('Swap cards with other players, the bank or a harbor.'),
		icon: PIXEL.trade,
		page: Trading
	},
	{
		id: 'robber',
		mode: 'classic',
		title: msg('The robber'),
		lede: msg('A roll of seven pays nothing and sets the robber loose.'),
		icon: TUT_ICON.robber,
		page: Robber
	},
	{
		id: 'dev',
		mode: 'classic',
		title: msg('Development cards'),
		lede: msg('Face-down cards with knights, shortcuts and hidden points.'),
		icon: PIXEL.dev,
		page: DevCards
	},
	{
		id: 'bonus',
		mode: 'classic',
		title: msg('Bonus points'),
		lede: msg('Two titles worth two points each change hands during the game.'),
		icon: PIXEL.star,
		page: Bonus
	},
	{
		id: 'online',
		mode: 'classic',
		title: msg('Online play'),
		lede: msg('Rooms, bots, the turn timer, pausing and the controls.'),
		icon: PIXEL.house,
		page: Online
	},
	{
		id: 'extended',
		mode: 'extended',
		title: msg('What changes'),
		lede: msg('Reign Extended keeps every Classic rule and lets the host reshape the game.'),
		icon: PIXEL.crown,
		page: Overview
	},
	{
		id: 'characters',
		mode: 'extended',
		title: msg('Characters'),
		lede: msg('Every player plays a character whose trait bends one rule in their favor, with a power to save for the right moment.'),
		icon: TUT_ICON.mask,
		page: Characters
	},
	{
		id: 'buildings',
		mode: 'extended',
		title: msg('New buildings'),
		lede: msg('Workshops, stone roads and more: buildings that do new jobs, if the host plays them.'),
		icon: PIXEL.hammer,
		page: Buildings
	},
	{
		id: 'events',
		mode: 'extended',
		title: msg('Events deck'),
		lede: msg('A card turns over each round: festivals, storms, bandits and royal favors.'),
		icon: PIXEL.star,
		page: Events
	},
	{
		id: 'maps',
		mode: 'extended',
		title: msg('Islands'),
		lede: msg('Play on bigger and stranger islands than the classic nineteen tiles.'),
		icon: TUT_ICON.scroll,
		page: Maps
	},
	{
		id: 'mapmaker',
		mode: 'extended',
		title: msg('Map maker'),
		lede: msg('Draw your own island, save it and share it with a code.'),
		icon: TUT_ICON.pen,
		page: MapMaker
	},
	{
		id: 'cq-realm',
		mode: 'conquest',
		title: msg('The Realm'),
		lede: msg('Six regions, borders and sea lanes, and how a war is won.'),
		icon: CQ_PIXEL.flag,
		page: CqRealm
	},
	{
		id: 'cq-turn',
		mode: 'conquest',
		title: msg('Your turn'),
		lede: msg('Reinforce, attack, fortify, all with clicks on the board.'),
		icon: CQ_PIXEL.troops,
		page: CqTurn
	},
	{
		id: 'cq-battle',
		mode: 'conquest',
		title: msg('Battles'),
		lede: msg('Dice against dice, and the defender wins ties.'),
		icon: PIXEL.sword,
		page: CqBattle
	},
	{
		id: 'cq-cards',
		mode: 'conquest',
		title: msg('Cards'),
		lede: msg('Earn a card each turn you conquer, and trade sets for armies.'),
		icon: PIXEL.cards,
		page: CqCards
	},
	{
		id: 'cq-missions',
		mode: 'conquest',
		title: msg('Secret missions'),
		lede: msg('A war of your own to win: two regions, a host of territories, or one rival.'),
		icon: PIXEL.letter,
		page: CqMissions
	}
];

export function chaptersOf(mode: TutorialMode): Chapter[] {
	return CHAPTERS.filter((c) => c.mode === mode);
}
