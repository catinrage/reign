import * as THREE from 'three';
import { generateBoard, generateStandardBoard } from '../../shared/board/generate';
import type { MapTile } from '../../shared/board/maps';
import { type Board, getTopology } from '../../shared/board/topology';
import { worldToHex, hexKey } from '../../shared/board/hex';
import type { GameEvent, GameView } from '../../shared/rules/types';
import { Animator, ease } from './anim';
import { BoardView } from './board/boardView';
import { islandReach } from './board/terrain';
import { cityModel, cloneModel, resourceItemModel, roadModel, settlementModel } from './board/models';
import { DIE_HALF, Dice } from './dice';
import { Particles } from './effects';
import { HEX_R, PLAYER_RGB } from './layout';
import { type Room, buildRoom } from './room/room';
import { TABLE_HALF } from './room/table';
import { ROOM_SCALE } from './room/util';
import { type Quality, Stage } from './stage';

export type PickKind = 'settlement' | 'road' | 'city' | 'robber';

export interface PickRequest {
	kind: PickKind;
	options: number[];
	color: string;
	onPick: (id: number) => void;
}

export interface SceneCallbacks {
	/** A resource item reached the top of its arc above a hex (for 2D fly-to-hand effects). */
	onResourcePopped?: (player: number, resource: string, screen: { x: number; y: number }) => void;
	/** The dice of the roll event `seq` came to rest on the table. */
	onDiceSettled?: (dice: [number, number], seq: number) => void;
	onHover?: (label: string | null) => void;
}

interface PieceObj {
	key: string;
	obj: THREE.Object3D;
}

const ROAD_LEN = 8;
const PIECE_SCALE = 0.64;

/**
 * The 3D side of the game: owns the stage, room, island and pieces, plays the animations
 * for game events, and turns pointer clicks into vertex/edge/hex picks.
 */
export class GameScene {
	readonly stage: Stage;
	readonly anim = new Animator();
	readonly particles: Particles;
	private room: Room;
	private boardView: BoardView | null = null;
	private boardKey = '';
	private boardSeed = 0;
	private pieces = new Map<string, PieceObj>();
	private dice: Dice;
	private lastSeq = 0;
	private view: GameView | null = null;
	private pick: PickRequest | null = null;
	private ghosts = new THREE.Group();
	private ghostHits: { mesh: THREE.Object3D; id: number }[] = [];
	private hovered: { id: number; obj: THREE.Object3D } | null = null;
	private hexRing: THREE.LineLoop;
	private raycaster = new THREE.Raycaster();
	private pointer = new THREE.Vector2(-9, -9);
	private mode: 'menu' | 'game' = 'menu';
	private callbacks: SceneCallbacks = {};
	private smokeClock = 0;
	private diceDown = false;
	/** How far the island's land reaches from the center, in world units (about 54 for the classic isle). */
	private reach = 54;
	/** The map shown on the lobby table ('' for the classic island). */
	private menuMap = '';
	/** Settles when the dice of the latest roll come to rest. */
	private diceLanded: Promise<void> = Promise.resolve();

	constructor(
		canvas: HTMLCanvasElement,
		quality: Quality,
		/** Voxels per terrain unit for the island: 1 standard, 2 finer (experimental). */
		private detail = 1
	) {
		this.stage = new Stage(canvas, quality);
		this.particles = new Particles(this.stage.scene);
		this.room = buildRoom(this.stage);
		this.dice = new Dice(this.stage.scene, this.anim, this.particles);
		this.stage.scene.add(this.ghosts);

		const ringGeo = new THREE.BufferGeometry().setFromPoints(
			Array.from({ length: 6 }, (_, i) => {
				const a = (Math.PI / 180) * (60 * i - 90);
				return new THREE.Vector3(Math.cos(a) * (HEX_R - 0.6), 0, Math.sin(a) * (HEX_R - 0.6));
			})
		);
		this.hexRing = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0.9 }));
		this.hexRing.visible = false;
		this.stage.scene.add(this.hexRing);

		this.stage.onFrame((dt, t) => this.frame(dt, t));
		canvas.addEventListener('pointermove', this.onPointerMove);
		canvas.addEventListener('pointerup', this.onPointerUp);
		this.showMenuBoard();
		this.stage.start();
	}

	setCallbacks(cb: SceneCallbacks) {
		this.callbacks = cb;
	}

	// ------------------------------------------------------------ modes

	/** Shift the view sideways (fraction of the screen width), e.g. to clear a menu panel. */
	setLensShift(x: number) {
		this.stage.setLensShift(x);
	}

	showMenuBoard() {
		this.mode = 'menu';
		this.boardKey = '';
		this.view = null;
		this.setPick(null);
		const seed = (Math.random() * 1e9) | 0;
		this.menuMap = '';
		this.setBoard(generateStandardBoard({ rng: seed }), seed);
		this.boardView!.setRobber(this.boardView!.board.hexes.findIndex((h) => h.terrain === 'desert'), true);
		this.clearPieces();
		this.stage.rig.autoRotate = 0.05;
		this.stage.rig.set({ radius: 360, polar: 0.92 });
	}

	/**
	 * In the lobby, the table shows the island the host picked: a freshly dealt copy of that map
	 * (null for the classic island). Does nothing once a game is on the table.
	 */
	showMenuMap(tiles: MapTile[] | null) {
		if (this.mode !== 'menu') return;
		const key = tiles ? JSON.stringify(tiles) : '';
		if (key === this.menuMap) return;
		this.menuMap = key;
		const seed = (Math.random() * 1e9) | 0;
		this.setBoard(tiles ? generateBoard(tiles, { rng: seed }) : generateStandardBoard({ rng: seed }), seed);
		this.boardView!.setRobber(this.boardView!.board.hexes.findIndex((h) => h.terrain === 'desert'), true);
		this.stage.rig.set({ radius: Math.min(470, (360 * this.reach) / 54) });
	}

	private setBoard(board: Board, seed: number) {
		if (this.boardView) {
			this.stage.scene.remove(this.boardView.group);
			this.boardView.dispose();
		}
		this.boardSeed = seed;
		this.boardView = new BoardView(board, seed, this.detail);
		this.stage.scene.add(this.boardView.group);
		// Bigger islands (Reign Extended maps) get a bigger table, so the sea still fits inside the rim.
		this.reach = islandReach(board);
		this.room.fitTable((this.reach + 50) / (TABLE_HALF * ROOM_SCALE));
	}

	/** Rebuild the island at another voxel detail, keeping the game (pieces, robber) as it is. */
	setDetail(detail: number) {
		if (detail === this.detail || !this.boardView) return;
		this.detail = detail;
		if (this.mode === 'game' && this.view) {
			const view = this.view;
			this.boardKey = '';
			this.setView(view);
			return;
		}
		const robber = this.boardView.robberHex;
		this.setBoard(this.boardView.board, this.boardSeed);
		this.boardView!.setRobber(robber, true);
	}

	// ------------------------------------------------------------ game state

	setView(view: GameView) {
		const key = JSON.stringify(view.board);
		const first = key !== this.boardKey;
		if (first) {
			this.boardKey = key;
			this.setBoard(view.board, hashString(key));
			this.clearPieces();
			this.boardView!.setRobber(view.robberHex, true);
			this.lastSeq = view.log.length ? view.log[view.log.length - 1].seq : 0;
			if (this.mode === 'menu') {
				this.mode = 'game';
				this.stage.rig.autoRotate = 0;
				// Each player looks at the table from their own side.
				const seat = Math.max(0, view.me);
				const goal = { ...this.framing(), azimuth: -0.62 + seat * (Math.PI / 2), target: new THREE.Vector3(0, 0, 0) };
				this.stage.rig.set(goal);
				if (this.room.ready) this.dice.place(this.diceSpots(this.cameraAt(goal)).ends);
			}
		}
		const prev = this.view;
		this.view = view;
		this.syncPieces(view, !first);
		this.syncMarks(view);
		if (!first && prev && prev.robberHex !== view.robberHex) this.moveRobber(view.robberHex);
		const fresh = view.log.filter((e) => e.seq > this.lastSeq);
		if (fresh.length) this.lastSeq = fresh[fresh.length - 1].seq;
		if (!first) for (const e of fresh) this.playEvent(e);
	}

	/** Distance and tilt that fit the island on screen, including tall phone screens. */
	private framing() {
		const cam = this.stage.camera;
		const aspect = cam.aspect;
		const vHalf = THREE.MathUtils.degToRad(cam.fov / 2);
		const hHalf = Math.atan(Math.tan(vHalf) * aspect);
		const fit = (80 * Math.max(1, this.reach / 54)) / Math.tan(hHalf);
		const radius = THREE.MathUtils.clamp(Math.max(218, fit * 0.95), 180, 480);
		return { radius, polar: aspect < 0.8 ? 0.62 : 0.82 };
	}

	private clearPieces() {
		for (const p of this.pieces.values()) this.stage.scene.remove(p.obj);
		this.pieces.clear();
	}

	private syncPieces(view: GameView, animate: boolean) {
		const bv = this.boardView!;
		const want = new Map<string, () => THREE.Object3D>();
		view.buildings.forEach((b, v) => {
			if (!b) return;
			const color = PLAYER_RGB[view.players[b.owner].color];
			want.set(`v${v}:${b.kind}:${b.owner}`, () => {
				const obj = cloneModel(b.kind === 'city' ? cityModel(color) : settlementModel(color));
				obj.scale.setScalar(PIECE_SCALE);
				obj.position.copy(bv.vertexPos(v));
				obj.rotation.y = hashString(`r${v}`) % 4 * (Math.PI / 2) + Math.PI / 4;
				return obj;
			});
		});
		view.roads.forEach((owner, e) => {
			if (owner === null) return;
			const color = PLAYER_RGB[view.players[owner].color];
			want.set(`e${e}:${owner}`, () => {
				const obj = cloneModel(roadModel(color, ROAD_LEN));
				obj.scale.set(0.92, 0.64, 0.64);
				const { pos, angle } = bv.edgePos(e);
				obj.position.copy(pos);
				obj.rotation.y = angle;
				return obj;
			});
		});
		for (const [key, p] of this.pieces) {
			if (want.has(key)) continue;
			this.pieces.delete(key);
			if (animate) {
				const o = p.obj;
				this.anim.tween(0.25, (t) => o.scale.setScalar((1 - t) * o.scale.x + 0.0001), ease.linear).then(() => this.stage.scene.remove(o));
			} else this.stage.scene.remove(p.obj);
		}
		for (const [key, make] of want) {
			if (this.pieces.has(key)) continue;
			const obj = make();
			this.stage.scene.add(obj);
			this.pieces.set(key, { key, obj });
			if (animate) this.dropIn(obj, key.startsWith('e'));
		}
	}

	/** Ring the numbers of the tiles you're on, and show who holds each harbor. */
	private syncMarks(view: GameView) {
		const bv = this.boardView!;
		const topo = getTopology(view.board);
		const me = view.players[view.me];
		const mine = new Set<number>();
		view.buildings.forEach((b, v) => {
			if (b && b.owner === view.me) for (const h of topo.vertices[v].hexes) mine.add(h);
		});
		bv.setMine(mine, me ? PLAYER_RGB[me.color] : null);
		bv.setPortOwners(
			bv.build.ports.map((p) => {
				const e = topo.edges[p.edge];
				const b = view.buildings[e.a] ?? view.buildings[e.b];
				return b ? PLAYER_RGB[view.players[b.owner].color] : null;
			})
		);
	}

	private dropIn(obj: THREE.Object3D, isRoad: boolean) {
		const ground = obj.position.y;
		const s = obj.scale.x;
		obj.position.y = ground + 28;
		this.anim.tween(0.55, (t) => {
			obj.position.y = ground + (1 - t) * 28;
		}, ease.outBounce).then(() => {
			this.particles.dust(obj.position.clone().setY(ground + 0.5), isRoad ? 10 : 22);
			this.anim.tween(0.25, (t) => {
				const sq = Math.sin(t * Math.PI) * 0.18;
				obj.scale.set(s * (1 + sq), s * (1 - sq), s * (1 + sq));
			}, ease.linear);
		});
	}

	private async moveRobber(hex: number) {
		const bv = this.boardView!;
		const robber = bv.robber;
		const from = robber.position.clone();
		const to = bv.robberSpot(hex);
		bv.setRobber(hex, false);
		await this.anim.tween(0.9, (t) => {
			robber.position.lerpVectors(from, to, t);
			robber.position.y += Math.sin(t * Math.PI) * 26;
			robber.rotation.y = t * Math.PI * 2;
		}, ease.inOutCubic);
		this.particles.dust(to.clone().setY(to.y + 0.5), 26);
		this.particles.emit({ at: to.clone().setY(to.y + 3), count: 12, colors: ['#2a2a30', '#45454f'], speed: 8, up: 10, life: 0.8 });
	}

	private playEvent(e: GameEvent) {
		const bv = this.boardView;
		if (!bv || !this.view) return;
		switch (e.type) {
			case 'diceRolled': {
				const spot = this.diceSpots();
				const total = e.dice[0] + e.dice[1];
				// As the dice land, the numbers rolled light up and the interface shows the roll.
				this.diceLanded = this.dice.roll(e.dice, spot.from, spot.ends, spot.yaw).then(() => {
					this.flashTokens(total);
					this.callbacks.onDiceSettled?.(e.dice, e.seq);
				});
				break;
			}
			case 'produced':
				// The resources rise from their tiles as the dice land.
				this.diceLanded.then(() => {
					for (const g of e.gains) this.popResource(g.hex, g.resource, g.player, g.amount);
				});
				break;
			case 'setupResources':
				for (const g of e.gains) this.popResource(g.hex, g.resource, g.player, g.amount);
				break;
			case 'gameOver': {
				const color = PLAYER_RGB[this.view.players[e.winner].color];
				this.particles.confetti(new THREE.Vector3(0, 40, 0), [color, '#ffd75e', '#ffffff', '#ff6f61', '#6fd3ff']);
				this.stage.rig.autoRotate = 0.12;
				break;
			}
		}
	}

	/**
	 * Where the dice land: two spots side by side (as this camera sees them) on clear table,
	 * off the board and its sea and away from the props, as near as possible to the right of
	 * the screen below the player plaques. They are tossed in from the viewer's side.
	 */
	private diceSpots(cam: THREE.PerspectiveCamera = this.stage.camera) {
		const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
		const toCam = fwd.clone().negate();
		const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
		const want = new THREE.Vector2(0.55, -0.3);
		const ndc = new THREE.Vector3();
		const blockers = this.hudBoxes();
		/** Distance from the wanted screen spot; spots off screen or under the HUD lose. */
		const score = (x: number, z: number) => {
			ndc.set(x, 0, z).project(cam);
			const off = Math.max(0, Math.abs(ndc.x) - 0.84) + Math.max(0, ndc.y - 0.78) + Math.max(0, -0.74 - ndc.y);
			let d = Math.hypot(ndc.x - want.x, ndc.y - want.y) + off * 20;
			for (const b of blockers) if (ndc.x > b.min.x && ndc.x < b.max.x && ndc.y > b.min.y && ndc.y < b.max.y) d += 4;
			return d;
		};
		// A die's corners reach about 1.42 half-widths from its center.
		const reach = DIE_HALF * 1.42 + 0.8;
		const boxes = this.room.props.children.map((c) => new THREE.Box3().setFromObject(c).expandByScalar(reach));
		const lim = this.room.tableHalf - reach - 1;
		const build = this.boardView?.build;
		const free = (x: number, z: number, r: number) => {
			if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
			for (const b of boxes) if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) return false;
			if (!build) return true;
			if (build.surfaceY(x, z) > 0) return false;
			for (let k = 0; k < 8; k++) {
				const a = (k * Math.PI) / 4;
				if (build.surfaceY(x + Math.cos(a) * r, z + Math.sin(a) * r) > 0) return false;
			}
			return true;
		};
		const gap = DIE_HALF * 1.5;
		let best: THREE.Vector3 | null = null;
		let bestD = Infinity;
		for (let z = -lim; z <= lim; z += 2.5)
			for (let x = -lim; x <= lim; x += 2.5) {
				const d = score(x, z);
				if (d >= bestD) continue;
				// Both dice, and where they first touch down on the way in.
				if (!free(x + right.x * gap, z + right.z * gap, reach)) continue;
				if (!free(x - right.x * gap, z - right.z * gap, reach)) continue;
				if (!free(x + toCam.x * 7, z + toCam.z * 7, DIE_HALF)) continue;
				bestD = d;
				best = new THREE.Vector3(x, 0, z);
			}
		const c = best ?? toCam.clone().multiplyScalar(lim);
		const jitter = () => new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
		const ends: [THREE.Vector3, THREE.Vector3] = [c.clone().addScaledVector(right, -gap).add(jitter()), c.clone().addScaledVector(right, gap).add(jitter())];
		// The turn that lines a die's faces up with the screen: its x axis along the view's right.
		const yaw = Math.atan2(-fwd.x, -fwd.z);
		return { ends, from: c.clone().addScaledVector(toCam, 24).setY(26), yaw };
	}

	/** Screen areas (in NDC) behind the HUD's panels: plaques, log, hand, buttons. */
	private hudBoxes(): THREE.Box2[] {
		const r = this.stage.canvas.getBoundingClientRect();
		if (!r.width || !r.height) return [];
		const pad = 24;
		const boxes: THREE.Box2[] = [];
		// Panels, and what sits inside wrappers that have no size of their own (the buttons).
		for (const node of document.querySelectorAll('.hud > *, .hud > * > *')) {
			const b = node.getBoundingClientRect();
			if (!b.width || !b.height || b.width * b.height > r.width * r.height * 0.5) continue;
			boxes.push(
				new THREE.Box2(
					new THREE.Vector2(((b.left - pad - r.left) / r.width) * 2 - 1, 1 - ((b.bottom + pad - r.top) / r.height) * 2),
					new THREE.Vector2(((b.right + pad - r.left) / r.width) * 2 - 1, 1 - ((b.top - pad - r.top) / r.height) * 2)
				)
			);
		}
		return boxes;
	}

	/** A copy of the camera placed where a rig framing would put it. */
	private cameraAt(f: { radius: number; polar: number; azimuth: number; target: THREE.Vector3 }) {
		const cam = this.stage.camera.clone();
		const s = Math.sin(f.polar);
		cam.position.set(f.target.x + f.radius * s * Math.sin(f.azimuth), f.target.y + f.radius * Math.cos(f.polar), f.target.z + f.radius * s * Math.cos(f.azimuth));
		cam.lookAt(f.target);
		cam.updateMatrixWorld();
		return cam;
	}

	private flashTokens(total: number) {
		const bv = this.boardView!;
		bv.board.hexes.forEach((h, i) => {
			if (h.number !== total) return;
			const tok = bv.tokens[i];
			tok.userData.highlight = true;
			this.particles.sparkle(tok.position.clone().setY(tok.position.y + 3), '#ffe39a', 10);
			this.anim.wait(2.2).then(() => (tok.userData.highlight = false));
		});
	}

	private popResource(hex: number, resource: string, player: number, amount: number) {
		const bv = this.boardView!;
		for (let k = 0; k < amount; k++) {
			const item = cloneModel(resourceItemModel(resource));
			item.scale.setScalar(0.42);
			const c = bv.hexCenter(hex);
			const start = new THREE.Vector3(c.x + (Math.random() - 0.5) * 6, bv.groundAt(c.x, c.z, 3) + 3, c.z + (Math.random() - 0.5) * 6);
			item.position.copy(start);
			this.stage.scene.add(item);
			const spin = Math.random() * 2 + 2;
			const delay = k * 0.15 + Math.random() * 0.1;
			this.anim.tween(1.1, (t) => {
				item.position.y = start.y + ease.outCubic(t) * 16;
				item.rotation.y = t * spin * Math.PI;
				item.scale.setScalar(0.42 * (t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1) + 0.001);
			}, ease.linear, delay).then(() => {
				this.stage.scene.remove(item);
				const screen = this.project(item.position);
				this.callbacks.onResourcePopped?.(player, resource, screen);
				this.particles.sparkle(item.position, '#fff1b8', 6);
			});
		}
	}

	project(p: THREE.Vector3) {
		const v = p.clone().project(this.stage.camera);
		const el = this.stage.canvas;
		return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
	}

	// ------------------------------------------------------------ picking

	setPick(req: PickRequest | null) {
		this.pick = req;
		this.ghosts.clear();
		this.ghostHits = [];
		this.hovered = null;
		this.hexRing.visible = false;
		if (!req || !this.boardView) return;
		const bv = this.boardView;
		const color = PLAYER_RGB[req.color] ?? 0xffffff;
		const mat = ghostMaterial(color);
		const markerMat = markerMaterial(color);
		for (const id of req.options) {
			let model: THREE.Object3D | null = null;
			let pos = new THREE.Vector3();
			let rot = 0;
			if (req.kind === 'settlement') {
				model = settlementModel(color);
				pos = bv.vertexPos(id);
			} else if (req.kind === 'city') {
				model = cityModel(color);
				pos = bv.vertexPos(id);
			} else if (req.kind === 'road') {
				model = roadModel(color, ROAD_LEN);
				const ep = bv.edgePos(id);
				pos = ep.pos;
				rot = ep.angle;
			}
			if (!model) continue;
			// A slot is a small glowing marker; the full ghost piece appears on hover.
			const slot = new THREE.Group();
			slot.position.copy(pos);
			slot.rotation.y = rot;
			slot.userData = { id, baseY: pos.y, phase: Math.random() * 6 };
			const ghost = cloneModel(model as THREE.Group);
			ghost.traverse((o) => {
				const m = o as THREE.Mesh;
				if (!m.isMesh) return;
				// The ghost is see-through, so its outline would show inside it.
				if (m.name === 'outline') m.visible = false;
				m.material = mat;
				m.castShadow = false;
			});
			ghost.scale.setScalar(req.kind === 'road' ? 0.7 : PIECE_SCALE);
			ghost.userData.base = ghost.scale.x;
			ghost.name = 'ghost';
			ghost.visible = false;
			slot.add(ghost);
			if (req.kind === 'road') {
				const bar = new THREE.Mesh(MARKER_BAR, markerMat);
				bar.position.y = 1.2;
				bar.name = 'marker';
				slot.add(bar);
			} else {
				const gem = new THREE.Mesh(MARKER_GEM, markerMat);
				gem.position.y = req.kind === 'city' ? 11 : 4.5;
				gem.name = 'marker';
				slot.add(gem);
				const ring = new THREE.Mesh(MARKER_RING, ringMaterial(color));
				ring.rotation.x = -Math.PI / 2;
				ring.position.y = 0.3;
				ring.name = 'ring';
				slot.add(ring);
			}
			this.ghosts.add(slot);
			const hit = new THREE.Mesh(
				req.kind === 'road' ? new THREE.BoxGeometry(9, 6, 4) : new THREE.SphereGeometry(5, 8, 6),
				new THREE.MeshBasicMaterial({ visible: false })
			);
			hit.position.copy(pos).setY(pos.y + 2);
			hit.rotation.y = rot;
			this.ghosts.add(hit);
			this.ghostHits.push({ mesh: hit, id });
		}
	}

	/** Screen positions of the current pick options (used by browser tests). */
	debugPickPoints(): { id: number; x: number; y: number }[] {
		if (!this.pick || !this.boardView) return [];
		if (this.pick.kind === 'robber') {
			return this.pick.options.map((id) => {
				const c = this.boardView!.hexCenter(id);
				c.y = this.boardView!.groundAt(c.x, c.z, 0);
				return { id, ...this.project(c.add(new THREE.Vector3(5, 0, 4))) };
			});
		}
		return this.ghostHits.map((g) => ({ id: g.id, ...this.project(g.mesh.position) }));
	}

	private onPointerMove = (e: PointerEvent) => {
		const r = this.stage.canvas.getBoundingClientRect();
		this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
	};

	private onPointerUp = (e: PointerEvent) => {
		if (e.button !== 0 || this.stage.rig.dragged || !this.pick) return;
		this.onPointerMove(e);
		const id = this.pickAtPointer();
		if (id !== null) {
			const req = this.pick;
			req.onPick(id);
		}
	};

	private pickAtPointer(): number | null {
		if (!this.pick || !this.boardView) return null;
		this.raycaster.setFromCamera(this.pointer, this.stage.camera);
		if (this.pick.kind === 'robber') {
			const hits = this.raycaster.intersectObject(this.boardView.build.group, true);
			const p = hits[0]?.point ?? this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -5), new THREE.Vector3());
			if (!p) return null;
			const ax = worldToHex(p.x / HEX_R, p.z / HEX_R);
			const idx = this.boardView.board.hexes.findIndex((h) => hexKey(h) === hexKey(ax));
			return this.pick.options.includes(idx) ? idx : null;
		}
		const hits = this.raycaster.intersectObjects(this.ghostHits.map((g) => g.mesh), false);
		if (!hits.length) return null;
		return this.ghostHits.find((g) => g.mesh === hits[0].object)?.id ?? null;
	}

	/** Little puffs from the chimneys of settlements and cities. */
	private smoke(dt: number) {
		this.smokeClock += dt;
		if (this.smokeClock < 0.35) return;
		this.smokeClock = 0;
		const homes = [...this.pieces.values()].filter((p) => p.key.startsWith('v'));
		if (!homes.length) return;
		const p = homes[Math.floor(Math.random() * homes.length)];
		const city = p.key.includes(':city:');
		const local = city ? new THREE.Vector3(-2.5, 12, -3) : new THREE.Vector3(1.5, 7.5, -1);
		const at = p.obj.localToWorld(local.clone());
		this.particles.emit({ at, count: 1, colors: ['#d9d4cc', '#c4beb5', '#eeeae4'], speed: 0.6, up: 3.2, spread: 0.3, life: 3.2, size: 0.9, gravity: -0.4, drag: 0.4 });
	}

	// ------------------------------------------------------------ frame

	private frame(dt: number, t: number) {
		this.anim.update(dt);
		this.particles.update(dt);
		this.room.update(dt, t);
		if (!this.diceDown && this.room.ready && this.boardView) {
			this.diceDown = true;
			this.dice.place(this.diceSpots().ends);
		}
		this.smoke(dt);
		const bv = this.boardView;
		if (bv) {
			bv.update(dt, t, this.stage.rig.azimuth);
		}

		// hover feedback
		const id = this.pick ? this.pickAtPointer() : null;
		this.stage.canvas.style.cursor = id !== null ? 'pointer' : '';
		for (const slot of this.ghosts.children) {
			if (slot.userData.id === undefined) continue;
			const hovered = slot.userData.id === id;
			const ghost = slot.getObjectByName('ghost')!;
			const marker = slot.getObjectByName('marker');
			const ring = slot.getObjectByName('ring');
			ghost.visible = hovered;
			if (hovered) {
				const s = THREE.MathUtils.lerp(ghost.scale.x, ghost.userData.base * 1.12, 0.3);
				ghost.scale.setScalar(s);
				ghost.position.y = 1.5 + Math.sin(t * 5) * 0.4;
			} else ghost.scale.setScalar(ghost.userData.base * 0.6);
			if (marker) {
				marker.visible = !hovered || this.pick?.kind === 'road';
				if (this.pick?.kind !== 'road') {
					marker.rotation.y = t * 1.8 + slot.userData.phase;
					marker.position.y = (this.pick?.kind === 'city' ? 11 : 4.5) + Math.sin(t * 3 + slot.userData.phase) * 0.7;
				}
			}
			if (ring) ring.scale.setScalar(1 + Math.sin(t * 3 + slot.userData.phase) * 0.12);
		}
		if (this.pick?.kind === 'robber' && bv) {
			if (id !== null) {
				const c = bv.hexCenter(id);
				this.hexRing.position.set(c.x, bv.groundAt(c.x, c.z, 0) + 0.3, c.z);
				this.hexRing.visible = true;
				(this.hexRing.material as THREE.LineBasicMaterial).opacity = 0.6 + Math.sin(t * 6) * 0.3;
			} else this.hexRing.visible = false;
		}
		const pulse = 0.5 + Math.sin(t * 4) * 0.5;
		for (const m of ghostCache.values()) m.emissiveIntensity = 0.4 + pulse * 0.3;
		for (const m of markerCache.values()) m.emissiveIntensity = 0.9 + pulse * 0.9;
	}

	dispose() {
		this.stage.dispose();
	}
}

const MARKER_GEM = new THREE.OctahedronGeometry(1.5, 0).scale(1, 1.45, 1);
const MARKER_BAR = new THREE.BoxGeometry(6.5, 0.9, 0.9);
const MARKER_RING = new THREE.RingGeometry(2.2, 3.1, 6);

const markerCache = new Map<number, THREE.MeshStandardMaterial>();
function markerMaterial(color: number) {
	let m = markerCache.get(color);
	if (!m) {
		m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.3, flatShading: true });
		markerCache.set(color, m);
	}
	return m;
}

const ringCache = new Map<number, THREE.MeshBasicMaterial>();
function ringMaterial(color: number) {
	let m = ringCache.get(color);
	if (!m) {
		m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
		ringCache.set(color, m);
	}
	return m;
}

const ghostCache = new Map<number, THREE.MeshStandardMaterial>();
function ghostMaterial(color: number) {
	let m = ghostCache.get(color);
	if (!m) {
		m = new THREE.MeshStandardMaterial({
			color,
			emissive: color,
			emissiveIntensity: 0.6,
			transparent: true,
			opacity: 0.72,
			depthWrite: true,
			roughness: 0.5
		});
		ghostCache.set(color, m);
	}
	return m;
}

function hashString(s: string) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

export { getTopology };
