// Dev: Reign Extended stone roads on the board (no game server needed). Three players each get a
// settlement and a trail of four roads, the middle two paved, so stone and plain roads of one
// color sit side by side. Shots: the island, each trail close up and from further off, and with
// PICK=1 the paving pick (glowing bars over your plain roads, a stone ghost on the hovered one).
// Math.random is seeded, so every run deals the same island.
// Usage: BASE=http://localhost:5173 node scripts/dev/stone-roads.mjs <outPrefix> [width] [height]
import { chromium } from 'playwright';
const [out = '/tmp/stone-roads', w = '1280', h = '800'] = process.argv.slice(2);
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

const trails = await page.evaluate(async (root) => {
	const { getTopology } = await import(`/@fs${root}/src/shared/board/topology.ts`);
	document.getElementById('app').style.display = 'none';
	const s = window.__scene;
	const colors = ['red', 'blue', 'white'];
	const players = colors.map((color, i) => ({ color, name: color, id: i }));
	const board = s.boardView.board;
	const topo = getTopology(board);
	const buildings = topo.vertices.map(() => null);
	const roads = topo.edges.map(() => null);
	const stoneRoads = topo.edges.map(() => false);
	const taken = new Set();
	const out = [];
	// Starting corners spread round the island, each walking a trail of four roads.
	const inland = topo.vertices.map((v, i) => i).filter((i) => topo.vertices[i].hexes.length === 3);
	for (let p = 0; p < players.length; p++) {
		for (const start of inland.slice(Math.floor((inland.length * (p * 2 + 1)) / 7))) {
			if (taken.has(start) || topo.vertices[start].neighbors.some((n) => taken.has(n))) continue;
			const trail = [];
			let v = start;
			const seen = new Set([start]);
			for (let k = 0; k < 4; k++) {
				const e = topo.vertices[v].edges.find((e) => {
					const ed = topo.edges[e];
					const next = ed.a === v ? ed.b : ed.a;
					return roads[e] === null && !seen.has(next) && !taken.has(next);
				});
				if (e === undefined) break;
				trail.push(e);
				const ed = topo.edges[e];
				v = ed.a === v ? ed.b : ed.a;
				seen.add(v);
			}
			if (trail.length < 4) continue;
			buildings[start] = { owner: p, kind: 'settlement' };
			for (const x of seen) {
				taken.add(x);
				for (const n of topo.vertices[x].neighbors) taken.add(n);
			}
			trail.forEach((e, k) => {
				roads[e] = p;
				stoneRoads[e] = k === 1 || k === 2;
			});
			out.push({ owner: p, color: colors[p], edges: trail });
			break;
		}
	}
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
		stoneRoads,
		workshops: board.hexes.map(() => null),
		buildingRules: { workshop: true, stoneRoad: true }
	};
	s.boardKey = '';
	s.setView(view);
	return out.map((t) => ({ ...t, at: t.edges.map((e) => s.boardView.edgePos(e).pos) }));
}, process.cwd());
console.log(JSON.stringify(trails.map((t) => ({ color: t.color, edges: t.edges }))));

const rig = (o) => page.evaluate((o) => window.__scene.stage.rig.set(o, true), o);
const shot = async (name) => {
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
await rig({ radius: 250, polar: 0.82, azimuth: -0.62, target: { x: 0, y: 0, z: 0 } });
await shot('island');
for (const t of trails) {
	const c = t.at.reduce((a, p) => ({ x: a.x + p.x / t.at.length, y: a.y + p.y / t.at.length, z: a.z + p.z / t.at.length }), { x: 0, y: 0, z: 0 });
	await rig({ radius: 44, polar: 0.78, azimuth: -0.62, target: c });
	await shot(t.color);
	await rig({ radius: 120, polar: 0.82, azimuth: -0.62, target: c });
	await shot(`${t.color}-far`);
}
if (process.env.PICK) {
	const red = trails[0];
	const c = red.at.reduce((a, p) => ({ x: a.x + p.x / red.at.length, y: a.y + p.y / red.at.length, z: a.z + p.z / red.at.length }), { x: 0, y: 0, z: 0 });
	const target = await page.evaluate(([edges, c]) => {
		const s = window.__scene;
		const plain = edges.filter((e) => !s.view.stoneRoads[e]);
		s.setPick({ kind: 'stoneRoad', options: plain, color: 'red', onPick: () => {} });
		s.stage.rig.set({ radius: 70, polar: 0.9, azimuth: -0.62, target: c }, true);
		return plain[0];
	}, [red.edges, c]);
	await shot('pick');
	const pt = await page.evaluate((id) => window.__scene.debugPickPoints().find((p) => p.id === id), target);
	await page.mouse.move(pt.x, pt.y);
	await shot('ghost');
}
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
