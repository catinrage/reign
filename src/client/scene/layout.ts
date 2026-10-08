/** World layout. One world unit is one board micro-voxel. */

/** Hex circumradius in voxels. */
export const HEX_R = 12;
/** Top face height of flat land. */
export const LAND_Y = 4;
/** Top face height of the sea. */
export const SEA_Y = 2;
/** Table surface. */
export const TABLE_Y = 0;

export const PLAYER_RGB: Record<string, number> = {
	red: 0xd8352a,
	blue: 0x2c5fd6,
	yellow: 0xf2c12e,
	green: 0x2f9a3a,
	white: 0xe9e4da,
	orange: 0xec7a22
};

export const PLAYER_CSS: Record<string, string> = Object.fromEntries(
	Object.entries(PLAYER_RGB).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`])
);

export function toWorld(p: { x: number; z: number }) {
	return { x: p.x * HEX_R, z: p.z * HEX_R };
}
