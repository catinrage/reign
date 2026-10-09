// Dev: Reign Extended city paths on the board (no game server needed). Castles, guild halls and
// fortresses of three colors stand on corners round the island (the guild halls trading different
// goods), some with a storehouse; then a city takes a path to show the change, and with PICK=1 the
// path pick (markers over your cities, the path's ghost on hover).
// Math.random is seeded, so every run deals the same island.
// Usage: BASE=http://localhost:5173 node scripts/dev/city-paths.mjs <outPrefix> [width] [height]
// Options: ONLY=island,0,3 picks the shots, RAD/POL/AZ set the camera (FACE=<radians> looks at
// each piece from its front, turned that far round), GROW=1 and PICK=castle|guildHall|fortress add
// the shots after them.
import { chromium } from 'playwright';
const [out = '/tmp/city-paths', w = '1280', h = '800'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.setDefaultTimeout(120000);
await page.addInitScript(() => {
	let a = 20261009;
	Math.random = () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()));
await page.goto(`${process.env.BASE ?? 'http://localhost:5173'}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(2500);

const spots = await page.evaluate(async (root) => {
	const { getTopology } = await import(`/@fs${root}/src/shared/board/topology.ts`);
	document.getElementById('app').style.display = 'none';
	const s = window.__scene;
	const colors = ['red', 'blue', 'white'];
	const players = colors.map((color, i) => ({ color, name: color, id: i, knightsPlayed: 0 }));
	const board = s.boardView.board;
	const topo = getTopology(board);
	const buildings = topo.vertices.map(() => null);
	const storehouses = topo.vertices.map(() => false);
	const cityPaths = topo.vertices.map(() => null);
	const guildGoods = topo.vertices.map(() => null);
	const taken = new Set();
	const out = [];
	const paths = ['castle', 'guildHall', 'fortress'];
	const goods = ['wheat', 'ore', 'wood', 'brick', 'sheep'];
	// Corners spread round the island, kept two roads apart.
	const order = topo.vertices.map((v, i) => i).sort((a, b) => ((a * 7919) % 97) - ((b * 7919) % 97));
	for (const v of order) {
		if (out.length >= 9) break;
		if (taken.has(v)) continue;
		const owner = out.length % 3;
		const path = paths[Math.floor(out.length / 3)];
		buildings[v] = { owner, kind: 'city' };
		cityPaths[v] = path;
		if (path === 'guildHall') guildGoods[v] = goods[owner];
		storehouses[v] = out.length % 4 === 1;
		taken.add(v);
		for (const n of topo.vertices[v].neighbors) {
			taken.add(n);
			for (const m of topo.vertices[n].neighbors) taken.add(m);
		}
		out.push({ v, owner, path, store: storehouses[v], terrain: topo.vertices[v].hexes.map((x) => board.hexes[x].terrain) });
	}
	// A plain city to grow, and roads off every building.
	const roads = topo.edges.map(() => null);
	for (const o of out) roads[topo.vertices[o.v].edges[0]] = o.owner;
	const view = {
		board,
		robberHex: board.hexes.findIndex((hx) => hx.terrain === 'desert'),
		log: [],
		me: 0,
		current: 0,
		phase: 'main',
		step: 'main',
		players,
		buildings,
		roads,
		stoneRoads: topo.edges.map(() => false),
		storehouses,
		cityPaths,
		guildGoods,
		workshops: board.hexes.map(() => null),
		buildingRules: { workshop: true, stoneRoad: true, storehouse: true, castle: true, guildHall: true, fortress: true }
	};
	s.boardKey = '';
	s.setView(view);
	return out.map((o) => ({ ...o, at: s.boardView.vertexPos(o.v) }));
}, process.cwd());
console.log(JSON.stringify(spots.map(({ at, ...o }) => o)));

const rig = (o) => page.evaluate((o) => window.__scene.stage.rig.set(o, true), o);
const shot = async (name) => {
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const az = Number(process.env.AZ ?? -0.62);
if (!only || only.includes('island')) {
	await rig({ radius: Number(process.env.IRAD ?? 250), polar: Number(process.env.IPOL ?? 0.82), azimuth: az, target: { x: 0, y: 0, z: 0 } });
	await shot('island');
}
for (const [i, sp] of spots.entries()) {
	if (only && !only.includes(String(i))) continue;
	// FACE=1 looks at each piece from its front.
	// FACE=<turn> looks at each piece from its front, turned that many radians round it.
	const facing = process.env.FACE
		? Number(process.env.FACE) +
			(await page.evaluate((v) => [...window.__scene.pieces.values()].find((p) => p.key.startsWith(`v${v}:`)).obj.rotation.y, sp.v))
		: az;
	await rig({ radius: Number(process.env.RAD ?? 34), polar: Number(process.env.POL ?? 0.95), azimuth: facing, target: sp.at });
	await shot(`${i}-${sp.path}`);
}
if (process.env.GROW) {
	// A castle loses its path for a moment and takes it again: the city turns into it.
	const s0 = spots[0];
	await page.evaluate((v) => {
		const s = window.__scene;
		const cityPaths = s.view.cityPaths.slice();
		cityPaths[v] = null;
		s.setView({ ...s.view, cityPaths });
	}, s0.v);
	await rig({ radius: 34, polar: 0.95, azimuth: az, target: s0.at });
	await shot('before');
	await page.evaluate((v) => {
		const s = window.__scene;
		const cityPaths = s.view.cityPaths.slice();
		cityPaths[v] = 'castle';
		s.setView({ ...s.view, cityPaths });
	}, s0.v);
	await shot('after');
}
if (process.env.PICK) {
	const s0 = spots[0];
	await page.evaluate(([v, owner, kind]) => {
		const s = window.__scene;
		const cityPaths = s.view.cityPaths.slice();
		cityPaths[v] = null;
		s.setView({ ...s.view, cityPaths });
		s.setPick({ kind, options: [v], color: ['red', 'blue', 'white'][owner], onPick: () => {} });
	}, [s0.v, s0.owner, process.env.PICK]);
	await rig({ radius: Number(process.env.RAD ?? 40), polar: Number(process.env.POL ?? 0.9), azimuth: az, target: s0.at });
	await shot('pick');
	const pt = await page.evaluate((id) => window.__scene.debugPickPoints().find((p) => p.id === id), s0.v);
	await page.mouse.move(pt.x, pt.y);
	await shot('ghost');
}
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
