// Dev helper: screenshot the interface, optionally after running steps in the page.
// Usage: node scripts/dev/ui.mjs <url> <out.png> [width] [height] [waitMs] [js]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [url, out, w = '1600', h = '900', wait = '5000', js = ''] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on(
	'console',
	(m) =>
		(m.type() === 'error' || m.type() === 'warning') && console.log('[console]', m.type(), m.text())
);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await signIn(page, url);
await page.goto(url);
await page
	.waitForFunction(() => window.__ready === true, null, { timeout: 120000 })
	.catch(() => console.log('not ready'));
await page.waitForTimeout(Number(wait));
if (js) {
	for (const step of js.split(';;')) {
		const m = step.match(/^wait:(\d+)$/);
		if (m) await page.waitForTimeout(Number(m[1]));
		else await page.evaluate(step);
	}
	await page.waitForTimeout(1500);
}
await page.screenshot({ path: out, timeout: 180000, animations: 'disabled' });
await browser.close();
