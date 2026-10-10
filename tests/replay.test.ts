import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Recorder, applyPatch, diff, replayStates, type Replay } from '../src/shared/replay';
import { botAction } from '../src/shared/rules/bot';
import { addChat, applyAction, createGame } from '../src/shared/rules/engine';
import type { GameSettings } from '../src/shared/rules/modes';
import type { Action, GameState } from '../src/shared/rules/types';
import { openDb } from '../src/server/db';
import { Accounts } from '../src/server/accounts';

const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'] as const;
const players = (n: number) =>
	COLORS.slice(0, n).map((color, i) => ({ name: `P${i}`, color, isBot: true, character: null }));

/** Play a bot game to the end, recording it, and keep every state it went through. */
function playRecorded(s: GameState, limit = 30000) {
	const rec = new Recorder(s, 0);
	const seen: GameState[] = [s];
	const n = s.players.length;
	let perTurn = 0;
	let lastTurn = -1;
	for (let steps = 0; s.phase !== 'ended' && steps < limit; steps++) {
		if (s.turn !== lastTurn) {
			lastTurn = s.turn;
			perTurn = 0;
		}
		let p = -1;
		let a: Action | null = null;
		for (let o = 0; o < n && !a; o++) if (o !== s.current && (a = botAction(s, o))) p = o;
		if (!a) a = botAction(s, (p = s.current), perTurn++)!;
		const r = applyAction(s, p, a);
		if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
		s = r.state;
		// Somebody says something now and then: chat never makes it into a replay.
		if (steps % 37 === 5) {
			s = addChat(s, 0, 'secret plans');
			rec.record(s, steps * 10);
		}
		rec.record(s, steps * 10 + 5);
		seen.push(s);
	}
	expect(s.phase).toBe('ended');
	return { rec, seen };
}

const strip = ({ log: _l, rng: _r, version: _v, ...rest }: GameState) => rest;

describe('replays', () => {
	it('diff and patch turn one value into another', () => {
		const a = { x: 1, list: [1, 2, 3], deep: { keep: { n: 1 }, gone: true }, same: { k: [1] } };
		const b = {
			x: 2,
			list: [1, 5, 3],
			deep: { keep: { n: 1 }, fresh: 'yes' },
			same: a.same,
			grown: [1, 2]
		};
		const ops = diff(a, b);
		const c = applyPatch(a, ops);
		expect(c).toEqual(b);
		// Nothing it was made from changed, and what didn't change is shared.
		expect(a.list).toEqual([1, 2, 3]);
		expect(a.deep).toEqual({ keep: { n: 1 }, gone: true });
		expect(c.same).toBe(a.same);
		expect(c.deep.keep).toBe(a.deep.keep);
		expect(applyPatch([1, 2], diff([1, 2], [1, 2, 3]))).toEqual([1, 2, 3]);
	});

	it('play a whole game back state by state', () => {
		for (const [seed, settings] of [
			[3, {}],
			[8, { mode: 'extended', characters: true, powers: true }]
		] as [number, Partial<GameSettings>][]) {
			let s = createGame(players(4), seed, undefined, settings);
			// The draft is played like any other step.
			const { rec, seen } = playRecorded(s);
			// Through JSON and gzip, as it is stored and sent.
			const replay = JSON.parse(
				gunzipSync(gzipSync(JSON.stringify(rec.replay()))).toString()
			) as Replay;
			const states = replayStates(replay);
			expect(states.length).toBe(seen.length);
			for (let i = 0; i < seen.length; i++) expect(strip(states[i])).toEqual(strip(seen[i]));
			const last = states[states.length - 1];
			expect(last.phase).toBe('ended');
			// The log at every point is the game's log then, without the chat.
			const said = seen[seen.length - 1].log.filter((e) => e.type !== 'chat');
			const tag = (e: { seq: number; type: string }) => `${e.seq}:${e.type}`;
			expect(last.log.slice(-said.length).map(tag)).toEqual(said.map(tag));
			expect(states.flatMap((st) => st.log).some((e) => e.type === 'chat')).toBe(false);
			expect(replay.steps.every((st, k) => k === 0 || st.t >= replay.steps[k - 1].t)).toBe(true);
			s = last;
		}
	}, 60_000);

	it('are kept with the match and shown to its players and their friends only', async () => {
		const db = await openDb('memory://');
		const accounts = new Accounts(db);
		const a = await accounts.register({
			username: 'anna',
			nickname: 'Anna',
			password: 'secret123',
			avatar: 'fox'
		});
		const b = await accounts.register({
			username: 'bert',
			nickname: 'Bert',
			password: 'secret123',
			avatar: 'fox'
		});
		const c = await accounts.register({
			username: 'cleo',
			nickname: 'Cleo',
			password: 'secret123',
			avatar: 'fox'
		});
		const id = await accounts.matchStarted({
			code: 'ABCDE',
			mode: 'classic',
			mapName: 'Classic Isle',
			pointsToWin: 10,
			seats: [
				{ userId: a.user.id, name: 'Anna', color: 'red', isBot: false, character: null },
				{ userId: null, name: 'Bot', color: 'blue', isBot: true, character: null }
			]
		});
		let h = await accounts.history(a.user.id);
		expect(h!.matches[0].replay).toBe(false);
		await accounts.saveReplay(id, 1, 3, gzipSync('{"v":1}'));
		h = await accounts.history(a.user.id);
		expect(h!.matches[0].replay).toBe(true);
		expect(gunzipSync(Buffer.from((await accounts.replay(a.user.id, id))!)).toString()).toBe(
			'{"v":1}'
		);
		expect(await accounts.replay(b.user.id, id)).toBeNull();
		await accounts.requestFriend(b.user.id, 'anna');
		expect(await accounts.replay(b.user.id, id)).toBeNull();
		await accounts.acceptFriend(a.user.id, b.user.id);
		expect(await accounts.replay(b.user.id, id)).not.toBeNull();
		expect(await accounts.replay(c.user.id, id)).toBeNull();
		expect(await accounts.replay(a.user.id, '999')).toBeNull();
		await db.close();
	}, 60_000);
});
