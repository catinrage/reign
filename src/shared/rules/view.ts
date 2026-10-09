import { totalResources } from './config';
import { totalPoints } from './engine';
import { publicPoints } from './queries';
import type { GameEvent, GameState, GameView } from './types';

/** Strip hidden information: other hands, the deck order, the rng, private steal results. */
export function viewFor(s: GameState, me: number): GameView {
	const reveal = s.phase === 'ended';
	const { rng: _rng, devDeck, players, log, ...rest } = s;
	return {
		...structuredClone(rest),
		board: s.board,
		devDeckCount: devDeck.length,
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
	return e;
}
