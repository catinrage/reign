// Dev: the night mode switches, in a game against bots. The moon button in the corner (off, then
// on with its tip), the N key, the switch in Settings, and that it is kept for the next visit:
// the home screen after a reload is still at night.
// Needs the dev game server (cheats). Usage:
//   BASE=http://localhost:5173 node scripts/dev/night-ui.mjs <outPrefix> [width] [height]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/night-ui', w = '1440', h = '900'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()));
const shot = async (name, wait = 0, clip) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000, clip });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 300000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const cheat = (c) => page.evaluate((c) => window.__client.send({ t: 'cheat', cheat: c }), c);
const night = () => page.evaluate(() => [window.__scene.stage.night, localStorage.getItem('reign:night')]);
const corner = { x: 0, y: 0, width: Math.min(Number(w), 620), height: 130 };

await signIn(page, base);
await page.goto(`${base}/`);
await page.evaluate(() => localStorage.setItem('reign:graphics', 'medium'));
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await until(() => window.__account?.status === 'in');
await page.waitForTimeout(2500);
await page.click('text=Play vs bots', { force: true });
await until(() => !!window.__client.view);
await cheat({ type: 'finishSetup' });
await page.waitForTimeout(1500);
console.log('start', await night());
// Nothing in the corner's column may overlap the panel under it (phones).
console.log(
	'column',
	await page.evaluate(() =>
		[...document.querySelectorAll('.corner > *, .toggle, .tiles')].map((e) => {
			const r = e.getBoundingClientRect();
			return `${e.className} ${Math.round(r.top)}-${Math.round(r.bottom)} ${getComputedStyle(e).getPropertyValue('--top')}`;
		})
	)
);
await shot('corner-off', 0, corner);
await page.click('.corner .night', { force: true });
console.log('clicked', await night());
await page.hover('.corner .night');
await shot('corner-on', 2500, corner);
await page.mouse.move(Number(w) / 2, Number(h) / 2);
// Swiftshader draws a frame or two a second, too few to watch the room fade: skip to night.
await page.evaluate(() => window.__scene.stage.setNight(true, true));
await shot('game-night', 3000);
await page.keyboard.press('n');
console.log('after N', await night());
await page.keyboard.press('n');
console.log('after N again', await night());
// The switch in Settings.
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await page.click('text=Settings', { force: true });
await page.waitForTimeout(800);
await page.evaluate(() => {
	const row = [...document.querySelectorAll('.settings .row')].find((r) => r.textContent.includes('Night mode'));
	row?.scrollIntoView({ block: 'center' });
});
await shot('settings', 800);
await page.evaluate(() => {
	const row = [...document.querySelectorAll('.settings .row')].find((r) => r.textContent.includes('Night mode'));
	[...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Off').click();
});
console.log('settings off', await night());
await page.evaluate(() => {
	const row = [...document.querySelectorAll('.settings .row')].find((r) => r.textContent.includes('Night mode'));
	[...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'On').click();
});
console.log('settings on', await night());
// Kept for the next visit: the home screen comes up at night.
await page.goto(`${base}/`);
await until(() => window.__ready === true);
console.log('reloaded', await night());
await shot('home-night', 8000);
if (errors.length) console.log('errors', errors);
await browser.close();
