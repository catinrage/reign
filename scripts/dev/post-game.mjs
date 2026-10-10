// Dev: the end-of-game window. A whole game against bots plays itself (the bot logic plays your
// seat too, bots at full speed) and the window is shot once it shows; on a narrow screen each tab
// is shot. Needs the dev server (cheats on): `pnpm build && npx tsx src/server/index.ts --dev`.
// Usage: BOTS=3 MODE=classic|extended LANG_CODE=de WIN_AT=30 node scripts/dev/post-game.mjs <outDir>
// [name] [base] [width] [height]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [
	dir = '/tmp/post-game',
	name = 'post-game',
	base = 'http://localhost:8787',
	w = '1366',
	h = '768'
] = process.argv.slice(2);
const bots = Number(process.env.BOTS ?? 3);
const mode = process.env.MODE ?? 'classic';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.addInitScript((lang) => {
	localStorage.setItem('reign:graphics', 'low');
	if (lang) localStorage.setItem('reign:lang', lang);
}, process.env.LANG_CODE ?? '');
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const until = (fn, arg, timeout = 1800000) =>
	page.waitForFunction(fn, arg, { timeout, polling: 500 });
const shot = async (file) => {
	await page.waitForTimeout(2500);
	await page.screenshot({ path: `${dir}/${file}.png`, timeout: 180000 });
	console.log('shot', file);
};
await signIn(page, base);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.waitForTimeout(1500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await page.evaluate(
	({ bots, mode }) => {
		const c = window.__client;
		if (mode === 'extended') {
			c.send({ t: 'setMode', mode: 'extended' });
			// The Grand Realm seats seven.
			c.send({ t: 'setMap', map: { preset: 'realm' } });
			c.send({ t: 'setPointsToWin', points: 8 });
		}
		for (let i = 0; i < bots; i++) c.send({ t: 'addBot' });
	},
	{ bots, mode }
);
await until((n) => window.__client.lobby?.seats.length === n, bots + 1, 60000);
await page.click('.start', { force: true });
await until(() => !!window.__client.view);
await page.evaluate(() =>
	window.__client.send({ t: 'cheat', cheat: { type: 'fastBots', on: true } })
);
const started = Date.now();
// Big tables take long: WIN_AT=<turn> ends the game with the win cheat once that turn comes.
const winAt = Number(process.env.WIN_AT ?? 0);
if (winAt) {
	await until((turn) => (window.__client.view?.turn ?? 0) >= turn, winAt);
	await page.evaluate(() =>
		window.__client.send({ t: 'cheat', cheat: { type: 'win', player: window.__client.view.me } })
	);
}
await until(() => window.__client.view?.phase === 'ended');
console.log(
	`game over after ${Math.round((Date.now() - started) / 1000)} s, turn ${await page.evaluate(() => window.__client.view.turn)}`
);
await until(() => !!document.querySelector('.victory .board'), null, 60000);
await shot(name);
const tabs = await page.locator('.victory .tab').count();
for (let i = 1; i < tabs; i++) {
	await page.locator('.victory .tab').nth(i).click();
	await shot(`${name}-tab${i + 1}`);
}
console.log(JSON.stringify(await page.evaluate(() => window.__client.view.stats)));
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
