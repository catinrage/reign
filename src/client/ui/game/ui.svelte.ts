import type { BuildKind } from '../../../shared/rules/config';
import type { BoardSpot } from '../../scene/gameScene';

/** Local interface state that isn't part of the game (open panels, build mode). */
class UiState {
	/** What a click on the board builds; 'tearDown' picks one of your workshops to tear down. */
	build = $state<Exclude<BuildKind, 'devCard'> | 'tearDown' | null>(null);
	trade = $state(false);
	flash = $state(false);
	logOpen = $state(typeof window === 'undefined' || window.innerWidth > 900);
	/** The in-game menu (pauses a game vs bots). */
	menu = $state(false);
	/** The piece on the board whose tooltip shows: under the mouse, or tapped on a touch screen. */
	piece = $state<{ spot: BoardSpot; tap: boolean } | null>(null);
}

export const ui = new UiState();
