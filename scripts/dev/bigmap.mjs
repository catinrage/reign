// Dev helper: a huge hexagonal custom island with a full table of bots, to check the map
// maker, the lobby and a game hold up at size. Prints how long the island took to appear and
// the frame rate once it has.
// Usage: node scripts/dev/bigmap.mjs <outDir> [radius] [bots] [width] [height] [base]
import { chromium } from 'playwright';
const [dir, radius = '7', bots = '7', w = '1600', h = '900', base = 'http://localhost:5173'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shot = async (name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, timeout = 400000) => page.waitForFunction(fn, null, { timeout, polling: 500 });
const fps = () =>
	page.evaluate(
		() =>
			new Promise((res) => {
				let n = 0;
				const t0 = performance.now();
				const tick = () => (performance.now() - t0 < 3000 ? (n++, requestAnimationFrame(tick)) : res(n / 3));
				requestAnimationFrame(tick);
			})
	);

await page.goto(`${base}/?autoplay`, { timeout: 180000 });
await until(() => window.__ready === true);
await page.waitForTimeout(2000);
await page.fill('.name-row .input', 'Komeil');
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await page.evaluate(
	([R, bots]) => {
		const tiles = [];
		for (let r = -R; r <= R; r++)
			for (let q = -R; q <= R; q++) if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= R) tiles.push({ q, r, terrain: null });
		const c = window.__client;
		c.send({ t: 'setMode', mode: 'extended' });
		c.send({ t: 'setMap', map: { custom: { name: 'Vast', tiles } } });
		c.send({ t: 'setPointsToWin', points: 13 });
		for (let i = 0; i < bots; i++) c.send({ t: 'addBot' });
	},
	[Number(radius), Number(bots)]
);
await shot('big-lobby', 4000);
if (process.env.EDITOR) {
	// The map maker started from Grand Realm, with land painted out past its old edge.
	await page.click('.pick >> nth=1', { force: true });
	await page.click('.modal .btn.green', { force: true });
	await page.waitForTimeout(800);
	await page.click('.starts .btn >> nth=2', { force: true });
	await page.waitForTimeout(500);
	const box = await page.locator('.board svg').boundingBox();
	await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.98, box.y + box.height * 0.5, { steps: 6 });
	await page.mouse.up();
	await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.98, box.y + box.height * 0.3, { steps: 6 });
	await page.mouse.up();
	await shot('big-editor', 1500);
}
if (process.env.LOBBY_ONLY) process.exit(await browser.close());
const t0 = Date.now();
await page.click('.start', { force: true });
await until(() => window.__client.view && window.__client.view.phase !== 'setup' && window.__client.view.turn >= 8);
console.log('game running after', Date.now() - t0, 'ms');
await until(() => {
	const v = window.__client.view;
	if (v.current === v.me && v.step === 'roll') {
		window.__stopAutoplay();
		return true;
	}
	return false;
});
await shot('big-game', 4000);
console.log('fps', await fps());
await browser.close();
