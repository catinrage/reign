import { missionById, type Beat, type CampaignGoal } from '../campaign/missions';
import { randomInt } from '../rng';
import type { CharacterId } from './characters';
import { RESOURCES, type Resource } from './config';
import { roundOf } from './events';
import { publicPoints, workshopCount } from './queries';
import type { Action, GameEvent, GameState, GameView } from './types';

/**
 * The solo campaign's rules on top of a game: what the player in the hero's seat may not do, how
 * many rounds they have, the cards of tribute rivals take, and the story beats the rivals and the
 * narrator speak as the game goes. The missions themselves are data, in ../campaign/missions.ts.
 */

/** Things a mission can forbid the hero (only the hero: the rivals play by the usual rules). */
export const CAMPAIGN_BANS = ['devCards', 'bankTrade', 'playerTrade'] as const;
export type CampaignBan = (typeof CAMPAIGN_BANS)[number];

export const BAN_TEXT: Record<CampaignBan, { name: string; text: string }> = {
	devCards: { name: 'No development cards', text: "You can't buy development cards." },
	bankTrade: { name: 'No bank trades', text: "You can't trade with the bank or at harbors." },
	playerTrade: { name: 'No trading with players', text: "You can't offer trades or accept anyone's." }
};

export interface CampaignState {
	mission: string;
	/** The seat of the player the campaign is for. */
	hero: number;
	/** Who each seat is in the story: a rival's character (also in Classic, for the portraits); null for the hero. */
	cast: (CharacterId | null)[];
	/** The rival the mission is about, or null. */
	boss: number | null;
	bans: CampaignBan[];
	/** The hero must win by the end of this round (0: no limit). */
	roundLimit: number;
	/** Every this many rounds these seats take a card of tribute from the bank. */
	tribute: { every: number; to: number[] } | null;
	goals: CampaignGoal[];
	/** Beats (indexes into the mission's list) already spoken. */
	fired: number[];
	/** The hero ran out of rounds, and the game ended there. */
	outOfTime: boolean;
}

/** What the hero may not do with this action under the mission's rules; null when it's allowed. */
export function campaignBan(s: Pick<GameState, 'campaign'>, p: number, a: Action): string | null {
	const c = s.campaign;
	if (!c || p !== c.hero || !c.bans.length) return null;
	const banned = (b: CampaignBan) => c.bans.includes(b);
	if (a.type === 'buyDevCard' && banned('devCards')) return 'This mission forbids you development cards.';
	if (a.type === 'bankTrade' && banned('bankTrade')) return 'This mission forbids you trades with the bank.';
	if (banned('playerTrade')) {
		if (a.type === 'offerTrade' || a.type === 'confirmTrade' || (a.type === 'respondTrade' && a.accept)) {
			return 'This mission forbids you trading with players.';
		}
	}
	return null;
}

/** Whether a mission forbids this player something (the bots ask before they try). */
export function banned(s: Pick<GameState | GameView, 'campaign'>, p: number, ban: CampaignBan): boolean {
	const c = s.campaign;
	return !!c && c.hero === p && c.bans.includes(ban);
}

type Emit = (e: GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'seq'> : never) : never) => void;

function points(s: GameState, p: number): number {
	return publicPoints(s, p) + s.players[p].devCards.filter((c) => c.type === 'victoryPoint').length;
}

/** The round the game is in (1 from the first turn after setup). */
export function campaignRound(s: Pick<GameState | GameView, 'turn' | 'players'>): number {
	return roundOf(s.turn, s.players.length);
}

/**
 * A new round begins: rivals due tribute take a card each, and a hero out of rounds loses. Returns
 * true when the game ended here.
 */
export function campaignNewRound(s: GameState, emit: Emit): boolean {
	const c = s.campaign;
	if (!c || s.phase !== 'main') return false;
	const round = campaignRound(s);
	if (c.roundLimit && round > c.roundLimit) {
		c.outOfTime = true;
		// The rival furthest ahead takes the island (the boss, on a tie).
		const rivals = s.players.map((_, i) => i).filter((i) => i !== c.hero);
		const best = Math.max(...rivals.map((i) => points(s, i)));
		const top = rivals.filter((i) => points(s, i) === best);
		const winner = c.boss !== null && top.includes(c.boss) ? c.boss : top[0];
		s.phase = 'ended';
		s.winner = winner;
		s.trade = null;
		emit({ type: 'gameOver', winner, points: s.players.map((_, i) => points(s, i)) });
		return true;
	}
	if (c.tribute && round > 1 && (round - 1) % c.tribute.every === 0) {
		for (const p of c.tribute.to) {
			const stocked = RESOURCES.filter((r) => s.bank[r] > 0);
			if (!stocked.length) break;
			const res: Resource = stocked[randomInt(s, stocked.length)];
			s.bank[res]--;
			s.players[p].resources[res]++;
			emit({ type: 'tribute', player: p, resource: res });
		}
	}
	return false;
}

/**
 * After every move: speak the story beats whose moment has come, each once. `events` are what
 * the move just did (who robbed whom).
 */
export function campaignBeats(s: GameState, events: GameEvent[], emit: Emit) {
	const c = s.campaign;
	if (!c || s.phase === 'draft' || s.phase === 'setup') return;
	const mission = missionById(c.mission);
	if (!mission) return;
	mission.beats.forEach((beat, i) => {
		if (c.fired.includes(i)) return;
		const who = beatMoment(s, beat, events);
		if (who === undefined) return;
		// The game is over: only an ending beat is still worth saying.
		if (s.phase === 'ended' && beat.when.on !== 'end') return;
		c.fired.push(i);
		emit({ type: 'campaignLine', speaker: speakerOf(c, beat, who), line: beat.line });
	});
}

/**
 * Whether a beat's moment has come: undefined if not; otherwise the seat it is about (the rival
 * who took the road, robbed the hero, ...), or null when it isn't about anyone.
 */
function beatMoment(s: GameState, beat: Beat, events: GameEvent[]): number | null | undefined {
	const c = s.campaign!;
	const w = beat.when;
	const rivals = s.players.map((_, i) => i).filter((i) => i !== c.hero);
	const round = campaignRound(s);
	switch (w.on) {
		case 'main':
			return s.phase === 'main' ? null : undefined;
		case 'round':
			return s.phase === 'main' && round >= w.n ? null : undefined;
		case 'roundsLeft':
			return s.phase === 'main' && c.roundLimit && c.roundLimit - round + 1 <= w.n ? null : undefined;
		case 'heroPoints':
			return points(s, c.hero) >= w.n ? null : undefined;
		case 'heroNear':
			return publicPoints(s, c.hero) >= s.pointsToWin - (w.n ?? 2) ? null : undefined;
		case 'rivalPoints': {
			const r = rivals.find((i) => publicPoints(s, i) >= w.n);
			return r ?? undefined;
		}
		case 'rivalNear': {
			const r = rivals.find((i) => publicPoints(s, i) >= s.pointsToWin - (w.n ?? 2));
			return r ?? undefined;
		}
		case 'longestRoad': {
			const h = s.longestRoadHolder;
			if (h === null) return undefined;
			return (w.who === 'hero') === (h === c.hero) ? h : undefined;
		}
		case 'largestArmy': {
			const h = s.largestArmyHolder;
			if (h === null) return undefined;
			return (w.who === 'hero') === (h === c.hero) ? h : undefined;
		}
		case 'heroRobbed': {
			const e = events.find((e) => e.type === 'stole' && e.victim === c.hero && e.thief !== c.hero);
			return e?.type === 'stole' ? e.thief : undefined;
		}
		case 'rivalRobbed': {
			const e = events.find((e) => e.type === 'stole' && e.thief === c.hero);
			return e?.type === 'stole' ? e.victim : undefined;
		}
		case 'heroCity':
			return s.buildings.some((b) => b?.owner === c.hero && b.kind === 'city') ? null : undefined;
		case 'tribute':
			return events.some((e) => e.type === 'tribute') ? (c.boss ?? null) : undefined;
		case 'event':
			return events.some((e) => e.type === 'eventDrawn') ? null : undefined;
		case 'power': {
			const e = events.find((e) => e.type === 'powerUsed' && (w.who === 'hero') === (e.player === c.hero));
			return e?.type === 'powerUsed' ? e.player : undefined;
		}
		case 'end':
			return s.phase === 'ended' && (w.won === undefined || w.won === (s.winner === c.hero)) ? null : undefined;
	}
}

/** The seat that says a beat, or null for the narrator. */
function speakerOf(c: CampaignState, beat: Beat, who: number | null): number | null {
	if (beat.speaker === 'narrator') return null;
	if (beat.speaker === 'boss') return c.boss;
	if (beat.speaker === 'them') return who === null || who === c.hero ? c.boss : who;
	// A rival by its character.
	const seat = c.cast.indexOf(beat.speaker);
	return seat >= 0 ? seat : null;
}

/** How a finished mission went: won or not, and which of its goals were met (only a win counts them). */
export interface MissionResult {
	won: boolean;
	outOfTime: boolean;
	goals: boolean[];
	/** One for the win and one for each goal met, 0 to 3. */
	stars: number;
	round: number;
}

export function missionResult(s: GameState | GameView): MissionResult | null {
	const c = s.campaign;
	if (!c || s.phase !== 'ended') return null;
	const won = s.winner === c.hero && !c.outOfTime;
	const round = campaignRound(s);
	const goals = c.goals.map((g) => won && goalMet(s, c.hero, g, round));
	return { won, outOfTime: c.outOfTime, goals, stars: won ? 1 + goals.filter(Boolean).length : 0, round };
}

/** Whether the hero has met a goal (judged at the end of the game, or as it goes for the HUD). */
export function goalMet(s: GameState | GameView, hero: number, g: CampaignGoal, round = campaignRound(s)): boolean {
	const stats = ('stats' in s ? s.stats?.players[hero] : undefined) ?? ('tally' in s && s.me === hero ? s.tally : undefined);
	switch (g.kind) {
		case 'rounds':
			return round <= g.max;
		case 'longestRoad':
			return s.longestRoadHolder === hero;
		case 'largestArmy':
			return s.largestArmyHolder === hero;
		case 'cities':
			return s.buildings.filter((b) => b?.owner === hero && b.kind === 'city').length >= g.n;
		case 'workshops':
			return workshopCount(s, hero) >= g.n;
		case 'lostAtMost':
			return !!stats && stats.lost <= g.n;
		case 'noDiscard':
			return !!stats && stats.discarded === 0;
	}
}
