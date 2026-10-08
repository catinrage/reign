import {
	STANDARD_NUMBER_POOL,
	STANDARD_PORT_POOL,
	STANDARD_TERRAIN_POOL,
	type PortKind
} from '../rules/config';
import { randomInt, shuffle } from '../rng';
import { hexesInRadius } from './hex';
import { type Board, type BoardHex, buildTopology } from './topology';

/** Random classic island: 19 tiles, no two red numbers (6 and 8) touching, 9 harbors. */
export function generateStandardBoard(rngState: { rng: number }): Board {
	const coords = hexesInRadius(2);
	for (let attempt = 0; attempt < 500; attempt++) {
		const terrains = shuffle(rngState, [...STANDARD_TERRAIN_POOL]);
		const numbers = shuffle(rngState, [...STANDARD_NUMBER_POOL]);
		let n = 0;
		const hexes: BoardHex[] = coords.map((c, i) => ({
			q: c.q,
			r: c.r,
			terrain: terrains[i],
			number: terrains[i] === 'desert' ? null : numbers[n++]
		}));
		const board: Board = { hexes, ports: [] };
		const topo = buildTopology(board);
		const redTouching = topo.hexes.some(
			(h) =>
				isRed(hexes[h.id].number) && h.neighbors.some((nb) => isRed(hexes[nb].number))
		);
		const sameTouching = topo.hexes.some((h) =>
			h.neighbors.some((nb) => hexes[nb].number !== null && hexes[nb].number === hexes[h.id].number)
		);
		if (redTouching || (sameTouching && attempt < 400)) continue;
		board.ports = placePorts(board, rngState);
		return board;
	}
	throw new Error('Could not generate a board');
}

function isRed(n: number | null) {
	return n === 6 || n === 8;
}

function placePorts(board: Board, rngState: { rng: number }) {
	const topo = buildTopology(board);
	const coastal = topo.edges
		.filter((e) => e.coastal)
		.map((e) => {
			const a = topo.vertices[e.a];
			const b = topo.vertices[e.b];
			return { e, angle: Math.atan2((a.z + b.z) / 2, (a.x + b.x) / 2) };
		})
		.sort((x, y) => x.angle - y.angle);
	const kinds = shuffle(rngState, [...STANDARD_PORT_POOL]) as PortKind[];
	const gaps = [3, 3, 4, 3, 3, 4, 3, 3, 4];
	const offset = randomInt(rngState, coastal.length);
	let idx = offset;
	return kinds.map((kind, i) => {
		const edge = coastal[idx % coastal.length].e;
		idx += gaps[i];
		const hex = edge.hexes[0];
		const side = topo.hexes[hex].edges.indexOf(edge.id);
		return { hex, side, kind };
	});
}
