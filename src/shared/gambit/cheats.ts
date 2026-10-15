import { boardOf, Ctx, gameOver, timeOutGambit } from './rules';
import { PIECE_KINDS, type GambitState, type PieceKind } from './types';

/**
 * Gambit's dev cheats, for testing, as the other games have theirs. The server only takes them
 * when it runs as the local dev server (`pnpm dev`), never in a production build. Each one leaves
 * a line in the chronicle.
 */
export type GambitCheat =
	/** Crowns more for a player. */
	| { type: 'crowns'; player: number; count: number }
	/** A piece of a player's on a free hex. */
	| { type: 'piece'; player: number; kind: PieceKind; cell: number }
	/** Whatever piece stands on the hex, gone. */
	| { type: 'remove'; cell: number }
	/** Play the round now, with the orders given so far. */
	| { type: 'playRound' }
	/** The war won on the spot. */
	| { type: 'win'; player: number }
	/** Bots stop pausing (handled by the room, not the game). */
	| { type: 'fastBots'; on: boolean };

export type GambitCheatResult = { ok: true; state: GambitState } | { ok: false; error: string };

const MOST_CROWNS = 50;
const fail = (error: string): GambitCheatResult => ({ ok: false, error });

export function applyGambitCheat(state: GambitState, by: number, cheat: GambitCheat): GambitCheatResult {
	if (state.phase === 'ended') return fail('The game is over.');
	const player = 'player' in cheat ? cheat.player : by;
	if (!Number.isInteger(player) || !state.players[player]) return fail('Pick a player.');
	const self = player === by;
	const other = state.players[player].name;
	if (cheat.type === 'playRound') {
		const played = timeOutGambit(state);
		new Ctx(played).emit({ type: 'cheat', player: by, text: 'played the round at once' });
		played.version++;
		return { ok: true, state: played };
	}
	const s = structuredClone(state);
	const board = boardOf(s);
	let text: string;
	switch (cheat.type) {
		case 'crowns': {
			const n = Math.floor(Number(cheat.count));
			if (!(n >= 1 && n <= MOST_CROWNS)) return fail(`Add 1 to ${MOST_CROWNS} crowns.`);
			s.players[player].crowns += n;
			text = self ? `took ${n} crowns` : `gave ${other} ${n} crowns`;
			break;
		}
		case 'piece': {
			const c = board.cells[cheat.cell];
			if (!c || c.terrain === 'water') return fail('Pick a hex on land.');
			if (s.pieces.some((p) => p.cell === cheat.cell)) return fail('That hex is taken.');
			if (!PIECE_KINDS.includes(cheat.kind)) return fail('Pick a piece.');
			s.pieces.push({ id: s.nextPieceId++, owner: player, kind: cheat.kind, cell: cheat.cell });
			text = self ? `called up a ${cheat.kind}` : `gave ${other} a ${cheat.kind}`;
			break;
		}
		case 'remove': {
			const i = s.pieces.findIndex((p) => p.cell === cheat.cell);
			if (i < 0) return fail('No piece stands there.');
			if (s.pieces[i].kind === 'monarch') return fail("Monarchs can't be taken off the board.");
			const [gone] = s.pieces.splice(i, 1);
			// Orders for it are gone with it.
			s.orders = s.orders.map((os) => os.filter((o) => o.piece !== gone.id));
			text = `took ${s.players[gone.owner].name}'s ${gone.kind} off the board`;
			break;
		}
		case 'win': {
			const ctx = new Ctx(s);
			ctx.emit({ type: 'cheat', player: by, text: self ? 'won on the spot' : `made ${other} win` });
			gameOver(ctx, player, 'crowns');
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
