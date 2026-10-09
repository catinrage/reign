/** World layout, in world units. Pieces, tokens and dice are built at one voxel per unit. */

/** Hex circumradius. */
export const HEX_R = 12;
/** Size of one terrain micro-voxel: the island is built 20 voxels per hex radius. */
export const VOXEL = 0.6;
/** Top of the sea (four micro-voxels of water). */
export const SEA_Y = 4 * VOXEL;
/** Table surface. */
export const TABLE_Y = 0;

export const PLAYER_RGB: Record<string, number> = {
	red: 0xd8352a,
	blue: 0x2c5fd6,
	yellow: 0xf2c12e,
	green: 0x2f9a3a,
	white: 0xe9e4da,
	orange: 0xec7a22,
	purple: 0x8a3fd6,
	pink: 0xf06aae
};

export const PLAYER_CSS: Record<string, string> = Object.fromEntries(
	Object.entries(PLAYER_RGB).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`])
);

export function toWorld(p: { x: number; z: number }) {
	return { x: p.x * HEX_R, z: p.z * HEX_R };
}
