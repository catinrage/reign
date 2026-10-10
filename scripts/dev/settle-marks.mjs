// Dev: the settlement placement marks (corner brackets) on a fresh island, as at the start of
// a game: every corner on offer, a couple of pieces already down. Shots from about where a
// player sits, close up, and close up with the pointer on one of them (its ghost house showing).
// Usage: BASE=http://localhost:8787 node scripts/dev/settle-marks.mjs <outPrefix> [width] [height]
// QUALITY=low takes them at Low graphics; COLOR=blue places as another player.
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/settle', w = '1280', h = '800'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.addInitScript((quality) => {
	let a = 20261009;
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

const target = await page.evaluate((color) => {
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
	// Two settlements already down, far apart; nothing within one road of them is on offer.
	const centre = V.reduce((a, p) => ({ x: a.x + p.x / nV, z: a.z + p.z / nV }), { x: 0, z: 0 });
	const byDist = [...V.keys()].sort((a, b) => Math.hypot(V[a].x - centre.x, V[a].z - centre.z) - Math.hypot(V[b].x - centre.x, V[b].z - centre.z));
	buildings[byDist[3]] = { owner: 1, kind: 'settlement' };
	buildings[byDist[12]] = { owner: 2, kind: 'settlement' };
	const near = (a, b) => Math.hypot(V[a].x - V[b].x, V[a].z - V[b].z) < 13;
	const options = [...V.keys()].filter((v) => buildings.every((b, i) => !b || !near(v, i)));
	s.setView({ board, robberHex: board.hexes.findIndex((hx) => hx.terrain === 'desert'), log: [], me: 0, current: 0, phase: 'setup', step: 'setupSettlement', players, buildings, roads: [] });
	s.setPick({ kind: 'settlement', options, color, onPick: () => {} });
	const id = byDist.find((v) => options.includes(v));
	const t = V[id];
	return { x: t.x, y: t.y, z: t.z, id };
}, process.env.COLOR ?? 'red');

const rig = (o) => page.evaluate((o) => window.__scene.stage.rig.set(o, true), o);
const shot = async (name) => {
	await page.waitForTimeout(1500);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
await rig({ radius: 210, polar: 0.82, azimuth: -0.62, target: { x: 0, y: 0, z: 0 } });
await shot('island');
await rig({ radius: 120, polar: 0.86, azimuth: -0.62, target: { x: target.x, y: 0, z: target.z } });
await shot('play');
await rig({ radius: 70, polar: 0.8, azimuth: -0.62, target: { x: target.x, y: target.y + 2, z: target.z } });
await shot('close');
const pt = await page.evaluate((id) => window.__scene.debugPickPoints().find((p) => p.id === id), target.id);
if (pt) {
	await page.mouse.move(pt.x, pt.y);
	await shot('hover');
}
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
