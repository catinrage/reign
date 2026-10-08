import { getTopology } from '../../shared/board/topology';
import {
	COSTS,
	DEV_CARD_LABEL,
	RESOURCES,
	RESOURCE_LABEL,
	hasResources,
	type BuildKind,
	type Resource,
	type ResourceCounts
} from '../../shared/rules/config';
import { citySpots, roadSpots, settlementSpots } from '../../shared/rules/queries';
import type { GameEvent, GameView } from '../../shared/rules/types';
import { PLAYER_CSS } from '../scene/layout';

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

export function canAfford(view: GameView, kind: BuildKind): boolean {
	const mine = view.players[view.me]?.resources;
	return !!mine && hasResources(mine, COSTS[kind]);
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
			return view.devDeckCount > 0;
	}
}

export function myTurn(view: GameView | null): boolean {
	return !!view && view.me === view.current && view.phase !== 'ended';
}

export function name(view: GameView, i: number): string {
	return i === view.me ? 'You' : (view.players[i]?.name ?? '?');
}

export function promptText(view: GameView): string {
	const cur = view.players[view.current];
	const mine = view.me === view.current;
	const who = cur?.name ?? '';
	if (view.phase === 'ended') return `${view.winner === view.me ? 'You win' : `${view.players[view.winner!].name} wins`}!`;
	switch (view.step) {
		case 'setupSettlement': {
			const second = view.setupIndex >= view.players.length;
			return mine ? `Place your ${second ? 'second' : 'first'} settlement` : `${who} is placing a settlement`;
		}
		case 'setupRoad':
			return mine ? 'Place a road next to it' : `${who} is placing a road`;
		case 'roll':
			return mine ? 'Your turn: roll the dice' : `${who} is about to roll`;
		case 'discard':
			if (view.pendingDiscards[view.me]) return `Discard ${view.pendingDiscards[view.me]} cards`;
			return 'Waiting for players to discard';
		case 'moveRobber':
			return mine ? 'Move the robber: click a tile' : `${who} is moving the robber`;
		case 'steal':
			return mine ? 'Choose who to rob' : `${who} is choosing who to rob`;
		case 'roadBuilding':
			return mine ? `Place ${view.roadBuildingLeft} free road${view.roadBuildingLeft > 1 ? 's' : ''}` : `${who} is building roads`;
		case 'main':
			return mine ? 'Build, trade, or end your turn' : `${who}'s turn`;
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
	switch (e.type) {
		case 'turnStarted':
			return e.turn === 0 ? null : [P(e.player), T(e.player === view.me ? ' start your turn' : "'s turn")];
		case 'built':
			return [P(e.player), T(` built a ${e.kind}`)];
		case 'diceRolled':
			return [P(e.player), T(` rolled ${e.dice[0] + e.dice[1]}`)];
		case 'produced': {
			const per = new Map<number, Partial<ResourceCounts>>();
			for (const g of e.gains) {
				const m = per.get(g.player) ?? {};
				m[g.resource] = (m[g.resource] ?? 0) + g.amount;
				per.set(g.player, m);
			}
			const parts: LogPart[] = [];
			for (const [p, m] of per) {
				if (parts.length) parts.push(T(', '));
				parts.push(P(p), T(' got '));
				for (const c of countsList(m)) parts.push(R(c.res, c.n));
			}
			if (e.blocked.length) parts.push(T(parts.length ? ' (robber blocked a tile)' : 'The robber blocked production'));
			return parts.length ? parts : null;
		}
		case 'setupResources': {
			const parts: LogPart[] = [P(e.player), T(' got ')];
			for (const g of e.gains) parts.push(R(g.resource));
			return parts;
		}
		case 'nothingProduced':
			return [T(`Nobody produced on ${e.total}`)];
		case 'mustDiscard':
			return [T('Robber! Players with more than 7 cards discard half')];
		case 'discarded':
			return [P(e.player), T(` discarded ${e.count}`)];
		case 'robberMoved':
			return [P(e.player), T(' moved the robber')];
		case 'stole':
			return e.resource
				? [P(e.thief), T(' stole '), R(e.resource), T(' from '), P(e.victim)]
				: [P(e.thief), T(' stole a card from '), P(e.victim)];
		case 'nothingToSteal':
			return [T('Nobody to rob there')];
		case 'devCardBought':
			return [P(e.player), T(' bought a development card')];
		case 'devCardPlayed':
			return [P(e.player), T(` played ${DEV_CARD_LABEL[e.card]}`)];
		case 'yearOfPlenty':
			return [P(e.player), T(' took '), ...e.resources.map((r) => R(r))];
		case 'monopoly': {
			const n = Object.values(e.taken).reduce((a, b) => a + b, 0);
			return [P(e.player), T(` took ${n} `), R(e.resource), T(' with Monopoly')];
		}
		case 'bankTrade':
			return [P(e.player), T(' traded '), R(e.give, e.giveCount), T(' for '), R(e.get)];
		case 'tradeOffered':
			return [P(e.offer.from), T(' offers '), ...countsList(e.offer.give).map((c) => R(c.res, c.n)), T(' for '), ...countsList(e.offer.want).map((c) => R(c.res, c.n))];
		case 'tradeCompleted':
			return [P(e.from), T(' traded with '), P(e.to)];
		case 'tradeCancelled':
			return null;
		case 'longestRoad':
			return e.player === null ? [T('Nobody holds the Longest Road now')] : [P(e.player), T(` took the Longest Road (${e.length})`)];
		case 'largestArmy':
			return e.player === null ? null : [P(e.player), T(` took the Largest Army (${e.knights})`)];
		case 'gameOver':
			return [P(e.winner), T(e.winner === view.me ? ' win the game!' : ' won the game!')];
		case 'chat':
			return [P(e.player), T(`: ${e.text}`)];
		case 'gameStarted':
			return [T('The game begins. Place your settlements!')];
	}
	return null;
}

export function vertexHasPort(view: GameView, v: number) {
	return getTopology(view.board).vertices[v]?.port ?? null;
}
