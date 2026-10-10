// Dev: a game's replay. A game against bots plays itself (the bot logic plays your seat too, bots
// at full speed, the win cheat ends it at WIN_AT), then the history's Watch replay button opens it,
// and the viewer is shot playing, scrubbed to the middle, with each data tab, and at the end.
// Needs the dev server (cheats on): `pnpm build && npx tsx src/server/index.ts --dev`.
// Usage: BOTS=3 MODE=classic|extended LANG_CODE=de WIN_AT=14 node scripts/dev/replay.mjs <outDir>
// [name] [base] [width] [height]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [
	dir = '/tmp/replay',
	name = 'replay',
	base = 'http://localhost:8787',
	w = '1366',
	h = '768'
] = process.argv.slice(2);
const bots = Number(process.env.BOTS ?? 3);
const mode = process.env.MODE ?? 'classic';
const winAt = Number(process.env.WIN_AT ?? 14);
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
const shot = async (file, wait = 2500) => {
	await page.waitForTimeout(wait);
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
await until(
	(turn) => (window.__client.view?.turn ?? 0) >= turn || window.__client.view?.phase === 'ended',
	winAt
);
if ((await page.evaluate(() => window.__client.view.phase)) !== 'ended')
	await page.evaluate(() =>
		window.__client.send({ t: 'cheat', cheat: { type: 'win', player: window.__client.view.me } })
	);
await until(() => window.__client.view?.phase === 'ended');
console.log(`game over after ${Math.round((Date.now() - started) / 1000)} s`);
await page.waitForTimeout(2000);
await page.evaluate(() => window.__client.leave());
await until(() => !!document.querySelector('.medal'), null, 60000);
await page
	.locator('button.medal', { hasText: /History|История|Verlauf|历史|Historique/ })
	.click({ force: true });
await until(() => !!document.querySelector('.history .match'), null, 60000);
await shot(`${name}-history`, 1500);
await page.locator('.history .watch').first().click({ force: true });
await until(() => window.__client.replaying && !!document.querySelector('.dock'), null, 60000);
await shot(`${name}-start`, 3000);
// Play a while at 4×.
await page.evaluate(() => window.__replay.setSpeed(4));
await page.waitForTimeout(12000);
await shot(`${name}-playing`, 0);
await page.evaluate(() => window.__replay.pause());
await page.evaluate(() => window.__replay.seek(Math.round(window.__replay.last * 0.6)));
await shot(`${name}-middle`);
const tabs = await page.locator('.data .tab').count();
for (let i = 1; i < tabs; i++) {
	await page.locator('.data .tab').nth(i).click();
	await shot(`${name}-tab${i + 1}`, 800);
}
await page.locator('.data .tab').first().click();
await page.evaluate(() => window.__replay.seek(window.__replay.last));
await shot(`${name}-end`, 3500);
console.log(
	JSON.stringify(
		await page.evaluate(() => ({
			steps: window.__replay.last,
			turns: window.__replay.turns.length,
			marks: window.__replay.marks.length
		}))
	)
);
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
