// Dev helper: screenshot the Reign Extended lobby, its pickers, the map maker and a game on a big map.
// Usage: node scripts/dev/extended.mjs <outDir> [width] [height] [base] [map] [bots]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, w = '1600', h = '900', base = 'http://localhost:5173', map = 'realm', bots = '3'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shot = async (name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, timeout = 300000) => page.waitForFunction(fn, null, { timeout, polling: 500 });

await signIn(page, base);

await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.waitForTimeout(2500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await page.evaluate(
	([map, bots]) => {
		const c = window.__client;
		c.send({ t: 'setMode', mode: 'extended' });
		c.send({ t: 'setMap', map: { preset: map } });
		for (let i = 0; i < bots; i++) c.send({ t: 'addBot' });
	},
	[map, Number(bots)]
);
await shot('ext-lobby', 3000);
await page.click('.pick >> nth=0', { force: true });
await shot('ext-characters', 2000);
await page.keyboard.press('Escape');
await page.click('.modal .close', { force: true });
await page.click('.pick >> nth=1', { force: true });
await shot('ext-maps', 1500);
await page.click('.modal .btn.green', { force: true });
await shot('ext-editor', 1500);
await page.click('.modal .close', { force: true });
await page.waitForTimeout(500);
await page.click('.modal .close', { force: true });
await page.waitForTimeout(500);
await page.click('.start', { force: true });
await until(() => window.__client.view && window.__client.view.phase !== 'setup' && window.__client.view.turn >= 4);
await until(() => {
	const v = window.__client.view;
	if (v.current === v.me && v.step === 'roll') {
		window.__stopAutoplay();
		return true;
	}
	return false;
});
await shot('ext-game', 4000);
await browser.close();
