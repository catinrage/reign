import * as THREE from 'three';
import { gambitBoard, startingCells, START_PIECES } from '../../../shared/gambit/board';
import type { GambitBoard, GambitView, GbEvent, Order, Piece, RoundPlay } from '../../../shared/gambit/types';
import { ease, type Animator } from '../anim';
import type { Particles } from '../effects';
import type { Stage } from '../stage';
import { buildHexBoard, HEX, type HexBoardBuild } from './hexBoard';
import { pieceModel } from './pieceModels';

/**
 * Gambit on the table: the hex board and its pieces, kept in step with the game. A round plays
 * out on the board before its result shows: every order is shown at once, the pieces move
 * together (those swapping places meet halfway), the losers fall where they were caught, the
 * arrows land, and monarchs taken come home. The interface decides what is lit up and what a
 * click means (see GambitHud); the scene says which hex was pointed at or clicked.
 */

export interface GbSceneCallbacks {
	/** The hex under the pointer changed (null: none). */
	onHover?(cell: number | null): void;
	/** A click or tap on a hex, or off the board (null). */
	onClick?(cell: number | null, touch: boolean): void;
	/** A round starts playing out on the board. */
	onRound?(play: RoundPlay): void;
	/** The board has played out everything up to this state. */
	onSettled?(view: GambitView): void;
	/** Alt+click (a long press on touch) on the board: a beacon at this spot (in tile radii). */
	onBeacon?(x: number, z: number): void;
}

/** What a hex is lit up as: the piece picked, where it can go (or take, or shoot), the pointer. */
export type CellMark = 'pick' | 'move' | 'take' | 'shoot' | 'brace' | 'hover' | 'mine';

const MARK_COLOR: Record<CellMark, number> = {
	pick: 0xffd45a,
	move: 0x9be36a,
	take: 0xff5a3c,
	shoot: 0xffa02c,
	brace: 0x7ec8ff,
	hover: 0xffffff,
	mine: 0xffd45a
};

/** How long the parts of a round take on the board (seconds). */
const SHOW_ORDERS = 0.8;
const MOVE = 0.85;
const AFTER_SWAP = 0.35;
const ARROW = 0.55;
const FALL = 0.55;
const HOME = 0.45;

interface PieceObj {
	piece: Piece;
	group: THREE.Group;
	/** The figure itself, tipped over when it falls. */
	model: THREE.Group;
	hitbox: THREE.Mesh;
}

export class GambitScene {
	readonly group = new THREE.Group();
	readonly board: GambitBoard;
	readonly build: HexBoardBuild;
	callbacks: GbSceneCallbacks = {};
	private colors: number[] = [];
	private pieces = new Map<number, PieceObj>();
	private view: GambitView | null = null;
	private lastSeq = 0;
	private queue: RoundPlay[] = [];
	private playing = false;
	private marks = new THREE.Group();
	private orders = new THREE.Group();
	private keeps = new THREE.Group();
	private hover: number | null = null;
	private ndc = new THREE.Vector2(-9, -9);
	private moved = true;
	private raycaster = new THREE.Raycaster();
	private downAt: { x: number; y: number } | null = null;
	private clickable = new Set<number>();
	private shown: { mine: Order[]; color: number } = { mine: [], color: 0xffffff };

	constructor(
		readonly stage: Stage,
		readonly anim: Animator,
		readonly particles: Particles,
		players: number,
		settings: { terrain: GambitView['settings']['terrain']; seed: number }
	) {
		this.board = gambitBoard(players, settings);
		this.build = buildHexBoard(this.board, settings.seed);
		this.group.add(this.build.group, this.keeps, this.marks, this.orders);
		this.group.name = 'gambit';
		stage.scene.add(this.group);
	}

	/** The board as a lobby shows it: everyone's pieces where they start, in the seats' colors. */
	showEmpty(colors: number[]) {
		this.view = null;
		this.lastSeq = 0;
		this.queue = [];
		const pieces: Piece[] = [];
		let id = 1;
		this.board.keeps.forEach((_, p) => startingCells(this.board, p).forEach((cell, i) => pieces.push({ id: id++, owner: p, kind: START_PIECES[i], cell })));
		this.setColors(colors);
		this.snap(pieces);
		this.setMarks(new Map());
		this.setOrders([], 0xffffff);
	}

	/**
	 * Show `view`. The rounds played since the last one play out on the board first; `quiet` shows
	 * it at once (a rejoin, a replay jumping about).
	 */
	setView(view: GambitView, colors: number[], quiet = false) {
		const newest = view.log.length ? view.log[view.log.length - 1].seq : 0;
		// A new game at the same table (a rematch) starts its log over: show it as it is.
		if (this.view && newest < this.lastSeq) quiet = true;
		const first = !this.view;
		this.setColors(colors);
		const fresh = view.log.filter((e): e is Extract<GbEvent, { type: 'roundPlayed' }> => e.seq > this.lastSeq && e.type === 'roundPlayed');
		this.lastSeq = Math.max(this.lastSeq, newest);
		this.view = view;
		if (first || quiet) {
			this.queue = [];
			this.snap(view.pieces);
			if (!this.playing) this.callbacks.onSettled?.(view);
			return;
		}
		this.queue.push(...fresh.map((e) => e.play));
		if (!this.playing) void this.play();
	}

	/** The board is still playing out a round. */
	get busy() {
		return this.playing;
	}

	private setColors(colors: number[]) {
		if (colors.length === this.colors.length && colors.every((c, i) => c === this.colors[i])) return;
		this.colors = colors.slice();
		// The pieces are rebuilt in their new colors, and each keep's ring glows in its player's.
		const all = [...this.pieces.values()].map((o) => o.piece);
		this.snap(all, true);
		empty(this.keeps);
		this.board.keeps.forEach((k, p) => {
			const c = this.build.centers[k];
			const ring = new THREE.Mesh(hexRing(HEX * 0.62, HEX * 0.74), new THREE.MeshBasicMaterial({ color: colors[p] ?? 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
			ring.position.set(c.x, c.y + 0.06, c.z);
			this.keeps.add(ring);
		});
	}

	/** Every piece where `pieces` has it, at once (`rebuild`: in fresh models, for new colors). */
	private snap(pieces: Piece[], rebuild = false) {
		const keep = new Set(pieces.map((p) => p.id));
		for (const [id, o] of this.pieces)
			if (!keep.has(id) || rebuild || o.piece.kind !== pieces.find((p) => p.id === id)?.kind) {
				this.group.remove(o.group);
				this.pieces.delete(id);
			}
		for (const p of pieces) {
			let o = this.pieces.get(p.id);
			if (!o) {
				o = this.makePiece(p);
				this.pieces.set(p.id, o);
			}
			o.piece = { ...p };
			o.model.rotation.set(0, 0, 0);
			o.model.position.set(0, 0, 0);
			const at = this.build.centers[p.cell];
			o.group.position.copy(at);
			o.group.rotation.y = this.facing(at);
		}
	}

	private makePiece(p: Piece): PieceObj {
		const group = new THREE.Group();
		const model = pieceModel(p.kind, this.colors[p.owner] ?? 0xffffff);
		group.add(model);
		const hitbox = new THREE.Mesh(HITBOX, HITBOX_MAT);
		hitbox.position.y = 4.2;
		hitbox.visible = false;
		group.add(hitbox);
		this.group.add(group);
		return { piece: { ...p }, group, model, hitbox };
	}

	/** Pieces face the middle of the board. */
	private facing(at: THREE.Vector3) {
		return Math.atan2(-at.x, -at.z);
	}

	// ------------------------------------------------------------ a round, played out

	private async play() {
		this.playing = true;
		try {
			while (this.queue.length) {
				// Far behind (a tab left in the background): catch up at once.
				if (this.queue.length > 3 || document.hidden) {
					this.queue = [];
					break;
				}
				await this.playRound(this.queue.shift()!);
			}
		} catch (err) {
			console.error(err);
			this.queue = [];
		}
		if (this.view) this.snap(this.view.pieces);
		this.playing = false;
		this.setOrders(this.shown.mine, this.shown.color);
		if (this.view) this.callbacks.onSettled?.(this.view);
	}

	private async playRound(play: RoundPlay) {
		this.callbacks.onRound?.(play);
		this.setMarks(new Map());
		// Everyone's orders, shown at once.
		this.showAllOrders(play);
		await this.hold(SHOW_ORDERS);
		empty(this.orders);

		const swapped = new Map<number, number>();
		for (const s of play.swaps) {
			swapped.set(s.a, s.b);
			swapped.set(s.b, s.a);
		}
		const lost = new Map(play.losses.map((l) => [l.piece.id, l]));
		const moves = play.moves.filter((m) => this.pieces.has(m.piece));
		// Every move at once (two swapping places only meet halfway).
		await Promise.all(
			moves.map((m) => {
				const o = this.pieces.get(m.piece)!;
				const from = this.build.centers[m.from].clone();
				const to = this.build.centers[m.to].clone();
				const end = swapped.has(m.piece) ? from.clone().lerp(to, 0.5) : to;
				const hop = o.piece.kind === 'knight' ? 4 : o.piece.kind === 'lancer' ? 0.6 : 1.2;
				o.group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
				return this.anim.tween(
					MOVE,
					(t) => {
						o.group.position.lerpVectors(from, end, t);
						o.group.position.y += Math.sin(Math.PI * Math.min(1, t)) * hop;
					},
					o.piece.kind === 'lancer' ? ease.inOutCubic : ease.outCubic
				);
			})
		);
		// Those caught where they stood or where they met fall (arrows' marks later).
		const falls: Promise<void>[] = [];
		for (const m of moves) {
			const o = this.pieces.get(m.piece)!;
			if (swapped.has(m.piece) && lost.get(m.piece)?.how !== 'arrow' && lost.has(m.piece)) falls.push(this.fall(o));
		}
		for (const l of play.losses) {
			if (l.how === 'arrow' || swapped.has(l.piece.id)) continue;
			const o = this.pieces.get(l.piece.id);
			if (o) falls.push(this.fall(o));
		}
		// Swap winners go on to where they were going.
		const onward = moves
			.filter((m) => swapped.has(m.piece) && !(lost.has(m.piece) && lost.get(m.piece)!.how !== 'arrow'))
			.map((m) => {
				const o = this.pieces.get(m.piece)!;
				const from = o.group.position.clone();
				const to = this.build.centers[m.to].clone();
				return this.anim.tween(AFTER_SWAP, (t) => o.group.position.lerpVectors(from, to, t));
			});
		await Promise.all([...falls, ...onward]);

		// Arrows, loosed as the round began, land.
		if (play.arrows.length) {
			await Promise.all(play.arrows.map((a) => this.shoot(a.piece, a.at)));
			const hit = play.losses.filter((l) => l.how === 'arrow').map((l) => this.pieces.get(l.piece.id));
			await Promise.all(hit.filter((o): o is PieceObj => !!o).map((o) => this.fall(o)));
		}

		// Monarchs come home, guards muster, shrines pay out.
		for (const r of play.returned) {
			const o = this.pieces.get(r.piece) ?? this.makePieceFor(r.piece);
			if (!o) continue;
			this.pieces.set(r.piece, o);
			this.group.add(o.group);
			o.model.rotation.set(0, 0, 0);
			o.model.position.set(0, 0, 0);
			o.group.position.copy(this.build.centers[r.cell]);
			o.group.rotation.y = this.facing(o.group.position);
			this.particles.sparkle(o.group.position.clone().add(new THREE.Vector3(0, 3, 0)), this.colors[o.piece.owner] ?? 0xffffff, 18);
		}
		for (const g of play.mustered) {
			const o = this.makePiece(g);
			this.pieces.set(g.id, o);
			const at = this.build.centers[g.cell];
			o.group.position.copy(at);
			o.group.rotation.y = this.facing(at);
			this.particles.dust(at.clone().add(new THREE.Vector3(0, 0.5, 0)), 12);
			void this.anim.tween(HOME, (t) => o.model.position.set(0, -3 * (1 - t), 0), ease.outBack);
		}
		for (const c of play.crowns) {
			if (!c.shrines) continue;
			for (const o of this.pieces.values())
				if (o.piece.owner === c.player && this.board.cells[this.cellOf(o)]?.shrine)
					this.particles.sparkle(o.group.position.clone().add(new THREE.Vector3(0, 4, 0)), '#ffd45a', 10);
		}
		await this.hold(HOME);
	}

	/** The cell a piece stands on now, as the board shows it. */
	private cellOf(o: PieceObj) {
		return this.build.cellAt(o.group.position.x, o.group.position.z);
	}

	/** A monarch the board no longer has (taken before this player joined): from the view. */
	private makePieceFor(id: number): PieceObj | null {
		const p = this.view?.pieces.find((x) => x.id === id);
		return p ? this.makePiece(p) : null;
	}

	/** A piece taken: it topples where it stands and sinks away. */
	private async fall(o: PieceObj) {
		const at = o.group.position.clone();
		this.particles.emit({ at: at.clone().add(new THREE.Vector3(0, 2, 0)), count: 18, colors: [this.colors[o.piece.owner] ?? 0xffffff, '#f2e2c0', '#3a2416'], speed: 8, up: 9, spread: 2, life: 0.6, size: 0.55, gravity: 22, drag: 2.5 });
		await this.anim.tween(FALL * 0.6, (t) => (o.model.rotation.x = -t * Math.PI * 0.5), ease.outBounce);
		await this.anim.tween(FALL * 0.4, (t) => (o.model.position.y = -t * 4), ease.linear);
		this.group.remove(o.group);
		this.pieces.delete(o.piece.id);
	}

	/** An archer's arrow, in a high arc to its hex. */
	private async shoot(archer: number, cell: number) {
		const o = this.pieces.get(archer);
		const from = (o ? o.group.position.clone() : this.build.centers[cell].clone()).add(new THREE.Vector3(0, 3, 0));
		const to = this.build.centers[cell].clone().add(new THREE.Vector3(0, 1.5, 0));
		const dart = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 5), new THREE.MeshBasicMaterial({ color: 0x5a3519 }));
		this.group.add(dart);
		const prev = from.clone();
		await this.anim.tween(
			ARROW,
			(t) => {
				dart.position.lerpVectors(from, to, t);
				dart.position.y += Math.sin(Math.PI * t) * 5;
				const dir = dart.position.clone().sub(prev);
				if (dir.lengthSq() > 1e-6) dart.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
				prev.copy(dart.position);
			},
			ease.linear
		);
		this.group.remove(dart);
		dart.geometry.dispose();
		(dart.material as THREE.Material).dispose();
		this.particles.dust(to, 6);
	}

	private hold(seconds: number) {
		return Promise.race([this.anim.wait(seconds), new Promise<void>((done) => setTimeout(done, seconds * 1000))]);
	}

	// ------------------------------------------------------------ what the interface lights up

	/** Light up hexes (by cell) as the interface says; the rest go back to plain. */
	setMarks(marks: Map<number, CellMark>) {
		empty(this.marks);
		for (const [cell, kind] of marks) {
			const c = this.build.centers[cell];
			if (!c) continue;
			const color = MARK_COLOR[kind];
			const fill = new THREE.Mesh(hexDisc(HEX * 0.86), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'hover' ? 0.12 : 0.26, depthWrite: false }));
			fill.position.set(c.x, c.y + 0.08, c.z);
			const ring = new THREE.Mesh(hexRing(HEX * 0.8, HEX * 0.92), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'hover' ? 0.5 : 0.9, depthWrite: false }));
			ring.position.set(c.x, c.y + 0.1, c.z);
			this.marks.add(fill, ring);
		}
	}

	/** Hexes a click does something on (the pointer turns into a hand over them). */
	setClickable(cells: Iterable<number>) {
		this.clickable = new Set(cells);
	}

	/** This player's orders this round, as arrows on the board (not while a round is playing out). */
	setOrders(orders: Order[], color: number) {
		this.shown = { mine: orders, color };
		if (this.playing) return;
		empty(this.orders);
		for (const o of orders) this.drawOrder(o, color);
	}

	private showAllOrders(play: RoundPlay) {
		empty(this.orders);
		play.orders.forEach((os, player) => os.forEach((o) => this.drawOrder(o, this.colors[player] ?? 0xffffff)));
	}

	private drawOrder(o: Order, color: number) {
		const p = this.pieces.get(o.piece);
		if (!p) return;
		const from = this.build.centers[p.piece.cell].clone().add(new THREE.Vector3(0, 0.5, 0));
		if (o.type === 'brace') {
			const ring = new THREE.Mesh(hexRing(HEX * 0.55, HEX * 0.68), new THREE.MeshBasicMaterial({ color: MARK_COLOR.brace, transparent: true, opacity: 0.95, depthWrite: false }));
			ring.position.copy(from);
			this.orders.add(ring);
			return;
		}
		const cell = o.type === 'move' ? o.to : o.at;
		const to = this.build.centers[cell].clone().add(new THREE.Vector3(0, 0.5, 0));
		const lift = o.type === 'shoot' ? 6 : 2;
		const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, lift, 0));
		const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
		const tint = o.type === 'shoot' ? MARK_COLOR.shoot : color;
		const mat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.92, depthWrite: false });
		const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, o.type === 'shoot' ? 0.18 : 0.32, 6), mat);
		const head = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 8), mat);
		const end = curve.getPoint(1);
		const dir = curve.getTangent(1).normalize();
		head.position.copy(end).addScaledVector(dir, -0.6);
		head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
		this.orders.add(tube, head);
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

	pointerDown(e: PointerEvent) {
		this.downAt = { x: e.clientX, y: e.clientY };
	}

	pointerUp(e: PointerEvent, ndc: THREE.Vector2) {
		this.pointerMove(ndc);
		this.updateHover();
		const down = this.downAt;
		this.downAt = null;
		if (e.button !== 0 || this.stage.rig.dragged || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8)) return;
		this.callbacks.onClick?.(this.hover, e.pointerType === 'touch');
	}

	/** The pointer is on a hex a click does something on. */
	get hovering() {
		return this.hover !== null && this.clickable.has(this.hover);
	}

	private updateHover() {
		if (!this.moved) return;
		this.moved = false;
		let cell: number | null = null;
		if (this.ndc.x > -2) {
			this.raycaster.setFromCamera(this.ndc, this.stage.camera);
			// A piece first (it stands up off its hex), then the board under the pointer.
			let near = Infinity;
			for (const o of this.pieces.values()) {
				const hit = this.raycaster.intersectObject(o.hitbox, false)[0];
				if (hit && hit.distance < near) {
					near = hit.distance;
					cell = o.piece.cell;
				}
			}
			if (cell === null) {
				const p = this.build.raycast(this.raycaster.ray);
				const c = p ? this.build.cellAt(p.x, p.z) : -1;
				cell = c >= 0 ? c : null;
			}
		}
		if (cell === this.hover) return;
		this.hover = cell;
		this.callbacks.onHover?.(cell);
	}

	/** Where hex `cell` is on screen (CSS pixels in the canvas), for popovers. */
	screenOf(cell: number): { x: number; y: number } | null {
		const c = this.build.centers[cell];
		if (!c) return null;
		const p = c.clone().add(new THREE.Vector3(0, 4, 0)).project(this.stage.camera);
		if (p.z > 1) return null;
		const box = this.stage.box;
		return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height };
	}

	/** The camera framing the whole board for this screen's shape, from `seat`'s side (-1: the first's). */
	framing(seat = -1) {
		const cam = this.stage.camera;
		const aspect = cam.aspect;
		const portrait = aspect < 0.8;
		const polar = portrait ? 0.5 : 0.78;
		const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
		const half = this.build.half;
		const across = half / (tan * aspect * (portrait ? 0.98 : 0.86));
		const deep = (half * Math.cos(polar) + half * Math.sin(polar) * 0.3) / (tan * 0.86);
		// Seen from behind this player's keep.
		const k = seat >= 0 ? this.build.centers[this.board.keeps[seat]] : null;
		const azimuth = k ? Math.atan2(k.x, k.z) : 0;
		return { radius: Math.max(across, deep), polar, azimuth, target: new THREE.Vector3(0, 0, portrait ? -10 : 4) };
	}

	frame(_dt: number, _t: number) {
		this.updateHover();
	}

	dispose() {
		this.stage.scene.remove(this.group);
		this.build.dispose();
		empty(this.marks);
		empty(this.orders);
		empty(this.keeps);
	}
}

/** What a piece is picked by: a column round it (shared, never drawn). */
const HITBOX = new THREE.CylinderGeometry(HEX * 0.5, HEX * 0.5, 8.5, 8);
const HITBOX_MAT = new THREE.MeshBasicMaterial();

/** Take everything out of a group of overlays, freeing their geometry and materials. */
function empty(g: THREE.Group) {
	for (const o of g.children) {
		const m = o as THREE.Mesh;
		m.geometry?.dispose();
		const mat = m.material;
		if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
		else mat?.dispose();
	}
	g.clear();
}

/** A flat hexagon (pointy towards ±z, as the board's hexes are), lying on the ground. */
function hexDisc(r: number) {
	return new THREE.CylinderGeometry(r, r, 0.04, 6);
}

/** A flat hexagonal ring lying on the ground. */
function hexRing(inner: number, outer: number) {
	const g = new THREE.RingGeometry(inner, outer, 6, 1, Math.PI / 2);
	g.rotateX(-Math.PI / 2);
	return g;
}

