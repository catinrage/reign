// Returns the number of dice combinations that result in the given value
export function getDiceComboCount(value: number): number {
	const combos: Record<number, number> = {
		2: 1,
		3: 2,
		4: 3,
		5: 4,
		6: 5,
		7: 6,
		8: 5,
		9: 4,
		10: 3,
		11: 2,
		12: 1
	};
	return combos[value] || 0;
}
