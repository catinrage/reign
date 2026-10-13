import * as THREE from 'three';
import type { RealmMap } from '../../../shared/conquest/realm';
import { build, shipModel } from '../board/models';
import { Mat, hash3, hex, pick, shade } from '../voxel/grid';
import { realmUniforms } from '../voxel/materials';
import { type RealmBuild, buildRealm } from './realmTerrain';
import { type Sigil, drawSigil } from './sigils';

/**
 * Conquest's board on the table: the Realm's terrain (see realmTerrain.ts) with every territory's
 * owner and highlight fed to the land's shader, an army medallion on each territory's square, its
 * name on a ribbon, and the sea lanes across the water. The board only shows things; the scene's
 * controller decides what is lit up and why.
 */

/** How one territory is lit up right now (all 0..1). */
export interface TerritoryLook {
	/** The whole territory lit in `color`. */
	fill?: number;
	/** Its band glowing in `color`. */
	glow?: number;
	/** Under the pointer. */
	hover?: number;
	/** Faded back: not part of what is going on. */
	dim?: number;
	color?: number;
	/** How much the light breathes. */
	pulse?: number;
}

/** What the board needs of the camera to face it and stay readable. */
export interface BoardCamera {
	azimuth: number;
	polar: number;
	camera: THREE.PerspectiveCamera;
	/** The canvas's height in CSS pixels. */
	height: number;
}

export interface Holder {
	/** The player's color (rgb) and sigil. */
	color: number;
	sigil: Sigil;
}

const MEDAL_R = 2.6;
/** Voxels across the medallion's radius. */
const MEDAL_V = 6.6;
const VS = MEDAL_R / MEDAL_V;

export class RealmBoard {
	readonly group = new THREE.Group();
	readonly realm: RealmBuild;
	readonly armies: ArmyToken[] = [];
	readonly labels: THREE.Sprite[] = [];
	readonly lanes: SeaLane[] = [];
	private readonly stateData = new Uint8Array(64 * 3 * 4);
	private readonly stateTex: THREE.DataTexture;
	private looks: TerritoryLook[];
	private shown: TerritoryLook[];
	private time = 0;
	/** Territories whose names show however crowded the view is (picked, hovered, targets). */
	emphasis = new Set<number>();

	readonly legend: RegionLegend;

	constructor(
		readonly map: RealmMap,
		/** Names to show (translated): territories and regions in the map's order, and the legend's title. */
		names: { territories: string[]; regions: string[]; legend: string } = {
			territories: map.territories.map((t) => t.name),
			regions: map.regions.map((r) => r.name),
			legend: 'Regions'
		}
	) {
		this.realm = buildRealm(map);
		this.group.name = 'conquest-board';
		this.group.add(this.realm.group);
		this.stateTex = new THREE.DataTexture(this.stateData, 64, 3, THREE.RGBAFormat, THREE.UnsignedByteType);
		this.stateTex.magFilter = THREE.NearestFilter;
		this.stateTex.minFilter = THREE.NearestFilter;
		this.stateTex.generateMipmaps = false;
		this.bindUniforms();
		this.looks = map.territories.map(() => ({}));
		this.shown = map.territories.map(() => ({ fill: 0, glow: 0, hover: 0, dim: 0, pulse: 0, color: 0xffffff }));
		map.territories.forEach((t, i) => {
			const a = new ArmyToken(i, this.realm.anchors[i]);
			this.armies.push(a);
			this.group.add(a.group);
			const label = nameLabel(names.territories[i]);
			label.position.copy(this.realm.anchors[i]);
			this.labels.push(label);
			this.group.add(label);
		});
		const index = new Map(map.territories.map((t, i) => [t.id, i]));
		map.lanes.forEach(([a, b], k) => {
			const lane = new SeaLane(index.get(a)!, index.get(b)!, this.realm.lanes[k]);
			this.lanes.push(lane);
			this.group.add(lane.group);
		});
		this.legend = new RegionLegend(map, names.regions, names.legend);
		this.legend.group.position.set(88, 0, 70);
		this.group.add(this.legend.group);
		const rose = compassRose();
		rose.position.set(-96, 2.4, 82);
		this.group.add(rose);
		this.writeState();
	}

	/** Who holds each territory (an index into `holders`, -1 for nobody) and the armies on it. */
	setHolders(owner: number[], armies: number[], holders: Holder[]) {
		owner.forEach((p, t) => {
			const h = holders[p];
			const o = t * 4;
			if (h) {
				this.stateData[o] = (h.color >> 16) & 255;
				this.stateData[o + 1] = (h.color >> 8) & 255;
				this.stateData[o + 2] = h.color & 255;
				this.stateData[o + 3] = 255;
			} else this.stateData[o + 3] = 0;
			this.armies[t].set(armies[t] ?? 0, h ?? null);
		});
		this.stateTex.needsUpdate = true;
		this.legend.setHolders(
			this.map.regions.map((_, g) => {
				const ts = this.map.territories.map((t, i) => (t.region === g ? i : -1)).filter((i) => i >= 0);
				const p = owner[ts[0]];
				return p >= 0 && ts.every((i) => owner[i] === p) ? (holders[p] ?? null) : null;
			})
		);
	}

	/** How territory `t` is lit up; the change eases in. */
	setLook(t: number, look: TerritoryLook) {
		this.looks[t] = look;
	}

	clearLooks() {
		this.looks = this.looks.map(() => ({}));
	}

	/** The territory under a ray: its army medallion, or the land itself. */
	pick(ray: THREE.Ray): number {
		const caster = new THREE.Raycaster(ray.origin, ray.direction);
		let best = -1;
		let near = Infinity;
		for (const a of this.armies) {
			if (!a.group.visible) continue;
			const hit = caster.intersectObject(a.hitbox, false)[0];
			if (hit && hit.distance < near) {
				near = hit.distance;
				best = a.territory;
			}
		}
		if (best >= 0) return best;
		const p = this.realm.raycast(ray);
		return p ? this.realm.territoryAt(p.x, p.z) : -1;
	}

	update(dt: number, t: number, view: BoardCamera) {
		this.time = t;
		// The board on show owns the land's shader inputs, even when another board (the menu
		// table's) was made or thrown away since.
		if (realmUniforms.uRealmState.value !== this.stateTex) this.bindUniforms();
		realmUniforms.uRealmPulse.value = 0.5 + 0.5 * Math.sin(t * 4.2);
		const k = 1 - Math.exp(-dt * 12);
		let changed = false;
		this.looks.forEach((look, i) => {
			const s = this.shown[i];
			for (const key of ['fill', 'glow', 'hover', 'dim', 'pulse'] as const) {
				const goal = look[key] ?? 0;
				const v = s[key]!;
				if (Math.abs(goal - v) < 0.002) {
					if (v !== goal) {
						s[key] = goal;
						changed = true;
					}
					continue;
				}
				s[key] = v + (goal - v) * k;
				changed = true;
			}
			if (look.color !== undefined && look.color !== s.color) {
				s.color = look.color;
				changed = true;
			}
		});
		if (changed) this.writeState();
		// Pixels per world unit at distance 1, to keep medallions and names big enough to read.
		const cam = view.camera;
		const ppu1 = view.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
		const at = new THREE.Vector3();
		this.armies.forEach((a, i) => {
			const d = at.copy(a.anchor).applyMatrix4(cam.matrixWorldInverse).z;
			a.update(dt, t, view, ppu1 / Math.max(1, -d));
			const s = this.shown[i];
			a.setHalo(Math.max(s.glow!, s.fill!) * (1 - s.dim!), s.color ?? 0xffffff, s.pulse!, t);
		});
		this.labels.forEach((l, i) => {
			const d = at.copy(l.position).applyMatrix4(cam.matrixWorldInverse).z;
			const ppu = ppu1 / Math.max(1, -d);
			// About 19 pixels tall from afar, growing a little closer in.
			const px = THREE.MathUtils.clamp(ppu * 1.5, 19, 30);
			const h = px / ppu;
			l.scale.set(h * l.userData.aspect, h, 1);
			l.position.y = this.realm.anchors[i].y + 0.3;
			// Names only where they fit inside their territory, so a far-off view doesn't drown in them.
			const e = this.realm.extents[i];
			const room = (e.maxX - e.minX) * ppu * 1.15;
			const fits = room >= px * l.userData.aspect;
			const goal = fits || this.emphasis.has(i) ? 1 : 0;
			const m = l.material;
			m.opacity += (goal - m.opacity) * (1 - Math.exp(-dt * 10));
			l.visible = m.opacity > 0.02;
		});
		for (const l of this.lanes) l.update(dt, t);
	}

	private bindUniforms() {
		realmUniforms.uRealmMap.value = this.realm.mapTexture;
		realmUniforms.uRealmState.value = this.stateTex;
		realmUniforms.uRealmGrid.value.copy(this.realm.gridInfo);
	}

	private writeState() {
		const d = this.stateData;
		this.shown.forEach((s, i) => {
			const o1 = (64 + i) * 4;
			d[o1] = Math.round(s.fill! * 255);
			d[o1 + 1] = Math.round(s.glow! * 255);
			d[o1 + 2] = Math.round(s.hover! * 255);
			d[o1 + 3] = Math.round(s.dim! * 255);
			const o2 = (128 + i) * 4;
			const c = s.color ?? 0xffffff;
			d[o2] = (c >> 16) & 255;
			d[o2 + 1] = (c >> 8) & 255;
			d[o2 + 2] = c & 255;
			d[o2 + 3] = Math.round(s.pulse! * 255);
		});
		this.stateTex.needsUpdate = true;
	}

	dispose() {
		this.realm.dispose();
		this.stateTex.dispose();
		for (const a of this.armies) a.dispose();
		for (const l of this.labels) {
			l.material.map?.dispose();
			l.material.dispose();
		}
		for (const l of this.lanes) l.dispose();
		this.legend.dispose();
		if (realmUniforms.uRealmState.value === this.stateTex) realmUniforms.uRealmState.value = null;
	}
}

// ---------------------------------------------------------------- armies

const CREAM = '#f6e3b4';

/** The medallion's back: a cream disc with a band in the holder's color and a dark rim. */
function medalBack(color: number | null) {
	return build(`cq-medal:${color ?? 'none'}`, [14, 14, 2], (g) => {
		const c = 6.5;
		const band = color ?? hex('#b9a27a');
		for (let y = 0; y < 14; y++)
			for (let x = 0; x < 14; x++) {
				const d = Math.hypot(x - c, y - c);
				if (d > MEDAL_V) continue;
				const col = d > 5.9 ? hex('#2b1a10') : d > 4.5 ? shade(band, 0.95 + hash3(x, y, 1) * 0.1) : pick([hex('#f4dcaa'), hex('#efd49e')], hash3(x, y, 2));
				g.set(x, y, 0, d > 5.9 ? hex('#2b1a10') : shade(col, 0.8));
				g.set(x, y, 1, col);
			}
	}, [7, 7, 1], VS, { outline: true, mats: { [Mat.Solid]: { lift: 0.25 } } });
}

/** A short wooden post with a foot, holding the medallion up off the square. */
function medalPost() {
	return build('cq-post', [5, 6, 5], (g) => {
		g.box(1, 0, 1, 3, 0, 3, (x, y, z) => pick([hex('#6b4224'), hex('#5a361d')], hash3(x, y, z)));
		g.box(2, 1, 2, 2, 5, 2, (x, y, z) => pick([hex('#7a4a28'), hex('#6a3f22')], hash3(x, y, z)));
	}, [2.5, 0, 2.5], 0.3);
}

function faceCanvas() {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	return c;
}

/** A white ring with a soft glow outside it, tinted per medallion: what a click there does. */
let haloTex: THREE.CanvasTexture | null = null;
function haloTexture() {
	if (haloTex) return haloTex;
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const ctx = c.getContext('2d')!;
	const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
	g.addColorStop(0, 'rgba(255,255,255,0)');
	g.addColorStop(0.05, 'rgba(255,255,255,1)');
	g.addColorStop(0.32, 'rgba(255,255,255,1)');
	g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 128, 128);
	haloTex = new THREE.CanvasTexture(c);
	return haloTex;
}

/** One territory's armies: a medallion with the count, the holder's band and sigil, facing the camera. */
export class ArmyToken {
	readonly group = new THREE.Group();
	/** A disc to pick the medallion by. */
	readonly hitbox: THREE.Mesh;
	private readonly medal = new THREE.Group();
	private back: THREE.Group | null = null;
	private readonly canvas = faceCanvas();
	private readonly tex: THREE.CanvasTexture;
	private readonly face: THREE.Mesh;
	private count = -1;
	private holder: Holder | null = null;
	/** Bumps when the count changes (0..1, eases out). */
	private bump = 0;
	/** Lifted while picked. */
	lift = 0;
	private readonly halo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

	/** Ring the medallion in a highlight's color (0 = none), pulsing when `pulse` is set. */
	setHalo(strength: number, color: number, pulse: number, t: number) {
		const wave = 0.5 + 0.5 * Math.sin(t * 4.2);
		const o = strength * (1 - pulse * 0.45 * (1 - wave));
		this.halo.visible = o > 0.02;
		if (!this.halo.visible) return;
		this.halo.material.opacity = Math.min(1, o);
		this.halo.material.color.setHex(color);
		this.halo.scale.setScalar(1 + pulse * 0.06 * wave);
	}
	private shownLift = 0;

	constructor(
		readonly territory: number,
		readonly anchor: THREE.Vector3
	) {
		this.group.position.copy(anchor);
		const post = medalPost().clone(true);
		this.group.add(post);
		this.medal.position.y = 1.6 + MEDAL_R;
		this.medal.rotation.order = 'YXZ';
		this.group.add(this.medal);
		this.tex = new THREE.CanvasTexture(this.canvas);
		this.tex.colorSpace = THREE.SRGBColorSpace;
		this.tex.anisotropy = 8;
		this.face = new THREE.Mesh(
			new THREE.CircleGeometry(4.55 * VS, 40),
			new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.75, transparent: true, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.12 })
		);
		this.face.position.z = 2 * VS + 0.02;
		this.medal.add(this.face);
		this.halo = new THREE.Mesh(
			new THREE.PlaneGeometry(MEDAL_R * 3.3, MEDAL_R * 3.3),
			new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0 })
		);
		this.halo.position.z = VS;
		this.halo.visible = false;
		this.medal.add(this.halo);
		this.hitbox = new THREE.Mesh(new THREE.CircleGeometry(MEDAL_R * 1.05, 20), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
		this.hitbox.visible = false;
		this.medal.add(this.hitbox);
	}

	/** A little jump (the territory changed hands). */
	pop() {
		this.bump = 1;
	}

	/** The medallion's middle, in the world. */
	medalWorld(): THREE.Vector3 {
		return this.medal.getWorldPosition(new THREE.Vector3());
	}

	set(count: number, holder: Holder | null) {
		if (count === this.count && holder?.color === this.holder?.color && holder?.sigil === this.holder?.sigil) return;
		if (this.count >= 0 && count !== this.count) this.bump = 1;
		if (holder?.color !== this.holder?.color || !this.back) {
			if (this.back) this.medal.remove(this.back);
			this.back = medalBack(holder?.color ?? null).clone(true);
			this.medal.add(this.back);
		}
		this.count = count;
		this.holder = holder;
		this.draw();
	}

	private draw() {
		const s = 128;
		const ctx = this.canvas.getContext('2d')!;
		ctx.clearRect(0, 0, s, s);
		const grad = ctx.createRadialGradient(s / 2, s * 0.4, s * 0.05, s / 2, s / 2, s / 2);
		grad.addColorStop(0, '#fff6dc');
		grad.addColorStop(0.8, CREAM);
		grad.addColorStop(1, '#e6c48c');
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
		ctx.fill();
		if (this.holder) {
			const c = `#${this.holder.color.toString(16).padStart(6, '0')}`;
			drawSigil(ctx, this.holder.sigil, s / 2, s * 0.17, s * 0.1, c, '#2b1a10', 3);
		}
		ctx.fillStyle = '#3a2416';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const text = String(Math.max(0, this.count));
		ctx.font = `900 ${text.length >= 3 ? 56 : text.length === 2 ? 72 : 82}px "Nunito Variable", system-ui, sans-serif`;
		ctx.fillText(text, s / 2, s * 0.62);
		this.tex.needsUpdate = true;
	}

	/** `ppu`: pixels per world unit where the medallion stands. */
	update(dt: number, _t: number, camera: { azimuth: number; polar: number }, ppu: number) {
		const elev = THREE.MathUtils.clamp(Math.PI / 2 - camera.polar, 0.3, 1.25);
		this.medal.rotation.y = camera.azimuth;
		this.medal.rotation.x = -elev * 0.85;
		this.bump = Math.max(0, this.bump - dt * 3.5);
		this.shownLift += (this.lift - this.shownLift) * (1 - Math.exp(-dt * 14));
		const pop = 1 + Math.sin(this.bump * Math.PI) * 0.22;
		// Never smaller than about 30 pixels across, so the count reads from the whole-map view.
		const grow = Math.min(2.4, Math.max(1, 34 / (2 * MEDAL_R * ppu)));
		const scale = grow * pop * (1 + this.shownLift * 0.12);
		this.group.scale.setScalar(grow);
		this.medal.scale.setScalar(scale / grow);
		this.medal.position.y = 1.6 + MEDAL_R + this.shownLift * 1.1;
	}

	dispose() {
		this.tex.dispose();
		this.face.geometry.dispose();
		(this.face.material as THREE.Material).dispose();
		this.hitbox.geometry.dispose();
		this.halo.geometry.dispose();
		this.halo.material.dispose();
	}
}

// ---------------------------------------------------------------- names

/** A territory's name on a cream ribbon that faces the camera. */
function nameLabel(name: string): THREE.Sprite {
	const px = 40;
	const font = `800 ${px}px "Nunito Variable", system-ui, sans-serif`;
	const measure = document.createElement('canvas').getContext('2d')!;
	measure.font = font;
	const w = Math.ceil(measure.measureText(name).width) + 44;
	const h = 60;
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d')!;
	// The ribbon: notched ends, a darker fold under each.
	ctx.fillStyle = 'rgba(43,26,16,0.9)';
	ribbon(ctx, 2, 6, w - 4, h - 10, 12);
	ctx.fill();
	ctx.fillStyle = '#f7e6bd';
	ribbon(ctx, 5, 9, w - 10, h - 16, 10);
	ctx.fill();
	ctx.fillStyle = '#3a2416';
	ctx.font = font;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(name, w / 2, h / 2 + 2);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
	sprite.userData.aspect = w / h;
	sprite.scale.set(w / h, 1, 1);
	sprite.center.set(0.5, 1.15);
	sprite.renderOrder = 3;
	sprite.name = 'label';
	return sprite;
}

function ribbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, notch: number) {
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + w, y);
	ctx.lineTo(x + w - notch, y + h / 2);
	ctx.lineTo(x + w, y + h);
	ctx.lineTo(x, y + h);
	ctx.lineTo(x + notch, y + h / 2);
	ctx.closePath();
}

// ---------------------------------------------------------------- sea lanes

const LANE_Y = 2.45;

/** A sea lane: a dotted course across the water between two shores, a mooring post at each end and a little ship on the way. */
export class SeaLane {
	readonly group = new THREE.Group();
	private readonly material: THREE.MeshStandardMaterial;
	private readonly dashes: THREE.InstancedMesh;
	private lit = 0;
	private shownLit = 0;
	private readonly ship: THREE.Group;
	private readonly path: THREE.QuadraticBezierCurve3;

	constructor(
		readonly a: number,
		readonly b: number,
		ends: { a: { x: number; z: number }; b: { x: number; z: number } }
	) {
		const A = new THREE.Vector3(ends.a.x, LANE_Y, ends.a.z);
		const B = new THREE.Vector3(ends.b.x, LANE_Y, ends.b.z);
		const mid = A.clone().lerp(B, 0.5);
		// A gentle bow, the same way for every lane, so it reads as a course rather than a ruler line.
		const side = new THREE.Vector3(-(B.z - A.z), 0, B.x - A.x).normalize().multiplyScalar(A.distanceTo(B) * 0.08);
		this.path = new THREE.QuadraticBezierCurve3(A, mid.add(side), B);
		const len = this.path.getLength();
		const n = Math.max(2, Math.floor(len / 1.5));
		this.material = new THREE.MeshStandardMaterial({ color: 0xf7ead0, roughness: 0.6, emissive: 0xfff2c8, emissiveIntensity: 0 });
		this.dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.22, 0.95), this.material, n);
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const up = new THREE.Vector3(0, 1, 0);
		for (let i = 0; i < n; i++) {
			const u = (i + 0.5) / n;
			const p = this.path.getPointAt(u);
			const tan = this.path.getTangentAt(u);
			q.setFromAxisAngle(up, Math.atan2(tan.x, tan.z));
			m.compose(p, q, new THREE.Vector3(1, 1, 1));
			this.dashes.setMatrixAt(i, m);
		}
		this.dashes.receiveShadow = true;
		this.group.add(this.dashes);
		for (const end of [A, B]) {
			const post = build('cq-mooring', [3, 9, 3], (g) => {
				g.box(1, 0, 1, 1, 7, 1, (x, y, z) => pick([hex('#6b4224'), hex('#5a361d')], hash3(x, y, z)));
				g.box(0, 7, 0, 2, 7, 2, hex('#e9d3a0'));
				g.box(1, 8, 1, 1, 8, 1, hex('#e9d3a0'));
			}, [1.5, 0, 1.5], 0.32).clone(true);
			post.position.set(end.x, 0.6, end.z);
			this.group.add(post);
		}
		this.ship = shipModel().clone(true);
		this.ship.scale.setScalar(0.26);
		this.group.add(this.ship);
		this.placeShip(0.5);
		this.group.name = 'lane';
	}

	private placeShip(u: number) {
		const p = this.path.getPointAt(u);
		const tan = this.path.getTangentAt(u);
		this.ship.position.set(p.x, LANE_Y - 0.15, p.z);
		this.ship.rotation.y = Math.atan2(tan.x, tan.z) - Math.PI / 2;
	}

	/** Lights the lane up (it can be crossed right now) or not. */
	setLit(on: number) {
		this.lit = on;
	}

	update(dt: number, t: number) {
		this.shownLit += (this.lit - this.shownLit) * (1 - Math.exp(-dt * 10));
		this.material.emissiveIntensity = this.shownLit * (0.55 + 0.25 * Math.sin(t * 4.2));
		this.ship.position.y = LANE_Y - 0.15 + Math.sin(t * 1.6 + this.a) * 0.06;
		this.ship.rotation.z = Math.sin(t * 1.3 + this.b) * 0.05;
	}

	dispose() {
		this.dashes.geometry.dispose();
		this.material.dispose();
	}
}

// ---------------------------------------------------------------- legend and compass

/**
 * The map's legend on a plank board in the sea: each region's color, name and the armies it is
 * worth each turn, with the sigil of whoever holds all of it.
 */
export class RegionLegend {
	readonly group = new THREE.Group();
	private readonly canvas = document.createElement('canvas');
	private readonly tex: THREE.CanvasTexture;
	private holders: (Holder | null)[] = [];

	constructor(
		readonly map: RealmMap,
		readonly names: string[],
		readonly title: string
	) {
		const rows = map.regions.length;
		const Wv = 56;
		const Dv = 14 + rows * 6;
		this.canvas.width = 640;
		this.canvas.height = Math.round((640 * (Dv - 2)) / (Wv - 2));
		this.tex = new THREE.CanvasTexture(this.canvas);
		this.tex.colorSpace = THREE.SRGBColorSpace;
		this.tex.anisotropy = 8;
		const board = build(`cq-legend:${Wv}x${Dv}`, [Wv, 2, Dv], (g) => {
			for (let z = 0; z < Dv; z++)
				for (let x = 0; x < Wv; x++) {
					const edge = x === 0 || z === 0 || x === Wv - 1 || z === Dv - 1;
					const plank = pick(P_WOOD, hash3(Math.floor(z / 4), 0, Math.floor(x / 19), 5));
					g.set(x, 0, z, shade(plank, 0.8));
					g.set(x, 1, z, edge ? hex('#4e2d14') : shade(plank, 0.95 + hash3(x, 1, z) * 0.08));
				}
		}, [Wv / 2, 0, Dv / 2], 0.6);
		const tilt = new THREE.Group();
		tilt.rotation.x = 0.32;
		tilt.position.y = 2.4 + (Dv * 0.6 * Math.sin(0.32)) / 2 + 0.2;
		tilt.add(board.clone(true));
		const face = new THREE.Mesh(
			new THREE.PlaneGeometry((Wv - 2) * 0.6, (Dv - 2) * 0.6),
			new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9 })
		);
		face.rotation.x = -Math.PI / 2;
		face.position.y = 1.2 + 0.02;
		face.receiveShadow = true;
		tilt.add(face);
		this.group.add(tilt);
		this.group.name = 'legend';
		this.draw();
	}

	setHolders(holders: (Holder | null)[]) {
		const same = holders.length === this.holders.length && holders.every((h, i) => h?.color === this.holders[i]?.color);
		if (same) return;
		this.holders = holders;
		this.draw();
	}

	private draw() {
		const c = this.canvas;
		const ctx = c.getContext('2d')!;
		const W = c.width;
		const H = c.height;
		const grad = ctx.createLinearGradient(0, 0, 0, H);
		grad.addColorStop(0, '#fbecc6');
		grad.addColorStop(1, '#f0d9a6');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, W, H);
		ctx.strokeStyle = 'rgba(120,80,30,0.55)';
		ctx.lineWidth = 6;
		ctx.strokeRect(14, 14, W - 28, H - 28);
		ctx.fillStyle = '#2b1a10';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = '900 50px "Nunito Variable", system-ui, sans-serif';
		ctx.fillText(this.title, W / 2, 62);
		const rowH = (H - 120) / this.map.regions.length;
		this.map.regions.forEach((g, i) => {
			const y = 112 + rowH * (i + 0.5);
			ctx.fillStyle = g.color;
			ctx.strokeStyle = '#2b1a10';
			ctx.lineWidth = 5;
			ctx.beginPath();
			ctx.roundRect(40, y - 20, 44, 40, 8);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = '#2b1a10';
			ctx.textAlign = 'left';
			ctx.font = '900 40px "Nunito Variable", system-ui, sans-serif';
			ctx.fillText(this.names[i], 104, y + 2);
			ctx.textAlign = 'right';
			ctx.font = '900 40px "Nunito Variable", system-ui, sans-serif';
			ctx.fillText(`+${g.bonus}`, W - 104, y + 2);
			const h = this.holders[i];
			if (h) drawSigil(ctx, h.sigil, W - 62, y, 20, `#${h.color.toString(16).padStart(6, '0')}`, '#2b1a10', 4);
		});
		this.tex.needsUpdate = true;
	}

	dispose() {
		this.tex.dispose();
	}
}

const P_WOOD = [hex('#8a5632'), hex('#7a4a28'), hex('#94603a'), hex('#6f4323')];

/** A brass compass rose inlaid in the sea, its north point red. */
function compassRose(): THREE.Group {
	const N = 27;
	return build('cq-compass', [N, 2, N], (g) => {
		const c = (N - 1) / 2;
		for (let z = 0; z < N; z++)
			for (let x = 0; x < N; x++) {
				const dx = x - c;
				const dz = z - c;
				const d = Math.hypot(dx, dz);
				const ring = d > 10.6 && d <= 12.4;
				// A four-pointed star, its points along the axes, a smaller one between them.
				const ax = Math.abs(dx);
				const az = Math.abs(dz);
				const main = ax + az * 4.2 <= 12.5 || az + ax * 4.2 <= 12.5;
				const diag = Math.abs(ax - az) * 2.6 + (ax + az) * 0.45 <= 6.2;
				if (!ring && !main && !diag) continue;
				let col = ring ? (Math.round(Math.atan2(dz, dx) * 8 / Math.PI) % 2 ? hex('#d4a23c') : hex('#e8c063')) : main ? hex('#f3e2b8') : hex('#d4a23c');
				if (main && dz < 0 && az > ax) col = dx < 0 ? hex('#c7261b') : hex('#e0402e');
				else if (main && (dx < 0) !== (dz < 0)) col = shade(col, 0.82);
				g.set(x, 0, z, shade(col, 0.75));
				g.set(x, 1, z, col);
			}
	}, [N / 2, 0, N / 2], 0.6);
}
