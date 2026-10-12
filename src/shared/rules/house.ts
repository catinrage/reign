import {
	BANK_PER_RESOURCE,
	BANK_PER_RESOURCE_HUGE,
	BANK_PER_RESOURCE_LARGE,
	DEV_CARDS,
	DEV_DECK,
	DEV_DECK_HUGE,
	DEV_DECK_LARGE,
	type DevCardType
} from './config';

/**
 * House rules, in both modes: how many cards of each resource the bank holds and how many of
 * each development card are in the deck. Null keeps the standard for the table, which grows with
 * the number of players (19 of each and 25 cards for four, 24 and 34 for five or six, 29 and 43
 * for seven or eight), so a standard bank still fits when players join or the map changes. A
 * number is the host's own choice and stays as set.
 */
export interface HouseRules {
	/** Cards of each resource in the bank, or null for the standard bank. */
	bank: number | null;
	/** How many of each development card, or null for the standard deck. */
	deck: DevDeck | null;
}

export type DevDeck = Record<DevCardType, number>;

export const STANDARD_HOUSE_RULES: HouseRules = { bank: null, deck: null };

/** The bank can hold this many of each resource. */
export const BANK_MIN = 10;
export const BANK_MAX = 40;
/** The most of each development card a deck can hold (none of any is fine, but not an empty deck). */
export const DECK_MAX: DevDeck = { knight: 40, roadBuilding: 12, yearOfPlenty: 12, monopoly: 12, victoryPoint: 12 };

/** The standard bank: 19 of each resource for up to four players, more for bigger tables. */
export function standardBank(players: number): number {
	return players > 6 ? BANK_PER_RESOURCE_HUGE : players > 4 ? BANK_PER_RESOURCE_LARGE : BANK_PER_RESOURCE;
}

/** The standard deck for this many players (a copy). */
export function standardDeck(players: number): DevDeck {
	return { ...(players > 6 ? DEV_DECK_HUGE : players > 4 ? DEV_DECK_LARGE : DEV_DECK) };
}

/** The bank this game starts with. */
export function bankFor(house: HouseRules | undefined, players: number): number {
	return house?.bank ?? standardBank(players);
}

/** The deck this game starts with. */
export function deckFor(house: HouseRules | undefined, players: number): DevDeck {
	return house?.deck ? { ...house.deck } : standardDeck(players);
}

export function deckSize(deck: DevDeck): number {
	return DEV_CARDS.reduce((n, c) => n + deck[c], 0);
}

function whole(n: unknown, min: number, max: number): n is number {
	return Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
}

/**
 * House rules as the host sent them, checked: every number whole and in range, and at least one
 * card in the deck. A string says what's wrong.
 */
export function cleanHouseRules(x: unknown): HouseRules | string {
	const h = (x ?? {}) as Partial<HouseRules>;
	if (typeof h !== 'object') return 'Those house rules make no sense.';
	const bank = h.bank ?? null;
	if (bank !== null && !whole(bank, BANK_MIN, BANK_MAX)) {
		const [least, most] = [BANK_MIN, BANK_MAX];
		return `The bank holds ${least} to ${most} of each resource.`;
	}
	if (h.deck == null) return { bank, deck: null };
	if (typeof h.deck !== 'object') return 'Those house rules make no sense.';
	const deck = {} as DevDeck;
	for (const c of DEV_CARDS) {
		const n = (h.deck as Partial<DevDeck>)[c];
		if (!whole(n, 0, DECK_MAX[c])) return 'A development card count is out of range.';
		deck[c] = n;
	}
	if (!deckSize(deck)) return 'Keep at least one card in the development deck.';
	return { bank, deck };
}

/** Whether these are the standard house rules. */
export function isStandard(house: HouseRules | undefined): boolean {
	return !house || (house.bank === null && house.deck === null);
}
