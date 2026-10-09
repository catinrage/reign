import { sceneRef } from '../sceneRef';

/** Wide screens put menus on the left and slide the island to the right to stay in view. */
export const SIDE_QUERY = '(min-width: 1100px) and (min-aspect-ratio: 4/3)';

/**
 * `shift` is how far over the island slides, as a share of the screen width. A function is asked
 * again whenever the window resizes.
 */
export function sideLayout(shift: number | (() => number) = 0.16): () => void {
	const mq = matchMedia(SIDE_QUERY);
	const apply = () =>
		sceneRef.current?.setLensShift(mq.matches ? (typeof shift === 'number' ? shift : shift()) : 0);
	apply();
	mq.addEventListener('change', apply);
	window.addEventListener('resize', apply);
	return () => {
		mq.removeEventListener('change', apply);
		window.removeEventListener('resize', apply);
		sceneRef.current?.setLensShift(0);
	};
}
