// Plays the setup and a few turns by actually clicking the 3D board and the HUD buttons.
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const out = process.argv[2] ?? '/tmp/click';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await signIn(page, 'http://localhost:8787/');
await page.goto('http://localhost:8787/');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.click('text=Quick game vs 3 bots');
await page.waitForFunction(() => window.__client?.view, null, { timeout: 30000 });
const view = () => page.evaluate(() => { const v = window.__client.view; return { me: v.me, cur: v.current, step: v.step, phase: v.phase, turn: v.turn, ver: v.version }; });
const log = [];
let shots = 0;
for (let i = 0; i < 400; i++) {
	const v = await view();
	if (v.cur !== v.me) { await page.waitForTimeout(700); continue; }
	if (['setupSettlement', 'setupRoad', 'moveRobber'].includes(v.step)) {
		await page.waitForTimeout(600);
		const pts = await page.evaluate(() => window.__scene.debugPickPoints());
		const vis = pts.filter((p) => p.x > 260 && p.x < 1150 && p.y > 90 && p.y < 640);
		const p = vis[Math.floor(Math.random() * vis.length)];
		if (!p) { log.push('no visible pick for ' + v.step); break; }
		await page.mouse.move(p.x, p.y);
		await page.waitForTimeout(400);
		if (shots < 2 && v.step === 'setupSettlement') await page.screenshot({ path: `${out}-pick${shots++}.png`, animations: 'disabled', timeout: 90000 });
		await page.mouse.click(p.x, p.y);
		await page.waitForFunction((ver) => window.__client.view.version > ver, v.ver, { timeout: 20000 }).catch(() => log.push('click did nothing at ' + v.step));
		log.push(`clicked ${v.step} ${p.id}`);
		continue;
	}
	if (v.step === 'roll') { await page.click('text=Roll dice', { force: true }); log.push('rolled'); await page.waitForTimeout(2500); continue; }
	if (v.step === 'steal') { await page.click('.victim >> nth=0', { force: true }); log.push('stole'); continue; }
	if (v.step === 'discard') { await page.waitForTimeout(1000); continue; }
	if (v.step === 'main') {
		if (v.turn >= 3) break;
		await page.screenshot({ path: `${out}-main.png`, animations: 'disabled', timeout: 90000 });
		await page.click('text=End turn', { force: true });
		log.push('ended turn');
		await page.waitForTimeout(1500);
		continue;
	}
	await page.waitForTimeout(800);
}
console.log(JSON.stringify({ log, errors: errors.slice(0, 10), final: await view() }, null, 1));
await browser.close();
