// Dev helper: play vs bots for a while, then screenshot the "Your tiles" list on the left.
// Usage: node scripts/dev/tiles.mjs <outDir> [width] [height] [base] [turns]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, w = '1600', h = '900', base = 'http://localhost:5180', turns = '12'] =
	process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('reign:quality', 'low'));
const shot = async (name) => {
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 400000) =>
	page.waitForFunction(fn, arg, { timeout, polling: 500 });

await signIn(page, base);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.waitForTimeout(2500);
await page.click('.sign .btn.big', { force: true });
await until(
	(t) =>
		window.__client.view &&
		window.__client.view.phase !== 'setup' &&
		window.__client.view.turn >= t,
	Number(turns)
);
await until(() => {
	const v = window.__client.view;
	if (v.current === v.me && v.step === 'main' && !window.__client.tossing) {
		window.__stopAutoplay();
		return true;
	}
	return false;
});
await page.waitForTimeout(3000);
// Open the list if it starts folded (phones).
if (!process.env.FOLDED && !(await page.$('.tiles .rows')))
	await page.click('.tiles .head', { force: true });
await shot(`tiles-${w}x${h}`);
await page.locator('.tiles').screenshot({ path: `${dir}/tiles-${w}x${h}-zoom.png` });
// The robber on one of my tiles, shown in the HUD only (nothing is sent), for a look.
await page.evaluate(async () => {
	const c = window.__client;
	const v = c.view;
	for (let h = 0; h < v.board.hexes.length; h++) {
		c.view = { ...v, robberHex: h };
		await new Promise((r) => setTimeout(r, 30));
		if (document.querySelector('.tiles .chip.robbed')) return;
	}
});
await page.waitForTimeout(500);
await page.locator('.tiles').screenshot({ path: `${dir}/tiles-${w}x${h}-robbed.png` });
await browser.close();
