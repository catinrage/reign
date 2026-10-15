/**
 * Holds a render loop to at most `maxFps` frames a second (0: every frame the screen shows),
 * keeping to the cap's own beat rather than the screen's, so a cap the screen's rate doesn't
 * divide (60 on a 144 Hz screen) still holds on average.
 */
export class FrameCap {
	maxFps = 0;
	private last = 0;

	/** Whether to draw the frame the screen offers at `now` (ms, as requestAnimationFrame gives it). */
	due(now: number): boolean {
		if (this.maxFps <= 0) return true;
		const interval = 1000 / this.maxFps;
		const since = now - this.last;
		// A little slack, so a cap at the screen's own rate doesn't skip every other frame.
		if (since < interval - 2) return false;
		this.last = since >= interval ? now - (since % interval) : now;
		return true;
	}
}
