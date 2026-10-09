import type { Component } from 'svelte';
import type { GameMode } from '../../../shared/rules/modes';
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
import Characters from './extended/Characters.svelte';
import MapMaker from './extended/MapMaker.svelte';
import Maps from './extended/Maps.svelte';
import Overview from './extended/Overview.svelte';
import { TUT_ICON } from './icons';

/**
 * The tutorial's table of contents. Each chapter is one page component; the tutorial shell draws
 * the chapter list, the page frame and the next/back buttons. To explain a new Reign Extended
 * feature, write a page in ./extended and add one line here.
 */
export interface Chapter {
	id: string;
	mode: GameMode;
	title: string;
	/** One line under the title, saying what the chapter covers. */
	lede: string;
	icon: string;
	page: Component;
}

export const CHAPTERS: Chapter[] = [
	{
		id: 'goal',
		mode: 'classic',
		title: 'The goal',
		lede: 'Settle an island, gather its riches and be the first to reach ten points.',
		icon: PIXEL.crown,
		page: Goal
	},
	{
		id: 'island',
		mode: 'classic',
		title: 'The island',
		lede: 'Every tile yields a resource whenever its number is rolled.',
		icon: TUT_ICON.isle,
		page: Island
	},
	{
		id: 'setup',
		mode: 'classic',
		title: 'Setting up',
		lede: 'Before the first roll, everyone places two settlements and two roads.',
		icon: TUT_ICON.flag,
		page: Setup
	},
	{
		id: 'turn',
		mode: 'classic',
		title: 'Your turn',
		lede: 'Roll, trade, build, then pass the dice.',
		icon: PIXEL.die,
		page: Turn
	},
	{
		id: 'building',
		mode: 'classic',
		title: 'Building',
		lede: 'Spend resources on roads, settlements, cities and development cards.',
		icon: PIXEL.hammer,
		page: Building
	},
	{
		id: 'trading',
		mode: 'classic',
		title: 'Trading',
		lede: 'Swap cards with other players, the bank or a harbor.',
		icon: PIXEL.trade,
		page: Trading
	},
	{
		id: 'robber',
		mode: 'classic',
		title: 'The robber',
		lede: 'A roll of seven pays nothing and sets the robber loose.',
		icon: TUT_ICON.robber,
		page: Robber
	},
	{
		id: 'dev',
		mode: 'classic',
		title: 'Development cards',
		lede: 'Face-down cards with knights, shortcuts and hidden points.',
		icon: PIXEL.dev,
		page: DevCards
	},
	{
		id: 'bonus',
		mode: 'classic',
		title: 'Bonus points',
		lede: 'Two titles worth two points each change hands during the game.',
		icon: PIXEL.star,
		page: Bonus
	},
	{
		id: 'online',
		mode: 'classic',
		title: 'Online play',
		lede: 'Rooms, bots, the turn timer, pausing and the controls.',
		icon: PIXEL.house,
		page: Online
	},
	{
		id: 'extended',
		mode: 'extended',
		title: 'What changes',
		lede: 'Reign Extended keeps every Classic rule and lets the host reshape the game.',
		icon: PIXEL.crown,
		page: Overview
	},
	{
		id: 'characters',
		mode: 'extended',
		title: 'Characters',
		lede: 'Every player plays a character whose trait bends one rule in their favor.',
		icon: TUT_ICON.mask,
		page: Characters
	},
	{
		id: 'maps',
		mode: 'extended',
		title: 'Islands',
		lede: 'Play on bigger and stranger islands than the classic nineteen tiles.',
		icon: TUT_ICON.scroll,
		page: Maps
	},
	{
		id: 'mapmaker',
		mode: 'extended',
		title: 'Map maker',
		lede: 'Draw your own island, save it and share it with a code.',
		icon: TUT_ICON.pen,
		page: MapMaker
	}
];

export function chaptersOf(mode: GameMode): Chapter[] {
	return CHAPTERS.filter((c) => c.mode === mode);
}
