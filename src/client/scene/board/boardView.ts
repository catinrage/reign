import * as THREE from 'three';
import { type Board, getTopology } from '../../../shared/board/topology';
import { HEX_R, SEA_Y } from '../layout';
import { getIcons } from '../icons';
import { cloneModel, robberModel, sheepModel, shipModel } from './models';
import { type BoardBuild, buildBoard } from './terrain';
import { harborToken, numberToken } from './tokens';

/**
 * Everything that belongs to one island: terrain, number and harbor tokens, ships,
 * grazing sheep and the robber. Knows where vertices, edges and hexes are in the world.
 */
export class BoardView {
	readonly group = new THREE.Group();
	readonly build: BoardBuild;
	readonly tokens: THREE.Group[] = [];
	readonly robber: THREE.Group;
	private ships: { obj: THREE.Object3D; base: THREE.Vector3; phase: number }[] = [];
	private sheep: {
		obj: THREE.Object3D;
		home: THREE.Vector2;
		pos: THREE.Vector2;
		target: THREE.Vector2;
		wait: number;
		phase: number;
	}[] = [];
	private faces: THREE.Object3D[] = [];
	robberHex = -1;

	constructor(
		readonly board: Board,
		seed: number
	) {
		this.build = buildBoard(board, seed);
		this.group.add(this.build.group);
		const topo = getTopology(board);

		board.hexes.forEach((h, i) => {
			if (h.number === null) {
				this.tokens.push(new THREE.Group());
				return;
			}
			const t = numberToken(h.number);
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
			tok.position.set(p.x, SEA_Y + 1.2, p.z);
			tok.scale.setScalar(0.9);
			this.faces.push(tok);
			this.group.add(tok);
			const ship = cloneModel(shipModel());
			const side = new THREE.Vector3(Math.cos(p.angle), 0, -Math.sin(p.angle));
			const out = new THREE.Vector3(Math.sin(p.angle), 0, Math.cos(p.angle));
			const pos = new THREE.Vector3(p.x, SEA_Y - 0.6, p.z).addScaledVector(side, 9.5).addScaledVector(out, 2.5);
			ship.position.copy(pos);
			ship.rotation.y = p.angle + Math.PI / 2;
			ship.scale.setScalar(0.8);
			this.ships.push({ obj: ship, base: pos.clone(), phase: Math.random() * 10 });
			this.group.add(ship);
		}

		const sheepBase = sheepModel();
		for (const s of this.build.sheepSpots) {
			const obj = cloneModel(sheepBase);
			obj.scale.setScalar(0.85);
			const home = new THREE.Vector2(s.x, s.z);
			obj.position.set(s.x, this.build.surfaceY(s.x, s.z), s.z);
			obj.rotation.y = Math.random() * Math.PI * 2;
			this.sheep.push({ obj, home, pos: home.clone(), target: home.clone(), wait: Math.random() * 4, phase: Math.random() * 10 });
			this.group.add(obj);
		}

		this.robber = cloneModel(robberModel());
		this.robber.scale.setScalar(0.95);
		this.group.add(this.robber);
		void topo;
	}

	hexCenter(h: number) {
		const t = getTopology(this.board).hexes[h];
		return new THREE.Vector3(t.x * HEX_R, 0, t.z * HEX_R);
	}

	/** Where the robber stands on a hex: beside the number token. */
	robberSpot(h: number) {
		const c = this.hexCenter(h);
		const hasToken = this.board.hexes[h].number !== null;
		if (hasToken) c.add(new THREE.Vector3(-4.2, 0, -5.4));
		c.y = this.groundAt(c.x, c.z, 2);
		return c;
	}

	groundAt(x: number, z: number, r = 1.5) {
		let y = 0;
		for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) y = Math.max(y, this.build.surfaceY(x + dx, z + dz));
		return y;
	}

	vertexPos(v: number) {
		const p = getTopology(this.board).vertices[v];
		const x = p.x * HEX_R;
		const z = p.z * HEX_R;
		return new THREE.Vector3(x, this.groundAt(x, z, 2), z);
	}

	edgePos(e: number) {
		const topo = getTopology(this.board);
		const ed = topo.edges[e];
		const a = topo.vertices[ed.a];
		const b = topo.vertices[ed.b];
		const x = ((a.x + b.x) / 2) * HEX_R;
		const z = ((a.z + b.z) / 2) * HEX_R;
		const angle = -Math.atan2((b.z - a.z), b.x - a.x);
		return { pos: new THREE.Vector3(x, this.groundAt(x, z, 2), z), angle };
	}

	setRobber(h: number, instant: boolean) {
		this.robberHex = h;
		if (instant) {
			this.robber.position.copy(this.robberSpot(h));
		}
		this.tokens.forEach((t, i) => (t.userData.dim = i === h));
	}

	update(dt: number, t: number, cameraAzimuth: number) {
		for (const f of this.faces) f.rotation.y = cameraAzimuth;
		for (const tok of this.tokens) {
			const target = tok.userData.dim ? 0.55 : 1;
			const face = tok.getObjectByName('face') as THREE.Mesh | undefined;
			if (face) {
				const m = face.material as THREE.MeshStandardMaterial;
				m.color.setScalar(THREE.MathUtils.lerp(m.color.r, target, 0.1));
			}
			if (tok.userData.highlight) tok.position.y = tok.userData.baseY + 1 + Math.sin(t * 4) * 0.5;
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
			const ground = this.build.surfaceY(sh.pos.x, sh.pos.y);
			sh.obj.position.set(sh.pos.x, ground + (walking ? Math.abs(Math.sin(t * 9 + sh.phase)) * 0.4 : 0), sh.pos.y);
		}
	}

	dispose() {
		this.build.dispose();
	}
}

function angleDelta(a: number, b: number) {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}
