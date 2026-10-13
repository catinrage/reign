/**
 * The chance an all-out attack takes a territory: the attacker rolls as many dice as they can (up
 * to three, keeping one army behind), the defender up to two, ties to the defender, until the
 * territory falls or the attacker has a single army left.
 */

/** One throw: [attacker loses everything compared, split, defender loses everything compared]. */
const THROW: Record<string, [number, number, number]> = {
	'1-1': [21 / 36, 0, 15 / 36],
	'2-1': [91 / 216, 0, 125 / 216],
	'3-1': [441 / 1296, 0, 855 / 1296],
	'1-2': [161 / 216, 0, 55 / 216],
	'2-2': [581 / 1296, 420 / 1296, 295 / 1296],
	'3-2': [2275 / 7776, 2611 / 7776, 2890 / 7776]
};

const cache = new Map<string, number>();

/** The chance `attackers` armies (all of them on the territory) take one held by `defenders`. */
export function winChance(attackers: number, defenders: number): number {
	const a = attackers - 1;
	if (a <= 0) return 0;
	if (defenders <= 0) return 1;
	if (a > 60 || defenders > 60) return a > defenders * 1.4 ? 0.99 : a < defenders * 0.6 ? 0.01 : 0.5;
	const key = `${a}:${defenders}`;
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const ad = Math.min(3, a);
	const dd = Math.min(2, defenders);
	const [lose, split, win] = THROW[`${ad}-${dd}`];
	const both = Math.min(ad, dd);
	let p: number;
	if (both === 1) p = lose * winChance(a, defenders) + win * winChance(a + 1, defenders - 1);
	else
		p =
			lose * winChance(a - 1, defenders) +
			split * winChance(a, defenders - 1) +
			win * winChance(a + 1, defenders - 2);
	cache.set(key, p);
	return p;
}
