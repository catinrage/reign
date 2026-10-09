import { totalResources } from './config';
import { totalPoints } from './engine';
import { rumorFor } from './events';
import { publicPoints } from './queries';
import type { EventMove, GameEvent, GameState, GameView } from './types';

/** Strip hidden information: other hands, the deck order, the rng, private steal results. */
export function viewFor(s: GameState, me: number): GameView {
	const reveal = s.phase === 'ended';
	const { rng: _rng, devDeck, players, log, events, ...rest } = s;
	return {
		...structuredClone(rest),
		board: s.board,
		devDeckCount: devDeck.length,
		// The event deck's order stays secret: players see this round's card and what's left, and
		// a player with a tavern the next card's rumor.
		events: events && (({ deck, ...ev }) => ({ ...structuredClone(ev), deckCount: deck.length, rumor: rumorFor(s, me) }))(events),
		me,
		players: players.map((p, i) => {
			const mine = i === me || reveal;
			return {
				name: p.name,
				color: p.color,
				isBot: p.isBot,
				character: p.character,
				resourceCount: totalResources(p.resources),
				devCardCount: p.devCards.length,
				knightsPlayed: p.knightsPlayed,
				piecesLeft: { ...p.piecesLeft },
				longestRoad: p.longestRoad,
				powerUsed: p.powerUsed ?? null,
				publicPoints: publicPoints(s, i),
				...(mine
					? {
							resources: { ...p.resources },
							devCards: p.devCards.map((c) => ({ ...c })),
							totalPoints: totalPoints(s, i)
						}
					: {})
			};
		}),
		log: log.map((e) => redactEvent(e, me, reveal))
	};
}

export function redactEvent(e: GameEvent, me: number, reveal = false): GameEvent {
	if (reveal) return e;
	if (e.type === 'stole' && me !== e.thief && me !== e.victim) return { ...e, resource: null };
	if (e.type === 'traitToll' && me !== e.from && me !== e.to) return { ...e, resource: null };
	if (e.type === 'devCardBought' && me !== e.player) return { ...e, card: null };
	if (e.type === 'eventCards') {
		const hidden = (m: EventMove) => m.from !== null && m.to !== null ? me !== m.from && me !== m.to : m.from !== null && me !== m.from;
		if (e.moves.some(hidden)) return { ...e, moves: e.moves.map((m) => (hidden(m) ? { ...m, resource: null } : m)) };
	}
	return e;
}
