// Dev: the FPS and ping readout (Settings > Show FPS and ping). Turns it on in Settings, then
// shoots it on the home screen and in a game against bots, and prints the numbers it shows.
// Needs the dev game server (cheats). Usage:
//   BASE=http://localhost:5173 node scripts/dev/net-stats.mjs <outPrefix> [width] [height] [lang]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/net-stats', w = '1366', h = '768', lang = 'en'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on(
	'console',
	(m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text())
);
const shot = async (name, wait = 0) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 300000) =>
	page.waitForFunction(fn, arg, { timeout, polling: 100 });
const cheat = (c) => page.evaluate((c) => window.__client.send({ t: 'cheat', cheat: c }), c);
const readout = () =>
	page.evaluate(() => {
		const el = document.querySelector('.net');
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return `${el.innerText.replace(/\s+/g, ' ')} @ ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`;
	});

await signIn(page, base);
await page.goto(`${base}/`);
await page.evaluate((lang) => {
	localStorage.setItem('reign:graphics', 'low');
	localStorage.setItem('reign:lang', lang);
}, lang);
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await until(() => window.__account?.status === 'in');
await page.waitForTimeout(2000);
console.log('before', await readout());
// The switch in Settings, from the home screen.
await page.click('.medal >> nth=3', { force: true });
await page.waitForTimeout(800);
await page.evaluate(() => {
	const row = [...document.querySelectorAll('.settings .row')].find((r) =>
		r.textContent.match(/FPS|帧率|IPS/)
	);
	row.scrollIntoView({ block: 'center' });
	row.querySelectorAll('button')[1].click();
});
await shot('settings', 1500);
await page.click('.icon-btn.close', { force: true });
await page.waitForTimeout(500);
await until(() => /\d/.test(document.querySelector('.net')?.textContent ?? ''));
await page.waitForTimeout(4500);
console.log('home', await readout());
await shot('home');
await page.evaluate(() => window.__client.quickPlay(3));
await until(() => !!window.__client.view);
await cheat({ type: 'finishSetup' });
await page.waitForTimeout(4000);
console.log('game', await readout());
console.log(
	'players',
	await page.evaluate(() => {
		const r = document.querySelector('[data-net-anchor=players]').getBoundingClientRect();
		return `${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`;
	})
);
await shot('game');
console.log('stored', await page.evaluate(() => localStorage.getItem('reign:stats')));
console.log('errors', errors);
await browser.close();
