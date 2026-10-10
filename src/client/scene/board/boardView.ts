import * as THREE from 'three';
import { type Board, getTopology } from '../../../shared/board/topology';
import { HEX_R, SEA_Y } from '../layout';
import { getIcons } from '../icons';
import { sharedUniforms } from '../voxel/materials';
import { cloneModel, robberModel, sheepModel, shipModel } from './models';
import { type BoardBuild, DECK_TOP, LAND_TOP, buildBoard } from './terrain';
import { harborToken, numberToken, tokenRing } from './tokens';

/** Number tokens are a little smaller than a third of a tile, as in the reference. */
const TOKEN_SCALE = 0.82;
/** How much number and harbor tokens light up from within at night, so they read in the dark. */
const NIGHT_TOKEN = 0.3;

/**
 * Everything that belongs to one island: terrain, number and harbor tokens, ships,
 * grazing sheep and the robber. Knows where vertices, edges and hexes are in the world.
 */
export class BoardView {
	readonly group = new THREE.Group();
	readonly build: BoardBuild;
	readonly tokens: THREE.Group[] = [];
	readonly robber: THREE.Group;
	/** One per harbor, in `build.ports` order. */
	private ships: { obj: THREE.Object3D; base: THREE.Vector3; phase: number }[] = [];
	private harbors: THREE.Group[] = [];
	/** Color of each harbor's owner (null while free), as last set. */
	private portOwners: (number | null)[] = [];
	private sheep: {
		obj: THREE.Object3D;
		home: THREE.Vector2;
		pos: THREE.Vector2;
		target: THREE.Vector2;
		wait: number;
		phase: number;
	}[] = [];
	private faces: THREE.Object3D[] = [];
	/** The robber's tile drains to gray (never the desert); the tile it left fades back. */
	private gray = [
		{ hex: -1, amount: 0, target: 0 },
		{ hex: -1, amount: 0, target: 0 }
	];
	robberHex = -1;

	constructor(
		/** Number tokens can move (a Reign Extended earthquake), so this follows the game's board. */
		public board: Board,
		seed: number,
		/** Voxels per terrain unit: 1 is the standard island, 2 the finer experiment. */
		detail = 1,
		/** Lay out a workshop plot on every tile that produces (Reign Extended workshops). */
		plots = false
	) {
		this.build = buildBoard(board, seed, detail, plots);
		this.group.add(this.build.group);
		const topo = getTopology(board);

		board.hexes.forEach((h, i) => {
			if (h.number === null) {
				this.tokens.push(new THREE.Group());
				return;
			}
			const t = numberToken(h.number);
			t.scale.setScalar(TOKEN_SCALE);
			const c = this.hexCenter(i);
			t.position.set(c.x, this.build.tokenY[i], c.z);
			t.userData.baseY = t.position.y;
			this.tokens.push(t);
			this.faces.push(t);
			this.group.add(t);
		});

		const icons = getIcons();
		for (const p of this.build.ports) {
			const tok = harborToken(p.kind === 'any' ? null : icons.canvases[p.kind], p.ratio, p.kind);
			tok.position.set(p.x, DECK_TOP + 0.2, p.z);
			tok.userData.baseY = tok.position.y;
			tok.scale.setScalar(0.62);
			this.faces.push(tok);
			this.harbors.push(tok);
			this.portOwners.push(null);
			this.group.add(tok);
			const ship = cloneModel(shipModel());
			const side = new THREE.Vector3(Math.cos(p.angle), 0, -Math.sin(p.angle));
			const out = new THREE.Vector3(Math.sin(p.angle), 0, Math.cos(p.angle));
			const pos = new THREE.Vector3(p.x, SEA_Y - 0.5, p.z).addScaledVector(side, 7.5).addScaledVector(out, 1.5);
			ship.position.copy(pos);
			ship.rotation.y = p.angle + Math.PI / 2;
			ship.scale.setScalar(0.62);
			this.ships.push({ obj: ship, base: pos.clone(), phase: Math.random() * 10 });
			this.group.add(ship);
		}

		const sheepBase = sheepModel();
		for (const s of this.build.sheepSpots) {
			const obj = cloneModel(sheepBase);
			obj.scale.setScalar(0.46);
			const home = new THREE.Vector2(s.x, s.z);
			obj.position.set(s.x, this.build.groundY(s.x, s.z), s.z);
			obj.rotation.y = Math.random() * Math.PI * 2;
			this.sheep.push({ obj, home, pos: home.clone(), target: home.clone(), wait: Math.random() * 4, phase: Math.random() * 10 });
			this.group.add(obj);
		}

		this.robber = cloneModel(robberModel());
		this.robber.scale.setScalar(0.78);
		this.group.add(this.robber);
		void topo;
	}

	/**
	 * Two tiles traded number tokens (a Reign Extended earthquake): each token now belongs to the
	 * other tile. Returns the two tokens with the spots they move to; the caller animates the move.
	 */
	swapTokens(board: Board, a: number, b: number) {
		this.board = board;
		[this.tokens[a], this.tokens[b]] = [this.tokens[b], this.tokens[a]];
		return [a, b].map((h) => {
			const c = this.hexCenter(h);
			const tok = this.tokens[h];
			tok.userData.baseY = this.build.tokenY[h];
			return { tok, to: new THREE.Vector3(c.x, this.build.tokenY[h], c.z) };
		});
	}

	hexCenter(h: number) {
		const t = getTopology(this.board).hexes[h];
		return new THREE.Vector3(t.x * HEX_R, 0, t.z * HEX_R);
	}

	/** Where the robber stands on a hex: beside the number token, in the lowest spot round it. */
	robberSpot(h: number) {
		const c = this.hexCenter(h);
		if (this.board.hexes[h].number === null) {
			c.y = this.groundAt(c.x, c.z, 2);
			return c;
		}
		// The usual spot is to the token's left; on a mountain a valley between peaks wins. A
		// workshop's plot is never in the way.
		let best: THREE.Vector3 | null = null;
		const a0 = Math.atan2(2.4, -5);
		const plot = this.build.plots[h];
		for (let k = 0; k < 8; k++) {
			const a = a0 + (k * Math.PI) / 4;
			if (plot && Math.abs(Math.atan2(Math.sin(a - plot.angle), Math.cos(a - plot.angle))) < 0.9) continue;
			const p = new THREE.Vector3(c.x + Math.cos(a) * 5.5, 0, c.z + Math.sin(a) * 5.5);
			p.y = this.groundAt(p.x, p.z, 2);
			if (!best || p.y < best.y - 0.3) best = p;
		}
		return best!;
	}

	/** Where a workshop stands on tile h, and which way its plot faces (null: the tile has none). */
	plotSpot(h: number): { pos: THREE.Vector3; angle: number } | null {
		const p = this.build.plots[h];
		if (!p) return null;
		return { pos: new THREE.Vector3(p.x, this.standY(p.x, p.z, 1.2), p.z), angle: p.angle };
	}

	groundAt(x: number, z: number, r = 1.5) {
		let y = 0;
		for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) y = Math.max(y, this.build.groundY(x + dx, z + dz));
		return y;
	}

	/**
	 * Height a piece stands at: the land level, or higher only where the ground right under
	 * it is. Sampling wider would lift pieces onto slopes beside them (mountains, hills).
	 */
	private standY(x: number, z: number, r: number) {
		let y = LAND_TOP;
		for (let dz = -r; dz <= r; dz += r) for (let dx = -r; dx <= r; dx += r) y = Math.max(y, this.build.groundY(x + dx, z + dz));
		return y;
	}

	vertexPos(v: number) {
		const p = getTopology(this.board).vertices[v];
		const x = p.x * HEX_R;
		const z = p.z * HEX_R;
		return new THREE.Vector3(x, this.standY(x, z, 0.6), z);
	}

	edgePos(e: number) {
		const topo = getTopology(this.board);
		const ed = topo.edges[e];
		const a = topo.vertices[ed.a];
		const b = topo.vertices[ed.b];
		const x = ((a.x + b.x) / 2) * HEX_R;
		const z = ((a.z + b.z) / 2) * HEX_R;
		const angle = -Math.atan2((b.z - a.z), b.x - a.x);
		// Roads lie along the beige border, so sample along the edge itself.
		let y = LAND_TOP;
		for (const t of [0.2, 0.5, 0.8]) y = Math.max(y, this.standY((a.x + (b.x - a.x) * t) * HEX_R, (a.z + (b.z - a.z) * t) * HEX_R, 0.3));
		return { pos: new THREE.Vector3(x, y, z), angle };
	}

	/** Ring the number tokens of `hexes` (the tiles your buildings touch) in your color. */
	setMine(hexes: Set<number>, color: number | null) {
		this.tokens.forEach((t, i) => {
			const want = color !== null && hexes.has(i) && this.board.hexes[i].number !== null ? color : null;
			setRing(t, want);
		});
	}

	/** Where harbor `i` (in `build.ports` order) is: on its disc, in world space. */
	harborSpot(i: number): THREE.Vector3 | null {
		return this.harbors[i]?.getWorldPosition(new THREE.Vector3()) ?? null;
	}

	/**
	 * Show who holds each harbor (colors in `build.ports` order, null while free): the disc
	 * gets a ring and the ship beside it hoists sails in the owner's color.
	 */
	setPortOwners(colors: (number | null)[]) {
		colors.forEach((color, i) => {
			if (i >= this.harbors.length || this.portOwners[i] === color) return;
			this.portOwners[i] = color;
			setRing(this.harbors[i], color);
			const s = this.ships[i];
			const ship = cloneModel(shipModel(color ?? undefined));
			ship.position.copy(s.obj.position);
			ship.rotation.copy(s.obj.rotation);
			ship.scale.copy(s.obj.scale);
			this.group.remove(s.obj);
			this.group.add(ship);
			s.obj = ship;
		});
	}

	/** Where the grazing sheep are now. */
	sheepSpots(): THREE.Vector3[] {
		return this.sheep.map((s) => s.obj.position.clone());
	}

	/** How many harbors the island has (see `harborSpot`). */
	get harborCount() {
		return this.harbors.length;
	}

	/**
	 * Reign Extended events on the harbors: a storm closes them (their discs go dark), a fair
	 * lights them up (they lift and bob); null: as usual.
	 */
	setHarborMood(mood: 'closed' | 'busy' | null) {
		for (const h of this.harbors) {
			h.userData.dim = mood === 'closed';
			h.userData.highlight = mood === 'busy';
		}
	}

	/** The robber is being aimed at tile `h` (-1: at none): its number token lifts and bobs. */
	setAimed(h: number) {
		this.tokens.forEach((t, i) => (t.userData.aim = i === h));
	}

	setRobber(h: number, instant: boolean) {
		this.robberHex = h;
		if (instant) {
			this.robber.position.copy(this.robberSpot(h));
		}
		this.tokens.forEach((t, i) => (t.userData.dim = i === h));
		const hex = h >= 0 && this.board.hexes[h]?.terrain !== 'desert' ? h : -1;
		if (!this.gray.some((g) => g.hex === hex && g.target === 1)) {
			for (const g of this.gray) g.target = 0;
			const slot = this.gray.find((g) => g.amount === 0) ?? this.gray.reduce((a, b) => (a.amount < b.amount ? a : b));
			slot.hex = hex;
			slot.target = hex >= 0 ? 1 : 0;
		}
		if (instant) for (const g of this.gray) g.amount = g.target;
		this.applyGray();
	}

	private applyGray() {
		this.gray.forEach((g, i) => {
			const c = g.hex >= 0 ? this.hexCenter(g.hex) : new THREE.Vector3();
			sharedUniforms.uGray.value[i].set(c.x, c.z, g.hex >= 0 ? g.amount : 0, 0);
		});
	}

	update(dt: number, t: number, cameraAzimuth: number) {
		for (const f of this.faces) f.rotation.y = cameraAzimuth;
		// The color drains as the robber lands and comes back a little quicker.
		for (const g of this.gray) {
			if (g.amount < g.target) g.amount = Math.min(g.target, g.amount + dt / 1.1);
			else if (g.amount > g.target) g.amount = Math.max(g.target, g.amount - dt / 0.8);
		}
		this.applyGray();
		for (const tok of [...this.tokens, ...this.harbors]) {
			const target = tok.userData.dim ? 0.55 : 1;
			const face = tok.getObjectByName('face') as THREE.Mesh | undefined;
			if (face) {
				const m = face.material as THREE.MeshStandardMaterial;
				m.color.setScalar(THREE.MathUtils.lerp(m.color.r, target, 0.1));
				m.emissive.setScalar(sharedUniforms.uNight.value * NIGHT_TOKEN * m.color.r);
				const ghost = tok.getObjectByName('ghost') as THREE.Mesh | undefined;
				if (ghost) (ghost.material as THREE.MeshBasicMaterial).color.copy(m.color);
			}
			if (tok.userData.aim) tok.position.y = tok.userData.baseY + 2.2 + Math.sin(t * 5) * 0.7;
			else if (tok.userData.highlight) tok.position.y = tok.userData.baseY + 1 + Math.sin(t * 4) * 0.5;
			else if (tok.userData.baseY !== undefined) tok.position.y = tok.userData.baseY;
		}
		for (const s of this.ships) {
			s.obj.position.y = s.base.y + Math.sin(t * 1.1 + s.phase) * 0.35;
			s.obj.rotation.z = Math.sin(t * 0.9 + s.phase) * 0.05;
			s.obj.rotation.x = Math.sin(t * 0.7 + s.phase * 2) * 0.03;
		}
		for (const sh of this.sheep) {
			sh.wait -= dt;
			const d = sh.target.clone().sub(sh.pos);
			if (sh.wait <= 0 && d.length() < 0.2) {
				const ang = Math.random() * Math.PI * 2;
				const r = Math.random() * 2.8;
				sh.target.set(sh.home.x + Math.cos(ang) * r, sh.home.y + Math.sin(ang) * r);
				sh.wait = 2 + Math.random() * 6;
			}
			let walking = false;
			if (d.length() > 0.05 && sh.wait < 2) {
				const step = Math.min(d.length(), dt * 1.4);
				sh.pos.addScaledVector(d.normalize(), step);
				const want = Math.atan2(d.x, d.y) - Math.PI / 2;
				sh.obj.rotation.y += angleDelta(sh.obj.rotation.y, want) * Math.min(1, dt * 5);
				walking = true;
			}
			const ground = this.build.groundY(sh.pos.x, sh.pos.y);
			sh.obj.position.set(sh.pos.x, ground + (walking ? Math.abs(Math.sin(t * 9 + sh.phase)) * 0.4 : 0), sh.pos.y);
		}
	}

	dispose() {
		this.build.dispose();
		for (const v of sharedUniforms.uGray.value) v.set(0, 0, 0, 0);
	}
}

/** Put a ring of `color` round a token, or take it off (null). */
function setRing(token: THREE.Group, color: number | null) {
	const old = token.getObjectByName('ring');
	if ((old?.userData.color ?? null) === color) return;
	if (old) token.remove(old);
	if (color === null) return;
	const ring = tokenRing(color);
	ring.userData.color = color;
	token.add(ring);
}

function angleDelta(a: number, b: number) {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}
