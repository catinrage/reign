import { DEFAULT_CONQUEST_SETTINGS } from '../../shared/conquest/types';
import type { Match } from '../../shared/accounts';
import type { LobbyInfo } from '../../shared/protocol';
import { REPLAY_VERSION, replayStates, type Replay, type ReplayStep } from '../../shared/replay';
import { totalPoints } from '../../shared/rules/engine';
import { DEFAULT_SETTINGS } from '../../shared/rules/modes';
import type { GameState, GameView } from '../../shared/rules/types';
import { viewFor } from '../../shared/rules/view';
import { t } from '../i18n/index.svelte';
import { sceneRef } from '../ui/sceneRef';
import { api } from './account.svelte';
import { client } from './client.svelte';

/**
 * Watching a finished game again. The whole recording is loaded and played back in the page on
 * the same table and HUD as a live game, seen as a spectator who sees every hand.
 */

/** A stretch of the game with one player at the helm: a turn, or one placement in the setup. */
export interface ReplayTurn {
	/** First and last state index of the stretch. */
	from: number;
	to: number;
	player: number;
	/** The game's turn number (0 in the draft and the setup). */
	turn: number;
	phase: GameState['phase'];
}

export type MarkKind = 'seven' | 'army' | 'road' | 'event' | 'win';

/** Something worth finding on the timeline, at the state it happened in. */
export interface ReplayMark {
	index: number;
	kind: MarkKind;
	player: number | null;
	/** For an event card: its id; for a seven: the dice. */
	detail?: string;
}

/** The speeds the player can pick. */
export const SPEEDS = [0.5, 1, 2, 4, 8];

/** How long a step stays on screen at 1×, whatever the players took to make it. */
const MIN_STEP_MS = 450;
const MAX_STEP_MS = 1700;

class ReplayPlayer {
	/** The game being watched, as the history lists it. */
	match = $state.raw<Match | null>(null);
	/** The game whose replay is being fetched, for the button that asked. */
	loading = $state<number | null>(null);
	error = $state('');
	/** Where in the game the table is: 0 is the deal, `last` the end. */
	index = $state(0);
	last = $state(0);
	playing = $state(false);
	speed = $state(1);
	turns = $state.raw<ReplayTurn[]>([]);
	marks = $state.raw<ReplayMark[]>([]);
	/** Everyone's points (hidden ones too) at the start of each turn, then at the end. */
	points = $state.raw<{ index: number; points: number[] }[]>([]);
	/** Milliseconds into the game of every state. */
	times = $state.raw<number[]>([]);
	/** The recording stopped before the game did. */
	cut = $state(false);

	private states: GameState[] = [];
	private views = new Map<number, GameView>();
	private timer: ReturnType<typeof setTimeout> | undefined;

	get open() {
		return client.replaying && this.match !== null;
	}

	/** Fetch a game's replay and start watching it from the deal. */
	async watch(match: Match) {
		if (this.loading !== null) return;
		this.loading = match.id;
		this.error = '';
		try {
			const replay = await api<Replay>(`replays/${match.id}`);
			if (!replay || typeof replay.v !== 'number' || replay.v > REPLAY_VERSION || !replay.start) {
				throw new Error(t('This replay was made by a newer version of the game.'));
			}
			this.load(match, replay);
		} catch (e) {
			this.error = (e as Error).message;
			client.toast(this.error, 'error');
		} finally {
			this.loading = null;
		}
	}

	/** Start watching a replay that's already here. */
	load(match: Match, replay: Replay) {
		this.pause();
		this.states = replayStates(replay);
		this.views.clear();
		this.match = match;
		this.cut = !!replay.cut;
		this.last = this.states.length - 1;
		this.index = 0;
		this.times = [0, ...replay.steps.map((s: ReplayStep) => s.t)];
		this.turns = turnsOf(this.states);
		this.marks = marksOf(replay.steps);
		this.points = this.turns
			.filter((tn, k) => k === 0 || tn.turn !== this.turns[k - 1].turn)
			.map((tn) => ({ index: tn.from, points: this.pointsAt(tn.from) }))
			.concat([{ index: this.last, points: this.pointsAt(this.last) }]);
		const scene = sceneRef.current;
		if (scene) scene.replay = true;
		client.startReplay(lobbyFor(match, this.states[0]), this.viewAt(0));
		this.play();
	}

	private pointsAt(i: number) {
		const s = this.states[i];
		return s.players.map((_, p) => totalPoints(s, p));
	}

	/** The table at state `i`, with every hand showing. */
	viewAt(i: number): GameView {
		let v = this.views.get(i);
		if (!v) {
			v = viewFor(this.states[i], -1, true);
			// Kept for the states near the playhead, which are the ones asked for again.
			if (this.views.size > 64) this.views.clear();
			this.views.set(i, v);
		}
		return v;
	}

	/** Jump to state `i` (scrubbing, skipping): the table shows it at once. */
	seek(i: number) {
		if (!this.open) return;
		i = Math.max(0, Math.min(this.last, Math.round(i)));
		const view = this.viewAt(i);
		this.index = i;
		sceneRef.current?.jumpTo(view);
		client.setReplayView(view, true);
		if (this.playing) this.schedule();
	}

	/** One state on, played out like a live game. */
	stepOn() {
		if (!this.open || this.index >= this.last) return;
		this.index++;
		client.setReplayView(this.viewAt(this.index), false);
	}

	/** The turn the playhead is in. */
	get turn(): ReplayTurn | null {
		return this.turnAt(this.index);
	}

	turnAt(i: number): ReplayTurn | null {
		const list = this.turns;
		let lo = 0;
		let hi = list.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (list[mid].to < i) lo = mid + 1;
			else if (list[mid].from > i) hi = mid - 1;
			else return list[mid];
		}
		return null;
	}

	/** To the start of the next turn (or the end). */
	nextTurn() {
		const next = this.turns.find((tn) => tn.from > this.index);
		this.seek(next ? next.from : this.last);
	}

	/** Back to the start of this turn, or of the one before when already there. */
	prevTurn() {
		const cur = this.turn;
		if (cur && cur.from < this.index) return this.seek(cur.from);
		const prev = [...this.turns].reverse().find((tn) => tn.from < this.index);
		this.seek(prev ? prev.from : 0);
	}

	play() {
		if (!this.open) return;
		if (this.index >= this.last) this.seek(0);
		this.playing = true;
		this.schedule();
	}

	pause() {
		this.playing = false;
		clearTimeout(this.timer);
	}

	toggle() {
		if (this.playing) this.pause();
		else this.play();
	}

	setSpeed(speed: number) {
		this.speed = speed;
		if (this.playing) this.schedule();
	}

	/** Stop watching: back to the menu. */
	close() {
		if (client.replaying) client.leave();
		else this.reset();
	}

	/** The replay is over (closed here, or left from the game menu or the victory window). */
	reset() {
		this.pause();
		this.match = null;
		this.states = [];
		this.views.clear();
		const scene = sceneRef.current;
		if (scene) scene.replay = false;
	}

	/** The next step comes after about as long as the players took, sped up and kept watchable. */
	private schedule() {
		clearTimeout(this.timer);
		if (!this.playing) return;
		const gap = (this.times[this.index + 1] ?? 0) - (this.times[this.index] ?? 0);
		const wait = Math.max(MIN_STEP_MS, Math.min(MAX_STEP_MS, gap)) / this.speed;
		this.timer = setTimeout(() => this.tick(), wait);
	}

	private tick() {
		if (!this.playing || !this.open) return;
		// Dice in the air, a card turning over or the menu open: the game waits for them.
		if (client.tossing || client.presenting || client.menuOpen) {
			this.timer = setTimeout(() => this.tick(), 120);
			return;
		}
		if (this.index >= this.last) {
			this.pause();
			return;
		}
		this.stepOn();
		if (this.index >= this.last) this.pause();
		else this.schedule();
	}
}

/** The table as the history knows it: who sat where, under which name. */
function lobbyFor(match: Match, start: GameState): LobbyInfo {
	return {
		code: '',
		game: 'settlement',
		conquest: DEFAULT_CONQUEST_SETTINGS,
		seats: start.players.map((p, i) => {
			const m = match.players[i];
			return {
				id: `replay-${i}`,
				name: p.name,
				color: p.color,
				isBot: p.isBot,
				connected: true,
				left: false,
				isHost: false,
				ready: true,
				userId: m?.user?.id ?? null,
				avatar: m?.user?.avatar ?? null,
				dice: m?.user?.dice ?? null
			};
		}),
		started: true,
		maxPlayers: start.players.length,
		paused: false,
		pausedBy: null,
		turnTime: 0,
		settings: {
			...DEFAULT_SETTINGS,
			mode: start.mode,
			pointsToWin: start.pointsToWin,
			handLimit: start.handLimit
		},
		clock: null,
		spectators: 0,
		mission: start.campaign?.mission ?? null
	};
}

/** The game cut into turns (and setup placements, and draft picks). */
export function turnsOf(states: GameState[]): ReplayTurn[] {
	const out: ReplayTurn[] = [];
	states.forEach((s, i) => {
		const prev = out[out.length - 1];
		if (prev && prev.player === s.current && prev.turn === s.turn && prev.phase === s.phase)
			prev.to = i;
		else if (prev && s.phase === 'ended') prev.to = i;
		else out.push({ from: i, to: i, player: s.current, turn: s.turn, phase: s.phase });
	});
	return out;
}

/** Sevens, the two awards changing hands, event cards and the win. */
export function marksOf(steps: ReplayStep[]): ReplayMark[] {
	const out: ReplayMark[] = [];
	steps.forEach((step, k) => {
		const index = k + 1;
		for (const e of step.events) {
			if (e.type === 'diceRolled' && e.dice[0] + e.dice[1] === 7)
				out.push({ index, kind: 'seven', player: e.player, detail: e.dice.join('+') });
			else if (e.type === 'largestArmy' && e.player !== null)
				out.push({ index, kind: 'army', player: e.player });
			else if (e.type === 'longestRoad' && e.player !== null)
				out.push({ index, kind: 'road', player: e.player });
			else if (e.type === 'eventDrawn')
				out.push({ index, kind: 'event', player: null, detail: e.card });
			else if (e.type === 'gameOver') out.push({ index, kind: 'win', player: e.winner });
		}
	});
	return out;
}

export const replay = new ReplayPlayer();
client.onReplayEnd = () => replay.reset();
