import { moveTargets, shotTargets } from '../../../shared/gambit/pieces';
import { ordersAllowed } from '../../../shared/gambit/rules';
import type { GambitView, Order, Piece } from '../../../shared/gambit/types';
import { t } from '../../i18n/index.svelte';
import type { CellMark } from '../../scene/gambit/gambitScene';
import { PLAYER_RGB } from '../../scene/layout';
import { client } from '../../state/client.svelte';
import { sceneRef } from '../sceneRef';
import { sfx } from '../sound';
import { boardOf, pieceName } from './text';

/**
 * What the player is doing in a game of Gambit: the piece picked, the orders drafted this round
 * (sent to the table as they change, so the clock running out still plays them), and what that
 * lights up on the board. The board is the interface: clicks come in through the scene.
 */
class GbPlay {
	/** The game as the board has shown it (rounds played out first). */
	view = $state.raw<GambitView | null>(null);
	/** The piece picked (by id), to give an order. */
	selected = $state<number | null>(null);
	/** The hex under the pointer. */
	hover = $state<number | null>(null);
	/** This round's orders, as drafted here. */
	drafts = $state.raw<Order[]>([]);
	/** The round the drafts are for. */
	private draftRound = 0;
	/** Done ordering this round. */
	ready = $state(false);
	/** A round is playing out on the board. */
	resolving = $state(false);
	/** A player's plaque is hovered: their pieces light up. */
	spotlight = $state<number | null>(null);
	/** Dev cheats (the dev server only): the next click on the board picks `cheatTarget` instead of ordering. */
	cheatPick = $state(false);
	cheatTarget = $state<number | null>(null);
	/** A short note by the pointer: why a click did nothing. */
	note = $state<{ text: string; x: number; y: number; id: number } | null>(null);
	private noteTimer: ReturnType<typeof setTimeout> | undefined;
	pointer = { x: 0, y: 0 };

	get me() {
		return this.view?.me ?? -1;
	}

	/** This player gives orders now: seated, the round open, the board done showing the last one. */
	get ordering() {
		const v = this.view;
		return !!v && v.phase === 'orders' && v.me >= 0 && !client.spectating && !client.replaying && !this.resolving;
	}

	get allowed() {
		const v = this.view;
		return v && v.me >= 0 ? ordersAllowed(v, v.me) : 0;
	}

	pieceAt(cell: number): Piece | undefined {
		return this.view?.pieces.find((p) => p.cell === cell);
	}

	pieceById(id: number | null): Piece | undefined {
		return id === null ? undefined : this.view?.pieces.find((p) => p.id === id);
	}

	/** The board has played out everything up to `view`. */
	settle(view: GambitView) {
		this.view = view;
		this.resolving = false;
		if (view.round !== this.draftRound || view.phase !== 'orders') {
			// A new round: nothing ordered yet (or what the table has, after a rejoin).
			this.draftRound = view.round;
			this.drafts = view.myOrders;
			this.selected = null;
		}
		this.ready = view.me >= 0 && !!view.ready[view.me];
		this.sync();
	}

	/** A round has started playing out on the board. */
	roundShown() {
		this.resolving = true;
		this.selected = null;
		this.sync();
	}

	hovered(cell: number | null) {
		this.hover = cell;
		this.sync();
	}

	/** Where the picked piece can go, and shoot at, this round (its own pieces moving away leave room). */
	targets(p: Piece) {
		const v = this.view!;
		const board = boardOf(v);
		const leaving = new Set(
			this.drafts.flatMap((o) => {
				if (o.type !== 'move' || o.piece === p.id) return [];
				const q = this.pieceById(o.piece);
				return q ? [q.cell] : [];
			})
		);
		return { moves: moveTargets(board, v.pieces, p, leaving), shots: shotTargets(board, p) };
	}

	clicked(cell: number | null, touch: boolean) {
		const v = this.view;
		if (!v) return;
		if (this.cheatPick) {
			this.cheatPick = false;
			if (cell !== null) this.cheatTarget = cell;
			return;
		}
		if (cell === null || !this.ordering) {
			this.selected = null;
			return this.sync();
		}
		const here = this.pieceAt(cell);
		const picked = this.pieceById(this.selected);
		if (picked) {
			const { moves, shots } = this.targets(picked);
			// An archer shoots at a piece of someone else's in range (it can step, too, if the hex is next to it).
			if (shots.includes(cell) && (!moves.includes(cell) || (here && here.owner !== v.me))) {
				if (here?.owner === v.me) return this.say(t("Your archer won't shoot your own pieces."), touch ? cell : undefined);
				return this.give({ piece: picked.id, type: 'shoot', at: cell });
			}
			if (moves.includes(cell)) return this.give({ piece: picked.id, type: 'move', to: cell });
		}
		if (here && here.owner === v.me) {
			this.selected = this.selected === here.id ? null : here.id;
			sfx.click();
			return this.sync();
		}
		if (picked) return this.say(t("Your {piece} can't go there.", { piece: pieceName(picked.kind) }), touch ? cell : undefined);
		this.selected = null;
		this.sync();
	}

	/** Brace the picked piece where it stands. */
	brace() {
		const p = this.pieceById(this.selected);
		if (p) this.give({ piece: p.id, type: 'brace' });
	}

	/** Give `o` (it replaces any order for the same piece). */
	give(o: Order) {
		const others = this.drafts.filter((d) => d.piece !== o.piece);
		if (others.length >= this.allowed) {
			return this.say(
				this.allowed === 1
					? t('You can give only 1 order this round. Take one back first.')
					: t('You can give only {n} orders this round. Take one back first.', { n: this.allowed })
			);
		}
		// Two of yours can't end on one hex: the newer order wins it.
		const to = o.type === 'move' ? o.to : null;
		this.drafts = [...others.filter((d) => !(to !== null && d.type === 'move' && d.to === to)), o];
		this.selected = null;
		sfx.build();
		this.push(false);
	}

	/** Take back the order for this piece. */
	takeBack(piece: number) {
		this.drafts = this.drafts.filter((d) => d.piece !== piece);
		sfx.click();
		this.push(false);
	}

	setReady(on: boolean) {
		if (!this.ordering) return;
		sfx.click();
		this.push(on);
	}

	/** The drafts to the table (any change makes this player not ready again). */
	private push(ready: boolean) {
		this.ready = ready;
		client.gbAct({ type: 'orders', orders: this.drafts, ready });
		this.sync();
	}

	private say(text: string, at?: number) {
		clearTimeout(this.noteTimer);
		sfx.error();
		const spot = at !== undefined ? sceneRef.current?.gambit?.screenOf(at) : null;
		this.note = { text, x: spot?.x ?? this.pointer.x, y: spot?.y ?? this.pointer.y, id: (this.note?.id ?? 0) + 1 };
		this.noteTimer = setTimeout(() => (this.note = null), 2600);
	}

	/** Light up the board for what is going on, and say which hexes a click does something on. */
	sync() {
		const scene = sceneRef.current?.gambit;
		const v = this.view;
		if (!scene || !v) return;
		const marks = new Map<number, CellMark>();
		const clickable = new Set<number>();
		if (this.ordering && !this.ready) {
			for (const p of v.pieces) if (p.owner === v.me) clickable.add(p.cell);
			const picked = this.pieceById(this.selected);
			if (picked) {
				const { moves, shots } = this.targets(picked);
				for (const c of shots) {
					const there = this.pieceAt(c);
					if (there && there.owner !== v.me) marks.set(c, 'shoot');
					clickable.add(c);
				}
				for (const c of moves) {
					const there = this.pieceAt(c);
					marks.set(c, there && there.owner !== v.me ? 'take' : 'move');
					clickable.add(c);
				}
				marks.set(picked.cell, 'pick');
			}
		}
		if (this.spotlight !== null) for (const p of v.pieces) if (p.owner === this.spotlight && !marks.has(p.cell)) marks.set(p.cell, 'mine');
		if (this.hover !== null && !marks.has(this.hover)) marks.set(this.hover, 'hover');
		scene.setMarks(marks);
		scene.setClickable(clickable);
		const color = v.me >= 0 ? (PLAYER_RGB[v.players[v.me]?.color] ?? 0xffffff) : 0xffffff;
		scene.setOrders(this.ordering ? this.drafts : [], color);
	}

	/** Back to nothing picked (a fresh table, or Esc). */
	clear() {
		this.selected = null;
		this.sync();
	}

	reset() {
		this.view = null;
		this.selected = null;
		this.hover = null;
		this.drafts = [];
		this.draftRound = 0;
		this.ready = false;
		this.resolving = false;
		this.spotlight = null;
		this.note = null;
	}
}

export const gbPlay = new GbPlay();
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __gbPlay: GbPlay }).__gbPlay = gbPlay;
