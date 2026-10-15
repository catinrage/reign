import { randomInt, randomSeed } from '../rng';
import { conquestBot } from './bot';
import { OMENS, OMEN_INFO, type OmenId } from './omens';
import { conquestMap } from './queries';
import { Ctx, applyConquest, conquestView, drawOmen, gameOver } from './rules';
import { CARD_SYMBOLS, type CardSymbol, type ConquestCard, type CqState } from './types';

/**
 * Conquest's dev cheats, for testing, as Settlement has its own (see rules/cheats.ts). The server
 * only takes them when it runs as the local dev server (`pnpm dev`), never in a production build.
 * Each one leaves a line in the chronicle.
 */
export type ConquestCheat =
	/** Armies more on a territory, whoever holds it. */
	| { type: 'armies'; territory: number; count: number }
	/** A card into a hand: from the deck when it has one of the kind. */
	| { type: 'card'; player: number; symbol: CardSymbol }
	/** The next battle's dice all go one side's way. */
	| { type: 'rigBattle'; side: 'attacker' | 'defender' }
	/** This omen, now, as the round's. */
	| { type: 'omen'; omen: OmenId }
	/** Everyone's starting armies still to place go down as a bot would put them, and the first turn begins. */
	| { type: 'finishDeploy' }
	/** The war won on the spot. */
	| { type: 'win'; player: number }
	/** Bots stop pausing between moves (handled by the room, not the game). */
	| { type: 'fastBots'; on: boolean };

export type ConquestCheatResult = { ok: true; state: CqState } | { ok: false; error: string };

const MOST_ARMIES = 99;
const SYMBOLS: CardSymbol[] = [...CARD_SYMBOLS, 'wild'];

/**
 * Dice that win every comparison for that side, however many each rolls (the attacker's come
 * first, then the defender's, sorted highest first).
 */
const RIGGED: Record<'attacker' | 'defender', number[]> = {
	attacker: [6, 5, 1, 1, 1, 1],
	defender: [1, 1, 6, 6, 6, 6]
};

const fail = (error: string): ConquestCheatResult => ({ ok: false, error });

export function applyConquestCheat(state: CqState, by: number, cheat: ConquestCheat): ConquestCheatResult {
	if (state.phase === 'ended') return fail('The game is over.');
	let s = structuredClone(state);
	const map = conquestMap(s.settings);
	const player = 'player' in cheat ? cheat.player : by;
	if (!Number.isInteger(player) || !s.players[player]) return fail('Pick a player.');
	const self = player === by;
	const other = s.players[player].name;
	let text: string;
	switch (cheat.type) {
		case 'armies': {
			const t = cheat.territory;
			const n = Math.floor(Number(cheat.count));
			if (!Number.isInteger(t) || !map.territories[t]) return fail('Pick a territory.');
			if (!(n >= 1 && n <= MOST_ARMIES)) return fail(`Add 1 to ${MOST_ARMIES} armies.`);
			s.armies[t] += n;
			text = `put ${n} more ${n === 1 ? 'army' : 'armies'} on ${map.territories[t].name}`;
			break;
		}
		case 'card': {
			if (s.settings.cards === 'none') return fail('This game has no cards.');
			if (!SYMBOLS.includes(cheat.symbol)) return fail('Pick a card.');
			const card = takeCard(s.deck, cheat.symbol) ?? takeCard(s.discard, cheat.symbol) ?? { id: nextCardId(s), territory: null, symbol: cheat.symbol };
			s.players[player].cards.push(card);
			text = self ? `took a ${cheat.symbol} card` : `gave ${other} a ${cheat.symbol} card`;
			break;
		}
		case 'rigBattle': {
			const rolls = RIGGED[cheat.side];
			if (!rolls) return fail('Pick a side.');
			s.rng = seedForRolls(rolls);
			text = `rigged the next battle for the ${cheat.side}`;
			break;
		}
		case 'omen': {
			if (!s.omens) return fail('This game has no omens.');
			if (!OMENS.includes(cheat.omen)) return fail('Pick an omen.');
			if (s.phase !== 'play') return fail('Omens come once the war has begun.');
			const ctx = new Ctx(s);
			ctx.emit({ type: 'cheat', player: by, text: `drew ${OMEN_INFO[cheat.omen].name}` });
			drawOmen(ctx, cheat.omen);
			s.version++;
			return { ok: true, state: s };
		}
		case 'finishDeploy': {
			if (s.phase !== 'deploy') return fail('Deployment is already over.');
			for (let i = 0; i < 2000 && s.phase === 'deploy'; i++) {
				const p = s.reserve.findIndex((r) => r > 0);
				if (p < 0) break;
				const action = conquestBot(conquestView(s, p));
				const res = action ? applyConquest(s, p, action) : null;
				if (!res?.ok) return fail('Deployment got stuck.');
				s = res.state;
			}
			text = 'finished the deployment';
			break;
		}
		case 'win': {
			if (s.phase !== 'play') return fail('Start the war first.');
			if (s.players[player].out) return fail(`${other} is out of the war.`);
			const ctx = new Ctx(s);
			ctx.emit({ type: 'cheat', player: by, text: self ? 'won on the spot' : `made ${other} win` });
			gameOver(ctx, player, 'domination');
			s.version++;
			return { ok: true, state: s };
		}
		case 'fastBots':
			text = cheat.on ? 'made the bots play fast' : 'let the bots take their time';
			break;
		default:
			return fail('Unknown cheat.');
	}
	new Ctx(s).emit({ type: 'cheat', player: by, text });
	s.version++;
	return { ok: true, state: s };
}

function takeCard(pile: ConquestCard[], symbol: CardSymbol): ConquestCard | null {
	const i = pile.findIndex((c) => c.symbol === symbol);
	return i >= 0 ? pile.splice(i, 1)[0] : null;
}

function nextCardId(s: CqState): number {
	const all = [...s.deck, ...s.discard, ...s.players.flatMap((p) => p.cards)];
	return all.reduce((most, c) => Math.max(most, c.id), 0) + 1;
}

/** An rng state whose next dice come up as `rolls`. */
export function seedForRolls(rolls: number[]): number {
	for (let seed = randomSeed(); ; seed = (seed + 1) | 0) {
		const probe = { rng: seed };
		if (rolls.every((r) => randomInt(probe, 6) + 1 === r)) return seed;
	}
}
