import * as THREE from 'three';
import { armiesMovedIn, conquestMap, fortifyRoute } from '../../../shared/conquest/queries';
import type { Battle, CqEvent, CqView } from '../../../shared/conquest/types';
import type { RealmMap } from '../../../shared/conquest/realm';
import type { Animator } from '../anim';
import type { Particles } from '../effects';
import { PLAYER_RGB } from '../layout';
import type { Stage } from '../stage';
import { type ArrowStyle, BoardArrow } from './arrow';
import { type BoardNames, type Holder, RealmBoard, type TerritoryLook } from './realmBoard';
import { SIGIL_OF } from './sigils';
import { Troops } from './troops';

/**
 * Conquest on the table: the Realm's board, kept in step with the game. A battle plays out on
 * the board before its result shows: the attack arrow strikes, the dice roll in the interface (see
 * `onBattle`), then the losses come off the medallions. The interface decides what is lit up and
 * what a click means; the scene says what was pointed at, clicked or dragged.
 */

export interface CqSceneCallbacks {
	/** The territory under the pointer changed (null: none). */
	onHover?(t: number | null): void;
	/** A click or tap on a territory, or on nothing (null). */
	onClick?(t: number | null, touch: boolean): void;
	/** Pressing on `from`: may a drag start there? (true holds the camera still and starts one.) */
	onDragStart?(from: number): boolean;
	/** A drag let go over `to` (null: nowhere). */
	onDrop?(from: number, to: number | null): void;
	/** A battle is being fought on the board right now: the interface rolls its dice. */
	onBattle?(b: Battle, fast: boolean): void;
	/** A territory just fell (after its battle played out). */
	onCaptured?(e: Extract<CqEvent, { type: 'captured' }>): void;
	/** The board has played out everything up to this state. */
	onSettled?(view: CqView): void;
}

/** How long a battle's dice roll before the losses show, in seconds (a quick one when many follow). */
export const BATTLE_ROLL = 0.62;
const BATTLE_ROLL_FAST = 0.3;

export class ConquestScene {
	readonly board: RealmBoard;
	/** The armies as miniatures, marching and fighting as the game goes (see troops.ts). */
	readonly troops: Troops;
	readonly arrow = new BoardArrow();
	readonly map: RealmMap;
	callbacks: CqSceneCallbacks = {};
	private view: CqView | null = null;
	private owner: number[] = [];
	private armies: number[] = [];
	private holders: Holder[] = [];
	private lastSeq = 0;
	private queue: CqEvent[] = [];
	private playing = false;
	/** The arrow the interface wants (a selection and its target), shown when no battle is playing. */
	private intent: { from: number; to: number; color: number; style: ArrowStyle } | null = null;
	private striking = false;
	private hover: number | null = null;
	private ndc = new THREE.Vector2(-9, -9);
	private moved = true;
	private raycaster = new THREE.Raycaster();
	private drag: { from: number; id: number } | null = null;
	private lifted: number | null = null;

	constructor(
		readonly stage: Stage,
		readonly anim: Animator,
		readonly particles: Particles,
		names?: BoardNames,
		map: RealmMap = conquestMap()
	) {
		this.map = map;
		this.board = new RealmBoard(map, names);
		this.troops = new Troops(map, this.board.realm, this.board.lanes.map((l) => l.path), particles);
		this.board.group.add(this.troops.group);
		stage.scene.add(this.board.group);
		stage.scene.add(this.arrow.group);
	}

	/** The board as a menu shows it: nobody's armies on it. */
	showEmpty() {
		this.view = null;
		this.owner = this.map.territories.map(() => -1);
		this.armies = this.map.territories.map(() => 0);
		this.board.setHolders(this.owner, this.armies, []);
		this.troops.reset(this.owner, this.armies);
		for (const a of this.board.armies) a.group.visible = false;
		this.board.clearLooks();
		this.intent = null;
		this.arrow.set(null, null, 0);
	}

	/**
	 * Show `view`. What happened since the last one plays out on the board first (battles fought,
	 * territories taken); `quiet` shows it at once (a rejoin, a replay jumping about).
	 */
	setView(view: CqView, quiet = false) {
		// A new game at the same table (a rematch) starts its log over: show it as it is.
		const newest = view.log.length ? view.log[view.log.length - 1].seq : 0;
		if (this.view && newest < this.lastSeq) return this.jumpTo(view);
		const first = !this.view;
		this.holders = view.players.map((p) => ({ color: PLAYER_RGB[p.color] ?? 0xffffff, sigil: SIGIL_OF[p.color] }));
		this.troops.setColors(this.holders.map((h) => h.color));
		const fresh = view.log.filter((e) => e.seq > this.lastSeq);
		if (view.log.length) this.lastSeq = Math.max(this.lastSeq, view.log[view.log.length - 1].seq);
		this.view = view;
		for (const a of this.board.armies) a.group.visible = true;
		if (first || quiet) {
			this.queue = [];
			this.apply(view, true);
			if (!this.playing) this.callbacks.onSettled?.(view);
			return;
		}
		for (const e of fresh) if (SHOWN.has(e.type)) this.queue.push(e);
		if (!this.playing) void this.play();
	}

	/** Jump straight to `view`, nothing played out (a new game, a replay scrubbed). */
	jumpTo(view: CqView) {
		this.lastSeq = view.log.length ? view.log[view.log.length - 1].seq : 0;
		this.queue = [];
		this.view = null;
		this.setView(view, true);
	}

	/**
	 * The holders, owners and armies of `view`, all at once. A territory just taken shows the armies
	 * moving into it already (and the ones they leave short), so it never reads 0. The troops
	 * march there; `snap` puts every piece in its place at once instead (a new game, a jump).
	 */
	private apply(view: CqView, snap = false) {
		this.owner = view.owner.slice();
		this.armies = view.armies.slice();
		const shown = armiesMovedIn(view, this.moveIn);
		this.board.setHolders(this.owner, shown, this.holders);
		if (snap) this.troops.reset(this.owner, shown);
		else this.troops.settle(this.owner, shown, view.step === 'occupy' ? view.occupy : null);
	}

	/** How many armies the player taking a territory means to move in (null: the fewest allowed). */
	setMoveIn(count: number | null) {
		if (count === this.moveIn) return;
		this.moveIn = count;
		if (this.view && !this.playing) this.apply(this.view);
	}
	private moveIn: number | null = null;

	private async play() {
		this.playing = true;
		try {
			await this.playQueue();
		} catch (err) {
			// Whatever went wrong showing an event, the board still catches up with the game.
			console.error(err);
			this.queue = [];
		}
		if (this.view) this.apply(this.view);
		this.striking = false;
		this.syncArrow();
		this.playing = false;
		if (this.view) this.callbacks.onSettled?.(this.view);
	}

	/**
	 * Wait `seconds` while the board plays something out: by the frame clock, or the wall clock
	 * when frames are slow (a weak device), so the board never falls behind the game for long.
	 */
	private hold(seconds: number) {
		return Promise.race([this.anim.wait(seconds), new Promise<void>((done) => setTimeout(done, seconds * 1000))]);
	}

	private async playQueue() {
		while (this.queue.length) {
			// Far behind (a tab left in the background): catch up at once.
			if (this.queue.length > 40 || document.hidden) {
				this.queue = [];
				return;
			}
			const e = this.queue.shift()!;
			const battlesLeft = this.queue.filter((q) => q.type === 'battle').length;
			const fast = battlesLeft >= 2;
			switch (e.type) {
				case 'battle': {
					const from = this.board.realm.anchors[e.from];
					const to = this.board.realm.anchors[e.to];
					this.striking = true;
					this.arrow.set(from, to, this.holders[e.player]?.color ?? 0xffffff, 'attack');
					this.arrow.strike();
					this.troops.attack(e.from, e.to, e.attack.length, fast);
					this.callbacks.onBattle?.(e, fast);
					await this.hold(fast ? BATTLE_ROLL_FAST : BATTLE_ROLL);
					this.armies[e.from] = Math.max(0, this.armies[e.from] - e.attackerLoss);
					this.armies[e.to] = Math.max(0, this.armies[e.to] - e.defenderLoss);
					this.board.setHolders(this.owner, this.armies, this.holders);
					this.troops.set(e.from, this.armies[e.from], 'battle', e.to);
					this.troops.set(e.to, this.armies[e.to], 'battle', e.from);
					const hit = (t: number, n: number) => {
						if (!n) return;
						const at = this.board.realm.anchors[t].clone().add(new THREE.Vector3(0, 3.5, 0));
						this.particles.emit({ at, count: 10 + n * 6, colors: ['#d8352a', '#7a1d14', '#f2e2c0', '#3a2416'], speed: 9, up: 9, spread: 2, life: 0.6, size: 0.55, gravity: 22, drag: 2.5 });
					};
					hit(e.from, e.attackerLoss);
					hit(e.to, e.defenderLoss);
					await this.hold(fast ? 0.1 : 0.32);
					break;
				}
				case 'captured': {
					this.owner[e.to] = e.player;
					this.board.setHolders(this.owner, this.armies, this.holders);
					this.troops.own(e.to, e.player);
					const at = this.board.realm.anchors[e.to].clone().add(new THREE.Vector3(0, 4, 0));
					const c = this.holders[e.player]?.color ?? 0xffffff;
					this.particles.emit({ at, count: 46, colors: [c, '#fff6c8', '#ffffff', c], speed: 12, up: 18, spread: 3, life: 1.1, size: 0.7, gravity: 18, drag: 1.6 });
					this.board.armies[e.to].pop();
					this.callbacks.onCaptured?.(e);
					break;
				}
				case 'occupied':
				case 'fortified': {
					this.armies[e.from] -= e.count;
					this.armies[e.to] += e.count;
					this.board.setHolders(this.owner, this.armies, this.holders);
					// The armies march there: through their own lands, for a fortify.
					const route = e.type === 'fortified' ? fortifyRoute({ owner: this.owner, settings: this.view!.settings }, e.from, e.to) : [];
					this.troops.flowTo(route.length ? route : [e.from, e.to], this.armies[e.to]);
					if (e.type === 'fortified') {
						this.striking = true;
						this.arrow.set(this.board.realm.anchors[e.from], this.board.realm.anchors[e.to], this.holders[e.player]?.color ?? 0xffffff, 'move');
						this.particles.dust(this.board.realm.anchors[e.to].clone().add(new THREE.Vector3(0, 1, 0)), 10);
						await this.hold(0.7);
					}
					break;
				}
				case 'placed': {
					this.armies[e.territory] += e.count;
					this.board.setHolders(this.owner, this.armies, this.holders);
					this.troops.set(e.territory, this.armies[e.territory], 'placed');
					if (e.count > 0) this.particles.sparkle(this.board.realm.anchors[e.territory].clone().add(new THREE.Vector3(0, 3, 0)), this.holders[e.player]?.color ?? 0xffffff, 8);
					break;
				}
				case 'eliminated': {
					// Every territory of the winner flashes in their color.
					const c = this.holders[e.by]?.color ?? 0xffffff;
					this.owner.forEach((o, t) => {
						if (o !== e.by) return;
						this.particles.sparkle(this.board.realm.anchors[t].clone().add(new THREE.Vector3(0, 3, 0)), c, 5);
					});
					break;
				}
				case 'gameOver': {
					const c = this.holders[e.winner]?.color ?? 0xffffff;
					this.troops.cheer(e.winner);
					this.particles.confetti(new THREE.Vector3(0, 30, 0), [c, '#fff6c8', '#ffffff', '#e0b24a'], 500);
					break;
				}
			}
			this.striking = false;
			this.syncArrow();
		}
	}

	/** The board is still playing out what happened (a battle, a capture). */
	get busy() {
		return this.playing;
	}

	/** The arrow the interface asks for (null: none), shown whenever no battle is being played. */
	setIntent(intent: { from: number; to: number; color: number; style: ArrowStyle } | null) {
		this.intent = intent;
		if (!this.striking) this.syncArrow();
	}

	private syncArrow() {
		const i = this.intent;
		if (i) this.arrow.set(this.board.realm.anchors[i.from], this.board.realm.anchors[i.to], i.color, i.style);
		else this.arrow.set(null, null, 0);
	}

	/** How each territory is lit up (by index; missing ones go back to plain). */
	setLooks(looks: (TerritoryLook | undefined)[]) {
		this.map.territories.forEach((_, t) => this.board.setLook(t, { ...(looks[t] ?? {}), hover: t === this.hover ? 1 : 0 }));
		this.looks = looks;
	}
	private looks: (TerritoryLook | undefined)[] = [];

	/** Lift a territory's medallion (the one picked), or none. */
	setLifted(t: number | null) {
		if (this.lifted !== null) this.board.armies[this.lifted].lift = 0;
		this.lifted = t;
		if (t !== null) this.board.armies[t].lift = 1;
	}

	/** Names always shown for these territories, however crowded the view (picked, targets). */
	setEmphasis(ts: number[]) {
		this.board.emphasis = new Set(ts);
	}

	// ------------------------------------------------------------ pointer

	pointerMove(ndc: THREE.Vector2) {
		this.ndc.copy(ndc);
		this.moved = true;
	}

	pointerLeave() {
		this.ndc.set(-9, -9);
		this.moved = true;
	}

	pointerDown(e: PointerEvent, ndc: THREE.Vector2) {
		this.pointerMove(ndc);
		this.updateHover();
		if (e.button !== 0 || this.hover === null || this.drag) return;
		if (this.callbacks.onDragStart?.(this.hover)) {
			this.drag = { from: this.hover, id: e.pointerId };
			// The camera stays put while armies are dragged, and the drag ends here wherever it is
			// let go (over a panel, off the window).
			this.stage.rig.enabled = false;
			this.stage.canvas.setPointerCapture(e.pointerId);
		}
	}

	pointerUp(e: PointerEvent, ndc: THREE.Vector2) {
		this.pointerMove(ndc);
		this.updateHover();
		const drag = this.drag;
		if (drag && e.pointerId === drag.id) {
			this.endDrag();
			// Let go anywhere but on the board itself (over a panel, off the window): called off.
			if (document.elementFromPoint(e.clientX, e.clientY) !== this.stage.canvas) return;
			if (this.hover !== drag.from) return this.callbacks.onDrop?.(drag.from, this.hover);
		}
		if (e.button !== 0 || this.stage.rig.dragged) return;
		this.callbacks.onClick?.(this.hover, e.pointerType === 'touch');
	}

	/** The pointer was taken away mid-drag (the browser cancelled it, or lost it): the drag is off. */
	pointerCancel(e: PointerEvent) {
		if (this.drag?.id === e.pointerId) this.endDrag();
	}

	private endDrag() {
		const drag = this.drag;
		if (!drag) return;
		this.drag = null;
		this.stage.rig.enabled = true;
		if (this.stage.canvas.hasPointerCapture(drag.id)) this.stage.canvas.releasePointerCapture(drag.id);
	}

	/** Territories a click does something on right now (the pointer turns into a hand over them). */
	setClickable(ts: Iterable<number>) {
		this.clickable = new Set(ts);
	}
	private clickable = new Set<number>();

	/** The pointer is on a territory a click does something on. */
	get hovering() {
		return this.hover !== null && this.clickable.has(this.hover);
	}

	/** Being dragged from (a drag in progress), or null. */
	get dragFrom() {
		return this.drag?.from ?? null;
	}

	private updateHover() {
		if (!this.moved) return;
		this.moved = false;
		let t: number | null = null;
		if (this.ndc.x > -2) {
			this.raycaster.setFromCamera(this.ndc, this.stage.camera);
			const hit = this.board.pick(this.raycaster.ray);
			t = hit >= 0 ? hit : null;
		}
		if (t === this.hover) return;
		this.hover = t;
		this.setLooks(this.looks);
		this.callbacks.onHover?.(t);
	}

	/** Where territory `t`'s medallion is on screen (CSS pixels in the canvas), for popovers. */
	screenOf(t: number): { x: number; y: number } | null {
		const a = this.board.armies[t];
		if (!a) return null;
		const p = a.medalWorld().project(this.stage.camera);
		if (p.z > 1) return null;
		const box = this.stage.box;
		return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height };
	}

	/** The camera framing the whole Realm for this screen's shape. */
	framing() {
		const cam = this.stage.camera;
		const aspect = cam.aspect;
		const portrait = aspect < 0.8;
		const polar = portrait ? 0.42 : 0.7;
		const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
		const halfX = this.board.realm.halfX * (portrait ? 0.98 : 1.0);
		const halfZ = this.board.realm.halfZ;
		// Wide enough for the map across, deep enough for it from front to back.
		const across = halfX / (tan * aspect * (portrait ? 0.98 : 0.84));
		const deep = (halfZ * Math.cos(polar) + halfZ * Math.sin(polar) * 0.25) / (tan * 0.86);
		// On a phone held upright the map sits low, in the gap between the plaques and the action bar.
		return { radius: Math.max(across, deep), polar, azimuth: 0, target: new THREE.Vector3(0, 0, portrait ? -26 : 6) };
	}

	frame(dt: number, t: number) {
		this.updateHover();
		const cam = this.stage.camera;
		this.board.update(dt, t, { azimuth: this.stage.rig.azimuth, polar: this.stage.rig.polar, camera: cam, height: this.stage.box.height });
		const ppu = this.stage.box.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * Math.max(1, cam.position.length()));
		this.arrow.update(dt, t, cam, ppu);
		this.troops.update(dt, ppu);
	}

	dispose() {
		this.stage.rig.enabled = true;
		this.stage.scene.remove(this.board.group);
		this.stage.scene.remove(this.arrow.group);
		this.board.dispose();
		this.troops.dispose();
		this.arrow.dispose();
	}
}

/** The events the board plays out one by one; the rest just show in the end state. */
const SHOWN = new Set<CqEvent['type']>(['battle', 'captured', 'occupied', 'fortified', 'placed', 'eliminated', 'gameOver']);
