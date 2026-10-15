import { attackBlock, attackDiceMax, attackTargets, canAttackFrom, canAttackNow, canEndTurnNow, canFortifyNow, conquestMap, fortifyMoves, fortifyRoute, fortifyTargets, neighbors } from '../../../shared/conquest/queries';
import type { Battle, CqAction, CqEvent, CqView } from '../../../shared/conquest/types';
import type { TerritoryLook } from '../../scene/conquest/realmBoard';
import { PLAYER_RGB } from '../../scene/layout';
import { client } from '../../state/client.svelte';
import { t } from '../../i18n/index.svelte';
import { sceneRef } from '../sceneRef';
import { sfx } from '../sound';

/**
 * What the player is doing on the Conquest board right now: the territory they picked to attack
 * or move from, the one they aim at, how many armies a click places. Clicks and drags on the
 * board come in here (see ConquestHud's scene callbacks); what each means depends on the step.
 */

/** How many armies one click places while reinforcing. */
export type PlaceStep = 1 | 5 | 'all';

/** The colour targets light up in during an attack. */
const ENEMY_GLOW = 0xff4a32;
/** Territories of yours a click does something on (place, attack from, move from), and the one picked. */
const PICK_GLOW = 0xffd45a;
/** Where armies on the move can go. */
const MARCH_GLOW = 0x9be36a;

class CqPlay {
	/** The state the interface shows: the newest one the board has finished playing out. */
	view = $state.raw<CqView | null>(null);
	/** Picked to attack or move from. */
	selected = $state<number | null>(null);
	/** Being attacked from `selected` (the combat panel is open), or picked to move to. */
	target = $state<number | null>(null);
	/** Under the pointer. */
	hover = $state<number | null>(null);
	/** Tapped on a touch screen, for its information card (or clicked where nothing else happens). */
	info = $state<number | null>(null);
	/** Dev cheats (the dev server only): the next click on the map picks `cheatTarget` instead of playing. */
	cheatPick = $state(false);
	cheatTarget = $state<number | null>(null);
	placeStep = $state<PlaceStep>(1);
	/** The dice to roll in an attack (null: as many as allowed). */
	dice = $state<number | null>(null);
	/** Armies to move (fortifying, or into a territory just taken). */
	move = $state(1);
	/** The battle the board is showing now, for the dice in the combat panel. */
	battle = $state.raw<{ b: Battle; roll: number; id: number } | null>(null);
	/** The last battle fought from the current selection, kept up once its dice have landed. */
	lastBattle = $state.raw<Battle | null>(null);
	/** Cards panel open. */
	cardsOpen = $state(false);
	/** Your secret mission's card open. */
	missionOpen = $state(false);
	/** This round's omen card open. */
	omenOpen = $state(false);
	/** A short note where the player clicked: why that did nothing. */
	note = $state<{ text: string; x: number; y: number; id: number } | null>(null);
	/** Armies placed this turn, newest last, so Undo can take them back in order. */
	placements = $state.raw<number[]>([]);
	/** A player whose plaque the mouse is on: their territories light up. */
	spotlight = $state<number | null>(null);
	private battleId = 0;
	private noteTimer: ReturnType<typeof setTimeout> | undefined;
	/** Where the last pointer event on the board was (screen pixels), for notes. */
	pointer = { x: 0, y: 0 };

	get me() {
		return this.view?.me ?? -1;
	}

	get myTurn() {
		const v = this.view;
		return !!v && v.me >= 0 && v.phase === 'play' && v.current === v.me && !client.spectating && !client.replaying;
	}

	/** This player still has starting armies to place (everyone places at once before the first turn). */
	get deploying() {
		const v = this.view;
		return !!v && v.me >= 0 && v.phase === 'deploy' && v.reserve[v.me] > 0 && !client.spectating && !client.replaying;
	}

	/** Placing armies now: the starting ones, or the turn's. */
	get placing() {
		const v = this.view;
		if (!v) return false;
		return this.deploying || (this.myTurn && v.step === 'reinforce' && v.reserve[v.me] > 0);
	}

	get reserve() {
		const v = this.view;
		return v && v.me >= 0 ? v.reserve[v.me] : 0;
	}

	/** Attacking now: armies placed, cards traded. */
	get attacking() {
		const v = this.view;
		return !!v && this.myTurn && canAttackNow(v, v.me);
	}

	get fortifying() {
		const v = this.view;
		return !!v && this.myTurn && v.step === 'fortify';
	}

	get occupying() {
		const v = this.view;
		return !!v && this.myTurn && v.step === 'occupy' && !!v.occupy;
	}

	/** A new state from the board (it has played out): drop what no longer applies. */
	settle(view: CqView) {
		const prev = this.view;
		this.view = view;
		const me = view.me;
		if (prev && (prev.turn !== view.turn || prev.current !== view.current || prev.phase !== view.phase)) {
			this.clear();
			this.placements = [];
			this.lastBattle = null;
		}
		const s = this.selected;
		if (s !== null && view.owner[s] !== me) this.clear();
		if (this.selected !== null && view.step === 'attack' && !canAttackFrom(view, me, this.selected)) {
			// Out of armies to attack with: the attack from here is over.
			this.selected = null;
			this.target = null;
		}
		if (this.target !== null && view.step === 'attack' && view.owner[this.target] === me) this.target = null;
		if (view.step === 'occupy' && view.occupy) {
			this.move = defaultOccupy(view);
			this.selected = view.occupy.from;
			this.target = view.occupy.to;
		} else if (prev?.step === 'occupy') {
			// Moved in: the attack goes on from wherever has the armies for it.
			const from = prev.occupy?.from ?? null;
			const to = prev.occupy?.to ?? null;
			this.target = null;
			this.selected = to !== null && canAttackFrom(view, me, to) ? to : from !== null && canAttackFrom(view, me, from) ? from : null;
		}
		if (view.step === 'fortify' && prev?.step !== 'fortify') this.clear();
		if (!view.players[me]?.cards?.length) this.cardsOpen = false;
		if (view.mustTrade && this.myTurn) this.cardsOpen = true;
		this.sync();
	}

	clear() {
		this.selected = null;
		this.target = null;
		this.dice = null;
		this.sync();
	}

	// ------------------------------------------------------------ the board says

	hovered(t: number | null) {
		this.hover = t;
		this.sync();
	}

	/** A click or tap on territory `t` (null: on no territory). */
	clicked(ter: number | null, touch: boolean) {
		const v = this.view;
		if (!v) return;
		if (this.cheatPick) {
			this.cheatPick = false;
			if (ter !== null) this.cheatTarget = ter;
			return;
		}
		if (ter === null) {
			// A click off the map lets go of what was picked.
			this.info = null;
			if (!this.occupying) this.clear();
			return;
		}
		const me = v.me;
		const name = this.name(ter);
		if (this.placing) {
			if (v.owner[ter] !== me) return this.say(t('Place armies on your own territories.'));
			if (v.mustTrade) return this.say(t('Trade in a set of cards first.'));
			const n = this.placeStep === 'all' ? this.reserve : Math.min(this.placeStep, this.reserve);
			this.act({ type: 'place', territory: ter, count: n });
			this.placements = [...this.placements, ...Array(n).fill(ter)];
			sfx.build();
			return;
		}
		if (this.occupying) {
			if (ter === v.occupy!.to || ter === v.occupy!.from) return this.occupy();
			return this.say(t('Move your armies into {place} first.', { place: this.name(v.occupy!.to) }));
		}
		if (this.attacking) {
			if (v.owner[ter] === me) {
				if (this.selected === ter) return this.clear();
				if (v.armies[ter] < 2) return this.say(t('{place} needs at least 2 armies to attack.', { place: name }), touch ? ter : undefined);
				if (!attackTargets(v, ter).length) return this.say(t('{place} has no enemy next to it.', { place: name }), touch ? ter : undefined);
				this.selected = ter;
				this.target = null;
				this.dice = null;
				this.lastBattle = null;
				sfx.click();
				return this.sync();
			}
			const s = this.selected;
			if (s === null) {
				const from = neighbors(ter, conquestMap(v.settings)).filter((n) => canAttackFrom(v, me, n));
				// Only one of yours can reach it: attack from there straight away.
				if (from.length === 1) {
					this.selected = from[0];
					return this.attack(ter);
				}
				if (!from.length) return this.say(t('None of your armies can reach {place}.', { place: name }), touch ? ter : undefined);
				return this.say(t('Pick one of your territories next to {place} to attack from.', { place: name }));
			}
			if (!attackTargets(v, s).includes(ter)) {
				const block = neighbors(s, conquestMap(v.settings)).includes(ter) ? attackBlock(v, s, ter) : null;
				return this.say(block ? blockNote(block) : t('{place} is not next to {from}.', { place: name, from: this.name(s) }), touch ? ter : undefined);
			}
			return this.attack(ter);
		}
		if (this.fortifying || (this.myTurn && canFortifyNow(v, me) && this.selected !== null)) {
			if (v.owner[ter] !== me) return this.say(t('Armies only move between your own territories.'), touch ? ter : undefined);
			const s = this.selected;
			if (s === null || s === ter) {
				if (s === ter) return this.clear();
				if (v.armies[ter] < 2) return this.say(t('{place} has no armies to spare.', { place: name }), touch ? ter : undefined);
				if (!fortifyTargets(v, ter).length) return this.say(t('{place} is cut off from your other territories.', { place: name }), touch ? ter : undefined);
				this.selected = ter;
				this.target = null;
				sfx.click();
				return this.sync();
			}
			if (!fortifyTargets(v, s).includes(ter)) return this.say(t('{place} is not connected to {from} through your territories.', { place: name, from: this.name(s) }), touch ? ter : undefined);
			this.target = ter;
			this.move = v.armies[s] - 1;
			sfx.click();
			return this.sync();
		}
		// Nothing to do with it now: show what it is.
		this.info = this.info === ter ? null : ter;
	}

	/** May a drag start from `t`? Only from the territory already picked, to attack or move. */
	dragStart(t: number): boolean {
		const v = this.view;
		if (!v || t !== this.selected || v.owner[t] !== v.me) return false;
		return this.attacking || this.fortifying;
	}

	dropped(from: number, to: number | null) {
		if (to === null || to === from) return;
		this.selected = from;
		this.clicked(to, false);
	}

	// ------------------------------------------------------------ actions

	act(action: CqAction) {
		client.cqAct(action);
	}

	attack(to: number, blitz = false) {
		const v = this.view;
		const s = this.selected;
		if (!v || s === null || sceneRef.current?.conquest?.busy) return;
		this.target = to;
		const most = attackDiceMax(v, s, to);
		const dice = Math.max(1, Math.min(most, this.dice ?? most));
		this.act({ type: 'attack', from: s, to, dice, ...(blitz ? { blitz: true } : {}) });
		this.sync();
	}

	occupy(count = this.move) {
		const v = this.view;
		if (!v?.occupy) return;
		this.act({ type: 'occupy', count: Math.max(v.occupy.min, Math.min(v.occupy.max, count)) });
		sfx.build();
	}

	fortify() {
		const v = this.view;
		if (!v || this.selected === null || this.target === null) return;
		this.act({ type: 'fortify', from: this.selected, to: this.target, count: Math.max(1, Math.min(v.armies[this.selected] - 1, this.move)) });
		sfx.build();
		this.clear();
	}

	/**
	 * Take back the last army placed this step. Without a list of placements (lost on a reload, or
	 * dropped once out of step with the board) any army of yours placed this step comes back.
	 */
	undo() {
		const v = this.view;
		if (!v) return;
		const last = this.placements.at(-1) ?? v.placed.findIndex((_, t) => this.placedHere(v, t));
		if (last < 0 || !this.placedHere(v, last)) {
			this.placements = [];
			return;
		}
		this.placements = this.placements.slice(0, -1);
		this.act({ type: 'place', territory: last, count: -1 });
	}

	get canUndo() {
		const v = this.view;
		// While everyone deploys at once, the armies others place are in `placed` too.
		return !!v && (this.placing || (this.myTurn && v.step === 'reinforce')) && v.placed.some((_, t) => this.placedHere(v, t));
	}

	/** This player put armies on `t` this step and can take one back. */
	private placedHere(v: CqView, t: number) {
		return v.placed[t] > 0 && v.owner[t] === v.me;
	}

	endAttack() {
		this.clear();
		this.act({ type: 'endAttack' });
	}

	endTurn() {
		this.clear();
		this.act({ type: 'endTurn' });
	}

	get canEndTurn() {
		const v = this.view;
		return !!v && this.myTurn && canEndTurnNow(v, v.me);
	}

	/** A fortify move now ends the turn (the turn's last move, by the table's rules and the warlord's). */
	get lastMove() {
		const v = this.view;
		return !!v && v.me >= 0 && (v.moves ?? 0) + 1 >= fortifyMoves(v, v.me);
	}

	// ------------------------------------------------------------ the board shows

	/** A battle being fought on the board: its dice roll in the combat panel for `roll` seconds. */
	fought(b: Battle, roll: number) {
		this.battle = { b, roll, id: ++this.battleId };
		if (b.player === this.me) this.lastBattle = b;
		sfx.dice();
	}

	captured(e: Extract<CqEvent, { type: 'captured' }>) {
		if (e.player === this.me) sfx.horn();
		else if (e.defender === this.me) sfx.steal();
	}

	/** The territory's name, as the map shows it. */
	name(ter: number) {
		const v = this.view;
		return v ? t(conquestMap(v.settings).territories[ter]?.name ?? '') : '';
	}

	private say(text: string, at?: number) {
		clearTimeout(this.noteTimer);
		sfx.error();
		const spot = at !== undefined ? sceneRef.current?.conquest?.screenOf(at) : null;
		this.note = { text, x: spot?.x ?? this.pointer.x, y: spot?.y ?? this.pointer.y, id: (this.note?.id ?? 0) + 1 };
		this.noteTimer = setTimeout(() => (this.note = null), 2600);
	}

	/** Light up the board for what is going on, and say which territories a click does something on. */
	sync() {
		const scene = sceneRef.current?.conquest;
		const v = this.view;
		if (!scene || !v) return;
		const n = v.owner.length;
		const looks: (TerritoryLook | undefined)[] = new Array(n);
		const me = v.me;
		const mine = me >= 0 ? (PLAYER_RGB[v.players[me]?.color] ?? 0xffffff) : 0xffffff;
		const clickable = new Set<number>();
		let intent: Parameters<typeof scene.setIntent>[0] = null;
		const emphasis: number[] = [];
		const lanes = new Set<string>();
		if (this.placing) {
			// Every territory of yours, for as long as the placing takes: its medallion ringed and a
			// faint line along its border, the land in its own colors, the rest a little faded. Lit
			// any brighter, set against the rest faded further, the whole map looked over-contrasted.
			for (let t = 0; t < n; t++) {
				if (v.owner[t] === me) {
					looks[t] = { glow: 0.28, ring: 0.9, color: PICK_GLOW };
					clickable.add(t);
				} else looks[t] = { dim: 0.3 };
			}
		} else if (this.occupying) {
			const o = v.occupy!;
			for (let t = 0; t < n; t++) looks[t] = { dim: 0.8 };
			looks[o.from] = { fill: 0.6, glow: 0.6, color: PICK_GLOW };
			looks[o.to] = { fill: 0.9, glow: 1, color: MARCH_GLOW, pulse: 0.8 };
			clickable.add(o.to);
			intent = { from: o.from, to: o.to, color: mine, style: 'move' };
			emphasis.push(o.from, o.to);
		} else if (this.attacking) {
			const s = this.selected;
			if (s === null) {
				for (let t = 0; t < n; t++) {
					if (v.owner[t] === me && canAttackFrom(v, me, t)) {
						looks[t] = { glow: 0.9, fill: 0.25, color: PICK_GLOW, pulse: 0.5 };
						clickable.add(t);
					} else if (v.owner[t] !== me) clickable.add(t);
				}
			} else {
				const targets = attackTargets(v, s);
				for (let t = 0; t < n; t++) looks[t] = { dim: 0.8 };
				looks[s] = { fill: 0.8, glow: 1, color: PICK_GLOW };
				for (const t of targets) {
					const aimed = t === this.target || t === this.hover;
					looks[t] = { glow: 1, fill: aimed ? 0.7 : 0.2, color: ENEMY_GLOW, pulse: aimed ? 0.3 : 1 };
					clickable.add(t);
					emphasis.push(t);
					lanes.add(laneKey(s, t));
				}
				for (let t = 0; t < n; t++) if (v.owner[t] === me && canAttackFrom(v, me, t)) clickable.add(t);
				emphasis.push(s);
				const aim = this.target ?? (this.hover !== null && targets.includes(this.hover) ? this.hover : null);
				if (aim !== null) intent = { from: s, to: aim, color: mine, style: this.target === aim ? 'attack' : 'preview' };
			}
		} else if (this.myTurn && canFortifyNow(v, me) && (this.fortifying || this.selected !== null)) {
			const s = this.selected;
			if (s === null) {
				for (let t = 0; t < n; t++) {
					if (v.owner[t] === me && v.armies[t] >= 2 && fortifyTargets(v, t).length) {
						looks[t] = { glow: 0.9, fill: 0.25, color: PICK_GLOW, pulse: 0.5 };
						clickable.add(t);
					}
				}
			} else {
				const reach = fortifyTargets(v, s);
				for (let t = 0; t < n; t++) looks[t] = { dim: 0.8 };
				looks[s] = { fill: 0.8, glow: 1, color: PICK_GLOW };
				for (const t of reach) {
					looks[t] = { glow: 0.85, color: MARCH_GLOW, pulse: 0.6 };
					clickable.add(t);
				}
				clickable.add(s);
				const aim = this.target ?? (this.hover !== null && reach.includes(this.hover) ? this.hover : null);
				if (aim !== null) {
					// The way the armies march, through territories of yours.
					const path = fortifyRoute(v, s, aim);
					for (const t of path) if (t !== s) looks[t] = { ...looks[t], fill: t === aim ? 0.85 : 0.45, color: MARCH_GLOW };
					for (let i = 1; i < path.length; i++) lanes.add(laneKey(path[i - 1], path[i]));
					intent = { from: s, to: aim, color: mine, style: this.target === aim ? 'move' : 'preview' };
					emphasis.push(aim);
				}
				emphasis.push(s);
			}
		} else if (v.phase === 'play') {
			// Someone else's turn (or watching): their territories glow faintly.
			const c = PLAYER_RGB[v.players[v.current]?.color] ?? 0xffffff;
			for (let t = 0; t < n; t++) if (v.owner[t] === v.current) looks[t] = { glow: 0.3, color: c };
		}
		// The fog of war: what can't be seen lies in shadow, whatever else is lit.
		if (v.fogged) for (let t = 0; t < n; t++) if (v.armies[t] < 0) looks[t] = { ...looks[t], fog: 1 };
		if (this.spotlight !== null && v.players[this.spotlight]) {
			const c = PLAYER_RGB[v.players[this.spotlight].color] ?? 0xffffff;
			for (let t = 0; t < n; t++) if (v.owner[t] === this.spotlight) looks[t] = { ...looks[t], glow: 0.9, color: c, dim: 0 };
		}
		if (this.info !== null) emphasis.push(this.info);
		if (this.hover !== null) emphasis.push(this.hover);
		scene.setLooks(looks);
		scene.setMoveIn(this.occupying ? this.move : null);
		scene.setLifted(this.selected);
		scene.setIntent(intent);
		scene.setClickable(clickable);
		scene.setEmphasis(emphasis);
		const map = conquestMap(v.settings);
		map.lanes.forEach(([a, b], k) => {
			const i = map.territories.findIndex((x) => x.id === a);
			const j = map.territories.findIndex((x) => x.id === b);
			scene.board.lanes[k]?.setLit(lanes.has(laneKey(i, j)) ? 1 : 0);
		});
	}
}

/** Why the round's omen keeps an attack off a neighbour. */
function blockNote(block: 'seaFog' | 'snowbound' | 'truce'): string {
	if (block === 'seaFog') return t('Sea Fog: nobody may cross a sea lane this round.');
	if (block === 'snowbound') return t('That region is snowed in this round.');
	return t('The Truce shields the smallest realm this round.');
}

function laneKey(a: number, b: number) {
	return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * How many armies to move into a territory just taken: all that can go when nothing else threatens
 * the territory they leave, otherwise half of them (never fewer than the rules ask).
 */
export function defaultOccupy(v: CqView): number {
	const o = v.occupy!;
	const exposed = attackTargets(v, o.from).some((t) => t !== o.to && v.owner[t] !== v.owner[o.from]);
	return exposed ? Math.max(o.min, Math.ceil(o.max / 2)) : o.max;
}

export const cqPlay = new CqPlay();

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __cqPlay: CqPlay }).__cqPlay = cqPlay;
