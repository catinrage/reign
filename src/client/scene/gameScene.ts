import * as THREE from 'three';
import { generateBoard, generateStandardBoard } from '../../shared/board/generate';
import type { MapTile } from '../../shared/board/maps';
import { type Board, getTopology } from '../../shared/board/topology';
import { worldToHex, hexKey } from '../../shared/board/hex';
import { RESOURCES, TERRAIN_RESOURCE } from '../../shared/rules/config';
import { isCityPath } from '../../shared/rules/buildings';
import type { EventCard } from '../../shared/rules/events';
import { builtKey } from '../../shared/rules/queries';
import type { GameEvent, GameView } from '../../shared/rules/types';
import { Animator, ease } from './anim';
import { BoardView } from './board/boardView';
import { RobberAim } from './board/robberAim';
import { islandReach } from './board/terrain';
import { bracketModel, cityModel, cloneModel, resourceItemModel, roadModel, settlementModel, stoneRoadModel } from './board/models';
import { PATH_LOOK, animatePath, pathObject } from './board/cityPaths';
import { type AnnexHost, type Footprint, annexSpot, annexYard } from './board/annex';
import { STOREHOUSE_SIZE, animateStorehouse, storehouseObject } from './board/storehouse';
import { TAVERN_CHIMNEY, TAVERN_SIZE, animateTavern, tavernObject } from './board/tavern';
import { WORKSHOP_SCALE, animateWorkshop, workshopChimney, workshopObject } from './board/workshops';
import { DIE_HALF, Dice } from './dice';
import { Particles } from './effects';
import { HEX_R, PLAYER_RGB } from './layout';
import { type Room, buildRoom } from './room/room';
import { TABLE_HALF } from './room/table';
import { ROOM_SCALE } from './room/util';
import { type Quality, Stage } from './stage';
import { FRAG_OUTPUT, sharedUniforms } from './voxel/materials';

/**
 * `stoneRoad` picks one of your roads to pave, `storehouse` and `tavern` one of your buildings to
 * add one onto, `castle`, `guildHall` and `fortress` one of your cities to take down that path,
 * `tearDown` one of your own workshops to tear down, `tile` any tile, lit up like the robber's
 * target but with no robber (a character's power).
 */
export type PickKind =
	| 'settlement'
	| 'road'
	| 'city'
	| 'robber'
	| 'workshop'
	| 'stoneRoad'
	| 'storehouse'
	| 'tavern'
	| 'castle'
	| 'guildHall'
	| 'fortress'
	| 'tearDown'
	| 'tile';

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

/**
 * A piece's key starts with where it stands: v12 (vertex), e5 (edge), w3 (a tile's workshop), s12
 * and t12 (the storehouse and the tavern on the building on vertex 12, which share its tooltip).
 */
const SPOT_PLACE: Record<string, BoardSpot['place']> = { v: 'vertex', e: 'edge', w: 'hex', s: 'vertex', t: 'vertex' };
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
	/** Where the island's tiles are, without what they hold: a power can change a tile, not the island. */
	private boardShape = '';
	/** Markers of character powers on the board: the Baron's claimed corners, the Abbess's blessed tiles. */
	private powerMarks = new THREE.Group();
	private powerMarksKey = '';
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
	/** Settles when the robber's latest hop to a new tile lands. */
	private robberHop: Promise<void> = Promise.resolve();
	/** The Reign Extended event card in play this round, shown on the island while it lasts. */
	private eventLook: EventCard | null = null;
	/** A Comet is waiting for the next roll. */
	private cometLook = false;
	private lookClock = 0;
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
		// Number tokens can trade places mid-game (a Reign Extended earthquake, the Cartographer's
		// power) without the island being dealt again, so they're left out of what keys it.
		const land = JSON.stringify({ ...view.board, hexes: view.board.hexes.map((h) => ({ ...h, number: null })) });
		const key = plots ? `${land}+plots` : land;
		const shape = `${JSON.stringify(view.board.hexes.map((h) => [h.q, h.r]))}${plots}`;
		const changed = key !== this.boardKey;
		// A character's power changed a tile's terrain: the same island in the same game, rebuilt
		// in place, with the game's events playing on.
		const retiled = changed && this.mode === 'game' && !!this.view && shape === this.boardShape;
		const first = changed && !retiled;
		if (changed) {
			this.boardKey = key;
			this.boardShape = shape;
			this.setBoard(view.board, hashString(shape), plots);
			this.clearPieces();
			this.powerMarksKey = '';
			this.boardView!.setRobber(view.robberHex, true);
		}
		if (first) {
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
		if (!changed) this.syncNumbers(view);
		this.syncPieces(view, !changed);
		this.syncMarks(view);
		this.syncPowerMarks(view);
		if (!first && prev && prev.robberHex !== view.robberHex)
			this.robberHop = this.moveRobber(view.robberHex);
		const fresh = view.log.filter((e) => e.seq > this.lastSeq);
		if (fresh.length) this.lastSeq = fresh[fresh.length - 1].seq;
		if (!first) for (const e of fresh) this.playEvent(e);
	}

	/**
	 * Number tokens that changed tiles: after an earthquake the two tokens leap across the island
	 * to their new tiles while the ground shakes.
	 */
	private syncNumbers(view: GameView) {
		const bv = this.boardView!;
		const changed = view.board.hexes.flatMap((h, i) => (h.number !== bv.board.hexes[i]?.number ? [i] : []));
		if (!changed.length) return;
		const [a, b] = changed;
		const swapped = changed.length === 2 && view.board.hexes[a].number === bv.board.hexes[b].number;
		if (!swapped) {
			// Anything else can't be shown as a move: deal the island again as it now is.
			this.boardKey = '';
			return this.setView(view);
		}
		for (const { tok, to } of bv.swapTokens(view.board, a, b)) {
			const from = tok.position.clone();
			this.particles.dust(from.clone(), 22);
			this.anim.tween(1.1, (t) => {
				tok.position.lerpVectors(from, to, t);
				tok.position.y += Math.sin(t * Math.PI) * 30;
				tok.rotation.y = t * Math.PI * 2;
			}, ease.inOutCubic).then(() => {
				this.particles.dust(to.clone(), 22);
				// Lit up for a while, so everyone can find where the numbers went.
				tok.userData.highlight = true;
				this.anim.wait(3.5).then(() => (tok.userData.highlight = false));
			});
		}
		// The island shakes hard, dust bursting off the tiles, then settles.
		const g = bv.group;
		this.anim.tween(2, (t) => {
			const k = (1 - t) * 1.6;
			g.position.set(Math.sin(t * 110) * k, Math.abs(Math.sin(t * 37)) * k * 0.4, Math.cos(t * 83) * k);
		}, ease.linear).then(() => g.position.set(0, 0, 0));
		this.tilesOf().forEach((h, k) => {
			if (k % 2) this.anim.wait(Math.random() * 1.2).then(() => this.particles.dust(this.overTile(h, 0), 10));
		});
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
		this.syncYards();
	}

	/** Tread the crops flat in front of each storehouse and tavern, so a field's wheat doesn't bury it. */
	private syncYards() {
		const yards = sharedUniforms.uYards.value;
		let i = 0;
		for (const p of this.pieces.values()) {
			const annex = annexOf(p.key);
			if (!annex || i >= yards.length) continue;
			annexYard(p.obj.position.clone().setY(p.ground), p.obj.rotation.y, PIECE_SCALE, ANNEX_SIZE[annex], yards[i++]);
		}
		for (; i < yards.length; i++) yards[i].set(0, 0, 0, 0);
	}

	private syncPieces(view: GameView, animate: boolean) {
		const bv = this.boardView!;
		const want = new Map<string, () => THREE.Object3D>();
		view.buildings.forEach((b, v) => {
			if (!b) return;
			const color = PLAYER_RGB[view.players[b.owner].color];
			// A city that took a path becomes a castle, a guild hall (showing its goods) or a fortress.
			const path = b.kind === 'city' ? (view.cityPaths?.[v] ?? null) : null;
			const goods = path === 'guildHall' ? (view.guildGoods?.[v] ?? null) : null;
			want.set(`v${v}:${path ?? b.kind}${goods ? `-${goods}` : ''}:${b.owner}`, () => {
				const obj = path ? pathObject(path, color, goods) : cloneModel(b.kind === 'city' ? cityModel(color) : settlementModel(color));
				obj.userData.path = path;
				obj.scale.setScalar(PIECE_SCALE);
				obj.position.copy(bv.vertexPos(v));
				obj.rotation.y = buildingYaw(v);
				return obj;
			});
		});
		// A storehouse or a tavern leans on its building, so it moves to a new wall when the
		// settlement grows into a city, and again when the city takes a path. One that went up after
		// the other keeps clear of its wall.
		view.buildings.forEach((b, v) => {
			if (!b) return;
			const color = PLAYER_RGB[view.players[b.owner].color];
			const order = annexOrder(view, v);
			for (const annex of order) {
				const after = annex === order[0] ? '' : `+${order[0][0]}`;
				want.set(`${annex[0]}${v}:${hostOf(view, v)}${after}:${b.owner}`, () => {
					const obj = annex === 'storehouse' ? storehouseObject(color) : tavernObject(color);
					obj.scale.setScalar(PIECE_SCALE);
					const spot = annexPlace(bv, view, v, annex, order);
					obj.position.copy(spot.pos);
					obj.rotation.y = spot.yaw;
					return obj;
				});
			}
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
			// Paving swaps the road for a stone one, which drops into its place.
			const stone = !!view.stoneRoads?.[e];
			want.set(`e${e}:${stone ? 'stone:' : ''}${owner}`, () => {
				const obj = cloneModel(stone ? stoneRoadModel(color, ROAD_LEN) : roadModel(color, ROAD_LEN));
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
			if (animate && key.startsWith('w')) this.tearDown(p.obj);
			else if (animate) {
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
		this.syncYards();
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
		this.eventLook = view.events?.current ?? null;
		this.cometLook = !!view.events?.comet;
		bv.setHarborMood(this.eventLook === 'stormAtSea' ? 'closed' : this.eventLook === 'travelingFair' ? 'busy' : null);
		bv.setPortOwners(
			bv.build.ports.map((p) => {
				const e = topo.edges[p.edge];
				const b = view.buildings[e.a] ?? view.buildings[e.b];
				return b ? PLAYER_RGB[view.players[b.owner].color] : null;
			})
		);
	}

	/** The Baron's flags on the corners he claimed, and a golden halo over each blessed tile. */
	private syncPowerMarks(view: GameView) {
		const bv = this.boardView!;
		const claims = Object.entries(view.claims ?? {}).filter(([v]) => !view.buildings[Number(v)]);
		const blessed = Object.entries(view.blessed ?? {});
		const key = JSON.stringify([claims, blessed]);
		if (key === this.powerMarksKey) return;
		this.powerMarksKey = key;
		this.powerMarks.clear();
		if (!this.powerMarks.parent) this.stage.scene.add(this.powerMarks);
		for (const [v, owner] of claims) {
			const flag = claimFlag(PLAYER_RGB[view.players[owner]?.color] ?? 0xffffff);
			flag.position.copy(bv.vertexPos(Number(v)));
			this.powerMarks.add(flag);
		}
		for (const [h, times] of blessed) {
			const c = bv.hexCenter(Number(h));
			const halo = new THREE.Group();
			halo.position.set(c.x, bv.groundAt(c.x, c.z, 0) + 5, c.z);
			for (let i = 0; i < times; i++) {
				const ring = new THREE.Mesh(BLESS_HALO, HALO_MAT);
				ring.rotation.x = -Math.PI / 2;
				ring.position.y = i * 1.6;
				halo.add(ring);
			}
			halo.userData.spin = 0.8;
			this.powerMarks.add(halo);
		}
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
			case 'tornDown': {
				// What the bank gives back rises from the rubble as the workshop slumps.
				const at = bv.plotSpot(e.hex)?.pos;
				this.anim.wait(0.5).then(() => {
					for (const [res, n] of Object.entries(e.refund)) if (n) this.popResource(e.hex, res, e.player, n, at);
				});
				break;
			}
			case 'powerUsed': {
				// A power that touched the island sparkles where it did.
				const color = PLAYER_RGB[this.view.players[e.player].color];
				for (const h of [e.hex, e.hex2]) {
					if (h === undefined || !bv.board.hexes[h]) continue;
					const c = bv.hexCenter(h);
					this.particles.sparkle(c.setY(bv.groundAt(c.x, c.z, 0) + 3), e.character === 'abbess' ? 0xffd75e : color, 30);
				}
				if (e.vertex !== undefined) this.particles.sparkle(bv.vertexPos(e.vertex).add(new THREE.Vector3(0, 4, 0)), color, 24);
				break;
			}
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

	// ------------------------------------------------------------ Reign Extended events

	/** The tiles of one terrain, or every tile that produces. */
	private tilesOf(terrain?: string): number[] {
		const hexes = this.boardView?.board.hexes ?? [];
		return hexes.flatMap((h, i) => ((terrain ? h.terrain === terrain : h.terrain !== 'desert') ? [i] : []));
	}

	/** Above the middle of tile `h`, `up` units over its number token. */
	private overTile(h: number, up = 3) {
		const bv = this.boardView!;
		const c = bv.hexCenter(h);
		return new THREE.Vector3(c.x, bv.build.tokenY[h] + up, c.z);
	}

	/** Light up tiles: their tokens lift and bob for a while, with a burst of sparkles. */
	private lightTiles(hexes: number[], colors: string[], seconds = 2.8) {
		const bv = this.boardView!;
		hexes.forEach((h, k) => {
			this.anim.wait(k * 0.08).then(() => {
				const tok = bv.tokens[h];
				if (tok) tok.userData.highlight = true;
				this.particles.emit({ at: this.overTile(h, 2), count: 22, colors, speed: 7, up: 15, spread: 7, life: 1.3, size: 0.7, gravity: 9, drag: 1.4 });
				this.anim.wait(seconds).then(() => tok && (tok.userData.highlight = false));
			});
		});
	}

	/**
	 * An event card was put down: what it does plays out on the island, so nobody at the table
	 * misses it. (Tokens that trade places in an earthquake and the robber's jump in a bandit
	 * uprising come with the new state; the cards an event moves fly in the interface.)
	 */
	presentEvent(card: EventCard) {
		const bv = this.boardView;
		if (!bv || this.mode !== 'game') return;
		const harbors = Array.from({ length: bv.harborCount }, (_, i) => bv.harborSpot(i)).filter((p) => !!p);
		switch (card) {
			case 'harvestFestival':
				this.lightTiles(this.tilesOf('fields'), ['#ffd75e', '#f2c14e', '#fff3b0']);
				break;
			case 'migratingHerds':
				this.lightTiles(this.tilesOf('pasture'), ['#ffffff', '#c9f08a', '#9ed05a']);
				for (const sh of bv.sheepSpots()) this.particles.dust(sh, 8);
				break;
			case 'travelingFair':
				for (const at of harbors) this.particles.emit({ at: at.clone().setY(at.y + 2), count: 30, colors: ['#ffd75e', '#e04b35', '#5fb43b', '#6fd3ff', '#ffffff'], speed: 9, up: 20, spread: 3, life: 1.6, size: 0.8, gravity: 14, drag: 1.2 });
				break;
			case 'stormAtSea':
				// Dark rain sweeps over every harbor for a couple of seconds.
				for (let k = 0; k < 8; k++) {
					this.anim.wait(k * 0.25).then(() => {
						for (const at of harbors) this.rain(at, 14);
					});
				}
				break;
			case 'comet': {
				// A comet streaks across the sky and bursts over the island; every tile glitters.
				const from = new THREE.Vector3(-this.reach * 1.6, 70, -this.reach * 1.2);
				const to = new THREE.Vector3(0, 8, 0);
				const head = new THREE.Vector3();
				this.anim.tween(1.3, (t) => {
					head.lerpVectors(from, to, t);
					this.particles.emit({ at: head, count: 6, colors: ['#ffffff', '#bfe8ff', '#ffe39a'], speed: 2, up: 1, spread: 1.5, life: 0.8, size: 1.3, gravity: 0, drag: 2 });
				}, (t) => t * t).then(() => {
					this.particles.confetti(to.clone().setY(14), ['#ffffff', '#bfe8ff', '#ffe39a', '#8fd0ff'], 160);
					this.lightTiles(this.tilesOf(), ['#ffffff', '#bfe8ff', '#ffe39a'], 2);
				});
				break;
			}
			case 'banditUprising': {
				// A cloud of dark smoke and splinters over the tile the bandits raided.
				const h = bv.robberHex;
				if (h < 0) break;
				this.anim.wait(0.6).then(() => {
					this.particles.emit({ at: this.overTile(h, 1), count: 50, colors: ['#2a2a30', '#45454f', '#6b2a22', '#8a3a2a'], speed: 10, up: 14, spread: 6, life: 1.4, size: 1.1, gravity: 8, drag: 1.6 });
					this.particles.dust(this.overTile(h, 0), 30);
				});
				break;
			}
			case 'bountifulYear':
				for (const r of RESOURCES) this.particles.sparkle(this.pileTop(r), '#ffe39a', 18);
				break;
			default:
				break;
		}
	}

	/** Dark raindrops falling over a point. */
	private rain(at: THREE.Vector3, count: number) {
		this.particles.emit({ at: at.clone().setY(at.y + 16), count, colors: ['#5c6f86', '#7f93ab', '#3f4c5e'], speed: 1.2, up: -6, spread: 9, life: 1, size: 0.45, gravity: 40, drag: 0.2 });
	}

	/** While an event card lasts, the island keeps showing it: glitter on its tiles, rain on closed harbors. */
	private eventAmbience(dt: number) {
		const bv = this.boardView;
		if (!bv || this.mode !== 'game' || (!this.eventLook && !this.cometLook)) return;
		this.lookClock -= dt;
		if (this.lookClock > 0) return;
		this.lookClock = 0.45;
		const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
		const glitter = (hexes: number[], colors: string[]) => {
			const h = pick(hexes);
			if (h !== undefined) this.particles.emit({ at: this.overTile(h, 1.5), count: 4, colors, speed: 3, up: 9, spread: 7, life: 1.2, size: 0.5, gravity: 4, drag: 1.5 });
		};
		if (this.cometLook) glitter(this.tilesOf(), ['#ffffff', '#bfe8ff']);
		switch (this.eventLook) {
			case 'harvestFestival':
				glitter(this.tilesOf('fields'), ['#ffd75e', '#fff3b0']);
				break;
			case 'migratingHerds':
				glitter(this.tilesOf('pasture'), ['#ffffff', '#c9f08a']);
				break;
			case 'stormAtSea':
				for (let i = 0; i < bv.harborCount; i++) {
					const at = bv.harborSpot(i);
					if (at) this.rain(at, 3);
				}
				break;
			case 'travelingFair': {
				const at = bv.harborSpot(Math.floor(Math.random() * bv.harborCount));
				if (at) this.particles.emit({ at: at.setY(at.y + 2), count: 3, colors: ['#ffd75e', '#e04b35', '#6fd3ff'], speed: 3, up: 9, spread: 2, life: 1, size: 0.5, gravity: 8, drag: 1.2 });
				break;
			}
		}
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

	/** A workshop torn down: it shudders, then slumps into the ground in a cloud of dust and splinters. */
	private tearDown(obj: THREE.Object3D) {
		const base = obj.position.clone();
		const s = obj.scale.x;
		const yaw = obj.rotation.y;
		const shudder = 0.35;
		this.anim.tween(shudder, (t) => {
			obj.rotation.set(Math.sin(t * 60) * 0.05, yaw, Math.cos(t * 47) * 0.05);
		}, ease.linear).then(() => {
			const at = base.clone().setY(base.y + 1);
			this.particles.emit({ at, count: 40, colors: ['#c9b89b', '#b3a07f', '#ddd0b6', '#9c8a6e'], speed: 7, up: 2.2, spread: 4, life: 1.5, size: 1.5, gravity: 1.2, drag: 2.4 });
			this.particles.emit({ at: at.clone().setY(base.y + 4), count: 18, colors: ['#6b4a2f', '#8a6239', '#7d7770', '#a39c92'], speed: 5, up: 9, spread: 2.5, life: 1.1, size: 0.55, gravity: 26, drag: 0.6 });
			return this.anim.tween(0.7, (t) => {
				const k = t * t * t;
				obj.position.set(base.x, base.y - k * 9 * s, base.z);
				obj.rotation.set(Math.sin(t * 34) * 0.06 * (1 - t), yaw, k * 0.18);
				obj.scale.set(s * (1 + k * 0.12), s * (1 - k * 0.5), s * (1 + k * 0.12));
			}, ease.linear);
		}).then(() => this.stage.scene.remove(obj));
	}

	/** The workshop standing on a tile, if there is one. */
	private workshopPiece(hex: number): THREE.Object3D | null {
		for (const p of this.pieces.values()) if (p.key.startsWith(`w${hex}:`)) return p.obj;
		return null;
	}

	/** The settlement or city on a corner. */
	private vertexPiece(v: number): THREE.Object3D | null {
		for (const p of this.pieces.values()) if (p.key.startsWith(`v${v}:`)) return p.obj;
		return null;
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
	 * Where on screen the cards paid to the bank land (in a trade, for a build or a development
	 * card, or thrown back on a 7): on the bank's pile of `resource`, or on the harbor whose rate a
	 * trade got. When that is out of sight, off screen or under one of the interface's panels, they
	 * fly off the edge of the screen toward it rather than onto a panel (a player's plaque, say).
	 */
	tradeTarget(resource: string, harbor: number) {
		const at = this.onScreen(this.tradeSpot(resource, harbor), -60);
		return this.underHud(at) ? this.pastEdge(at) : at;
	}

	/** Settles once the robber is on its tile: at once, or as its hop to a new one lands. */
	robberLanded(): Promise<void> {
		return this.robberHop;
	}

	/** A card paid to the bank reached the pile or the harbor. */
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
	 * Where `p` is on screen, kept `margin` px clear of the edges so a card flying from it starts in
	 * sight: when `p` is out of view, the nearest point toward it. A negative margin lets a card
	 * flying to `p` leave the screen on its side instead.
	 */
	private onScreen(p: THREE.Vector3, margin = 40) {
		const v = p.clone().project(this.stage.camera);
		// Behind the camera the projection comes out mirrored: turn it round and push it off screen.
		if (v.z > 1) v.multiplyScalar(-1e3);
		const { clientWidth: w, clientHeight: h } = this.stage.canvas;
		return {
			x: THREE.MathUtils.clamp(((v.x + 1) / 2) * w, margin, w - margin),
			y: THREE.MathUtils.clamp(((1 - v.y) / 2) * h, margin, h - margin)
		};
	}

	/** Just past the edge of the screen, on the line from its middle through `p`. */
	private pastEdge(p: { x: number; y: number }) {
		const { clientWidth: w, clientHeight: h } = this.stage.canvas;
		const dx = p.x - w / 2;
		const dy = p.y - h / 2;
		const k = Math.min((w / 2 + 60) / Math.abs(dx), (h / 2 + 60) / Math.abs(dy));
		return Number.isFinite(k) ? { x: w / 2 + dx * k, y: h / 2 + dy * k } : p;
	}

	/** Whether a point on screen is under one of the interface's panels. */
	private underHud(p: { x: number; y: number }) {
		const r = this.stage.canvas.getBoundingClientRect();
		for (const node of document.querySelectorAll('.hud > *, .hud > * > *')) {
			if (node.classList.contains('flyer')) continue;
			const b = node.getBoundingClientRect();
			// Leave out what has no size, and overlays as big as the screen.
			if (!b.width || !b.height || b.width * b.height > r.width * r.height * 0.5) continue;
			if (p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom) return true;
		}
		return false;
	}

	// ------------------------------------------------------------ picking

	setPick(req: PickRequest | null) {
		if (this.pick?.kind === 'tearDown') for (const p of this.pieces.values()) if (p.key.startsWith('w')) p.obj.rotation.z = 0;
		if (isCityPath(this.pick?.kind)) for (const p of this.pieces.values()) if (p.key.startsWith('v')) p.obj.visible = true;
		this.pick = req;
		this.ghosts.clear();
		this.ghostHits = [];
		this.hovered = null;
		if (!req || !this.boardView) return;
		const bv = this.boardView;
		const color = PLAYER_RGB[req.color] ?? 0xffffff;
		// Tearing down is marked in red, whoever's workshop it is.
		const tint = req.kind === 'tearDown' ? TEAR_DOWN_RGB : color;
		const mat = ghostMaterial(tint);
		const markerMat = markerMaterial(tint);
		for (const id of req.options) {
			let model: THREE.Object3D | null = null;
			let pos = new THREE.Vector3();
			let rot = 0;
			let lean: { pos: THREE.Vector3; yaw: number } | null = null;
			if (req.kind === 'settlement') {
				model = settlementModel(color);
				pos = bv.vertexPos(id);
			} else if (req.kind === 'city') {
				model = cityModel(color);
				pos = bv.vertexPos(id);
			} else if (req.kind === 'road' || req.kind === 'stoneRoad') {
				model = req.kind === 'road' ? roadModel(color, ROAD_LEN) : stoneRoadModel(color, ROAD_LEN);
				const ep = bv.edgePos(id);
				pos = ep.pos;
				rot = ep.angle;
			} else if (req.kind === 'workshop' || req.kind === 'tearDown') {
				const res = TERRAIN_RESOURCE[bv.board.hexes[id].terrain];
				const spot = bv.plotSpot(id);
				if (!res || !spot) continue;
				model = workshopObject(res, color);
				pos = spot.pos;
				rot = Math.PI / 2 - spot.angle;
			} else if (req.kind === 'storehouse' || req.kind === 'tavern') {
				const view = this.view;
				if (!view?.buildings[id]) continue;
				model = req.kind === 'storehouse' ? storehouseObject(color) : tavernObject(color);
				pos = bv.vertexPos(id);
				// The marker goes over the building; the ghost stands against the wall it would lean on.
				lean = annexPlace(bv, view, id, req.kind, annexOrder(view, id, req.kind));
			} else if (isCityPath(req.kind)) {
				// The city as it would be, turned the way it stands.
				model = pathObject(req.kind, color);
				pos = bv.vertexPos(id);
				rot = buildingYaw(id);
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
				m.castShadow = false;
				// Paving keeps the stone's own colors: a see-through tint over a road of the same
				// color would not show at all.
				if (req.kind === 'stoneRoad') return;
				// The ghost is see-through, so its outline would show inside it.
				if (m.name === 'outline') m.visible = false;
				m.material = mat;
			});
			const edge = req.kind === 'road' || req.kind === 'stoneRoad';
			const shop = req.kind === 'workshop' || req.kind === 'tearDown';
			ghost.scale.setScalar(edge ? 0.7 : shop ? WORKSHOP_SCALE : PIECE_SCALE);
			ghost.userData.base = ghost.scale.x;
			ghost.name = 'ghost';
			ghost.visible = false;
			if (lean) {
				ghost.position.set(lean.pos.x - pos.x, 0, lean.pos.z - pos.z);
				ghost.rotation.y = lean.yaw;
			}
			slot.add(ghost);
			if (edge) {
				const bar = new THREE.Mesh(MARKER_BAR, markerMat);
				// Over the road that is already there, when paving.
				bar.position.y = req.kind === 'road' ? 1.2 : 2.4;
				bar.name = 'marker';
				slot.add(bar);
			} else if (req.kind === 'settlement') {
				// Four corner brackets on the ground round the spot, open in the middle.
				slot.add(cornerBrackets(color, bracketLift(pos, (x, z) => bv.groundAt(x, z, 0))));
			} else {
				const gem = new THREE.Mesh(MARKER_GEM, markerMat);
				gem.position.y = markerHeight(req.kind);
				gem.name = 'marker';
				slot.add(gem);
				const ring = new THREE.Mesh(MARKER_RING, ringMaterial(tint));
				ring.rotation.x = -Math.PI / 2;
				ring.position.y = 0.3;
				ring.name = 'ring';
				slot.add(ring);
			}
			this.ghosts.add(slot);
			const hit = new THREE.Mesh(
				edge ? new THREE.BoxGeometry(9, 6, 4) : new THREE.SphereGeometry(5, 8, 6),
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
		if (this.pick.kind === 'robber' || this.pick.kind === 'tile') {
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
		if (this.pick.kind === 'robber' || this.pick.kind === 'tile') {
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

	/** Little puffs from the chimneys of settlements, cities and taverns. */
	private smoke(dt: number) {
		this.smokeClock += dt;
		if (this.smokeClock < 0.35) return;
		this.smokeClock = 0;
		const homes = [...this.pieces.values()].filter((p) => p.key.startsWith('v') || p.key.startsWith('t'));
		if (!homes.length) return;
		const p = homes[Math.floor(Math.random() * homes.length)];
		const look = lookOf(p.key);
		const local = p.key.startsWith('t')
			? TAVERN_CHIMNEY
			: isCityPath(look)
				? PATH_LOOK[look].chimney
				: look === 'city'
					? new THREE.Vector3(-2.5, 12, -3)
					: new THREE.Vector3(1.5, 7.5, -1);
		if (!local) return;
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
			// A storehouse or a tavern floats with its building, under the building's ring and beam.
			if (annexOf(p.key)) continue;
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
		const annex = !!annexOf(p.key);
		const look = lookOf(p.key);
		const path = isCityPath(look) ? look : null;
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
		if (workshop || annex || path) {
			// A workshop's body is a model of its own, and its moving parts carry their own light,
			// so it turns with the sails and rolls with the cart (and a storehouse's sack rides its
			// rope, a tavern's sign swings, a castle's flag flies and a fortress's quintain spins).
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
		if (!road && !annex) {
			// Sizes are in the piece's own units: its voxels. The ring hugs the building, on the
			// paths where the tiles meet, clear of the trees and wheat round about.
			const city = look === 'city';
			const radius = path ? PATH_LOOK[path].ring : (workshop ? 4.2 : city ? 5.9 : 4.8) / unit;
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
			beam.position.y = workshop ? 13 : path ? PATH_LOOK[path].beam : city ? 12 : 7;
			glow.add(ground, beam);
		}
		p.obj.add(glow);
		return glow;
	}

	/**
	 * Workshops at work: sails and wheels turn, carts roll, and kilns smoke; storehouses hoist
	 * sacks, and taverns' signs swing.
	 */
	private workshops(dt: number, t: number) {
		this.kilnClock += dt;
		const puff = this.kilnClock > 0.28;
		if (puff) this.kilnClock = 0;
		for (const p of this.pieces.values()) {
			if (p.key.startsWith('s')) animateStorehouse(p.obj, t);
			if (p.key.startsWith('t')) animateTavern(p.obj, t);
			if (p.obj.userData.path) animatePath(p.obj, t);
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
		this.eventAmbience(dt);
		this.workshops(dt, t);
		for (const m of this.powerMarks.children) if (m.userData.spin) m.rotation.y += dt * m.userData.spin;
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
			const brackets = slot.getObjectByName('brackets');
			ghost.visible = hovered;
			if (brackets) aimBrackets(brackets, hovered, this.stage.rig.azimuth, t + slot.userData.phase, dt);
			if (this.pick?.kind === 'tearDown') {
				// The workshop itself trembles inside a red shell.
				ghost.scale.setScalar(ghost.userData.base * 1.06);
				const shop = this.workshopPiece(slot.userData.id);
				if (shop) shop.rotation.z = hovered ? Math.sin(t * 40) * 0.03 : 0;
			} else if (hovered) {
				const s = THREE.MathUtils.lerp(ghost.scale.x, ghost.userData.base * 1.12, 0.3);
				ghost.scale.setScalar(s);
				ghost.position.y = 1.5 + Math.sin(t * 5) * 0.4;
			} else ghost.scale.setScalar(ghost.userData.base * 0.6);
			// A city about to take a path makes way for its ghost, which would be lost inside it.
			if (isCityPath(this.pick?.kind)) {
				const city = this.vertexPiece(slot.userData.id);
				if (city) city.visible = !hovered;
			}
			if (marker) {
				const edge = this.pick?.kind === 'road' || this.pick?.kind === 'stoneRoad';
				// A road's bar glows on through its see-through ghost; the stone ghost hides it.
				marker.visible = !hovered || this.pick?.kind === 'road';
				if (!edge) {
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
		const tile = this.pick?.kind === 'tile';
		const aim = this.pick?.kind === 'robber' || tile ? { hex: id, color: this.pick!.color } : this.theirAim;
		this.aim.set(bv, aim?.hex ?? null, PLAYER_RGB[aim?.color ?? ''] ?? 0xffffff, !tile);
		this.aim.update(dt, t, bv, this.stage.rig.azimuth);
		const pulse = 0.5 + Math.sin(t * 4) * 0.5;
		for (const m of ghostCache.values()) m.emissiveIntensity = 0.4 + pulse * 0.3;
		for (const m of markerCache.values()) m.emissiveIntensity = 0.9 + pulse * 0.9;
	}

	dispose() {
		this.stage.dispose();
	}
}

const BLESS_HALO = new THREE.TorusGeometry(6.4, 0.6, 6, 30);
const HALO_MAT = new THREE.MeshStandardMaterial({ color: 0xffd75e, emissive: 0xffb820, emissiveIntensity: 1.1, roughness: 0.3, flatShading: true });
const POLE = new THREE.BoxGeometry(0.7, 10, 0.7);
const POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.9, flatShading: true });
const PENNANT = new THREE.BoxGeometry(4.2, 2.6, 0.5);

/** The Baron's claim on a corner: a little pole with a pennant in his color. */
function claimFlag(color: number): THREE.Group {
	const g = new THREE.Group();
	const pole = new THREE.Mesh(POLE, POLE_MAT);
	pole.position.y = 5;
	const pennant = new THREE.Mesh(PENNANT, new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true }));
	pennant.position.set(2.4, 8.4, 0);
	g.add(pole, pennant);
	g.traverse((o) => (o.castShadow = true));
	return g;
}

/** How high a pick's glowing gem floats above its spot, clear of the piece that would go there. */
function markerHeight(kind: PickKind) {
	if (isCityPath(kind)) return 12.5;
	return kind === 'city' || kind === 'storehouse' || kind === 'tavern' ? 11 : kind === 'workshop' || kind === 'tearDown' ? 9.5 : 4.5;
}

/** Picking a workshop to tear down glows in this red. */
const TEAR_DOWN_RGB = 0xff5a3c;

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

/** World units per voxel of the settlement brackets, and half the square they mark, in voxels. */
const BRACKET_VOXEL = 0.8;
const BRACKET_HALF = 3.5;
const UP = new THREE.Vector3(0, 1, 0);

const bracketSeeCache = new Map<number, THREE.MeshBasicMaterial>();
/** The brackets drawn faintly where wheat, trees or a slope stand in front of them. */
function bracketSeeMaterial(color: number) {
	let m = bracketSeeCache.get(color);
	if (!m) {
		m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, depthFunc: THREE.GreaterDepth });
		bracketSeeCache.set(color, m);
	}
	return m;
}

/**
 * The mark on a corner where a settlement can go: four L-shaped brackets in the player's color
 * at the corners of a square, low on the ground and open in the middle, so a crowded island
 * stays readable. Each corner holds a plain and a lit copy (see `aimBrackets`).
 */
function cornerBrackets(color: number, lift: number): THREE.Group {
	const g = new THREE.Group();
	g.name = 'brackets';
	g.scale.setScalar(BRACKET_VOXEL);
	g.position.y = lift - 0.3;
	const see = bracketSeeMaterial(color);
	for (let k = 0; k < 4; k++) {
		const corner = new THREE.Group();
		corner.rotation.y = (k * Math.PI) / 2;
		corner.userData.dir = new THREE.Vector3(-1, 0, -1).normalize().applyAxisAngle(UP, corner.rotation.y);
		corner.userData.spread = 0;
		const idle = cloneModel(bracketModel(color));
		idle.name = 'idle';
		const hot = cloneModel(bracketModel(color, true));
		hot.name = 'hot';
		hot.visible = false;
		for (const o of [...idle.children]) {
			const m = o as THREE.Mesh;
			if (!m.isMesh || m.name === 'outline') continue;
			const ghost = new THREE.Mesh(m.geometry, see);
			ghost.position.copy(m.position);
			ghost.scale.copy(m.scale);
			ghost.renderOrder = 2;
			corner.add(ghost);
		}
		corner.add(idle, hot);
		g.add(corner);
	}
	return g;
}

/**
 * How far above a spot its brackets lie, so the square stays level and clear of the ground round
 * it: up to the highest bare land under the ring the corners turn on (they follow the camera), but
 * no more than a couple of units, so a corner by a peak doesn't hang in the air (it shows through
 * the slope instead). `ground` gives the world height of the bare land at (x, z).
 */
function bracketLift(pos: THREE.Vector3, ground: (x: number, z: number) => number) {
	const r = BRACKET_HALF * Math.SQRT2 * BRACKET_VOXEL;
	let top = pos.y;
	for (let k = 0; k < 16; k++) {
		const a = (k * Math.PI) / 8;
		top = Math.max(top, ground(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r));
	}
	return Math.min(top - pos.y, 2);
}

/**
 * Keep the brackets square to the view (a corner pointing at the camera, as in the design), let
 * them breathe a little, and spread and light them up while the pointer is on their spot. They
 * stay one level square throughout.
 */
function aimBrackets(g: THREE.Object3D, hovered: boolean, azimuth: number, t: number, dt: number) {
	g.rotation.y = azimuth + Math.PI / 4;
	const k = Math.min(1, dt * 12);
	for (const corner of g.children) {
		const u = corner.userData;
		u.spread += ((hovered ? 0.8 : Math.sin(t * 2.4) * 0.12) - u.spread) * k;
		corner.position.copy(u.dir).multiplyScalar(BRACKET_HALF * Math.SQRT2 + u.spread);
		corner.position.y = (Math.max(0, u.spread) / 0.8) * 0.35;
		corner.getObjectByName('idle')!.visible = !hovered;
		corner.getObjectByName('hot')!.visible = hovered;
	}
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
				${FRAG_OUTPUT}
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
				${FRAG_OUTPUT}
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

/** What a building on a corner looks like, from its piece key: 'settlement', 'city' or a city's path. */
function lookOf(key: string): string {
	return key.split(':')[1]?.split(/[-+]/)[0] ?? '';
}

/** What can be added onto a settlement or city, against one of its walls (Reign Extended). */
type Annex = 'storehouse' | 'tavern';
const ANNEX_SIZE: Record<Annex, Footprint> = { storehouse: STOREHOUSE_SIZE, tavern: TAVERN_SIZE };

/** Which annex a piece is, from its key, or null. */
function annexOf(key: string): Annex | null {
	return key.startsWith('s') ? 'storehouse' : key.startsWith('t') ? 'tavern' : null;
}

/** What the building on vertex v is now: a settlement, a city or the path its city took. */
function hostOf(view: GameView, v: number): AnnexHost {
	const b = view.buildings[v]!;
	return (b.kind === 'city' ? view.cityPaths?.[v] : null) ?? b.kind;
}

/**
 * The annexes on vertex v's building, the first one built first (on the same turn, the storehouse);
 * with `adding`, as they will be once that one goes up this turn.
 */
function annexOrder(view: GameView, v: number, adding?: Annex): Annex[] {
	const has = (a: Annex) => a === adding || !!(a === 'storehouse' ? view.storehouses : view.taverns)?.[v];
	const turn = (a: Annex) => (a === adding ? view.turn : (view.builtTurns?.[builtKey(a, v)] ?? 0));
	return (['storehouse', 'tavern'] as const).filter(has).sort((a, b) => turn(a) - turn(b));
}

/** Where annex `a` of vertex v's building stands: the first one built takes the best wall, the other the best of the rest. */
function annexPlace(bv: BoardView, view: GameView, v: number, a: Annex, order: Annex[]) {
	const host = hostOf(view, v);
	const yaw = buildingYaw(v);
	const first = annexSpot(bv, v, host, yaw, PIECE_SCALE, ANNEX_SIZE[order[0]]);
	return order[0] === a ? first : annexSpot(bv, v, host, yaw, PIECE_SCALE, ANNEX_SIZE[a], first.wall);
}

/** Which way the settlement or city on vertex v is turned: each corner turns its own way. */

function buildingYaw(v: number) {
	return (hashString(`r${v}`) % 4) * (Math.PI / 2) + Math.PI / 4;
}

export { getTopology };
