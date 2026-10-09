import type { BuildKind } from '../../../shared/rules/config';
import type { BoardSpot } from '../../scene/gameScene';

/**
 * Where using a character's power has got to: its dialog is open, the player is picking its spot
 * on the board (`first`: the Cartographer's first tile), or the Alchemist is choosing a terrain.
 */
export type PowerFlow = { stage: 'dialog' } | { stage: 'pick'; first?: number } | { stage: 'terrain'; hex: number };

/** Local interface state that isn't part of the game (open panels, build mode). */
class UiState {
	/** What a click on the board builds; 'tearDown' picks one of your workshops to tear down. */
	build = $state<Exclude<BuildKind, 'devCard'> | 'tearDown' | null>(null);
	/** The build panel shows the city paths (a castle, a guild hall, a fortress) instead of the builds. */
	paths = $state(false);
	trade = $state(false);
	power = $state<PowerFlow | null>(null);
	flash = $state(false);
	logOpen = $state(typeof window === 'undefined' || window.innerWidth > 900);
	/** The in-game menu (pauses a game vs bots). */
	menu = $state(false);
	/** The piece on the board whose tooltip shows: under the mouse, or tapped on a touch screen. */
	piece = $state<{ spot: BoardSpot; tap: boolean } | null>(null);
}

export const ui = new UiState();
