import { sceneRef } from '../sceneRef';

/** Wide screens put menus on the left and slide the island to the right to stay in view. */
export const SIDE_QUERY = '(min-width: 1100px) and (min-aspect-ratio: 4/3)';

export function sideLayout(): () => void {
	const mq = matchMedia(SIDE_QUERY);
	const apply = () => sceneRef.current?.setLensShift(mq.matches ? 0.16 : 0);
	apply();
	mq.addEventListener('change', apply);
	return () => {
		mq.removeEventListener('change', apply);
		sceneRef.current?.setLensShift(0);
	};
}
