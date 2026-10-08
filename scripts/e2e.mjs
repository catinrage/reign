// End-to-end smoke test: quick game vs bots in a real browser, screenshots along the way.
// Usage: node scripts/e2e.mjs <baseUrl> <outDir> [maxSeconds]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [base = 'http://localhost:8787', out = 'test-results/e2e', maxS = '600'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || undefined,
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?autoplay`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/01-home.png`, animations: 'disabled', timeout: 90000 });
await page.fill('input[placeholder="Settler"]', 'Komeil');
await page.click('text=Quick game vs 3 bots');
await page.waitForFunction(() => window.__client?.view, null, { timeout: 30000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/02-start.png`, animations: 'disabled', timeout: 90000 });
const start = Date.now();
let shot = 3;
let lastShot = Date.now();
while (Date.now() - start < Number(maxS) * 1000) {
	const phase = await page.evaluate(() => window.__client.view?.phase);
	if (phase === 'ended') break;
	if (Date.now() - lastShot > 45000) {
		await page.screenshot({ path: `${out}/${String(shot++).padStart(2, '0')}-mid.png`, animations: 'disabled', timeout: 90000 });
		lastShot = Date.now();
	}
	await page.waitForTimeout(1000);
}
const summary = await page.evaluate(() => {
	const v = window.__client.view;
	return { phase: v.phase, turn: v.turn, winner: v.winner, points: v.players.map((p) => p.totalPoints ?? p.publicPoints) };
});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/99-end.png`, animations: 'disabled', timeout: 90000 });
console.log(JSON.stringify({ summary, errors: errors.slice(0, 20) }, null, 2));
await browser.close();
