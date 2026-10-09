import { randomInt, randomSeed } from '../rng';
import { botAction } from './bot';
import {
	DEV_CARDS,
	DEV_CARD_LABEL,
	RESOURCES,
	RESOURCE_LABEL,
	emptyResources,
	type DevCardType,
	type ResourceCounts
} from './config';
import { LOG_LIMIT, applyAction, totalPoints } from './engine';
import type { GameEvent, GameState } from './types';

/**
 * Dev cheats for testing. The server only accepts them when it runs as the local dev server
 * (`pnpm dev`), never in a production build. Each one leaves a line in the chronicle.
 */
export type Cheat =
	/** Add cards to a hand, out of thin air (the bank is left alone). */
	| { type: 'resources'; player: number; resources: Partial<ResourceCounts> }
	| { type: 'clearHand'; player: number }
	/** A development card that can be played right away. */
	| { type: 'devCard'; player: number; card: DevCardType }
	/** Make the next roll come up this total. */
	| { type: 'rigDice'; total: number }
	/** Bots place every remaining setup settlement and road, yours included. */
	| { type: 'finishSetup' }
	/** Give a player the victory points they still need and end the game in their favour. */
	| { type: 'win'; player: number }
	/** Bots stop pausing between moves (handled by the room, not the game). */
	| { type: 'fastBots'; on: boolean };

export type CheatResult = { ok: true; state: GameState } | { ok: false; error: string };

const HAND_CAP = 99;

export function applyCheat(state: GameState, by: number, cheat: Cheat): CheatResult {
	if (state.phase === 'ended') return { ok: false, error: 'The game is over.' };
	const target = 'player' in cheat ? cheat.player : by;
	if (!Number.isInteger(target) || !state.players[target]) {
		return { ok: false, error: 'Pick a player.' };
	}
	const { board, ...rest } = state;
	let s: GameState = { ...structuredClone(rest), board };
	const pl = s.players[target];
	const self = target === by;
	const other = pl.name;
	let text: string;
	switch (cheat.type) {
		case 'resources': {
			const got: string[] = [];
			for (const r of RESOURCES) {
				const n = Math.floor(Number(cheat.resources?.[r] ?? 0));
				if (!Number.isFinite(n) || n <= 0) continue;
				pl.resources[r] = Math.min(HAND_CAP, pl.resources[r] + n);
				got.push(`${n} ${RESOURCE_LABEL[r]}`);
			}
			if (!got.length) return { ok: false, error: 'Pick some resources.' };
			text = self ? `took ${got.join(', ')}` : `gave ${other} ${got.join(', ')}`;
			break;
		}
		case 'clearHand':
			pl.resources = emptyResources();
			text = self ? 'dropped every card' : `emptied ${other}'s hand`;
			break;
		case 'devCard': {
			if (!DEV_CARDS.includes(cheat.card)) return { ok: false, error: 'Pick a card.' };
			// Take it from the deck when there is one left, so the deck count stays honest.
			const i = s.devDeck.lastIndexOf(cheat.card);
			if (i >= 0) s.devDeck.splice(i, 1);
			pl.devCards.push({ type: cheat.card, boughtTurn: s.turn - 1 });
			const card = `a ${DEV_CARD_LABEL[cheat.card]} card`;
			text = self ? `took ${card}` : `gave ${other} ${card}`;
			break;
		}
		case 'rigDice': {
			const total = Math.floor(Number(cheat.total));
			if (!(total >= 2 && total <= 12)) return { ok: false, error: 'Pick a total from 2 to 12.' };
			s.rng = seedForRoll(total);
			text = `rigged the next roll to ${total}`;
			break;
		}
		case 'finishSetup': {
			if (s.phase !== 'setup') return { ok: false, error: 'Setup is already over.' };
			for (let i = 0; i < 200 && s.phase === 'setup'; i++) {
				const action = botAction(s, s.current);
				const res = action && applyAction(s, s.current, action);
				if (!res?.ok) return { ok: false, error: `Setup got stuck at ${s.step}.` };
				s = res.state;
			}
			text = 'finished the setup';
			break;
		}
		case 'win': {
			if (s.phase === 'setup') return { ok: false, error: 'Finish the setup first.' };
			const need = Math.max(0, s.pointsToWin - totalPoints(s, target));
			for (let i = 0; i < need; i++)
				pl.devCards.push({ type: 'victoryPoint', boughtTurn: s.turn - 1 });
			s.phase = 'ended';
			s.winner = target;
			s.trade = null;
			text = self ? 'won on the spot' : `made ${other} win`;
			break;
		}
		case 'fastBots':
			text = cheat.on ? 'made the bots play fast' : 'let the bots take their time';
			break;
		default:
			return { ok: false, error: 'Unknown cheat.' };
	}
	emit(s, { type: 'cheat', player: by, text });
	if (cheat.type === 'win') {
		emit(s, {
			type: 'gameOver',
			winner: target,
			points: s.players.map((_, i) => totalPoints(s, i))
		});
	}
	s.version++;
	return { ok: true, state: s };
}

/** An rng state whose next two dice add up to the total. */
export function seedForRoll(total: number): number {
	for (let seed = randomSeed(); ; seed = (seed + 1) | 0) {
		const probe = { rng: seed };
		if (randomInt(probe, 6) + randomInt(probe, 6) + 2 === total) return seed;
	}
}

type NewEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'seq'> : never) : never;

function emit(s: GameState, e: NewEvent) {
	s.log.push({ ...e, seq: s.nextEventSeq++ } as GameEvent);
	if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}
