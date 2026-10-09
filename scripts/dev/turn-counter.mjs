// Dev: the turn counter in the top-left corner. A game against bots plays itself (the bot logic
// plays your seat too) and is paused once turn TURN (6 by default) has come, or during the setup
// with TURN=0; shots of the whole table and the corner. (Autoplay stalls on an action refused
// while paused, so each run pauses once.) Usage: TURN=6 node scripts/dev/turn-counter.mjs <outDir>
// [base] [width] [height] (a narrow width shows the phone layout).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir = '/tmp/turn-counter', base = 'http://localhost:8787', w = '1600', h = '900'] =
	process.argv.slice(2);
const turn = Number(process.env.TURN ?? 6);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.addInitScript(() => localStorage.setItem('reign:quality', 'low'));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 600000, polling: 200 });
const shot = async (name) => {
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000 });
	const box = await page.locator('.corner').boundingBox();
	await page.screenshot({
		path: `${dir}/${name}-corner.png`,
		clip: {
			x: 0,
			y: Math.max(0, box.y - 10),
			width: box.x + box.width + 30,
			height: box.height + 20
		},
		timeout: 180000
	});
	console.log('shot', name, JSON.stringify(await page.locator('.turn').innerText()));
};
await signIn(page, base);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.evaluate(() => window.__client.setName('Komeil'));
await page.click('text=Play vs bots', { force: true });
// Hold the table for each shot (the bots play fast), out of sight of the paused screen.
await page.addStyleTag({ content: '.curtain { display: none !important; }' });
const hold = async (paused) => {
	await page.evaluate((paused) => window.__client.pauseGame(paused), paused);
	await until((paused) => !!window.__client.lobby?.pausedBy === paused, paused);
};
if (turn) await until((turn) => (window.__client.view?.turn ?? 0) >= turn, turn);
else await until(() => window.__client.view?.phase === 'setup');
await hold(true);
await shot(turn ? `turn-${turn}` : 'setup');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
