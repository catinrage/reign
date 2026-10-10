// Dev: night mode on an island in mid-game (settlements, cities and roads for four players),
// by day and at night: the whole table, a close look at a village, and the room round it.
// Usage: BASE=http://localhost:5173 node scripts/dev/night.mjs <outPrefix> [width] [height]
// QUALITY=medium|low takes them at that graphics level; ONLY=night skips the day shots.
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/night', w = '1280', h = '800'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.addInitScript((quality) => {
	let a = 20261010;
	Math.random = () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	if (quality) localStorage.setItem('reign:graphics', quality);
}, process.env.QUALITY ?? '');
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()));
await signIn(page, base);
await page.goto(`${base}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
// The home screen deals its own island a moment after it is ready; set up after that.
await page.waitForTimeout(7000);

const village = await page.evaluate(() => {
	document.getElementById('app').style.display = 'none';
	const s = window.__scene;
	const colors = ['red', 'blue', 'yellow', 'green'];
	const players = colors.map((c, i) => ({ color: c, name: c, id: i }));
	const board = s.boardView.board;
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
	const roads = [];
	let nE = 0;
	try {
		for (;;) {
			bv.edgePos(nE);
			nE++;
		}
	} catch {}
	for (let e = 0; e < nE; e++) roads.push(null);
	// Spread pieces round the island: every fifth corner far enough from the last ones.
	const near = (a, b) => Math.hypot(V[a].x - V[b].x, V[a].z - V[b].z) < 13;
	let k = 0;
	for (let v = 0; v < nV && k < 16; v += 5) {
		if (buildings.some((b, i) => b && near(v, i))) continue;
		buildings[v] = { owner: k % 4, kind: k % 3 === 0 ? 'city' : 'settlement' };
		k++;
	}
	// A road from each building towards the nearest edge.
	buildings.forEach((b, v) => {
		if (!b) return;
		let best = -1;
		let bd = 1e9;
		for (let e = 0; e < nE; e++) {
			const p = bv.edgePos(e).pos;
			const d = Math.hypot(p.x - V[v].x, p.z - V[v].z);
			if (d < bd && roads[e] === null) {
				bd = d;
				best = e;
			}
		}
		if (best >= 0) roads[best] = b.owner;
	});
	s.setView({ board, robberHex: board.hexes.findIndex((hx) => hx.terrain === 'desert'), log: [], me: 0, current: 0, phase: 'main', step: 'main', players, buildings, roads });
	const v = buildings.findIndex((b) => b && b.kind === 'city');
	// Look at the city from its door's side (its front faces +z before it is turned).
	const city = [...s.pieces.values()].find((p) => p.key.startsWith(`v${v}:`));
	return { x: V[v].x, y: V[v].y, z: V[v].z, yaw: (city?.obj.rotation.y ?? 0) };
});

const rig = (o) => page.evaluate((o) => window.__scene.stage.rig.set(o, true), o);
const night = (on) =>
	page.evaluate((on) => {
		const s = window.__scene;
		s.stage.setNight(on, true);
		s.stage.lighting.update(0, 0);
		// Swiftshader draws a frame every second or two: let a few seconds of fireflies and
		// chimney sparks play out without drawing them.
		for (let i = 0; on && i < 120; i++) {
			s.fireflies(0.05);
			s.smoke(0.05);
			s.nightLights.update(0.05);
			s.particles.update(0.05);
		}
	}, on);
const shot = async (name) => {
	await page.waitForTimeout(2500);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
const views = [
	['table', { radius: 210, polar: 0.82, azimuth: -0.62, target: { x: 0, y: 0, z: 0 } }],
	['close', { radius: 70, polar: 0.92, azimuth: -0.62, target: { x: village.x, y: village.y + 2, z: village.z } }],
	['village', { radius: 48, polar: 0.78, azimuth: village.yaw, target: { x: village.x, y: village.y + 2, z: village.z } }],
	['room', { radius: 300, polar: 1.12, azimuth: 0.9, target: { x: 0, y: 0, z: 0 } }]
];
for (const [name, view] of views) {
	await rig(view);
	if (process.env.ONLY !== 'night') {
		await night(false);
		await shot(`${name}-day`);
	}
	await night(true);
	await shot(`${name}-night`);
}
if (errors.length) console.log('errors', errors);
await browser.close();
