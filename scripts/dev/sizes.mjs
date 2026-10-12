// Dev helper: screenshots of the interface size settings (HUD and menus bigger and smaller).
// Usage: node scripts/dev/sizes.mjs <outDir> [width] [height] [base]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, w = '1366', h = '768', base = 'http://localhost:5180'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const tag = `${w}x${h}`;
const shot = async (name) => {
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${dir}/${tag}-${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, timeout = 240000) => page.waitForFunction(fn, null, { timeout, polling: 500 });
const setSizes = (hud, menu) =>
	page.evaluate(([hud, menu]) => {
		localStorage.setItem('reign:hudSize', String(hud));
		localStorage.setItem('reign:menuSize', String(menu));
	}, [hud, menu]);

await signIn(page, base);
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await setSizes(1, 1.4);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.waitForTimeout(2500);
await shot('home-menu140');
await page.click('.medal >> nth=0', { force: true }).catch(() => {});
await shot('home-first-medal-140');
await page.keyboard.press('Escape');
await setSizes(1, 0.8);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.waitForTimeout(2000);
await shot('home-menu80');
await setSizes(1.4, 1);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.waitForTimeout(2500);
await page.click('.sign .btn.big', { force: true });
await until(() => window.__client.view && window.__client.view.phase !== 'setup' && window.__client.view.turn >= 4);
await until(() => {
	const v = window.__client.view;
	if (v.current === v.me && v.step === 'roll') {
		window.__stopAutoplay();
		return true;
	}
	return false;
});
await page.waitForTimeout(2500);
await shot('hud140');
await page.keyboard.press('Escape');
await page.click('.board .list .btn.wood >> nth=1', { force: true });
await shot('hud140-settings');
// Move the HUD slider (the first of the interface sizes) from the in-game settings.
const hudSlider = async (v) => {
	await page.evaluate((v) => {
		const s = document.querySelectorAll('.settings input.slider')[0];
		s.value = String(v);
		s.dispatchEvent(new Event('input', { bubbles: true }));
		s.dispatchEvent(new Event('change', { bubbles: true }));
	}, v);
};
await hudSlider(0.7);
await shot('hud70-settings');
await hudSlider(1);
await page.keyboard.press('Escape');
await shot('hud100');
await page.keyboard.press('Escape');
await page.click('.board .list .btn.wood >> nth=1', { force: true });
await hudSlider(0.7);
await page.keyboard.press('Escape');
await shot('hud70');
await page.evaluate(() => {
	localStorage.setItem('reign:hudSize', '1.5');
});
await page.reload();
await until(() => window.__client?.view?.phase === 'main' || window.__client?.view);
await page.waitForTimeout(5000);
await shot('hud150');
await page.hover('[data-hand] >> nth=0', { force: true });
await page.waitForTimeout(800);
await shot('hud150-tooltip');
await browser.close();
