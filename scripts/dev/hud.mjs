// Dev helper: play a quick game vs bots and screenshot the HUD at key moments.
// Usage: node scripts/dev/hud.mjs <outDir> [width] [height] [base]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, w = '1600', h = '900', base = 'http://localhost:5180'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shot = async (name) => {
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, timeout = 240000) => page.waitForFunction(fn, null, { timeout, polling: 500 });

await signIn(page, base);

await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.waitForTimeout(2500);
await page.click('.sign .btn.big', { force: true });
await until(
	() =>
		window.__client.view && window.__client.view.phase !== 'setup' && window.__client.view.turn >= 4
);
// Stop autoplay at the start of one of my turns.
await until(() => {
	const v = window.__client.view;
	if (v.current === v.me && v.step === 'roll') {
		window.__stopAutoplay();
		return true;
	}
	return false;
});
await page.waitForTimeout(2500);
await shot('roll');
await page.click('.actions .roll', { force: true });
await until(() => window.__client.view.step === 'main');
await page.waitForTimeout(4000);
await shot('main');
await page.click('.actions .row .btn.wood', { force: true });
await shot('trade');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await shot('menu');
await page.click('.board .list .btn.wood >> nth=0', { force: true });
await shot('help');
await page.click('.board .back', { force: true });
await page.click('.board .list .btn.wood >> nth=1', { force: true });
await shot('settings');
await browser.close();
