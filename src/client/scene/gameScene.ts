import * as THREE from 'three';
import { generateBoard, generateStandardBoard } from '../../shared/board/generate';
import type { MapTile } from '../../shared/board/maps';
import { type Board, getTopology } from '../../shared/board/topology';
import { worldToHex, hexKey } from '../../shared/board/hex';
import { TERRAIN_RESOURCE } from '../../shared/rules/config';
import type { GameEvent, GameView } from '../../shared/rules/types';
import { Animator, ease } from './anim';
import { BoardView } from './board/boardView';
import { RobberAim } from './board/robberAim';
import { islandReach } from './board/terrain';
import { cityModel, cloneModel, resourceItemModel, roadModel, settlementModel } from './board/models';
import { WORKSHOP_SCALE, animateWorkshop, workshopChimney, workshopObject } from './board/workshops';
import { DIE_HALF, Dice } from './dice';
import { Particles } from './effects';
import { HEX_R, PLAYER_RGB } from './layout';
import { type Room, buildRoom } from './room/room';
import { TABLE_HALF } from './room/table';
import { ROOM_SCALE } from './room/util';
import { type Quality, Stage } from './stage';
import { sharedUniforms } from './voxel/materials';

export type PickKind = 'settlement' | 'road' | 'city' | 'robber' | 'workshop';

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
	/**
	 * The built piece under the pointer changed (null: none), for its tooltip. With a mouse it
	 * follows the pointer while nothing is being placed; on touch a tap on a piece sends it with
	 * `tap` set.
	 */
	onPieceHover?: (spot: BoardSpot | null, tap: boolean) => void;
	/** The tile under the pointer changed while this player picks where the robber goes (null: none). */
	onAim?: (hex: number | null) => void;
}

/** Where a piece stands: a settlement or city on a vertex, a road on an edge, a workshop on a tile. */
export interface BoardSpot {
	place: 'vertex' | 'edge' | 'hex';
	at: number;
}

/** A piece's key starts with where it stands: v12 (vertex), e5 (edge), w3 (a tile's workshop). */
const SPOT_PLACE: Record<string, BoardSpot['place']> = { v: 'vertex', e: 'edge', w: 'hex' };
function spotOf(key: string): BoardSpot | null {
	const m = /^([a-z])(\d+)/.exec(key);
	const place = m && SPOT_PLACE[m[1]];
	return place ? { place, at: Number(m[2]) } : null;
}

interface PieceObj {
	key: string;
	obj: THREE.Object3D;
	/** Seat of the player it belongs to. */
	owner: number;
	/** Height it stands at. */
	ground: number;
	/** How far it floats above the ground while its player is highlighted (see `lightUp`). */
	lift: number;
	/** What lights it up while its player is highlighted, or null. */
	glow: THREE.Group | null;
}

const ROAD_LEN = 8;
const PIECE_SCALE = 0.64;
/** How much a piece's model is scaled on the board, by its key. */
const pieceScale = (key: string) => (key.startsWith('w') ? WORKSHOP_SCALE : PIECE_SCALE);

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
	/** Whether the island was laid out with workshop plots (Reign Extended workshops are on). */
	private boardPlots = false;
	private pieces = new Map<string, PieceObj>();
	private dice: Dice;
	private lastSeq = 0;
	private view: GameView | null = null;
	private pick: PickRequest | null = null;
	private ghosts = new THREE.Group();
	private ghostHits: { mesh: THREE.Object3D; id: number }[] = [];
	private hovered: { id: number; obj: THREE.Object3D } | null = null;
	/** Lights up the tile the robber is about to move to. */
	private aim: RobberAim;
	/** The tile this player's pointer is on while they pick the robber's tile, as last reported. */
	private myAim: number | null = null;
	/** The tile another player is about to move the robber to, and their color. */
	private theirAim: { hex: number; color: string } | null = null;
	private raycaster = new THREE.Raycaster();
	private pointer = new THREE.Vector2(-9, -9);
	/** The last pointer's kind, and whether a button is held (dragging the view). */
	private pointerType = '';
	private pointerHeld = false;
	/** The piece under the pointer as last reported to `onPieceHover` ('' for none). */
	private hoverKey = '';
	private hoverAt = new THREE.Vector2(-9, -9);
	private hoverIdle = 0;
	private mode: 'menu' | 'game' = 'menu';
	private callbacks: SceneCallbacks = {};
	private smokeClock = 0;
	private kilnClock = 0;
	private diceDown = false;
	/** How far the island's land reaches from the center, in world units (about 54 for the classic isle). */
	private reach = 54;
	/** The map shown on the lobby table ('' for the classic island). */
	private menuMap = '';
	/** Settles when the dice of the latest roll come to rest. */
	private diceLanded: Promise<void> = Promise.resolve();
	/** The player whose pieces light up (their plaque is hovered), or null. */
	private highlighted: number | null = null;
	/** How lit up each player's pieces are, from 0 to 1, as they fade in and out. */
	private lit: number[] = [];

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
		this.aim = new RobberAim(this.stage.scene, this.particles);
		this.stage.scene.add(this.ghosts);

		this.stage.onFrame((dt, t) => this.frame(dt, t));
		canvas.addEventListener('pointermove', this.onPointerMove);
		canvas.addEventListener('pointerup', this.onPointerUp);
		canvas.addEventListener('pointerleave', this.onPointerLeave);
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
		this.highlighted = null;
		this.lit = [];
		const seed = (Math.random() * 1e9) | 0;
		this.menuMap = '';
		this.setBoard(generateStandardBoard({ rng: seed }), seed);
		this.boardView!.setRobber(this.boardView!.board.hexes.findIndex((h) => h.terrain === 'desert'), true);
		this.clearPieces();
		this.stage.rig.autoRotate = 0.05;
		this.stage.rig.set({ radius: this.menuRadius(103, 0.92), polar: 0.92 });
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
		this.stage.rig.set({ radius: this.menuRadius((103 * this.reach) / 54, 0.92) });
	}

	private setBoard(board: Board, seed: number, plots = false) {
		this.aim.clear(this.boardView);
		if (this.boardView) {
			this.stage.scene.remove(this.boardView.group);
			this.boardView.dispose();
		}
		this.boardSeed = seed;
		this.boardPlots = plots;
		this.boardView = new BoardView(board, seed, this.detail, plots);
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
		this.setBoard(this.boardView.board, this.boardSeed, this.boardPlots);
		this.boardView!.setRobber(robber, true);
	}

	// ------------------------------------------------------------ game state

	setView(view: GameView) {
		// Workshops need plots laid out on the tiles; the island is otherwise dealt the same.
		const plots = !!view.buildingRules?.workshop;
		const board = JSON.stringify(view.board);
		const key = plots ? `${board}+plots` : board;
		const first = key !== this.boardKey;
		if (first) {
			this.boardKey = key;
			this.setBoard(view.board, hashString(board), plots);
			this.clearPieces();
			this.boardView!.setRobber(view.robberHex, true);
			this.lastSeq = view.log.length ? view.log[view.log.length - 1].seq : 0;
			if (this.mode === 'menu') {
				this.mode = 'game';
				this.stage.rig.autoRotate = 0;
				// Each player looks at the table from their own side.
				const seat = Math.max(0, view.me);
				const azimuth = -0.62 + seat * (Math.PI / 2);
				const goal = { ...this.framing(azimuth), azimuth, target: new THREE.Vector3(0, 0, 0) };
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

	/** Light up one player's pieces on the board (while their plaque is hovered), or nobody's. */
	highlightPlayer(seat: number | null) {
		this.highlighted = seat;
	}

	/**
	 * Distance and tilt that fit the island on screen seen from `azimuth`, including tall phone
	 * screens: all of it across the screen, the near edge of its land 72% of the way down from the
	 * middle (just above the hand) and the far edge at most 80% of the way up. Where the room is
	 * too small for that, the camera stops at a wall or the ceiling.
	 */
	private framing(azimuth: number) {
		const cam = this.stage.camera;
		const aspect = cam.aspect;
		const polar = aspect < 0.8 ? 0.62 : 0.82;
		const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
		// How far the land reaches towards the camera, away from it and to either side: a long
		// island seen from the side needs less room than seen end on.
		const [x, z] = [Math.sin(azimuth), Math.cos(azimuth)];
		let near = 0;
		let far = 0;
		let side = 0;
		for (const t of getTopology(this.boardView!.board).hexes) {
			near = Math.max(near, t.x * x + t.z * z);
			far = Math.max(far, -t.x * x - t.z * z);
			side = Math.max(side, Math.abs(t.x * z - t.z * x));
		}
		const land = (d: number) => d * HEX_R + HEX_R;
		const across = ((80 * Math.max(1, land(side) / 54)) / (tan * aspect)) * 0.95;
		const [s, c] = [Math.sin(polar), Math.cos(polar)];
		// Never closer than for the classic island.
		const shore = Math.max(54, land(near)) * (s + c / (0.72 * tan));
		const top = land(far) * (c / (0.8 * tan) - s);
		return { radius: Math.max(across, shore, top), polar };
	}

	/**
	 * Distance for the menus' slow turn round the table: far enough back for the view to reach
	 * `h` world units above and below the target, and close enough that the camera never has to
	 * come in at a wall as it turns.
	 */
	private menuRadius(h: number, polar: number) {
		const r = h / Math.tan(THREE.MathUtils.degToRad(this.stage.camera.fov / 2));
		const room = this.stage.rig.bounds;
		return room ? Math.min(r, (room.half - 8) / Math.sin(polar), room.top / Math.cos(polar)) : r;
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
		view.workshops?.forEach((owner, h) => {
			const res = TERRAIN_RESOURCE[view.board.hexes[h].terrain];
			const spot = bv.plotSpot(h);
			if (owner === null || !res || !spot) return;
			const color = PLAYER_RGB[view.players[owner].color];
			want.set(`w${h}:${owner}`, () => {
				const obj = workshopObject(res, color);
				obj.scale.setScalar(WORKSHOP_SCALE);
				obj.position.copy(spot.pos);
				// Its front faces out from the tile's center.
				obj.rotation.y = Math.PI / 2 - spot.angle;
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
			// Keys end with the owner's seat.
			const owner = Number(key.slice(key.lastIndexOf(':') + 1));
			obj.userData.pieceKey = key;
			this.pieces.set(key, { key, obj, owner, ground: obj.position.y, lift: 0, glow: null });
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
		// A highlighted building waits until it is down before it floats (see `lightUp`).
		obj.userData.landing = true;
		this.anim.tween(0.55, (t) => {
			obj.position.y = ground + (1 - t) * 28;
		}, ease.outBounce).then(() => {
			obj.userData.landing = false;
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
				// The resources rise from their tiles as the dice land, a workshop's from the workshop.
				this.diceLanded.then(() => {
					for (const g of e.gains) {
						const shop = g.workshop ? this.pieces.get(`w${g.hex}:${g.player}`)?.obj : undefined;
						if (shop) this.workshopPays(shop);
						this.popResource(g.hex, g.resource, g.player, g.amount, shop?.position);
					}
				});
				break;
			case 'setupResources':
				for (const g of e.gains) this.popResource(g.hex, g.resource, g.player, g.amount);
				break;
			case 'yearOfPlenty':
				// After any dice still in the air, as the interface counts the cards only then.
				this.diceLanded.then(() => this.popFromBank(e.resources, e.player));
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

	/** A copy of the camera placed where a rig framing would put it (inside the room). */
	private cameraAt(f: { radius: number; polar: number; azimuth: number; target: THREE.Vector3 }) {
		const cam = this.stage.camera.clone();
		this.stage.rig.positionFor(f, cam.position);
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

	/** A workshop that just paid gives a little hop and a sparkle. */
	private workshopPays(obj: THREE.Object3D) {
		const base = obj.position.y;
		const s = obj.scale.x;
		this.particles.sparkle(obj.position.clone().setY(base + 6), '#ffe39a', 14);
		this.anim.tween(0.45, (t) => {
			const k = Math.sin(t * Math.PI);
			obj.position.y = base + k * 1.2;
			obj.scale.set(s * (1 - k * 0.06), s * (1 + k * 0.1), s * (1 - k * 0.06));
		}, ease.linear).then(() => {
			obj.position.y = base;
			obj.scale.setScalar(s);
		});
	}

	/** Resources rise from a tile (or from `from`, a workshop on it) and fly to their player. */
	private popResource(hex: number, resource: string, player: number, amount: number, from?: THREE.Vector3) {
		const bv = this.boardView!;
		for (let k = 0; k < amount; k++) {
			const c = from ?? bv.hexCenter(hex);
			const spread = from ? 2 : 6;
			const start = new THREE.Vector3(c.x + (Math.random() - 0.5) * spread, (from ? from.y + 4 : bv.groundAt(c.x, c.z, 3)) + 3, c.z + (Math.random() - 0.5) * spread);
			this.riseAndFly(start, resource, player, k * 0.15 + Math.random() * 0.1);
		}
	}

	/** A Year of Plenty: each card rises off the bank's pile of its kind on the table. */
	private popFromBank(resources: string[], player: number) {
		resources.forEach((resource, k) => {
			const start = this.pileTop(resource);
			start.x += (Math.random() - 0.5) * 2;
			start.z += (Math.random() - 0.5) * 2;
			// The piles sit on the table's rim, often near the edge of the screen: a lower rise
			// keeps the card in sight.
			this.riseAndFly(start, resource, player, k * 0.25, 9);
		});
	}

	/** Just over the bank's pile of `resource` on the table. */
	private pileTop(resource: string): THREE.Vector3 {
		const piles: THREE.Object3D[] = [];
		this.room.props.traverse((o) => {
			if (o.userData.cards) piles.push(o);
		});
		const pile = piles.find((o) => o.userData.cards === resource);
		// Before the room has its piles, over the middle of the island.
		if (!pile) return new THREE.Vector3(0, 30, 0);
		const box = new THREE.Box3().setFromObject(pile);
		return box.getCenter(new THREE.Vector3()).setY(box.max.y + 1);
	}

	/**
	 * Where the cards of a bank trade go in and come out: just over the bank's pile of `resource`,
	 * or over harbor `harbor` (an index into the board's harbors) when the trade went through one.
	 */
	private tradeSpot(resource: string, harbor: number): THREE.Vector3 {
		const at = harbor >= 0 ? this.boardView?.harborSpot(harbor) : null;
		return at ? at.setY(at.y + 2) : this.pileTop(resource);
	}

	/**
	 * Where on screen the cards paid in a bank trade land: on the bank's pile of `resource`, or on
	 * the harbor.
	 */
	tradeTarget(resource: string, harbor: number) {
		return this.onScreen(this.tradeSpot(resource, harbor));
	}

	/** A card paid in a bank trade reached the pile or the harbor. */
	tradeLanded(resource: string, harbor: number) {
		this.particles.sparkle(this.tradeSpot(resource, harbor), '#fff1b8', 5);
	}

	/**
	 * The card bought in a bank trade rises off the bank's pile of its kind, or off the harbor, and
	 * flies to `player`.
	 */
	tradeOut(resource: string, harbor: number, player: number) {
		this.riseAndFly(this.tradeSpot(resource, harbor), resource, player, 0, harbor >= 0 ? 12 : 9);
	}

	/**
	 * A resource rises `rise` units from `start`, spinning, then the interface flies it to
	 * `player`'s hand (`onResourcePopped`).
	 */
	private riseAndFly(start: THREE.Vector3, resource: string, player: number, delay: number, rise = 16) {
		const item = cloneModel(resourceItemModel(resource));
		// Unseen until its turn to rise.
		item.scale.setScalar(0.001);
		item.position.copy(start);
		this.stage.scene.add(item);
		const spin = Math.random() * 2 + 2;
		this.anim.tween(1.1, (t) => {
			item.position.y = start.y + ease.outCubic(t) * rise;
			item.rotation.y = t * spin * Math.PI;
			item.scale.setScalar(0.42 * (t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1) + 0.001);
		}, ease.linear, delay).then(() => {
			this.stage.scene.remove(item);
			// It flies on from where it is, or from the nearest edge if it rose out of sight.
			this.callbacks.onResourcePopped?.(player, resource, this.onScreen(item.position));
			this.particles.sparkle(item.position, '#fff1b8', 6);
		});
	}

	project(p: THREE.Vector3) {
		const v = p.clone().project(this.stage.camera);
		const el = this.stage.canvas;
		return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
	}

	/**
	 * Where `p` is on screen, kept clear of the edges so a card flying from or to it stays in
	 * sight: when `p` is out of view, the nearest point toward it.
	 */
	private onScreen(p: THREE.Vector3) {
		const v = p.clone().project(this.stage.camera);
		// Behind the camera the projection comes out mirrored: turn it round and push it off screen.
		if (v.z > 1) v.multiplyScalar(-1e3);
		const el = this.stage.canvas;
		return {
			x: THREE.MathUtils.clamp(((v.x + 1) / 2) * el.clientWidth, 40, el.clientWidth - 40),
			y: THREE.MathUtils.clamp(((1 - v.y) / 2) * el.clientHeight, 40, el.clientHeight - 40)
		};
	}

	// ------------------------------------------------------------ picking

	setPick(req: PickRequest | null) {
		this.pick = req;
		this.ghosts.clear();
		this.ghostHits = [];
		this.hovered = null;
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
			} else if (req.kind === 'workshop') {
				const res = TERRAIN_RESOURCE[bv.board.hexes[id].terrain];
				const spot = bv.plotSpot(id);
				if (!res || !spot) continue;
				model = workshopObject(res, color);
				pos = spot.pos;
				rot = Math.PI / 2 - spot.angle;
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
			ghost.scale.setScalar(req.kind === 'road' ? 0.7 : req.kind === 'workshop' ? WORKSHOP_SCALE : PIECE_SCALE);
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
				gem.position.y = markerHeight(req.kind);
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

	/**
	 * Light up the tile another player is about to move the robber to, in their color (null:
	 * they point at none). While this player picks the robber's tile, their own pointer wins.
	 */
	setTheirAim(hex: number | null, color: string) {
		this.theirAim = hex === null ? null : { hex, color };
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
		this.pointerType = e.pointerType;
		this.pointerHeld = e.buttons !== 0;
	};

	private onPointerLeave = () => {
		this.pointer.set(-9, -9);
	};

	private onPointerUp = (e: PointerEvent) => {
		this.pointerHeld = false;
		// A tap on a piece (when nothing is being placed) shows its tooltip on touch screens.
		if (e.pointerType === 'touch' && !this.pick && !this.stage.rig.dragged) {
			this.onPointerMove(e);
			const piece = this.pieceAtPointer();
			const spot = piece && spotOf(piece.key);
			if (spot) this.callbacks.onPieceHover?.(spot, true);
			return;
		}
		// After dragging the view, the piece still under the pointer gets its tooltip back.
		if (e.pointerType !== 'touch') this.hoverKey = '';
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

	/** The built piece under the pointer, if any. */
	private pieceAtPointer(): PieceObj | null {
		if (this.mode !== 'game' || !this.pieces.size) return null;
		this.raycaster.setFromCamera(this.pointer, this.stage.camera);
		const objs = [...this.pieces.values()].map((p) => p.obj);
		for (const hit of this.raycaster.intersectObjects(objs, true)) {
			let o: THREE.Object3D | null = hit.object;
			while (o && o.userData.pieceKey === undefined) o = o.parent;
			const piece = o && this.pieces.get(o.userData.pieceKey);
			if (piece) return piece;
		}
		return null;
	}

	/**
	 * Where a piece's tooltip points: just over the top of the piece on `spot`, in page pixels
	 * (null when there is no such piece any more, or it is off screen).
	 */
	pieceTipPoint(spot: BoardSpot): { x: number; y: number } | null {
		const prefix = { vertex: 'v', edge: 'e', hex: 'w' }[spot.place] + spot.at + ':';
		let piece: PieceObj | null = null;
		for (const p of this.pieces.values()) if (p.key.startsWith(prefix)) piece = p;
		if (!piece) return null;
		const box = new THREE.Box3().setFromObject(piece.obj);
		const top = box.getCenter(new THREE.Vector3()).setY(box.max.y);
		const v = top.project(this.stage.camera);
		if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
		const r = this.stage.canvas.getBoundingClientRect();
		return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
	}

	/** Report the piece under a mouse pointer when it changes, for its tooltip. */
	private hoverPiece() {
		const live = !this.pick && this.pointerType !== 'touch' && !this.pointerHeld;
		// Look again when the pointer moves, and now and then for pieces moving under it.
		const moved = !this.hoverAt.equals(this.pointer);
		if (live && !moved && ++this.hoverIdle < 12) return;
		this.hoverAt.copy(this.pointer);
		this.hoverIdle = 0;
		const piece = live ? this.pieceAtPointer() : null;
		const spot = piece && spotOf(piece.key);
		const key = spot ? `${spot.place}${spot.at}` : '';
		if (key === this.hoverKey) return;
		this.hoverKey = key;
		this.callbacks.onPieceHover?.(spot, false);
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

	/**
	 * The highlighted player's pieces light up: buildings glow with a bright rim, float and bob,
	 * with a ring spreading out on the ground and a beam of light above; roads glow more quietly.
	 * Each player fades in and out on their own, so the next plaque lights up as the last fades.
	 */
	private lightUp(dt: number, t: number) {
		const view = this.view;
		if (!view) return;
		const pulse = 0.5 + Math.sin(t * 4) * 0.5;
		// The ripple spreads from every building at once, every 1.4 seconds.
		const wave = (t / 1.4) % 1;
		view.players.forEach((pl, i) => {
			const was = this.lit[i] ?? 0;
			const level = i === this.highlighted ? Math.min(1, was + dt * 5) : Math.max(0, was - dt * 3);
			this.lit[i] = level;
			if (level || was) setGlow(glowKit(PLAYER_RGB[pl.color]), level, pulse, wave);
		});
		for (const p of this.pieces.values()) {
			const level = this.lit[p.owner] ?? 0;
			if (!level) {
				if (p.glow) {
					p.obj.remove(p.glow);
					for (const part of p.glow.userData.parts ?? []) part.removeFromParent();
				}
				p.glow = null;
				if (p.lift && !p.obj.userData.landing) p.obj.position.y = p.ground;
				p.lift = 0;
				continue;
			}
			p.glow ??= this.addGlow(p);
			if (p.key.startsWith('e')) continue;
			if (!p.obj.userData.landing) {
				p.lift += (level * (1.3 + Math.sin(t * 3) * 0.5) - p.lift) * Math.min(1, dt * 10);
				p.obj.position.y = p.ground + p.lift;
			}
			// The rings stay down on the ground as the building floats; the beam shoots up as it lights.
			const unit = pieceScale(p.key);
			const ground = p.glow.getObjectByName('ground')!;
			ground.position.y = -p.lift / unit;
			const ripple = ground.getObjectByName('ripple')!;
			ripple.scale.setScalar(ripple.userData.radius * (1 + wave));
			const beam = p.glow.getObjectByName('beam')!;
			beam.scale.y = (BEAM_HEIGHT / unit) * ease.outCubic(level);
		}
	}

	/** The lights for one piece while its player is highlighted (see `lightUp`). */
	private addGlow(p: PieceObj) {
		const kit = glowKit(PLAYER_RGB[this.view!.players[p.owner].color]);
		const road = p.key.startsWith('e');
		const workshop = p.key.startsWith('w');
		const unit = pieceScale(p.key);
		const glow = new THREE.Group();
		glow.name = 'glow';
		// The piece drawn again as light on top of itself, and a rim round its dark outline.
		const copy = (from: THREE.Object3D, into: THREE.Object3D) => {
			for (const c of from.children) {
				const m = c as THREE.Mesh;
				if (!m.isMesh) continue;
				const rim = m.name === 'outline';
				const lit = new THREE.Mesh(m.geometry, rim ? (road ? kit.rimRoad : kit.rim) : road ? kit.litRoad : kit.lit);
				lit.position.copy(m.position);
				lit.scale.copy(m.scale);
				into.add(lit);
			}
		};
		copy(p.obj, glow);
		if (workshop) {
			// A workshop's body is a model of its own, and its moving parts carry their own light,
			// so it turns with the sails and rolls with the cart.
			glow.userData.parts = [];
			for (const part of p.obj.children) {
				if (!part.name) {
					copy(part, glow);
					continue;
				}
				for (const model of [...part.children]) {
					const lit = new THREE.Group();
					lit.name = 'glow';
					copy(model, lit);
					lit.position.copy(model.position);
					lit.rotation.copy(model.rotation);
					lit.scale.copy(model.scale);
					part.add(lit);
					glow.userData.parts.push(lit);
				}
			}
		}
		if (!road) {
			// Sizes are in the piece's own units: its voxels. The ring hugs the building, on the
			// paths where the tiles meet, clear of the trees and wheat round about.
			const city = p.key.includes(':city:');
			const radius = (workshop ? 4.2 : city ? 5.9 : 4.8) / unit;
			const ground = new THREE.Group();
			ground.name = 'ground';
			const ring = new THREE.Mesh(HALO, kit.ring);
			ring.scale.setScalar(radius);
			const ripple = new THREE.Mesh(HALO, kit.ripple);
			ripple.name = 'ripple';
			ripple.userData.radius = radius;
			ring.position.y = ripple.position.y = 0.4 / unit;
			ground.add(ring, ripple);
			const beam = new THREE.Mesh(BEAM, kit.beam);
			beam.name = 'beam';
			beam.scale.set(2.6 / unit, 0, 2.6 / unit);
			beam.position.y = workshop ? 13 : city ? 12 : 7;
			glow.add(ground, beam);
		}
		p.obj.add(glow);
		return glow;
	}

	/** Workshops at work: sails and wheels turn, carts roll, and kilns smoke. */
	private workshops(dt: number, t: number) {
		this.kilnClock += dt;
		const puff = this.kilnClock > 0.28;
		if (puff) this.kilnClock = 0;
		for (const p of this.pieces.values()) {
			if (!p.key.startsWith('w')) continue;
			animateWorkshop(p.obj, t, dt);
			const at = puff ? workshopChimney(p.obj) : null;
			if (at) this.particles.emit({ at, count: 1, colors: ['#8d867e', '#a59e95', '#77706a'], speed: 0.5, up: 3.6, spread: 0.35, life: 3.4, size: 1.1, gravity: -0.45, drag: 0.4 });
		}
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
		this.workshops(dt, t);
		this.lightUp(dt, t);
		const bv = this.boardView;
		if (bv) {
			bv.update(dt, t, this.stage.rig.azimuth);
		}

		// hover feedback
		this.hoverPiece();
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
					marker.position.y = markerHeight(this.pick!.kind) + Math.sin(t * 3 + slot.userData.phase) * 0.7;
				}
			}
			if (ring) ring.scale.setScalar(1 + Math.sin(t * 3 + slot.userData.phase) * 0.12);
		}
		// The robber's target: the tile under this player's pointer, or the one another player aims at.
		const mine = this.pick?.kind === 'robber' ? id : null;
		if (mine !== this.myAim) {
			this.myAim = mine;
			this.callbacks.onAim?.(mine);
		}
		const aim = this.pick?.kind === 'robber' ? { hex: mine, color: this.pick.color } : this.theirAim;
		this.aim.set(bv, aim?.hex ?? null, PLAYER_RGB[aim?.color ?? ''] ?? 0xffffff);
		this.aim.update(dt, t, bv, this.stage.rig.azimuth);
		const pulse = 0.5 + Math.sin(t * 4) * 0.5;
		for (const m of ghostCache.values()) m.emissiveIntensity = 0.4 + pulse * 0.3;
		for (const m of markerCache.values()) m.emissiveIntensity = 0.9 + pulse * 0.9;
	}

	dispose() {
		this.stage.dispose();
	}
}

/** How high a pick's glowing gem floats above its spot, clear of the piece that would go there. */
function markerHeight(kind: PickKind) {
	return kind === 'city' ? 11 : kind === 'workshop' ? 9.5 : 4.5;
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

// ---------------------------------------------------------------- highlighted pieces

/** A flat square two units across, for the soft rings under highlighted buildings. */
const HALO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
/** An open tube one unit high, standing on its base, for the beams above them. */
const BEAM = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
/** How high the beams reach above the roofs, in world units. */
const BEAM_HEIGHT = 26;

let haloTexture: THREE.CanvasTexture | null = null;
/** A soft white ring on clear, tinted per player. */
function haloMap() {
	if (!haloTexture) {
		const s = 128;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = s;
		const ctx = canvas.getContext('2d')!;
		const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
		grad.addColorStop(0.62, 'rgba(255,255,255,0)');
		grad.addColorStop(0.76, 'rgba(255,255,255,1)');
		grad.addColorStop(0.88, 'rgba(255,255,255,1)');
		grad.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, s, s);
		haloTexture = new THREE.CanvasTexture(canvas);
	}
	return haloTexture;
}

/** The materials that light up one player's pieces. All their pieces share them. */
interface GlowKit {
	/** The piece's own colors again, added as light. */
	lit: THREE.MeshBasicMaterial;
	litRoad: THREE.MeshBasicMaterial;
	/** A bright band just outside the dark outline. */
	rim: THREE.ShaderMaterial;
	rimRoad: THREE.ShaderMaterial;
	ring: THREE.MeshBasicMaterial;
	ripple: THREE.MeshBasicMaterial;
	beam: THREE.ShaderMaterial;
}

const glowKits = new Map<number, GlowKit>();
function glowKit(color: number): GlowKit {
	let kit = glowKits.get(color);
	if (!kit) {
		const base = new THREE.Color(color);
		const white = new THREE.Color('#ffffff');
		// Rims and rings are pale, so they show on a tile of the same color; the beam is bright.
		const pale = base.clone().lerp(white, 0.45).multiplyScalar(1.5);
		const bright = base.clone().lerp(white, 0.15).multiplyScalar(1.6);
		const core = base.clone().lerp(white, 0.5).multiplyScalar(2.4);
		// Dark colors get more light, so every player's pieces brighten about as much.
		const boost = THREE.MathUtils.clamp(0.8 / (0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b), 1.2, 4);
		const lit = (gain: number) =>
			new THREE.MeshBasicMaterial({ color: white.clone().multiplyScalar(gain), vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
		const ring = () =>
			new THREE.MeshBasicMaterial({ map: haloMap(), color: pale, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
		kit = {
			lit: lit(boost),
			litRoad: lit(boost * 0.7),
			rim: rimMaterial(pale, 4.5),
			rimRoad: rimMaterial(pale, 2.5),
			ring: ring(),
			ripple: ring(),
			beam: beamMaterial(bright, core)
		};
		glowKits.set(color, kit);
	}
	return kit;
}

/** Fade a player's lights to `level` (0 to 1), pulsing, with the ripple `wave` of the way out. */
function setGlow(kit: GlowKit, level: number, pulse: number, wave: number) {
	kit.lit.opacity = level * (0.5 + pulse * 0.5);
	kit.litRoad.opacity = level * (0.25 + pulse * 0.25);
	kit.rim.uniforms.uOpacity.value = level * (0.7 + pulse * 0.3);
	kit.rimRoad.uniforms.uOpacity.value = level * (0.35 + pulse * 0.2);
	kit.ring.opacity = level * (0.7 + pulse * 0.3);
	kit.ripple.opacity = level * (1 - wave) * (1 - wave);
	kit.beam.uniforms.uOpacity.value = level * (0.7 + pulse * 0.3);
}

/**
 * Like the dark outline (see `addOutline`), the model's hull drawn as back faces pushed out a
 * fixed number of pixels, here wider and in a bright color. It sits a little farther from the
 * eye than the outline, so the dark line stays on top and the color shows just outside it.
 */
function rimMaterial(color: THREE.Color, width: number) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uViewport: sharedUniforms.uViewport,
			uWidth: { value: width },
			uColor: { value: color },
			uOpacity: { value: 0 }
		},
		vertexShader: /* glsl */ `
			uniform vec2 uViewport;
			uniform float uWidth;
			void main() {
				vec4 view = modelViewMatrix * vec4(position, 1.0);
				view.xyz += normalize(view.xyz) * 0.6;
				vec4 clip = projectionMatrix * view;
				vec2 dir = (normalMatrix * normal).xy;
				float len = length(dir);
				if (len > 1e-4) clip.xy += dir / len * (2.0 * uWidth / uViewport) * clip.w;
				gl_Position = clip;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uOpacity;
			void main() {
				gl_FragColor = vec4(uColor, uOpacity);
			}`,
		side: THREE.BackSide,
		transparent: true,
		depthWrite: false
	});
}

/**
 * Light rising from a roof: a soft glow in the player's color round a bright core, so it reads
 * over the pale tiles as well as the dark table. It gathers just above the roof, so the house
 * stays clear under it, and fades out upward.
 */
function beamMaterial(color: THREE.Color, core: THREE.Color) {
	return new THREE.ShaderMaterial({
		uniforms: { uColor: { value: color }, uCore: { value: core }, uOpacity: { value: 0 } },
		vertexShader: /* glsl */ `
			varying float vUp;
			varying vec3 vWorld;
			varying vec2 vSide;
			void main() {
				vUp = uv.y;
				vec4 world = modelMatrix * vec4(position, 1.0);
				vWorld = world.xyz;
				vSide = (mat3(modelMatrix) * normal).xz;
				gl_Position = projectionMatrix * viewMatrix * world;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform vec3 uCore;
			uniform float uOpacity;
			varying float vUp;
			varying vec3 vWorld;
			varying vec2 vSide;
			void main() {
				// No normalize of a vector that can be zero and no pow of a base that can dip below
				// zero: some graphics cards make NaN of those, and the bloom spreads one NaN pixel
				// over the whole screen.
				// 1 down the middle of the tube as the camera sees it, 0 at its edges.
				vec2 toCamera = cameraPosition.xz - vWorld.xz;
				float across = min(1.0, abs(dot(vSide, toCamera)) / max(length(vSide) * length(toCamera), 1e-4));
				float top = clamp(1.0 - vUp, 0.0, 1.0);
				float along = smoothstep(0.0, 0.16, vUp) * top * sqrt(top);
				float a2 = across * across;
				float a8 = a2 * a2 * a2 * a2;
				vec3 light = uColor * a2 + uCore * a8 * a8 * a8;
				gl_FragColor = vec4(light, along * uOpacity);
			}`,
		side: THREE.DoubleSide,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending
	});
}

function hashString(s: string) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

export { getTopology };
