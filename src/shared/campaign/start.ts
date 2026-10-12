import { generateBoard, generateStandardBoard } from '../board/generate';
import { mapTiles } from '../board/maps';
import { CHARACTER_INFO, type CharacterId } from '../rules/characters';
import { RESOURCES, type PlayerColor, type ResourceCounts } from '../rules/config';
import { createGame, type NewPlayer } from '../rules/engine';
import { DEFAULT_SETTINGS, pieceLimits, type GameSettings } from '../rules/modes';
import type { CampaignState } from '../rules/campaign';
import type { GameState } from '../rules/types';
import type { Mission } from './missions';

/** A seat at a mission's table: the hero, or a rival by character. */
export interface MissionSeat {
	name: string;
	color: PlayerColor;
	isBot: boolean;
	/** Who a rival is (null for the hero). */
	cast: CharacterId | null;
}

/**
 * The table for a mission, in playing order: the hero where the mission seats them (by lot unless
 * it says first or last) and the rivals under their characters' names, in the colors left.
 */
export function missionSeats(
	m: Mission,
	hero: { name: string; color: PlayerColor },
	colors: readonly PlayerColor[],
	random = Math.random
): MissionSeat[] {
	const free = colors.filter((c) => c !== hero.color);
	const rivals: MissionSeat[] = m.rivals.map((r, i) => ({
		name: CHARACTER_INFO[r.character].name,
		color: free[i % free.length],
		isBot: true,
		cast: r.character
	}));
	const at = m.hero?.seat === 'first' ? 0 : m.hero?.seat === 'last' ? rivals.length : Math.floor(random() * (rivals.length + 1));
	const seats = [...rivals];
	seats.splice(at, 0, { name: hero.name, color: hero.color, isBot: false, cast: null });
	return seats;
}

/** The game settings a mission plays with. */
export function missionSettings(m: Mission): GameSettings {
	return {
		...structuredClone(DEFAULT_SETTINGS),
		// Characters come from the story, never from a draft.
		characters: false,
		...structuredClone(m.settings ?? {}),
		mode: m.mode,
		map: m.map ?? DEFAULT_SETTINGS.map,
		pointsToWin: m.points
	};
}

/** Whether characters bring their traits (and powers) to the game, rather than only their faces. */
export function missionTraits(m: Mission): boolean {
	return m.mode === 'extended' && !!m.hero?.character;
}

/**
 * Deal a mission's game for these seats (from missionSeats). The island comes from the mission's
 * own seed, so it is the same every attempt; the dice and decks from `seed`.
 */
export function createMissionGame(m: Mission, seats: MissionSeat[], seed: number): GameState {
	const settings = missionSettings(m);
	const tiles = m.mode === 'extended' ? mapTiles(settings.map) : null;
	const island = { rng: m.seed | 0 };
	const board = tiles ? generateBoard(tiles, island) : generateStandardBoard(island);
	const traits = missionTraits(m);
	const hero = seats.findIndex((s) => !s.isBot);
	const players: NewPlayer[] = seats.map((s) => ({
		name: s.name,
		color: s.color,
		isBot: s.isBot,
		character: traits ? (s.isBot ? s.cast : m.hero!.character!) : null
	}));
	const g = createGame(players, seed, board, settings);
	// Classic missions play to their own goal too, with the pieces to reach it.
	g.pointsToWin = m.points;
	if (m.points > 10) for (const p of g.players) p.piecesLeft = pieceLimits(m.points);
	g.mapName = m.place;
	const rivalAt = (i: number) => seats.findIndex((s) => s.isBot && s.cast === m.rivals[i].character);
	const give = (p: number, cards: Partial<ResourceCounts> | undefined) => {
		for (const r of RESOURCES) {
			const n = Math.min(cards?.[r] ?? 0, g.bank[r]);
			g.bank[r] -= n;
			g.players[p].resources[r] += n;
		}
	};
	give(hero, m.hero?.start);
	m.rivals.forEach((r, i) => {
		const p = rivalAt(i);
		give(p, r.start);
		for (let k = 0; k < (r.vp ?? 0); k++) {
			// The card comes out of the deck, so the deck still holds what it says it does.
			const at = g.devDeck.lastIndexOf('victoryPoint');
			if (at >= 0) g.devDeck.splice(at, 1);
			g.players[p].devCards.push({ type: 'victoryPoint', boughtTurn: 0 });
		}
	});
	const bossIndex = m.rivals.findIndex((r) => r.boss);
	const boss = bossIndex >= 0 ? rivalAt(bossIndex) : null;
	const campaign: CampaignState = {
		mission: m.id,
		hero,
		cast: seats.map((s) => s.cast),
		boss,
		bans: [...(m.bans ?? [])],
		roundLimit: m.roundLimit ?? 0,
		tribute: m.tribute
			? {
					every: m.tribute.every,
					to: m.tribute.all ? seats.flatMap((s, i) => (s.isBot ? [i] : [])) : boss !== null ? [boss] : []
				}
			: null,
		goals: structuredClone(m.goals),
		fired: [],
		outOfTime: false
	};
	g.campaign = campaign;
	return g;
}
