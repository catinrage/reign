import type { Match } from '../../shared/accounts';
import { CQ_LOG_LIMIT, conquestView } from '../../shared/conquest/rules';
import type { CqEvent, CqState, CqView } from '../../shared/conquest/types';
import type { LobbyInfo } from '../../shared/protocol';
import { REPLAY_VERSION, replayStates, type Replay } from '../../shared/replay';
import { DEFAULT_SETTINGS } from '../../shared/rules/modes';
import { t } from '../i18n/index.svelte';
import { sceneRef } from '../ui/sceneRef';
import { api } from './account.svelte';
// Loaded first, so its hook for the end of a replay is in place before this one wraps it.
import './replay.svelte';
import { client } from './client.svelte';

/**
 * Watching a finished game of Conquest again: the whole recording is loaded, and the board plays
 * it back battle by battle, seen as a spectator who sees every hand.
 */

/** One player's turn (or the opening deployment), from its first state to its last. */
export interface CqReplayTurn {
	from: number;
	to: number;
	player: number;
	round: number;
	deploy: boolean;
}

export const CQ_SPEEDS = [0.5, 1, 2, 4, 8];
const MIN_STEP_MS = 380;
const MAX_STEP_MS = 1500;

class CqReplayPlayer {
	match = $state.raw<Match | null>(null);
	loading = $state<number | null>(null);
	index = $state(0);
	last = $state(0);
	playing = $state(false);
	speed = $state(1);
	turns = $state.raw<CqReplayTurn[]>([]);
	cut = $state(false);
	private states: CqState[] = [];
	private times: number[] = [];
	private timer: ReturnType<typeof setTimeout> | undefined;

	get open() {
		return client.replaying && this.match !== null;
	}

	async watch(match: Match) {
		if (this.loading !== null) return;
		this.loading = match.id;
		try {
			const replay = await api<Replay<Omit<CqState, 'log' | 'rng'>, CqEvent>>(`replays/${match.id}`);
			if (!replay || typeof replay.v !== 'number' || replay.v > REPLAY_VERSION || !replay.start) {
				throw new Error(t('This replay was made by a newer version of the game.'));
			}
			this.load(match, replay);
		} catch (e) {
			client.toast((e as Error).message, 'error');
		} finally {
			this.loading = null;
		}
	}

	load(match: Match, replay: Replay<Omit<CqState, 'log' | 'rng'>, CqEvent>) {
		this.pause();
		this.states = replayStates<CqState>(replay, CQ_LOG_LIMIT);
		this.match = match;
		this.cut = !!replay.cut;
		this.last = this.states.length - 1;
		this.index = 0;
		this.times = [0, ...replay.steps.map((s) => s.t)];
		this.turns = turnsOf(this.states);
		const scene = sceneRef.current;
		if (scene) scene.replay = true;
		client.startCqReplay(lobbyFor(match, this.states[0]), this.viewAt(0));
		this.play();
	}

	viewAt(i: number): CqView {
		return conquestView(this.states[i], -1, true);
	}

	seek(i: number) {
		if (!this.open) return;
		i = Math.max(0, Math.min(this.last, Math.round(i)));
		const view = this.viewAt(i);
		this.index = i;
		sceneRef.current?.conquest?.jumpTo(view);
		client.cq = view;
		if (this.playing) this.schedule();
	}

	stepOn() {
		if (!this.open || this.index >= this.last) return;
		this.index++;
		client.cq = this.viewAt(this.index);
	}

	get turn(): CqReplayTurn | null {
		return this.turns.find((tn) => tn.from <= this.index && this.index <= tn.to) ?? null;
	}

	nextTurn() {
		const next = this.turns.find((tn) => tn.from > this.index);
		this.seek(next ? next.from : this.last);
	}

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

	close() {
		if (client.replaying) client.leave();
		else this.reset();
	}

	reset() {
		this.pause();
		this.match = null;
		this.states = [];
		const scene = sceneRef.current;
		if (scene) scene.replay = false;
	}

	private schedule() {
		clearTimeout(this.timer);
		if (!this.playing) return;
		const gap = (this.times[this.index + 1] ?? 0) - (this.times[this.index] ?? 0);
		const wait = Math.max(MIN_STEP_MS, Math.min(MAX_STEP_MS, gap)) / this.speed;
		this.timer = setTimeout(() => this.tick(), wait);
	}

	private tick() {
		if (!this.playing || !this.open) return;
		// The board is still showing a battle, or the menu is open: wait for it.
		if (sceneRef.current?.conquest?.busy || client.menuOpen) {
			this.timer = setTimeout(() => this.tick(), 120);
			return;
		}
		if (this.index >= this.last) return this.pause();
		this.stepOn();
		if (this.index >= this.last) this.pause();
		else this.schedule();
	}
}

function lobbyFor(match: Match, start: CqState): LobbyInfo {
	return {
		code: '',
		game: 'conquest',
		conquest: start.settings,
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
		settings: DEFAULT_SETTINGS,
		clock: null,
		spectators: 0,
		mission: null
	};
}

/** The game cut into turns: the deployment, then each player's go. */
export function turnsOf(states: CqState[]): CqReplayTurn[] {
	const out: CqReplayTurn[] = [];
	states.forEach((s, i) => {
		const prev = out[out.length - 1];
		const deploy = s.phase === 'deploy';
		if (prev && (s.phase === 'ended' || (prev.deploy && deploy) || (!deploy && !prev.deploy && prev.player === s.current && prev.round === s.round))) prev.to = i;
		else out.push({ from: i, to: i, player: s.current, round: s.round, deploy });
	});
	return out;
}

export const cqReplay = new CqReplayPlayer();
{
	const before = client.onReplayEnd;
	client.onReplayEnd = () => {
		before?.();
		cqReplay.reset();
	};
}
