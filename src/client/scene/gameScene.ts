import * as THREE from 'three';
import { generateStandardBoard } from '../../shared/board/generate';
import { type Board, getTopology } from '../../shared/board/topology';
import { worldToHex, hexKey } from '../../shared/board/hex';
import type { GameEvent, GameView } from '../../shared/rules/types';
import { Animator, ease } from './anim';
import { BoardView } from './board/boardView';
import { cityModel, cloneModel, resourceItemModel, roadModel, settlementModel } from './board/models';
import { Dice } from './dice';
import { Particles } from './effects';
import { HEX_R, PLAYER_RGB } from './layout';
import { type Room, buildRoom } from './room/room';
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
	onDiceSettled?: (dice: [number, number]) => void;
	onHover?: (label: string | null) => void;
}

interface PieceObj {
	key: string;
	obj: THREE.Object3D;
}

const ROAD_LEN = 8;
const PIECE_SCALE = 0.74;

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

	constructor(canvas: HTMLCanvasElement, quality: Quality) {
		this.stage = new Stage(canvas, quality);
		this.particles = new Particles(this.stage.scene);
		this.room = buildRoom(this.stage);
		this.dice = new Dice(this.stage.scene, this.anim, this.particles, new THREE.Vector3(-60, 0, 100));
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

	showMenuBoard() {
		this.mode = 'menu';
		this.boardKey = '';
		this.view = null;
		this.setPick(null);
		const seed = (Math.random() * 1e9) | 0;
		this.setBoard(generateStandardBoard({ rng: seed }), seed);
		this.boardView!.setRobber(this.boardView!.board.hexes.findIndex((h) => h.terrain === 'desert'), true);
		this.clearPieces();
		this.stage.rig.autoRotate = 0.05;
		this.stage.rig.set({ radius: 360, polar: 0.92 });
	}

	private setBoard(board: Board, seed: number) {
		if (this.boardView) {
			this.stage.scene.remove(this.boardView.group);
			this.boardView.dispose();
		}
		this.boardView = new BoardView(board, seed);
		this.stage.scene.add(this.boardView.group);
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
				this.stage.rig.set({ ...this.framing(), azimuth: -0.62 + seat * (Math.PI / 2), target: new THREE.Vector3(0, 0, 0) });
			}
		}
		const prev = this.view;
		this.view = view;
		this.syncPieces(view, !first);
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
		const fit = 88 / Math.tan(hHalf);
		const radius = THREE.MathUtils.clamp(Math.max(255, fit * 0.92), 200, 700);
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
				obj.scale.set(1, 0.7, 0.7);
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
				const cam = this.stage.camera.position.clone();
				const dir = new THREE.Vector3(cam.x, 0, cam.z).normalize();
				const side = new THREE.Vector3(-dir.z, 0, dir.x);
				const rest = dir.clone().multiplyScalar(104).addScaledVector(side, 26);
				const from = dir.clone().multiplyScalar(170).addScaledVector(side, 40).setY(40);
				this.dice.roll(e.dice, from, rest).then(() => this.callbacks.onDiceSettled?.(e.dice));
				// Highlight producing tokens once the dice land.
				const total = e.dice[0] + e.dice[1];
				this.anim.wait(1.4).then(() => this.flashTokens(total));
				break;
			}
			case 'produced':
				this.anim.wait(1.55).then(() => {
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
			item.scale.setScalar(0.55);
			const c = bv.hexCenter(hex);
			const start = new THREE.Vector3(c.x + (Math.random() - 0.5) * 6, bv.groundAt(c.x, c.z, 3) + 3, c.z + (Math.random() - 0.5) * 6);
			item.position.copy(start);
			this.stage.scene.add(item);
			const spin = Math.random() * 2 + 2;
			const delay = k * 0.15 + Math.random() * 0.1;
			this.anim.tween(1.1, (t) => {
				item.position.y = start.y + ease.outCubic(t) * 16;
				item.rotation.y = t * spin * Math.PI;
				item.scale.setScalar(0.55 * (t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1) + 0.001);
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
			const ghost = cloneModel(model as THREE.Group);
			ghost.traverse((o) => {
				const m = o as THREE.Mesh;
				if (m.isMesh) {
					m.material = mat;
					m.castShadow = false;
				}
			});
			ghost.position.copy(pos);
			ghost.rotation.y = rot;
			ghost.scale.setScalar(req.kind === 'road' ? 0.85 : PIECE_SCALE);
			ghost.userData = { id, baseY: pos.y, phase: Math.random() * 6, base: ghost.scale.x };
			if (req.kind === 'city') ghost.position.y += 1;
			this.ghosts.add(ghost);
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
		this.smoke(dt);
		const bv = this.boardView;
		if (bv) {
			bv.update(dt, t, this.stage.rig.azimuth);
		}

		// hover feedback
		const id = this.pick ? this.pickAtPointer() : null;
		this.stage.canvas.style.cursor = id !== null ? 'pointer' : '';
		for (const g of this.ghosts.children) {
			if (g.userData.id === undefined) continue;
			const hovered = g.userData.id === id;
			const target = g.userData.base * (hovered ? 1.2 : 1);
			const s = THREE.MathUtils.lerp(g.scale.x, target, 0.25);
			g.scale.setScalar(s);
			g.position.y = g.userData.baseY + (hovered ? 2.5 : 1 + Math.sin(t * 3 + g.userData.phase) * 0.8);
		}
		if (this.pick?.kind === 'robber' && bv) {
			if (id !== null) {
				const c = bv.hexCenter(id);
				this.hexRing.position.set(c.x, bv.groundAt(c.x, c.z, 0) + 0.3, c.z);
				this.hexRing.visible = true;
				(this.hexRing.material as THREE.LineBasicMaterial).opacity = 0.6 + Math.sin(t * 6) * 0.3;
			} else this.hexRing.visible = false;
		}
		const mats = new Set<THREE.Material>();
		this.ghosts.traverse((o) => {
			const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
			if (m && m.visible !== false && 'emissiveIntensity' in m) mats.add(m);
		});
		for (const m of mats) (m as THREE.MeshStandardMaterial).emissiveIntensity = 0.55 + Math.sin(t * 4) * 0.25;
	}

	dispose() {
		this.stage.dispose();
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
			opacity: 0.55,
			depthWrite: false,
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
