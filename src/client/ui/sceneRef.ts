import type { GameScene } from '../scene/gameScene';

/** The single 3D scene, shared with interface components. */
export const sceneRef: { current: GameScene | null } = { current: null };
