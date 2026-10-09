// Dev helper: screenshot every tutorial chapter from the main menu.
// Usage: node scripts/dev/tutorial.mjs [outDir] [width] [height] [only,chapter,ids]
// Each chapter is saved twice: the top of the page, and the whole page scrolled into one tall shot.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';

const [dir = 'shots/tutorial', w = '1600', h = '900', only = ''] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
await page.addInitScript(() => localStorage.setItem('reign:quality', 'low'));
const url = process.env.URL || 'http://localhost:5173/';
await signIn(page, url);
await page.goto(url);
await page
	.waitForFunction(() => window.__ready === true, null, { timeout: 120000 })
	.catch(() => console.log('not ready'));
await page.getByRole('button', { name: 'Tutorial' }).click();
await page.waitForTimeout(800);

const ids = await page.$$eval('[data-chapter]', (els) => els.map((e) => e.dataset.chapter));
// The chapter list only shows one mode at a time; walk both.
const all = [...ids];
await page.getByRole('tab', { name: 'Reign Extended' }).click();
await page.waitForTimeout(400);
for (const id of await page.$$eval('[data-chapter]', (els) => els.map((e) => e.dataset.chapter)))
	if (!all.includes(id)) all.push(id);
await page.getByRole('tab', { name: 'Classic' }).click();

for (const id of all) {
	if (only && !only.split(',').includes(id)) continue;
	const extended = !ids.includes(id);
	await page.getByRole('tab', { name: extended ? 'Reign Extended' : 'Classic' }).click();
	await page.click(`[data-chapter="${id}"]`);
	await page.waitForTimeout(700);
	await page.screenshot({ path: `${dir}/${id}.png`, animations: 'disabled' });
	// Grow the page to its full content height for one tall shot of the whole chapter.
	const full = await page.$eval('article.page', (el) => el.scrollHeight);
	await page.setViewportSize({ width: Number(w), height: Math.max(Number(h), full + 200) });
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${dir}/${id}-full.png`, animations: 'disabled' });
	await page.setViewportSize({ width: Number(w), height: Number(h) });
	console.log('shot', id);
}
await browser.close();
