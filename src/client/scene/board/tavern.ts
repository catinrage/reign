import * as THREE from 'three';
import { Mat, hash3, hex, pick, shade } from '../voxel/grid';
import type { Footprint } from './annex';
import { PIECE, STONE, WINDOW, build, cloneModel } from './models';

/**
 * Reign Extended taverns: a little inn set against one wall of its owner's settlement or city, its
 * gable out to the open ground. Its timbers are painted in the owner's color between white
 * plaster, it is thatched with straw, its windows and open door glow, and a golden tankard hangs
 * from a beam over the door. It is built at twice a piece's detail, like the storehouse, so its
 * shutters, bench and lantern fit on something this small.
 */

const PLASTER = [hex('#efe4c8'), hex('#e6d9b8'), hex('#f4ead2')];
/** Old straw, greyer than ripe wheat or sand, so the roof stands out on a field or the desert. */
const THATCH = [hex('#b99a62'), hex('#a98b56'), hex('#c4a46c'), hex('#9c7f4e')];
const TIMBER = [hex('#7a4a28'), hex('#6a3f22'), hex('#8a5632')];
const PLANK = [hex('#a76b38'), hex('#95602f'), hex('#b37742')];
/** The light of the hearth through the open door. */
const HEARTH = hex('#e8913a');
const IRON = hex('#3b3a40');
const BEER = [hex('#f2a52c'), hex('#e8962a'), hex('#f7b53e')];
const FOAM = [hex('#fffaf0'), hex('#f3ece0')];

/** Cells per piece voxel. */
const FINE = 2;
/** Rows of stone footing below the ground, which show where the land falls away (on a shore). */
const FOOT = 4;
/** The grid cell at the middle of the tavern's back, on the ground. */
const C = [6, FOOT, 0] as const;
/** A point in the tavern's grid, in piece voxels from its origin. */
const at = (x: number, y: number, z: number) => new THREE.Vector3((x - C[0]) / FINE, (y - C[1]) / FINE, (z - C[2]) / FINE);

/** Where the tankard hangs from: the end of the ridge beam, out over the door. */
const HOOK = at(6, FOOT + 10, 8.5);
/** The top of the hearth's chimney, where its smoke rises. */
export const TAVERN_CHIMNEY = at(9, FOOT + 12, 2);

/**
 * A tavern's body in its owner's color: a timber-framed inn of white plaster under a steep thatched
 * roof, its gable out front and its back at the origin, facing +z. In piece voxels it is 4 wide,
 * 3 deep and 5.5 tall at the ridge, which runs out from the house it leans on and is capped in the
 * owner's color. Glowing windows with painted shutters, an open door with the hearth's light in
 * it, a lantern, a bench and a barrel; a stone chimney up the side.
 */
export function tavernModel(color: number): THREE.Group {
	return build(
		`tavern:${color}`,
		[12, FOOT + 13, 9],
		(g) => {
			const G = FOOT;
			const frame = (x: number, y: number, z: number) => shade(color, 0.62 + hash3(x, y, z, 2) * 0.08);
			const plaster = (x: number, y: number, z: number) => shade(pick(PLASTER, hash3(x, y, z, 3)), 0.97 + hash3(x, y, z, 4) * 0.05);
			// The footing, its top course just above the ground.
			g.box(2, 0, 0, 9, G, 5, (x, y, z) => shade(pick(STONE, hash3(x, y, z, 1)), y === G ? 0.92 : 0.8));
			// Plaster walls between timbers: posts at the corners and by the door, a plate along the top.
			g.box(2, G + 1, 0, 9, G + 5, 5, (x, y, z) => {
				if (x > 2 && x < 9 && z > 0 && z < 5) return -1;
				const corner = (x === 2 || x === 9) && (z === 0 || z === 5);
				if (corner || y === G + 5 || (z === 5 && x === 5 && y <= G + 4)) return frame(x, y, z);
				return plaster(x, y, z);
			});
			// The front: a window on the left, the door ajar on the hearth's light, a lintel over it.
			g.box(3, G + 2, 5, 4, G + 3, 5, WINDOW, Mat.Glow);
			g.box(6, G + 1, 6, 6, G + 3, 6, (x, y, z) => pick(TIMBER, hash3(x, y, z, 10)));
			g.box(6, G + 1, 5, 7, G + 3, 5, (x, y) => shade(HEARTH, y === G + 1 ? 0.8 : 1), Mat.Glow);
			g.box(6, G + 4, 5, 8, G + 4, 5, frame);
			// A window in each side, its shutters swung open in the owner's color.
			for (const [x, out] of [
				[2, 1],
				[9, 10]
			]) {
				g.box(x, G + 2, 2, x, G + 3, 3, WINDOW, Mat.Glow);
				for (const z of [1, 4]) g.box(out, G + 2, z, out, G + 3, z, (xx, y, zz) => shade(color, 0.95 + hash3(xx, y, zz, 5) * 0.1));
			}
			// The thatch in steps up to the ridge, which runs out from the house and is capped in the
			// owner's color; under it, plaster fills the gable, with a lit window in the loft.
			for (let k = 0; k <= 4; k++) {
				const y = G + 6 + k;
				g.box(1 + k, y, 0, 10 - k, y, 6, (x, _y, z) => {
					const edge = x === 1 + k || x === 10 - k;
					if (k === 4) return shade(color, 0.8 + hash3(x, y, z, 6) * 0.1);
					if (edge) return shade(pick(THATCH, hash3(x, y, z, 7)), (k === 0 ? 0.88 : 1) * (z % 2 ? 0.95 : 1.03));
					if (z === 6) return -1;
					return z === 5 || z === 0 ? plaster(x, y, z) : shade(pick(THATCH, hash3(x, y, z, 7)), 0.8);
				});
			}
			g.box(5, G + 7, 5, 6, G + 8, 5, WINDOW, Mat.Glow);
			// The ridge runs on out over the door as a beam to hang the sign from.
			g.box(5, G + 10, 7, 6, G + 10, 8, (x, y, z) => (z === 8 ? shade(color, 0.7) : shade(color, 0.8 + hash3(x, y, z, 6) * 0.1)));
			// The hearth's chimney up the right of the roof.
			g.box(8, G + 6, 1, 9, G + 11, 2, (x, y, z) => (y === G + 11 ? shade(IRON, 1.2) : shade(pick(STONE, hash3(x, y, z, 8)), 0.95)));
			// A lantern by the door, on its bracket.
			g.set(8, G + 3, 6, hex('#ffb347'), Mat.Fire);
			g.set(8, G + 4, 6, IRON);
			// A bench under the window, a tankard left on it.
			g.box(2, G + 1, 6, 4, G + 1, 6, (x, y, z) => pick(PLANK, hash3(x, y, z, 9)));
			for (const x of [2, 4]) g.set(x, G, 6, pick(TIMBER, x));
			g.set(3, G + 2, 6, BEER[0]);
			// A barrel by the door, hooped in iron.
			g.box(9, G, 6, 10, G + 2, 7, (x, y, z) => (y === G + 1 ? IRON : y === G + 2 ? shade(pick(PLANK, hash3(x, y, z, 4)), 1.12) : pick(TIMBER, hash3(x, y, z, 3))));
		},
		[...C],
		1 / FINE,
		PIECE
	);
}

/** The tavern's sign: a tankard of ale frothing over, on a short chain; the hook is at the origin. */
function tankardModel() {
	return build(
		'tavern:tankard',
		[7, 9, 5],
		(g) => {
			const round = (x: number, z: number) => (x === 0 || x === 4) && (z === 0 || z === 4);
			// The glass, lit from the left, and a darker foot.
			g.box(0, 0, 0, 4, 4, 4, (x, y, z) => {
				if (round(x, z)) return -1;
				return shade(pick(BEER, hash3(x, y, z, 1)), y === 0 ? 0.78 : x < 2 ? 1.08 : x > 2 ? 0.9 : 1);
			});
			// The head of foam spills over the rim and runs down the front.
			g.box(0, 5, 0, 4, 5, 4, (x, y, z) => (round(x, z) ? -1 : pick(FOAM, hash3(x, y, z, 2))));
			g.box(1, 6, 1, 3, 6, 3, (x, y, z) => pick(FOAM, hash3(x, y, z, 3)));
			g.box(1, 3, 4, 1, 4, 4, FOAM[0]);
			// The handle.
			for (const [x, y] of [
				[5, 1],
				[6, 1],
				[6, 2],
				[6, 3],
				[5, 4],
				[6, 4]
			])
				g.box(x, y, 2, x, y, 2, shade(BEER[1], 0.85));
			// The chain.
			g.box(2, 7, 2, 2, 8, 2, (_x, y) => (y % 2 ? IRON : shade(IRON, 1.3)));
		},
		[2.5, 9, 2.5],
		1 / 4,
		PIECE
	);
}

/** A tavern in its owner's color, ready to place: its back at the origin against the wall, facing +z. Clone-safe: the sign is found by name. */
export function tavernObject(color: number): THREE.Group {
	const root = new THREE.Group();
	root.add(cloneModel(tavernModel(color)));
	const sign = new THREE.Group();
	sign.name = 'sign';
	sign.position.copy(HOOK);
	sign.add(cloneModel(tankardModel()));
	root.add(sign);
	return root;
}

/** Keep a tavern's sign swinging on its hook in the wind. `t` is the scene clock in seconds. */
export function animateTavern(obj: THREE.Object3D, t: number) {
	const time = t + (obj.userData.phase ??= Math.random() * 100);
	const sign = obj.getObjectByName('sign');
	if (!sign) return;
	sign.rotation.x = Math.sin(time * 1.2) * 0.18 + Math.sin(time * 2.9) * 0.04;
	sign.rotation.z = Math.sin(time * 0.8 + 1) * 0.08;
}

/** The ground a tavern takes against its building's wall (see annex.ts). */
export const TAVERN_SIZE: Footprint = { depth: 3.75, half: 2.5 };
