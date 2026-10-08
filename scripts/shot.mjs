// Usage: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from 'playwright';
const [url, out, wait = '4000', w = '1600', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || undefined,
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(() => console.log('not ready'));
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
await browser.close();
