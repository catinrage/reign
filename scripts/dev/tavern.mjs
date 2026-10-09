// Dev: Reign Extended taverns on the board (no game server needed). Settlements, cities and a
// castle of three colors stand on corners round the island, each with a tavern, some of them on
// the shore; every other one has a storehouse too, built before the tavern or after it, so the two
// share the building's walls. Then a settlement grows into a city to show both move to the city's
// walls. Shots: the island, each building close up, and with PICK=1 the tavern pick (markers over
// your buildings, the tavern's ghost against the wall it would go on, clear of the storehouse).
// Math.random is seeded, so every run deals the same island.
// Usage: BASE=http://localhost:5173 node scripts/dev/tavern.mjs <outPrefix> [width] [height]
// Options: ONLY=island,0,3 picks the shots, FACE=1 looks at each tavern from the front, RAD/POL/AZ
// set the camera, GROW=1 and PICK=1 add the shots after them, QUALITY=veryLow draws faster.
import { chromium } from 'playwright';
const [out = '/tmp/tavern', w = '1280', h = '800'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.setDefaultTimeout(120000);
await page.addInitScript((q) => {
	if (q) localStorage.setItem('reign:quality', q);
	let a = 20261009;
	Math.random = () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}, process.env.QUALITY ?? '');
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
	const players = colors.map((color, i) => ({ color, name: color, id: i }));
	const board = s.boardView.board;
	const topo = getTopology(board);
	const buildings = topo.vertices.map(() => null);
	const storehouses = topo.vertices.map(() => false);
	const taverns = topo.vertices.map(() => false);
	const cityPaths = topo.vertices.map(() => null);
	const builtTurns = {};
	const taken = new Set();
	const out = [];
	// Corners spread round the island, inland ones and shore ones, kept two roads apart.
	const order = topo.vertices.map((v, i) => i).sort((a, b) => ((a * 7919) % 97) - ((b * 7919) % 97));
	for (const v of order) {
		if (out.length >= 9) break;
		if (taken.has(v)) continue;
		const shore = topo.vertices[v].hexes.length < 3;
		if (shore && out.filter((o) => o.shore).length >= 3) continue;
		const owner = out.length % 3;
		const kind = out.length % 2 ? 'city' : 'settlement';
		buildings[v] = { owner, kind };
		// The eighth is a castle.
		if (out.length === 7) cityPaths[v] = 'castle';
		taverns[v] = true;
		// Every other one has a storehouse, built before the tavern (on turns 4 and 9) or after it.
		const store = out.length % 2 === 0;
		storehouses[v] = store;
		builtTurns[`tavern:${v}`] = 6;
		if (store) builtTurns[`storehouse:${v}`] = out.length % 4 === 0 ? 4 : 9;
		taken.add(v);
		for (const n of topo.vertices[v].neighbors) {
			taken.add(n);
			for (const m of topo.vertices[n].neighbors) taken.add(m);
		}
		out.push({ v, owner, kind: cityPaths[v] ?? kind, shore, store, terrain: topo.vertices[v].hexes.map((x) => board.hexes[x].terrain) });
	}
	const view = {
		board,
		robberHex: board.hexes.findIndex((hx) => hx.terrain === 'desert'),
		log: [],
		me: 0,
		current: 0,
		turn: 12,
		phase: 'main',
		step: 'main',
		players,
		buildings,
		roads: topo.edges.map(() => null),
		stoneRoads: topo.edges.map(() => false),
		storehouses,
		taverns,
		cityPaths,
		builtTurns,
		workshops: board.hexes.map(() => null),
		buildingRules: { workshop: true, stoneRoad: true, storehouse: true, tavern: true, castle: true, guildHall: true, fortress: true }
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
// ONLY picks the shots: building indices, and 'island' for the whole island.
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const az = Number(process.env.AZ ?? -0.62);
if (!only || only.includes('island')) {
	await rig({ radius: 250, polar: 0.82, azimuth: az, target: { x: 0, y: 0, z: 0 } });
	await shot('island');
}
for (const [i, sp] of spots.entries()) {
	if (only && !only.includes(String(i))) continue;
	// FACE=1 looks at each tavern from the front.
	const facing = process.env.FACE
		? await page.evaluate((v) => [...window.__scene.pieces.values()].find((p) => p.key.startsWith(`t${v}:`)).obj.rotation.y, sp.v)
		: az;
	await rig({ radius: Number(process.env.RAD ?? 30), polar: Number(process.env.POL ?? 0.9), azimuth: facing, target: sp.at });
	await shot(`${i}-${sp.kind}`);
}
if (process.env.GROW) {
	// The first settlement grows into a city: its tavern and storehouse move to the city's walls.
	const s0 = spots.find((sp) => sp.kind === 'settlement');
	await page.evaluate((v) => {
		const s = window.__scene;
		const buildings = s.view.buildings.slice();
		buildings[v] = { ...buildings[v], kind: 'city' };
		s.setView({ ...s.view, buildings });
	}, s0.v);
	await rig({ radius: 30, polar: 0.9, azimuth: az, target: s0.at });
	await shot('grown');
}
if (process.env.PICK) {
	// The tavern of the first building with a storehouse comes down, to be built again.
	const s0 = spots.find((sp) => sp.store);
	await page.evaluate(([v, owner]) => {
		const s = window.__scene;
		const taverns = s.view.taverns.slice();
		taverns[v] = false;
		s.setView({ ...s.view, taverns });
		s.setPick({ kind: 'tavern', options: [v], color: ['red', 'blue', 'white'][owner], onPick: () => {} });
	}, [s0.v, s0.owner]);
	// FACE=1 looks at the wall the tavern would go on.
	const facing = process.env.FACE
		? await page.evaluate(() => window.__scene.ghosts.getObjectByName('ghost').rotation.y)
		: az;
	await rig({ radius: Number(process.env.RAD ?? 40), polar: Number(process.env.POL ?? 0.9), azimuth: facing, target: s0.at });
	await shot('pick');
	const pt = await page.evaluate((id) => window.__scene.debugPickPoints().find((p) => p.id === id), s0.v);
	await page.mouse.move(pt.x, pt.y);
	await shot('ghost');
}
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
