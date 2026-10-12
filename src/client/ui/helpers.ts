import { getTopology } from '../../shared/board/topology';
import {
	BUILDING_INFO,
	CASTLE_POINTS,
	CITY_PATHS,
	WORKSHOP_LIMIT,
	WORKSHOP_NAME,
	isCityPath,
	type CityPath,
	type ExtraBuilding
} from '../../shared/rules/buildings';
import {
	COSTS,
	DEV_CARD_LABEL,
	RESOURCES,
	RESOURCE_LABEL,
	TERRAIN_RESOURCE,
	hasResources,
	type BuildKind,
	type Resource,
	type ResourceCounts
} from '../../shared/rules/config';
import { banned } from '../../shared/rules/campaign';
import { CHARACTER_INFO, POWER_INFO } from '../../shared/rules/characters';
import { EVENT_INFO } from '../../shared/rules/events';
import {
	builtKey,
	citySpots,
	canPay,
	costOf,
	fortressOf,
	guildGoodsFor,
	harborUsers,
	paveSpots,
	pathSpots,
	pointsBreakdown,
	pointsOf,
	POINT_VALUE,
	type PointPart,
	roadSpots,
	settlementSpots,
	storehouseOf,
	storehouseSpots,
	tavernOf,
	tavernSpots,
	workshopCount,
	workshopSpots
} from '../../shared/rules/queries';
import type { BuiltKind, GameEvent, GameView } from '../../shared/rules/types';
import type { BoardSpot } from '../scene/gameScene';
import { PLAYER_CSS } from '../scene/layout';
import { t, tParts, tx } from '../i18n/index.svelte';
import { tint } from './art';
import { TERRAIN_NAME } from './extended/terrainColors';

export const RES_BG: Record<Resource, [string, string]> = {
	wood: ['#4f8f35', '#2f6a22'],
	brick: ['#d9693e', '#a8432a'],
	sheep: ['#a8d667', '#6fa83a'],
	wheat: ['#f6cb4a', '#d9951c'],
	ore: ['#a9adb6', '#6f737c']
};

export { RESOURCES, RESOURCE_LABEL, DEV_CARD_LABEL, COSTS, PLAYER_CSS };

export function playerColor(view: GameView | null, i: number): string {
	return PLAYER_CSS[view?.players[i]?.color ?? 'white'] ?? '#fff';
}

/** Relative luminance (0 black to 1 white) of a #rrggbb color. */
function luminance(hex: string): number {
	const lin = (k: number) => {
		const c = parseInt(hex.slice(k, k + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
}

const inkCache = new Map<string, string>();
/**
 * A player's color for their name written on the dark wood: lifted toward white just enough that
 * the darker colors (blue, red, green) read as easily as the light ones.
 */
export function playerInk(view: GameView | null, i: number): string {
	const hex = playerColor(view, i);
	let ink = inkCache.get(hex);
	if (!ink) {
		let lift = 0;
		while (lift < 0.6 && luminance(tint(hex, lift)) < 0.3) lift += 0.05;
		ink = tint(hex, lift);
		inkCache.set(hex, ink);
	}
	return ink;
}

export function canAfford(view: GameView, kind: BuildKind): boolean {
	// The Alchemist may pay Brick as Ore and Ore as Brick.
	return canPay(view, view.me, kind, view.players[view.me]?.resources);
}

/** Whether a build is possible right now (resources, pieces and a legal spot). */
export function buildAvailable(view: GameView, kind: BuildKind): boolean {
	if (view.me !== view.current || view.step !== 'main' || view.phase !== 'main') return false;
	if (!canAfford(view, kind)) return false;
	const p = view.players[view.me];
	switch (kind) {
		case 'road':
			return p.piecesLeft.road > 0 && roadSpots(view, view.me).length > 0;
		case 'settlement':
			return p.piecesLeft.settlement > 0 && settlementSpots(view, view.me, false).length > 0;
		case 'city':
			return p.piecesLeft.city > 0 && citySpots(view, view.me).length > 0;
		case 'devCard':
			return view.devDeckCount > 0 && !banned(view, view.me, 'devCards');
		case 'workshop':
			return workshopSpots(view, view.me).length > 0;
		case 'stoneRoad':
			return paveSpots(view, view.me).length > 0;
		case 'storehouse':
			return storehouseSpots(view, view.me).length > 0;
		case 'tavern':
			return tavernSpots(view, view.me).length > 0;
		case 'castle':
		case 'guildHall':
		case 'fortress':
			return pathSpots(view, view.me, kind).length > 0;
	}
}

/** Whether any of the city paths can be taken right now. */
export function pathAvailable(view: GameView): boolean {
	return CITY_PATHS.some((p) => view.buildingRules?.[p] && buildAvailable(view, p));
}

/** Your cities that haven't taken a path yet. */
export function openCities(view: GameView): number {
	return view.buildings.filter((b, v) => b?.owner === view.me && b.kind === 'city' && !view.cityPaths?.[v]).length;
}

/** How many more of a Reign Extended building this player can build. */
export function extraStock(view: GameView, kind: ExtraBuilding): number {
	if (kind === 'workshop') return WORKSHOP_LIMIT - workshopCount(view, view.me);
	if (kind === 'storehouse') return storehouseOf(view, view.me) === null ? 1 : 0;
	if (kind === 'tavern') return tavernOf(view, view.me) === null ? 1 : 0;
	if (isCityPath(kind)) {
		const open = openCities(view);
		if (kind === 'fortress') return fortressOf(view, view.me) === null ? Math.min(1, open) : 0;
		if (kind === 'guildHall') return Math.min(open, guildGoodsFor(view, view.me).length);
		return open;
	}
	return paveSpots(view, view.me).length;
}

/** Words in a list: "a, b and c". */
export function andList(parts: string[]): string {
	if (parts.length < 2) return parts[0] ?? '';
	let list = parts[0];
	for (const item of parts.slice(1, -1)) list = t('{list}, {item}', { list, item });
	return t('{list} and {item}', { list, item: parts[parts.length - 1] });
}

/** A list of cards in words: "1 Lumber, 1 Brick and 1 Ore". */
export function cardsText(r: Partial<ResourceCounts>): string {
	return andList(countsList(r).map((c) => t('{count} {resource}', { count: c.n, resource: t(RESOURCE_LABEL[c.res]) })));
}

/** Why a build can't be made right now, for its tooltip ('' when it can). */
export function buildNote(view: GameView, kind: BuildKind): string {
	if (kind === 'workshop') {
		if (workshopCount(view, view.me) >= WORKSHOP_LIMIT) return t('You have built all {limit} of your workshops.', { limit: WORKSHOP_LIMIT });
		if (!workshopSpots(view, view.me).length) return t('Every tile beside your buildings already has a workshop.');
	}
	if (kind === 'stoneRoad' && !paveSpots(view, view.me).length) return t('Every one of your roads is paved already.');
	if (kind === 'storehouse' && storehouseOf(view, view.me) !== null) return t('You already have a storehouse.');
	if (kind === 'tavern' && tavernOf(view, view.me) !== null) return t('You already have a tavern.');
	if (isCityPath(kind)) {
		if (kind === 'fortress' && fortressOf(view, view.me) !== null) return t('You already have a fortress.');
		if (kind === 'guildHall' && !guildGoodsFor(view, view.me).length) return t('You already trade every good at 2:1.');
		const why = pathsClosed(view);
		if (why) return why;
	}
	if (!canAfford(view, kind)) return t('You need {cards}.', { cards: cardsText(costOf(view, view.me, kind)) });
	return '';
}

/** Why none of your cities can take a path ('' when one can). */
export function pathsClosed(view: GameView): string {
	if (openCities(view)) return '';
	return view.buildings.some((b) => b?.owner === view.me && b.kind === 'city')
		? t('Every one of your cities has taken its path.')
		: t('A path is for a city: build one first.');
}

/** Why no city path can be taken right now, for the City path plaque ('' when one can). */
export function pathNote(view: GameView): string {
	if (pathAvailable(view)) return '';
	return pathsClosed(view) || t('You need the cards for one of them.');
}

/** The workshop a tile would get: a Mill on fields, a Kiln on hills... */
export function workshopName(view: GameView, hex: number): string {
	const res = TERRAIN_RESOURCE[view.board.hexes[hex]?.terrain ?? 'desert'];
	return res ? t(WORKSHOP_NAME[res]) : t('Workshop');
}

/** The log line for something built: "Ada built a road", "You built a Mill". */
function builtParts(view: GameView, kind: BuiltKind, at: number, player: LogPart, T: (text: string) => LogPart): LogPart[] {
	const slots = { player };
	switch (kind) {
		case 'road':
			return tParts('{player} built a road', slots, T);
		case 'settlement':
			return tParts('{player} built a settlement', slots, T);
		case 'city':
			return tParts('{player} built a city', slots, T);
		case 'stoneRoad':
			return tParts('{player} built a stone road', slots, T);
		case 'storehouse':
			return tParts('{player} built a storehouse', slots, T);
		case 'tavern':
			return tParts('{player} built a tavern', slots, T);
		case 'workshop':
			return tParts('{player} built a {workshop}', slots, T, { workshop: workshopName(view, at) });
		case 'castle':
			return tParts('{player} built a castle', slots, T);
		case 'guildHall':
			return tParts('{player} built a guild hall', slots, T);
		case 'fortress':
			return tParts('{player} built a fortress', slots, T);
	}
}

/** A piece's name, as its tooltip heads it: "Road", "City", "Mill". */
export function pieceName(view: GameView, kind: BuiltKind, at: number): string {
	switch (kind) {
		case 'workshop':
			return workshopName(view, at);
		case 'stoneRoad':
			return t('Stone road');
		case 'road':
			return t('Road');
		case 'settlement':
			return t('Settlement');
		case 'city':
			return t('City');
		case 'storehouse':
			return t('Storehouse');
		case 'tavern':
			return t('Tavern');
		case 'castle':
		case 'guildHall':
		case 'fortress':
			return t(BUILDING_INFO[kind].label);
	}
}

/** When a piece went up, in words: "during setup", "on turn 6" (null if the game never said). */
export function builtWhen(view: GameView, kind: BuiltKind, at: number): string | null {
	const turn = view.builtTurns?.[builtKey(kind, at)];
	if (turn === undefined) return null;
	return turn === 0 ? t('during setup') : t('on turn {turn}', { turn });
}

/**
 * What the tooltip of a piece on the board says: its name over who owns it and the turn it went
 * up on. A city also says when it was settled (and when it took its path, with what that path
 * does), a stone road when it was a plain road, and a building when its storehouse or tavern went
 * up (and, to the tavern's owner, the rumor heard there). Null when nothing stands on the spot.
 */
export function pieceTip(view: GameView, spot: BoardSpot): { head: string; text: string } | null {
	const { place, at } = spot;
	if (place === 'harbor') return harborTip(view, at);
	let owner: number | null | undefined;
	let kind: BuiltKind;
	let path: CityPath | null = null;
	if (place === 'vertex') {
		const b = view.buildings[at];
		owner = b?.owner;
		kind = b?.kind ?? 'settlement';
		if (kind === 'city') path = view.cityPaths?.[at] ?? null;
	} else if (place === 'edge') {
		owner = view.roads[at];
		kind = view.stoneRoads?.[at] ? 'stoneRoad' : 'road';
	} else {
		owner = view.workshops?.[at];
		kind = 'workshop';
	}
	if (owner === null || owner === undefined || !view.players[owner]) return null;
	const lines = [t('Owner: {player}', { player: name(view, owner) })];
	/** Adds a line for when piece `k` went up, if the game said: `say` words it for that turn (0: setup). */
	const when = (k: BuiltKind, say: (turn: number) => string) => {
		const turn = view.builtTurns?.[builtKey(k, at)];
		if (turn !== undefined) lines.push(say(turn));
	};
	const built = (turn: number) => (turn ? t('Built on turn {turn}', { turn }) : t('Built during setup'));
	if (kind === 'city') {
		when('settlement', (turn) => (turn ? t('Settled on turn {turn}', { turn }) : t('Settled during setup')));
		when('city', (turn) => (turn ? t('Became a city on turn {turn}', { turn }) : t('Became a city during setup')));
		if (path) when(path, (turn) => pathWhen(path, turn));
	} else if (kind === 'stoneRoad') {
		when('road', built);
		when('stoneRoad', (turn) => (turn ? t('Paved on turn {turn}', { turn }) : t('Paved during setup')));
	} else when(kind, built);
	if (place === 'vertex' && view.storehouses?.[at])
		when('storehouse', (turn) => (turn ? t('Storehouse added on turn {turn}', { turn }) : t('Storehouse added during setup')));
	if (place === 'vertex' && view.taverns?.[at]) {
		when('tavern', (turn) => (turn ? t('Tavern added on turn {turn}', { turn }) : t('Tavern added during setup')));
		// Only the tavern's owner hears its rumors.
		const rumor = owner === view.me ? view.events?.rumor : null;
		if (rumor) lines.push(t('Rumor: the next event is {event}', { event: t(EVENT_INFO[rumor].name) }));
	}
	if (path) lines.push(pathLine(view, path, at));
	return { head: pieceName(view, path ?? kind, at), text: lines.join('\n') };
}

/**
 * A harbor's name: "Wool harbor", or "Harbor for any resource". The rate is left to the line
 * under it, since the pixel face of tooltip heads makes a small 2 look like an 8.
 */
export function harborName(view: GameView, port: number): string {
	const kind = view.board.ports[port]?.kind;
	return !kind || kind === 'any' ? t('Harbor for any resource') : t('{resource} harbor', { resource: t(RESOURCE_LABEL[kind]) });
}

/**
 * A harbor's tooltip: what it trades, who trades there (or how to get it), and whether this
 * round's storm has closed it.
 */
export function harborTip(view: GameView, port: number): { head: string; text: string } | null {
	const kind = view.board.ports[port]?.kind;
	if (!kind) return null;
	const lines = [
		kind === 'any'
			? t('Trade 3 cards of any one resource for 1 card of your choice.')
			: t('Trade 2 {resource} for 1 card of your choice.', { resource: t(RESOURCE_LABEL[kind]) })
	];
	const users = harborUsers(view, port);
	if (!users.length) lines.push(t('Free: build a settlement on one of its two corners to trade here.'));
	else if (users.includes(view.me) && users.length === 1) lines.push(t('Yours: you trade here.'));
	else {
		const list = users
			.map((i) => (i === view.me ? t('you') : name(view, i)))
			.reduce((list, next) => t('{list}, {next}', { list, next }));
		lines.push(t('Traded at by: {players}', { players: list }));
	}
	if (view.events?.current === 'stormAtSea') lines.push(t('Closed this round by the Storm at Sea.'));
	return { head: harborName(view, port), text: lines.join('\n') };
}

/** When a city took its path, for its tooltip (a path is only ever taken on a turn, never in setup). */
function pathWhen(path: CityPath, turn: number): string {
	if (path === 'castle') return t('Became a castle on turn {turn}', { turn });
	if (path === 'guildHall') return t('Became a guild hall on turn {turn}', { turn });
	return t('Became a fortress on turn {turn}', { turn });
}

/** What a city's path does for its owner, in a line. */
function pathLine(view: GameView, path: CityPath, at: number): string {
	if (path === 'castle') return t('Worth {n, plural, one {# point} other {# points}}', { n: CASTLE_POINTS });
	if (path === 'fortress') return t('Knights count double for the Largest Army');
	const goods = view.guildGoods?.[at];
	return goods ? t('Trades {resource} with the bank at 2:1', { resource: t(RESOURCE_LABEL[goods]) }) : t('Trades with the bank at 2:1');
}

export function myTurn(view: GameView | null): boolean {
	return !!view && view.me === view.current && view.phase !== 'ended';
}

export function name(view: GameView, i: number): string {
	return i === view.me ? t('You') : (view.players[i]?.name ?? '?');
}

/**
 * Where a player's points come from, as far as this view shows: their victory point cards only
 * when the view has their hand (your own, everyone's once the game is over or in a replay).
 */
export function pointParts(view: GameView, i: number): PointPart[] {
	return pointsBreakdown(view, i, view.players[i]?.devCards);
}

/** One line of a points breakdown: "Cities: 3 × 2 = 6", "Longest Road: +2". */
export function pointLine(part: PointPart): string {
	const n = { n: part.count, each: POINT_VALUE[part.source], points: part.points };
	switch (part.source) {
		case 'settlement':
			return t('Settlements: {n} × {each} = {points}', n);
		case 'city':
			return t('Cities: {n} × {each} = {points}', n);
		case 'castle':
			return t('Castles: {n} × {each} = {points}', n);
		case 'longestRoad':
			return t('Longest Road: +{points}', n);
		case 'largestArmy':
			return t('Largest Army: +{points}', n);
		case 'victoryCard':
			return t('Hidden victory point cards: {n} × {each} = {points}', n);
	}
}

/**
 * A player's points coin tooltip: the score against the goal, a line per source, and a note
 * on what can't be seen: another player's development cards may hide victory points.
 */
export function pointsTip(view: GameView, i: number): { head: string; text: string; note: string } {
	const parts = pointParts(view, i);
	const p = view.players[i];
	let note = '';
	if (!p.devCards && p.devCardCount)
		note = t(
			'{n, plural, one {Their # development card could be a hidden victory point.} other {Their # development cards could hide victory points.}}',
			{ n: p.devCardCount }
		);
	else if (i === view.me && view.phase !== 'ended' && parts.some((x) => x.source === 'victoryCard'))
		note = t('Only you can see your hidden cards.');
	return {
		head: t('Victory points: {points} of {goal} to win', { points: pointsOf(parts), goal: view.pointsToWin }),
		text: parts.length ? parts.map(pointLine).join('\n') : t('No points yet.'),
		note
	};
}

export function promptText(view: GameView): string {
	const cur = view.players[view.current];
	const mine = view.me === view.current;
	const player = cur?.name ?? '';
	if (view.phase === 'ended') return view.winner === view.me ? t('You win!') : t('{player} wins!', { player: view.players[view.winner!].name });
	switch (view.step) {
		case 'pickCharacter':
			return mine ? t('Pick your character') : t('{player} is picking a character', { player });
		case 'setupSettlement': {
			const second = view.setupIndex >= view.players.length;
			if (!mine) return t('{player} is placing a settlement', { player });
			return second ? t('Place your second settlement') : t('Place your first settlement');
		}
		case 'setupRoad':
			return mine ? t('Place a road next to it') : t('{player} is placing a road', { player });
		case 'roll':
			return mine ? t('Your turn: roll the dice') : t('{player} is about to roll', { player });
		case 'discard':
			if (view.pendingDiscards[view.me]) return t('Discard {n, plural, one {# card} other {# cards}}', { n: view.pendingDiscards[view.me] });
			return t('Waiting for players to discard');
		case 'moveRobber':
			return mine ? t('Move the robber: click a tile') : t('{player} is moving the robber', { player });
		case 'steal':
			return mine ? t('Choose who to rob') : t('{player} is choosing who to rob', { player });
		case 'roadBuilding':
			return mine
				? t('Place {n, plural, one {# free road} other {# free roads}}', { n: view.roadBuildingLeft })
				: t('{player} is building roads', { player });
		case 'chooseRoll':
			return mine ? t('Foresight: keep one of the three rolls') : t('{player} is choosing a roll', { player });
		case 'main':
			return mine ? t('Build, trade, or end your turn') : t("{player}'s turn", { player });
		case 'eventChoice': {
			const p = view.events?.choice?.player ?? -1;
			return p === view.me ? t("Royal Decree: pick this round's event") : t('{player} is picking the event', { player: view.players[p]?.name ?? '?' });
		}
	}
}

export function countsList(r: Partial<ResourceCounts>): { res: Resource; n: number }[] {
	return RESOURCES.filter((k) => (r[k] ?? 0) > 0).map((k) => ({ res: k, n: r[k]! }));
}

export type LogPart = { text: string; player?: number; res?: Resource; count?: number };

/** Human-readable log line built from structured parts. */
export function eventParts(e: GameEvent, view: GameView): LogPart[] | null {
	const P = (i: number): LogPart => ({ text: name(view, i), player: i });
	const T = (text: string): LogPart => ({ text });
	const R = (res: Resource, count = 1): LogPart => ({ text: '', res, count });
	const cards = (r: Partial<ResourceCounts>) => countsList(r).map((c) => R(c.res, c.n));
	switch (e.type) {
		case 'turnStarted':
			if (e.turn === 0) return null;
			return e.player === view.me ? tParts('{you} start your turn', { you: P(e.player) }, T) : tParts("{player}'s turn", { player: P(e.player) }, T);
		case 'turnTimedOut':
			return tParts('{player} ran out of time', { player: P(e.player) }, T);
		case 'built':
			// A guild hall says the goods it trades.
			return e.kind === 'guildHall' && e.resource
				? tParts('{player} built a guild hall for {res} at 2:1', { player: P(e.player), res: R(e.resource) }, T)
				: builtParts(view, e.kind, e.at, P(e.player), T);
		case 'tornDown': {
			const workshop = workshopName(view, e.hex);
			const back = cards(e.refund);
			if (e.player === view.me) {
				return back.length
					? tParts('{you} tore down your {workshop} and got {cards} back', { you: P(e.player), cards: back }, T, { workshop })
					: tParts('{you} tore down your {workshop}', { you: P(e.player) }, T, { workshop });
			}
			return back.length
				? tParts('{player} tore down their {workshop} and got {cards} back', { player: P(e.player), cards: back }, T, { workshop })
				: tParts('{player} tore down their {workshop}', { player: P(e.player) }, T, { workshop });
		}
		case 'diceRolled':
			return tParts('{player} rolled {total}', { player: P(e.player) }, T, { total: e.dice[0] + e.dice[1] });
		case 'produced': {
			const per = new Map<number, Partial<ResourceCounts>>();
			for (const g of e.gains) {
				const m = per.get(g.player) ?? {};
				m[g.resource] = (m[g.resource] ?? 0) + g.amount;
				per.set(g.player, m);
			}
			const clauses: LogPart[][] = [];
			for (const [p, m] of per) clauses.push(tParts('{player} got {cards}', { player: P(p), cards: cards(m) }, T));
			if (e.blocked.length) {
				if (clauses.length) clauses.push(tParts('{production} (robber blocked a tile)', { production: joinClauses(clauses.splice(0), T) }, T));
				else clauses.push([T(t('The robber blocked production'))]);
			}
			for (const p of e.hexed ?? []) clauses.push(tParts('{player} got nothing (hexed)', { player: P(p) }, T));
			return clauses.length ? joinClauses(clauses, T) : null;
		}
		case 'setupResources':
			return tParts('{player} got {cards}', { player: P(e.player), cards: e.gains.map((g) => R(g.resource)) }, T);
		case 'nothingProduced':
			return [T(t('Nobody produced on {total}', { total: e.total }))];
		case 'mustDiscard':
			return [T(t('Robber! Players with more than {limit, plural, one {# card} other {# cards}} discard half', { limit: view.handLimit ?? 7 }))];
		case 'discarded':
			return tParts('{player} discarded {count}', { player: P(e.player) }, T, { count: e.count });
		case 'robberMoved':
			return tParts('{player} moved the robber', { player: P(e.player) }, T);
		case 'stole':
			return e.resource
				? tParts('{thief} stole {res} from {victim}', { thief: P(e.thief), res: R(e.resource), victim: P(e.victim) }, T)
				: tParts('{thief} stole a card from {victim}', { thief: P(e.thief), victim: P(e.victim) }, T);
		case 'draftStarted':
			return [T(t('Character draft: the first to place a settlement picks last'))];
		case 'characterPicked': {
			const info = CHARACTER_INFO[e.character];
			return tParts('{player} picked {character} {title}', { player: P(e.player) }, T, { character: t(info.name), title: t(info.title) });
		}
		case 'traitGain':
			return tParts('{player} ({trait}) took {res}', { player: P(e.player), res: R(e.resource) }, T, { trait: t(CHARACTER_INFO[e.character].trait) });
		case 'pickOwed':
			return tParts('{player} may take a resource of choice ({trait})', { player: P(e.player) }, T, { trait: t(CHARACTER_INFO[e.character].trait) });
		case 'traitToll': {
			const slots = { from: P(e.from), to: P(e.to) };
			if (e.character === 'witch') {
				return e.resource
					? tParts("{from} paid {res} to {to} (the Witch's purse)", { ...slots, res: R(e.resource) }, T)
					: tParts("{from} paid a card to {to} (the Witch's purse)", slots, T);
			}
			return e.resource
				? tParts("{from} paid {res} to {to} (the Baron's toll)", { ...slots, res: R(e.resource) }, T)
				: tParts("{from} paid a card to {to} (the Baron's toll)", slots, T);
		}
		case 'powerUsed':
			return powerParts(e, view, P, T, R);
		case 'rollChoices':
			return tParts('{player} foresaw {rolls}', { player: P(e.player) }, T, { rolls: e.rolls.map((r) => r[0] + r[1]).join(', ') });
		case 'mischief':
			return tParts('{player} pooled every hand and dealt it back out', { player: P(e.player) }, T);
		case 'nothingToSteal':
			return [T(t('Nobody to rob there'))];
		case 'devCardBought':
			return tParts('{player} bought a development card', { player: P(e.player) }, T);
		case 'devCardPlayed':
			return tParts('{player} played {card}', { player: P(e.player) }, T, { card: t(DEV_CARD_LABEL[e.card]) });
		case 'yearOfPlenty':
			return tParts('{player} took {cards}', { player: P(e.player), cards: e.resources.map((r) => R(r)) }, T);
		case 'monopoly': {
			const n = Object.values(e.taken).reduce((a, b) => a + b, 0);
			return tParts('{player} took {count} {res} with Monopoly', { player: P(e.player), res: R(e.resource) }, T, { count: n });
		}
		case 'bankTrade':
			return tParts('{player} traded {give} for {get}', { player: P(e.player), give: R(e.give, e.giveCount), get: R(e.get) }, T);
		case 'tradeOffered':
			return tParts('{player} offers {give} for {want}', { player: P(e.offer.from), give: cards(e.offer.give), want: cards(e.offer.want) }, T);
		case 'tradeCompleted':
			return tParts('{from} traded with {to}', { from: P(e.from), to: P(e.to) }, T);
		case 'tradeCancelled':
			return null;
		case 'longestRoad':
			return e.player === null
				? [T(t('Nobody holds the Longest Road now'))]
				: tParts('{player} took the Longest Road ({length})', { player: P(e.player) }, T, { length: e.length });
		case 'largestArmy':
			return e.player === null ? null : tParts('{player} took the Largest Army ({knights})', { player: P(e.player) }, T, { knights: e.knights });
		case 'gameOver':
			return e.winner === view.me
				? tParts('{you} win the game!', { you: P(e.winner) }, T)
				: tParts('{player} won the game!', { player: P(e.winner) }, T);
		case 'chat':
			// The chat line itself is the player's own words: never translated.
			return tParts('{player}: {text}', { player: P(e.player), text: T(e.text) }, T);
		case 'cheat':
			return [T('[cheat] '), P(e.player), T(` ${e.text}`)];
		case 'campaignLine': {
			// The campaign's story: a rival speaks from their seat, the narrator from nowhere.
			const who = e.speaker === null ? T(t(CHARACTER_INFO.steward.name)) : P(e.speaker);
			return tParts('{player}: {text}', { player: who, text: T(t(e.line)) }, T);
		}
		case 'tribute':
			return tParts('{player} took {res} as tribute', { player: P(e.player), res: R(e.resource) }, T);
		case 'eventDrawn':
			return e.by !== undefined
				? tParts('{player} decreed {event}', { player: P(e.by) }, T, { event: t(EVENT_INFO[e.card].name) })
				: [T(t('Round {round} event: {event}', { round: e.round, event: t(EVENT_INFO[e.card].name) }))];
		case 'eventCards':
			return eventCardsParts(e, view, P, T, R);
		case 'earthquake': {
			const [a, b] = e.hexes.map((h) => view.board.hexes[h]?.number ?? '');
			return [T(t('Earthquake! The {a} and the {b} swapped tiles', { a, b }))];
		}
		case 'gameStarted':
			if (view.mode !== 'extended') return [T(t('The game begins. Place your settlements!'))];
			return [
				T(
					view.draft
						? t('Reign Extended on {map}, first to {points, plural, one {# point} other {# points}}.', { map: tx(view.mapName ?? ''), points: view.pointsToWin })
						: t('Reign Extended on {map}, first to {points, plural, one {# point} other {# points}}. Place your settlements!', {
								map: tx(view.mapName ?? ''),
								points: view.pointsToWin
							})
				)
			];
	}
	return null;
}

/** Clauses of one chronicle line, one after another: "Ada got 2 wood, you got 1 ore". */
function joinClauses(clauses: LogPart[][], T: (text: string) => LogPart): LogPart[] {
	return clauses.reduce((a, b) => tParts('{a}, {b}', { a, b }, T));
}

/** The chronicle's line for cards an event moved. */
function eventCardsParts(
	e: Extract<GameEvent, { type: 'eventCards' }>,
	view: GameView,
	P: (i: number) => LogPart,
	T: (text: string) => LogPart,
	R: (res: Resource) => LogPart
): LogPart[] | null {
	const n = e.moves.length;
	switch (e.card) {
		case 'bountifulYear': {
			const m = e.moves[0];
			return m?.to != null && m.resource ? tParts('{player} took {res} (Bountiful Year)', { player: P(m.to), res: R(m.resource) }, T) : null;
		}
		case 'royalWedding':
			return n ? tParts('Wedding gifts: {player} got {n, plural, one {# card} other {# cards}}', { player: P(e.moves[0].to!) }, T, { n }) : null;
		case 'tournament':
			return e.champion === undefined
				? [T(t('The Tournament had no champion'))]
				: tParts('{player} won the Tournament and took {n, plural, one {# card} other {# cards}}', { player: P(e.champion) }, T, { n });
		case 'plagueOfRats':
			return [T(n ? t('Rats ate {n, plural, one {# card} other {# cards}}', { n }) : t('The rats found nothing to eat'))];
		case 'taxCollector':
			return [T(n ? t('The Tax Collector took {n, plural, one {# card} other {# cards}}', { n }) : t('The Tax Collector found no cities to tax'))];
		case 'banditUprising': {
			if (!n) return [T(t('The bandits found nobody to rob'))];
			if (e.hex === undefined) return [T(t('Bandits took {n, plural, one {# card} other {# cards}}', { n }))];
			const tile = view.board.hexes[e.hex]?.number ?? t('desert');
			return [T(t('Bandits raided the {tile} and took {n, plural, one {# card} other {# cards}}', { tile, n }))];
		}
	}
	return null;
}

/** The log line for a power going off: who, which power, and what it picked. */
function powerParts(
	e: Extract<GameEvent, { type: 'powerUsed' }>,
	view: GameView,
	P: (i: number) => LogPart,
	T: (text: string) => LogPart,
	R: (res: Resource, count?: number) => LogPart
): LogPart[] {
	const player = P(e.player);
	const power = t(POWER_INFO[e.character].name);
	const tileName = (h: number | undefined) => {
		const hex = h === undefined ? undefined : view.board.hexes[h];
		if (!hex) return t('a tile');
		const res = TERRAIN_RESOURCE[hex.terrain];
		const number = hex.number;
		if (res) return number === null || number === undefined ? t('the {resource}', { resource: t(RESOURCE_LABEL[res]) }) : t('the {resource} {number}', { resource: t(RESOURCE_LABEL[res]), number });
		return number === null || number === undefined ? t('the desert') : t('the desert {number}', { number });
	};
	const counts = (r: Partial<ResourceCounts> | undefined) => countsList(r ?? {}).map((c) => R(c.res, c.n));
	switch (e.character) {
		case 'merchant':
			return tParts('{player} used {power}: {give} for {get}', { player, give: counts(e.give), get: counts(e.get) }, T, { power });
		case 'rogue':
		case 'witch':
			return e.target === undefined
				? tParts('{player} used {power}', { player }, T, { power })
				: tParts('{player} used {power} on {target}', { player, target: P(e.target) }, T, { power });
		case 'steward':
		case 'bard':
			return tParts('{player} used {power} on {number}', { player }, T, { power, number: e.number ?? '' });
		case 'alchemist':
			return e.terrain
				? tParts('{player} used {power}: {tile} is now {terrain}', { player }, T, { power, tile: tileName(e.hex), terrain: t(TERRAIN_NAME[e.terrain]) })
				: tParts('{player} used {power}: {tile} is now changed', { player }, T, { power, tile: tileName(e.hex) });
		case 'cartographer':
			return tParts('{player} used {power}: swapped the numbers on {tile} and {other}', { player }, T, { power, tile: tileName(e.hex), other: tileName(e.hex2) });
		case 'abbess':
			return tParts('{player} used {power} on {tile}', { player }, T, { power, tile: tileName(e.hex) });
		case 'baron':
			return tParts('{player} used {power} and claimed a corner', { player }, T, { power });
		default:
			return tParts('{player} used {power}', { player }, T, { power });
	}
}

export function vertexHasPort(view: GameView, v: number) {
	return getTopology(view.board).vertices[v]?.port ?? null;
}
