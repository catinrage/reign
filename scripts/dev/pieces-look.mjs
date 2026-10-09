// Dev: put pieces of every color on chosen tiles (no game server needed) and take shots at
// game distance and close up: pieces against the terrain, your tiles' rings, a held harbor,
// and the dice. Math.random is seeded, so every run (and every build) gets the same island.
// Usage: BASE=http://localhost:8787 node scripts/dev/pieces-look.mjs <outPrefix> [width] [height]
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/pieces', w = '1280', h = '800'] = process.argv.slice(2);
// BOARD=<file> reuses an island saved by an earlier run (<outPrefix>-board.json).
// ONLY=game,mine,... takes just those shots.
const only = process.env.ONLY?.split(',');
const want = (name) => !only || only.includes(name);
const injected = process.env.BOARD ? JSON.parse(readFileSync(process.env.BOARD, 'utf8')) : null;
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
page.on(
	'console',
	(m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text())
);
await signIn(page, process.env.BASE ?? 'http://localhost:8787');
await page.goto(`${process.env.BASE ?? 'http://localhost:8787'}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(3000);

const spots = await page.evaluate(
	({ mine, injected }) => {
		document.getElementById('app').style.display = 'none';
		const s = window.__scene;
		const colors = ['red', 'blue', 'yellow', 'green', 'white', 'orange'];
		const players = colors.map((color, i) => ({ color, name: color, id: i }));
		if (injected) {
			const robberHex = injected.hexes.findIndex((hx) => hx.terrain === 'desert');
			s.setView({
				board: injected,
				robberHex,
				log: [],
				me: mine,
				players,
				buildings: [],
				roads: []
			});
		}
		const bv = s.boardView;
		const board = bv.board;
		let nV = 0;
		try {
			for (;;) {
				bv.vertexPos(nV);
				nV++;
			}
		} catch {}
		let nE = 0;
		try {
			for (;;) {
				bv.edgePos(nE);
				nE++;
			}
		} catch {}
		const V = [...Array(nV)].map((_, v) => bv.vertexPos(v));
		const E = [...Array(nE)].map((_, e) => bv.edgePos(e).pos);
		const near = (a, b, d) => Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - d) < 0.8;
		const buildings = Array(nV).fill(null);
		const roads = Array(nE).fill(null);
		const taken = [];
		const placed = [];
		const free = (p) => taken.every((t) => Math.hypot(p.x - V[t].x, p.z - V[t].z) > 20);
		const put = (v, owner, kind, label, around) => {
			taken.push(v);
			buildings[v] = { kind, owner };
			let n = 0;
			E.forEach((m, e) => {
				if (n < 2 && near(m, V[v], 6) && (!around || near(m, around, 10.39))) {
					roads[e] = owner;
					n++;
				}
			});
			placed.push({ label, v, owner, kind, at: { x: V[v].x, y: V[v].y, z: V[v].z } });
		};
		// [terrain, player, kind]: green and yellow where they blend in, the rest round about.
		const plan = [
			['forest', 3, 'settlement'],
			['fields', 2, 'settlement'],
			['forest', 0, 'city'],
			['fields', 1, 'settlement'],
			['pasture', 4, 'settlement'],
			['hills', 5, 'city'],
			['mountains', 2, 'city'],
			['pasture', 3, 'settlement']
		];
		const used = new Set();
		for (const [terrain, owner, kind] of plan) {
			const hex = board.hexes.findIndex((hx, i) => hx.terrain === terrain && !used.has(i));
			if (hex < 0) continue;
			used.add(hex);
			const c = bv.hexCenter(hex);
			const v = V.findIndex((p) => near(p, c, 12) && free(p));
			if (v >= 0) put(v, owner, kind, terrain, c);
		}
		// Two harbors: one for player 1, one for you.
		const ports = bv.build.ports;
		const harbors = [];
		for (const [owner, kind] of [
			[1, 'settlement'],
			[mine, 'settlement']
		]) {
			for (const p of ports) {
				// Older builds don't record the harbor's edge: take the edge nearest its landing.
				const mid =
					p.edge !== undefined
						? E[p.edge]
						: E.reduce((a, b) =>
								Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a
							);
				const v = V.findIndex((q) => near(q, mid, 6) && free(q));
				if (v < 0) continue;
				put(v, owner, kind, `harbor-${owner}`);
				harbors.push({ x: p.x, z: p.z, owner });
				break;
			}
		}
		const view = {
			board,
			robberHex: board.hexes.findIndex((hx) => hx.terrain === 'desert'),
			log: [],
			me: mine,
			current: 0,
			phase: 'main',
			players,
			buildings,
			roads
		};
		s.setView(view);
		s.anim.update(60);
		// Hold the camera still so every run (and every build) frames the same shots.
		s.stage.rig.autoRotate = 0;
		s.stage.rig.set({ azimuth: -0.62 }, true);
		return { placed, harbors, board };
	},
	{ mine: 3, injected }
);
writeFileSync(`${out}-board.json`, JSON.stringify(spots.board));
delete spots.board;
console.log(JSON.stringify(spots));
await page.waitForTimeout(2500);
if (want('game'))
	await page.screenshot({ path: `${out}-game.png`, animations: 'disabled', timeout: 180000 });

const look = async (name, at, radius = 95, polar = 0.82) => {
	if (!want(name)) return;
	await page.evaluate(
		({ at, radius, polar }) => {
			const s = window.__scene;
			const V3 = s.stage.camera.position.constructor;
			const t = new V3(at.x, at.y ?? 4, at.z);
			s.stage.rig.set({ radius, polar, azimuth: -0.62, target: t }, true);
		},
		{ at, radius, polar }
	);
	await page.waitForTimeout(2500);
	await page.screenshot({ path: `${out}-${name}.png`, animations: 'disabled', timeout: 180000 });
};
for (const sp of spots.placed.slice(0, 2)) await look(sp.label, sp.at);
await look('mine', { x: -20, z: -10 }, 200, 0.82);
for (const hb of spots.harbors) await look(`harbor-${hb.owner}`, hb, 80, 0.8);

// The dice, rolled to 3 and 6 and settled.
const dice = await page.evaluate(() => {
	const s = window.__scene;
	const spot = s.diceSpots();
	s.dice.roll([3, 6], spot.from, spot.ends, spot.yaw);
	for (let i = 0; i < 40; i++) s.anim.update(0.1);
	const p = s.dice.dice[0].position.clone().add(s.dice.dice[1].position).multiplyScalar(0.5);
	return { x: p.x, y: p.y, z: p.z };
});
await look('dice', dice, 60, 0.7);
await look('dice-far', dice, 200, 0.82);
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
