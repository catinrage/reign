import { GAME_KINDS, type GameKind } from '../../../shared/games';
import { CONQUEST_MAX_PLAYERS } from '../../../shared/conquest/types';
import { GAMBIT_MAX_PLAYERS, GAMBIT_MIN_PLAYERS } from '../../../shared/gambit/types';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../../shared/protocol';
import { msg } from '../../i18n/index.svelte';
import { CQ_PIXEL } from '../conquest/icons';
import { GB_PIXEL } from '../gambit/icons';
import { PIXEL } from '../pixel';

/**
 * The games on the main menu, as their boxes show them: what each is called and is about, how
 * many play it, its pictures and its colors. A new game is a new entry here (and in GAME_KINDS).
 */
export interface GameInfo {
	id: GameKind;
	name: string;
	/** Three words for what you do in it, on the ribbon under the title. */
	motto: [string, string, string];
	/** What it is, in a sentence. */
	blurb: string;
	/** What sets it apart, a few words each. */
	features: string[];
	players: [number, number];
	/** Its picture, small. */
	icon: string;
	/** Its box's picture: a big piece between two small ones. */
	cover: [string, string, string];
	/** Its box's colors: the top and bottom of the picture, and a light for its edges. */
	theme: { top: string; bottom: string; glow: string };
}

export const GAMES: GameInfo[] = [
	{
		id: 'settlement',
		name: msg('Settlement'),
		motto: [msg('Settle'), msg('Trade'), msg('Build')],
		blurb: msg('Settle an island, trade and build. Classic, Reign Extended and the campaign.'),
		features: [msg('Trading'), msg('Island maps'), msg('Story campaign')],
		players: [MIN_PLAYERS, MAX_PLAYERS],
		icon: PIXEL.house,
		cover: [PIXEL.anchor, PIXEL.house, PIXEL.clover],
		theme: { top: '#3d8fb0', bottom: '#2f6b2a', glow: '#9ee07a' }
	},
	{
		id: 'conquest',
		name: msg('Conquest'),
		motto: [msg('Muster'), msg('Attack'), msg('Conquer')],
		blurb: msg('A war for the Realm: take territories with armies and dice, region by region.'),
		features: [msg('Dice battles'), msg('Random worlds'), msg('Secret missions')],
		players: [MIN_PLAYERS, CONQUEST_MAX_PLAYERS],
		icon: PIXEL.sword,
		cover: [CQ_PIXEL.footman, CQ_PIXEL.knight, CQ_PIXEL.catapult],
		theme: { top: '#b0402e', bottom: '#4a1a12', glow: '#ff9a6e' }
	},
	{
		id: 'gambit',
		name: msg('Gambit'),
		motto: [msg('Order'), msg('Reveal'), msg('Outwit')],
		blurb: msg('Up to eight players order their pieces in secret on a hex board, then every move plays out at once.'),
		features: [msg('Secret orders'), msg('Everyone moves at once'), msg('No dice')],
		players: [GAMBIT_MIN_PLAYERS, GAMBIT_MAX_PLAYERS],
		icon: GB_PIXEL.knight,
		cover: [GB_PIXEL.archer, GB_PIXEL.monarch, GB_PIXEL.knight],
		theme: { top: '#6a4cb8', bottom: '#241a4e', glow: '#c9aaff' }
	}
];

if (GAMES.length !== GAME_KINDS.length) throw new Error('Every game needs its entry in GAMES.');

export function gameInfo(id: GameKind): GameInfo {
	return GAMES.find((g) => g.id === id) ?? GAMES[0];
}

/** The box's colors as CSS custom properties, for a style attribute. */
export function gameTheme(g: GameInfo): string {
	return `--top:${g.theme.top};--bottom:${g.theme.bottom};--glow:${g.theme.glow}`;
}
