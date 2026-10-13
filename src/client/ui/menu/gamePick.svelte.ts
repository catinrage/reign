import { isGameKind, type GameKind } from '../../../shared/games';

const KEY = 'reign:game';

function remembered(): GameKind {
	try {
		const g = localStorage.getItem(KEY);
		return isGameKind(g) ? g : 'settlement';
	} catch {
		return 'settlement';
	}
}

/** The game picked on the main menu: what Play vs bots and Create a room start. Kept between visits. */
class GamePick {
	game = $state<GameKind>(typeof window === 'undefined' ? 'settlement' : remembered());

	set(g: GameKind) {
		this.game = g;
		try {
			localStorage.setItem(KEY, g);
		} catch {
			// Private windows can refuse storage: the pick lasts this visit.
		}
	}
}

export const gamePick = new GamePick();
