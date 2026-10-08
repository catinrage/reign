import { botAction } from '../shared/rules/bot';
import type { GameState } from '../shared/rules/types';
import { client } from './state/client.svelte';

/**
 * Debug helper (?autoplay): lets the bot logic play your seat from what your client can see.
 * Used by the end-to-end test to run whole games in a real browser.
 */
export function startAutoplay(delay = 250) {
	let lastKey = '';
	let perTurn = 0;
	let turnKey = '';
	setInterval(() => {
		const v = client.view;
		if (!v || v.me < 0 || v.phase === 'ended') return;
		const key = `${v.version}:${v.log.length}`;
		if (key === lastKey) return;
		const tk = `${v.turn}:${v.current}`;
		if (tk !== turnKey) {
			turnKey = tk;
			perTurn = 0;
		}
		const state = {
			...v,
			rng: 0,
			devDeck: Array(v.devDeckCount).fill('knight'),
			players: v.players.map((p) => ({
				...p,
				resources: p.resources ?? { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
				devCards: p.devCards ?? []
			}))
		} as unknown as GameState;
		const action = botAction(state, v.me, perTurn);
		if (!action) return;
		lastKey = key;
		if (v.current === v.me) perTurn++;
		client.act(action);
	}, delay);
}
