// Dev: Play vs bots and a campaign mission should go from the menu straight to the board, never
// showing the lobby of the table they set up. Watches for the lobby (and the menu) with a
// MutationObserver from the click until the game is in, and screenshots the first game frame.
// Needs a server: `pnpm build && npx tsx src/server/index.ts --dev`.
// Usage: node scripts/dev/skip-lobby.mjs <outDir> [base]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir = '/tmp/skip-lobby', base = 'http://localhost:8787'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.addInitScript(() => localStorage.setItem('reign:graphics', 'low'));
page.on('pageerror', (e) => console.log('pageerror', e.message));
const until = (fn, arg, timeout = 120000) =>
	page.waitForFunction(fn, arg, { timeout, polling: 100 });

/** Note every time the lobby shows, from now until the game view is up. */
const watch = () =>
	page.evaluate(() => {
		window.__lobbySeen = 0;
		const check = () => {
			if (document.querySelector('.lobby')) window.__lobbySeen++;
		};
		check();
		window.__lobbyObs?.disconnect();
		window.__lobbyObs = new MutationObserver(check);
		window.__lobbyObs.observe(document.body, { childList: true, subtree: true });
	});
const seen = () => page.evaluate(() => (window.__lobbyObs.disconnect(), window.__lobbySeen));

await signIn(page, base);
await page.goto(base);
await until(() => window.__ready === true);
const menuReady = () =>
	until(
		() =>
			window.__client.status === 'online' && !document.querySelector('.home .btn.shine')?.disabled
	);
await menuReady();
await page.waitForTimeout(1000);

await watch();
await page.evaluate(() => document.querySelector('.home .btn.shine').click());
await until(() => !!window.__client.view && !!document.querySelector('.hud, .corner'));
console.log('Play vs bots: lobby shown', await seen(), 'times');
await page.screenshot({ path: `${dir}/bots.png` });

await page.evaluate(() => window.__client.leave());
await until(() => !window.__client.lobby);
await menuReady();
await page.waitForTimeout(1000);
await page.evaluate(() => document.querySelector('.home .btn.purple:not(.rejoin)').click());
await until(() => !!document.querySelector('.campaign'));
await page.waitForTimeout(500);
await watch();
await page.evaluate(() => document.querySelector('.campaign .btn.big').click());
await until(() => !!window.__client.view && !!document.querySelector('.hud, .corner'));
console.log('Campaign mission: lobby shown', await seen(), 'times');
await page.screenshot({ path: `${dir}/mission.png` });
await browser.close();
