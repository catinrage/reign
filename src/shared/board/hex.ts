/**
 * Pointy-top hex math in axial coordinates. One unit is the hex circumradius
 * (center to corner); renderers scale these positions to their own world units.
 */
export interface Axial {
	q: number;
	r: number;
}

export const SQRT3 = Math.sqrt(3);

export const AXIAL_DIRECTIONS: readonly Axial[] = [
	{ q: 1, r: 0 },
	{ q: 1, r: -1 },
	{ q: 0, r: -1 },
	{ q: -1, r: 0 },
	{ q: -1, r: 1 },
	{ q: 0, r: 1 }
];

export function hexKey(h: Axial): string {
	return `${h.q},${h.r}`;
}

export function hexToWorld(h: Axial): { x: number; z: number } {
	return { x: SQRT3 * (h.q + h.r / 2), z: 1.5 * h.r };
}

/** Corner i of a pointy-top hex of radius 1, starting at the top-right corner going clockwise on screen. */
export function hexCorner(h: Axial, i: number): { x: number; z: number } {
	const c = hexToWorld(h);
	const angle = (Math.PI / 180) * (60 * i - 90);
	return { x: c.x + Math.cos(angle), z: c.z + Math.sin(angle) };
}

export function hexDistance(a: Axial, b: Axial): number {
	return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function hexNeighbors(h: Axial): Axial[] {
	return AXIAL_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/** All hexes within `radius` of the origin, ordered row by row (top to bottom, left to right). */
export function hexesInRadius(radius: number): Axial[] {
	const out: Axial[] = [];
	for (let r = -radius; r <= radius; r++) {
		for (let q = -radius; q <= radius; q++) {
			if (hexDistance({ q, r }, { q: 0, r: 0 }) <= radius) out.push({ q, r });
		}
	}
	return out;
}

/** Fractional world position to the axial hex that contains it. */
export function worldToHex(x: number, z: number): Axial {
	const q = (SQRT3 / 3) * x - z / 3;
	const r = (2 / 3) * z;
	return axialRound(q, r);
}

export function axialRound(qf: number, rf: number): Axial {
	const sf = -qf - rf;
	let q = Math.round(qf);
	let r = Math.round(rf);
	const s = Math.round(sf);
	const dq = Math.abs(q - qf);
	const dr = Math.abs(r - rf);
	const ds = Math.abs(s - sf);
	if (dq > dr && dq > ds) q = -r - s;
	else if (dr > ds) r = -q - s;
	return { q: q + 0, r: r + 0 };
}
