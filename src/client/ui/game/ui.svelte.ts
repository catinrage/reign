import type { BuildKind } from '../../../shared/rules/config';

/** Local interface state that isn't part of the game (open panels, build mode). */
class UiState {
	build = $state<Exclude<BuildKind, 'devCard'> | null>(null);
	trade = $state(false);
	flash = $state(false);
	logOpen = $state(typeof window === 'undefined' || window.innerWidth > 900);
	rolling = $state(false);
}

export const ui = new UiState();
