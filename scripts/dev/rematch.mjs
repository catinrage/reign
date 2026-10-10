// Dev: play again after a game ends. Wins a game against a bot with the win cheat, presses Play
// again and checks the camera stops turning and looks at the new island from your seat. Needs the
// dev server (cheats on): `pnpm build && npx tsx src/server/index.ts --dev`.
// Usage: node scripts/dev/rematch.mjs <outDir> [base]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir = '/tmp/rematch', base = 'http://localhost:8787'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.addInitScript(() => localStorage.setItem('reign:graphics', 'low'));
page.on('pageerror', (e) => console.log('pageerror', e.message));
const until = (fn, arg, timeout = 300000) =>
	page.waitForFunction(fn, arg, { timeout, polling: 250 });
const camera = () =>
	page.evaluate(() => {
		const rig = window.__scene.stage.rig;
		return { autoRotate: rig.autoRotate, azimuth: +rig.azimuth.toFixed(3) };
	});
/** How far the camera turns by itself over a few seconds. */
const drift = async () => {
	const a = await camera();
	await page.waitForTimeout(4000);
	const b = await camera();
	return { ...b, turned: +(b.azimuth - a.azimuth).toFixed(3) };
};
await signIn(page, base);
await page.goto(base);
await until(() => window.__ready === true);
await page.waitForTimeout(1500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await page.evaluate(() => window.__client.send({ t: 'addBot' }));
await until(() => window.__client.lobby?.seats.length === 2);
await page.click('.start', { force: true });
await until(() => !!window.__client.view);
await page.waitForTimeout(3000);
console.log('first game', await drift());
await page.evaluate(() => window.__client.cheat({ type: 'finishSetup' }));
await until(() => window.__client.view?.phase !== 'setup');
await page.evaluate(() => window.__client.cheat({ type: 'win', player: window.__client.view.me }));
await until(() => window.__client.view?.phase === 'ended');
await until(() => !!document.querySelector('.victory'), null, 60000);
console.log('game over', await drift());
await page.locator('.victory button', { hasText: 'Play again' }).click({ force: true });
await until(() => window.__client.view && window.__client.view.phase !== 'ended');
await page.waitForTimeout(3000);
console.log('rematch', await drift());
await page.screenshot({ path: `${dir}/rematch.png` });
// The new game's events still play: wait for the first roll to show its dice.
await page.evaluate(() => window.__client.cheat({ type: 'finishSetup' }));
await until(
	() => window.__client.view.log.some((e) => e.type === 'diceRolled'),
	null,
	120000
).catch(() => {});
console.log(
	'scene caught up',
	await page.evaluate(() => ({
		lastSeq: window.__scene.lastSeq,
		logEnd: window.__client.view.log.at(-1)?.seq
	}))
);
await browser.close();
