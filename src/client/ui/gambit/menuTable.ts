import { PLAYER_COLORS } from '../../../shared/rules/config';
import { PLAYER_RGB } from '../../scene/layout';
import { sceneRef } from '../sceneRef';

/** The board the menu's table shows for Gambit: six seats in the first six colors, a new one each visit. */
const board = { terrain: 'mixed' as const, seed: (Math.random() * 1e9) | 0 };

export function showMenuGambit() {
	sceneRef.current?.showGambitTable(6, board, PLAYER_COLORS.slice(0, 6).map((c) => PLAYER_RGB[c] ?? 0xffffff));
}
