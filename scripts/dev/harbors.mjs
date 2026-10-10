// Dev: the harbor discs at the table's normal view, a close crop of each, and the tooltip a
// harbor shows on hover. A game against bots plays itself until turn TURN (4 by default) and is
// paused, then each harbor is shot and the mouse rests on a few of them in turn.
// Usage: TURN=4 node scripts/dev/harbors.mjs <outDir> [base] [width] [height]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir = '/tmp/harbors', base = 'http://localhost:8787', w = '1366', h = '768'] =
	process.argv.slice(2);
const turn = Number(process.env.TURN ?? 4);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.addInitScript((lang) => {
	localStorage.setItem('reign:graphics', 'medium');
	if (lang) localStorage.setItem('reign:lang', lang);
}, process.env.LANG_CODE ?? '');
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 900000, polling: 250 });
await signIn(page, base);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await until(() => !document.getElementById('boot'));
await page.click('text=Play vs bots', { force: true });
await until((turn) => (window.__client.latest?.turn ?? 0) >= turn, turn);
await page.evaluate(() => {
	window.__stopAutoplay();
	window.__client.pauseGame(true);
});
await until(() => !!window.__client.lobby?.pausedBy);
await page.addStyleTag({ content: '.curtain { display: none !important; }' });
await page.evaluate(() => {
	const s = window.__scene;
	s.anim.update(60);
	s.stage.rig.set({}, true);
	s.stage.shift = s.stage.shiftGoal;
	s.stage.applyShift();
});
await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
if (process.env.OWN) {
	// Hand your seat a settlement beside the first OWN harbors (only in this page's copy of the
	// game), so the "Your harbors" list under your tiles has something in it.
	const owned = await page.evaluate((n) => {
		const c = window.__client;
		const s = window.__scene;
		const bv = s.boardView;
		const v = c.view;
		const buildings = [...v.buildings];
		const picked = [];
		for (let i = 0; i < bv.harborCount && picked.length < n; i++) {
			const at = bv.harborSpot(i);
			let best = -1;
			let d = Infinity;
			buildings.forEach((_, k) => {
				const p = bv.vertexPos(k);
				const dk = Math.hypot(p.x - at.x, p.z - at.z);
				if (dk < d) [best, d] = [k, dk];
			});
			if (buildings[best]) continue;
			buildings[best] = { owner: v.me, kind: 'settlement' };
			picked.push(v.board.ports[i].kind);
		}
		c.view = { ...v, buildings };
		c.latest = c.view;
		return picked;
	}, Number(process.env.OWN));
	console.log('owned', owned);
	await page.waitForTimeout(1500);
	await page.screenshot({ path: `${dir}/panel.png`, clip: { x: 0, y: 120, width: 360, height: 420 }, timeout: 180000 });
	const chips = await page.$$('.tiles .harbors .chip');
	for (const [k, chip] of chips.entries()) {
		await chip.hover();
		await page.waitForSelector('.reign-tip.on', { timeout: 60000 });
		await page.waitForTimeout(400);
		console.log('chip', k, JSON.stringify(await page.evaluate(() => document.querySelector('.reign-tip').innerText)));
		if (!k) await page.screenshot({ path: `${dir}/panel-tip.png`, clip: { x: 0, y: 120, width: 560, height: 480 }, timeout: 180000 });
		await page.mouse.move(700, 5);
		await page.waitForSelector('.reign-tip:not(.on)', { timeout: 60000 });
	}
}
await page.screenshot({ path: `${dir}/table.png`, timeout: 180000 });
const spots = await page.evaluate(() => {
	const s = window.__scene;
	const bv = s.boardView;
	const canvas = s.stage.canvas;
	const out = [];
	for (let i = 0; i < bv.harborCount; i++) {
		const at = s.project(bv.harborSpot(i));
		out.push({ i, ...at, free: document.elementFromPoint(at.x, at.y) === canvas });
	}
	return out;
});
console.log(JSON.stringify(spots));
for (const sp of spots.slice(0, 9)) {
	await page.screenshot({
		path: `${dir}/harbor-${sp.i}.png`,
		clip: { x: Math.max(0, sp.x - 90), y: Math.max(0, sp.y - 70), width: 180, height: 120 },
		timeout: 180000
	});
}
if (!process.env.NO_HOVER)
	for (const sp of spots.filter((s) => s.free).slice(0, Number(process.env.HOVERS ?? 3))) {
		await page.mouse.move(sp.x - 30, sp.y - 30);
		await page.mouse.move(sp.x, sp.y, { steps: 4 });
		await page.waitForSelector('.reign-tip.on', { timeout: 60000 });
		await page.waitForTimeout(400);
		const text = await page.evaluate(() => document.querySelector('.reign-tip').innerText);
		console.log(sp.i, JSON.stringify(text));
		await page.screenshot({
			path: `${dir}/tip-${sp.i}.png`,
			clip: { x: Math.max(0, sp.x - 200), y: Math.max(0, sp.y - 170), width: 400, height: 230 },
			timeout: 180000
		});
		await page.mouse.move(5, Number(h) / 2);
		await page.waitForSelector('.reign-tip:not(.on)', { timeout: 60000 });
	}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
