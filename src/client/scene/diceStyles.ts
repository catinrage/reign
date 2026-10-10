import type { DiceStyleId } from '../../shared/accounts';

/**
 * How each style of dice looks, for the voxel dice on the table (`dieModel`) and the little
 * faces in the interface (`dieFace`). Every style keeps a strong light/dark split between the
 * body and the spots, so the roll reads from across the table, at night and on Low graphics.
 */
export interface DiceLook {
	/** The body, picked per voxel for a little texture. */
	body: string[];
	/** The body in stripes rather than speckles (wood grain). */
	grain?: boolean;
	/** A ring just inside each face's edges, clear of the spots. */
	trim?: string;
	/** The spots of 2 to 6. */
	pip: string;
	/** The spots glow (they light themselves, so they read in the dark). */
	pipGlow?: boolean;
	/** The 1. */
	one: string;
	oneGlow?: boolean;
	/** The 1 as a 6×6 picture ('#' filled), or none for one big round spot. */
	mark?: string[];
	/** The dark rim round the little interface faces. */
	rim: string;
	/** Lights the die a little from within, so darker dice still read at night (see `lift`). */
	lift?: number;
}

const CROWN = ['#.##.#', '#.##.#', '######', '######', '......', '######'];
const FLAME = ['..#...', '..##..', '.###..', '.####.', '######', '.####.'];
const FLAKE = ['#.##.#', '.####.', '..##..', '..##..', '.####.', '#.##.#'];
const LEAF = ['....##', '..####', '.#####', '.####.', '####..', '#.....'];
const COIN = ['.####.', '######', '######', '######', '######', '.####.'];
const SKULL = ['.####.', '######', '#..#..', '######', '.####.', '.#.#.#'];
const STAR = ['..##..', '..##..', '######', '.####.', '.####.', '##..##'];

export const DICE_LOOKS: Record<DiceStyleId, DiceLook> = {
	// The dice the game always had: white, near-black spots, a red 1.
	classic: { body: ['#f7f2e6'], pip: '#1c1411', one: '#d3281c', rim: '#2a1a10' },
	// A king's dice: purple with gold spots and a crown for the 1.
	royal: {
		body: ['#5b2a86', '#62308f', '#552679'],
		pip: '#ffd65e',
		one: '#ffd65e',
		mark: CROWN,
		rim: '#1e0b30',
		lift: 0.3
	},
	// Dragon's dice: charcoal with glowing embers for spots and a flame for the 1.
	dragonfire: {
		body: ['#2b2523', '#332b28', '#252020'],
		trim: '#6a2414',
		pip: '#ff8a2a',
		pipGlow: true,
		one: '#ffd04a',
		oneGlow: true,
		mark: FLAME,
		rim: '#0e0908'
	},
	// Ice: frosted blue, deep blue spots and a snowflake for the 1.
	frost: {
		body: ['#9fd3f0', '#a9d9f3', '#94cbeb'],
		pip: '#11294d',
		one: '#1f62c4',
		mark: FLAKE,
		rim: '#0f2440',
		lift: 0.15
	},
	// Carved oak: grained wood, spots burnt in, a green leaf for the 1.
	woodland: {
		body: ['#c99a62', '#d4a66d', '#bd8d56'],
		grain: true,
		trim: '#8a5a2e',
		pip: '#2b180b',
		one: '#2f8a2a',
		mark: LEAF,
		rim: '#2b180b',
		lift: 0.2
	},
	// The sea: deep teal, foam-white spots, a gold doubloon for the 1.
	tide: {
		body: ['#1f7d8c', '#23889a', '#1b7282'],
		pip: '#f4fbff',
		one: '#ffcb3a',
		mark: COIN,
		rim: '#082c33',
		lift: 0.25
	},
	// The crypt: mossy tomb stone, bone-white spots and a ghostly glowing skull for the 1.
	crypt: {
		body: ['#4b514b', '#555b54', '#454a45', '#4e5a4a'],
		trim: '#3b403b',
		pip: '#ece2c6',
		one: '#7dff9a',
		oneGlow: true,
		mark: SKULL,
		rim: '#141714',
		lift: 0.35
	},
	// The night sky: midnight blue, glowing starlight spots and a golden star for the 1.
	starlight: {
		body: ['#1d2350', '#222a5c', '#1a1f48'],
		trim: '#4656a8',
		pip: '#d8e8ff',
		pipGlow: true,
		one: '#ffd75e',
		oneGlow: true,
		mark: STAR,
		rim: '#090b22'
	}
};

/** Whether cell (u, w) of a 6×6 picture is filled; (0, 0) is its top left. */
export function markAt(mark: string[], u: number, w: number) {
	return mark[w]?.[u] === '#';
}
