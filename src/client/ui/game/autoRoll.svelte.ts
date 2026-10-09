/**
 * Auto roll: when this player's turn comes to its roll, the dice roll by themselves after a short
 * wait (`AUTO_ROLL_MS`), which leaves time to play a Knight or a character power first. The
 * switch is this browser's, like the other settings.
 */

const KEY = 'reign:autoRoll';

/** How long the Roll dice button waits before rolling by itself. */
export const AUTO_ROLL_MS = 2200;

function read(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

class AutoRoll {
	on = $state(read());

	set(on: boolean) {
		this.on = on;
		try {
			localStorage.setItem(KEY, on ? '1' : '0');
		} catch {
			/* private mode */
		}
	}
}

export const autoRoll = new AutoRoll();
