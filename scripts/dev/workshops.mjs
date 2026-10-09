// Dev: the Reign Extended workshops on the board (no game server needed). One of each, in
// different colors, each on a tile beside its owner's settlement; then a shot of the island and
// a close-up of each workshop. Math.random is seeded, so every run deals the same island.
// Usage: BASE=http://localhost:5173 node scripts/dev/workshops.mjs <outPrefix> [width] [height]
// ONLY=island,play,mill,... takes just those shots; PICK=1 also shows the workshop picking ghosts.
import { chromium } from 'playwright';
const [out = '/tmp/workshops', w = '1280', h = '800'] = process.argv.slice(2);
const only = process.env.ONLY?.split(',');
const want = (name) => !only || only.includes(name);
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
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

const shops = await page.evaluate(() => {
	document.getElementById('app').style.display = 'none';
	const s = window.__scene;
	const colors = ['red', 'blue', 'yellow', 'green', 'white', 'orange'];
	const players = colors.map((color, i) => ({ color, name: color, id: i }));
	const board = s.boardView.board;
	// Deal the view once with plots, so positions below come from the island with plots.
	const base = { board, robberHex: board.hexes.findIndex((hx) => hx.terrain === 'desert'), log: [], me: 0, current: 0, phase: 'main', step: 'main', players, buildings: [], roads: [], workshops: board.hexes.map(() => null), buildingRules: { workshop: true } };
	s.setView(base);
	const bv = s.boardView;
	let nV = 0;
	try {
		for (;;) {
			bv.vertexPos(nV);
			nV++;
		}
	} catch {}
	const V = [...Array(nV)].map((_, v) => bv.vertexPos(v));
	const buildings = Array(nV).fill(null);
	const workshops = board.hexes.map(() => null);
	const plan = [
		['fields', 'mill', 3],
		['forest', 'sawmill', 0],
		['hills', 'kiln', 1],
		['mountains', 'mine', 2],
		['pasture', 'fold', 4]
	];
	const placed = [];
	for (const [terrain, name, owner] of plan) {
		const hex = board.hexes.findIndex((hx) => hx.terrain === terrain);
		if (hex < 0) continue;
		const c = bv.hexCenter(hex);
		const v = V.findIndex((p, i) => Math.abs(Math.hypot(p.x - c.x, p.z - c.z) - 12) < 0.8 && !buildings[i]);
		buildings[v] = { owner, kind: owner % 2 ? 'city' : 'settlement' };
		workshops[hex] = owner;
		const spot = bv.plotSpot(hex);
		placed.push({ name, hex, at: { x: spot.pos.x, y: spot.pos.y, z: spot.pos.z }, angle: spot.angle });
	}
	// Deal it again as a fresh island, so the pieces are simply there (no drop-in dust).
	s.boardKey = '';
	s.setView({ ...base, buildings, workshops, log: [] });
	return placed;
});
console.log(JSON.stringify(shops));

const rig = (o) => page.evaluate((o) => window.__scene.stage.rig.set(o, true), o);
const shot = async (name) => {
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
if (want('island')) {
	await page.evaluate(() => window.__scene.stage.rig.set({ radius: 250, polar: 0.82, azimuth: -0.62 }, true));
	await shot('island');
}
if (want('play')) {
	// About how close a player zooms in to play, looking at the workshops from the first seat.
	const c = shops.reduce((a, sp) => ({ x: a.x + sp.at.x / shops.length, z: a.z + sp.at.z / shops.length }), { x: 0, z: 0 });
	await rig({ radius: 130, polar: 0.86, azimuth: -0.62, target: { x: c.x, y: 0, z: c.z } });
	await shot('play');
}
for (const sp of shops) {
	if (!want(sp.name)) continue;
	// Look at it from outside its tile, a little to one side.
	const az = Math.atan2(Math.cos(sp.angle), Math.sin(sp.angle)) + 0.5;
	await rig({ radius: 48, polar: 0.92, azimuth: az, target: { x: sp.at.x, y: sp.at.y + 2, z: sp.at.z } });
	await shot(sp.name);
}
if (process.env.PICK) {
	await page.evaluate(() => {
		const s = window.__scene;
		const opts = s.boardView.board.hexes.map((_, i) => i).filter((i) => s.boardView.plotSpot(i));
		s.setPick({ kind: 'workshop', options: opts, color: 'red', onPick: () => {} });
		s.stage.rig.set({ radius: 200, polar: 0.8, azimuth: -0.62, target: { x: 0, y: 0, z: 0 } }, true);
	});
	await shot('pick');
}
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
