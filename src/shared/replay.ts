import { LOG_LIMIT } from './rules/engine';
import type { GameEvent, GameState } from './rules/types';

/**
 * Replays: a finished game kept move by move so it can be watched again. The server writes down
 * the state of the table every time it changes (what every player was sent), as small patches
 * from one state to the next. Patches rather than the moves themselves, so an old game still
 * plays back the way it went after the rules have changed.
 */

/** Bumped when the format changes in a way older viewers can't read. */
export const REPLAY_VERSION = 1;
/** A recording stops growing here (a game that long is kept up to this point). */
export const REPLAY_MAX_STEPS = 8000;

/** The state of the table without its log (the events travel with each step) and the rng. */
export type ReplayState = Omit<GameState, 'log' | 'rng'>;

/** A key path into the state and what's there now; a path alone means it was removed. */
export type PatchOp = [path: (string | number)[], value: unknown] | [path: (string | number)[]];

export interface ReplayStep {
	/** Milliseconds since the game started. */
	t: number;
	/** What happened in this step, in order (chat left out). */
	events: GameEvent[];
	/** From the state before this step to the state after it. */
	patch: PatchOp[];
}

export interface Replay {
	v: number;
	/** The table as the game started (dealt, before anyone moved). */
	start: ReplayState;
	/** The log at the start (the game began, the first turn or the draft). */
	startEvents: GameEvent[];
	steps: ReplayStep[];
	/** The game went on past REPLAY_MAX_STEPS, and the recording stops there. */
	cut?: boolean;
}

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null;
}

/** The ops that turn `a` into `b`. Arrays that change length are replaced whole. */
export function diff(
	a: unknown,
	b: unknown,
	path: (string | number)[] = [],
	out: PatchOp[] = []
): PatchOp[] {
	if (a === b) return out;
	if (isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b)) {
		if (Array.isArray(a)) {
			const bb = b as unknown as unknown[];
			if (a.length !== bb.length) out.push([path, bb]);
			else for (let i = 0; i < a.length; i++) diff(a[i], bb[i], [...path, i], out);
			return out;
		}
		for (const k of Object.keys(a))
			if (!(k in b) || b[k] === undefined) if (a[k] !== undefined) out.push([[...path, k]]);
		for (const k of Object.keys(b)) {
			if (b[k] === undefined) continue;
			diff(a[k], b[k], [...path, k], out);
		}
		return out;
	}
	if (b === undefined) out.push([path]);
	else out.push([path, b]);
	return out;
}

/**
 * Apply ops to `state` without touching it: only the objects along the changed paths are copied,
 * so every state of a replay shares everything it didn't change with the one before.
 */
export function applyPatch<T>(state: T, ops: PatchOp[]): T {
	if (!ops.length) return state;
	const fresh = new Set<object>();
	const copy = (o: Record<string, unknown> | unknown[]) => {
		if (fresh.has(o)) return o;
		const c = Array.isArray(o) ? [...o] : { ...o };
		fresh.add(c);
		return c;
	};
	let root: unknown = state;
	for (const op of ops) {
		const [path] = op;
		if (!path.length) {
			root = op[1];
			continue;
		}
		root = copy(root as Record<string, unknown>);
		let node = root as Record<string | number, unknown>;
		for (let i = 0; i < path.length - 1; i++) {
			const k = path[i];
			const child = node[k];
			const c = isObject(child) ? copy(child as Record<string, unknown>) : {};
			node[k] = c;
			node = c as Record<string | number, unknown>;
		}
		const last = path[path.length - 1];
		if (op.length === 1) {
			if (Array.isArray(node)) node.splice(last as number, 1);
			else delete node[last];
		} else node[last] = op[1];
	}
	return root as T;
}

/** What is kept of a state: everything but the log and the rng, copied so later moves can't change it. */
function keep(s: GameState): ReplayState {
	const { log: _log, rng: _rng, ...rest } = s;
	return structuredClone(rest);
}

/** Writes a game down as it is played. The room hands it every state it sends out. */
export class Recorder {
	private steps: ReplayStep[] = [];
	private start: ReplayState;
	private startEvents: GameEvent[];
	private last: ReplayState;
	private lastSeq: number;
	private began: number;
	private cut = false;

	constructor(game: GameState, now = Date.now()) {
		this.began = now;
		this.start = keep(game);
		this.startEvents = structuredClone(game.log.filter((e) => e.type !== 'chat'));
		this.last = this.start;
		this.lastSeq = newestSeq(game);
	}

	/** The table changed (or might have): note what's new since the last state. */
	record(game: GameState, now = Date.now()) {
		const events = game.log.filter((e) => e.seq > this.lastSeq);
		this.lastSeq = Math.max(this.lastSeq, newestSeq(game));
		const next = keep(game);
		const patch = diff(this.last, next);
		const shown = events.filter((e) => e.type !== 'chat');
		// Chat isn't kept, and a state that only said something isn't a step.
		if (!shown.length && patch.every(([path]) => path[0] === 'version')) return;
		if (this.steps.length >= REPLAY_MAX_STEPS) {
			this.cut = true;
			return;
		}
		this.last = next;
		this.steps.push({ t: Math.max(0, now - this.began), events: structuredClone(shown), patch });
	}

	get size() {
		return this.steps.length;
	}

	replay(): Replay {
		return {
			v: REPLAY_VERSION,
			start: this.start,
			startEvents: this.startEvents,
			steps: this.steps,
			...(this.cut ? { cut: true } : {})
		};
	}
}

function newestSeq(g: { log: GameEvent[] }) {
	return g.log.length ? g.log[g.log.length - 1].seq : 0;
}

/**
 * Every state of a replay, from the deal (index 0) to after its last step, each with the log as
 * the table had it then.
 */
export function replayStates(r: Replay): GameState[] {
	const out: GameState[] = [];
	let state = r.start;
	let log: GameEvent[] = r.startEvents ?? [];
	out.push({ ...state, log, rng: 0 } as GameState);
	for (const step of r.steps) {
		state = applyPatch(state, step.patch);
		if (step.events.length) {
			log = [...log, ...step.events];
			if (log.length > LOG_LIMIT) log = log.slice(log.length - LOG_LIMIT);
		}
		out.push({ ...state, log, rng: 0 } as GameState);
	}
	return out;
}
