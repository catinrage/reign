/**
 * The loading screen. It is drawn by index.html itself, so it shows from the first paint; the
 * page's own script moves the bar (see there). The steps below report how far loading really is,
 * and `bootDone` fades the screen away once the first menu is fully drawn behind it.
 */
type Boot = {
	step(reached: number, upTo: number, label?: string): void;
	label(aria: string): void;
	done(): void;
};

const boot = (window as unknown as { __boot?: Boot }).__boot;

/** Loading has reached `reached` (0 to 1); the step that starts now ends at `upTo`. */
export function bootStep(reached: number, upTo: number, label?: string): void {
	boot?.step(reached, upTo, label);
}

/** The name screen readers give the bar, once the language is known. */
export function bootLabel(aria: string): void {
	boot?.label(aria);
}

/** Fill the bar and fade into the game. */
export function bootDone(): void {
	boot?.done();
}

/** Resolves once the browser has drawn a frame, so a new label shows before blocking work starts. */
export function nextPaint(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** Resolves when `test` holds, checking every 50 ms, or after `timeout` ms regardless. */
export function until(test: () => boolean, timeout: number): Promise<void> {
	return new Promise((resolve) => {
		const start = performance.now();
		const check = () => {
			if (test() || performance.now() - start > timeout) resolve();
			else setTimeout(check, 50);
		};
		check();
	});
}
