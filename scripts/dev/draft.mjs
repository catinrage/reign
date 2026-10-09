// Dev helper: the Reign Extended character draft. The host's lobby with the Characters card,
// the host leaving two out, then the draft itself: waiting on a bot, your own pick with a
// character pointed at and chosen, and the table once everyone has picked.
// Usage: node scripts/dev/draft.mjs <outDir> [bots] [width] [height] [base]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, bots = '3', w = '1600', h = '900', base = 'http://localhost:5173'] = process.argv.slice(2);
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
const until = (fn, timeout = 300000) => page.waitForFunction(fn, null, { timeout, polling: 300 });

await signIn(page, base, 'Komeil');
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await page.waitForTimeout(2000);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
// LEAVE=a,b picks who to leave out (default the Rogue and the Steward); HAND=n sets the hand limit.
const leave = (process.env.LEAVE ?? 'rogue,steward').split(',').filter(Boolean);
await page.evaluate(
	([bots, leave, hand]) => {
		const c = window.__client;
		c.send({ t: 'setMode', mode: 'extended' });
		for (let i = 0; i < bots; i++) c.send({ t: 'addBot' });
		for (const character of leave) c.send({ t: 'leaveOut', character, out: true });
		if (hand) c.send({ t: 'setHandLimit', cards: hand });
	},
	[Number(bots), leave, Number(process.env.HAND ?? 0)]
);
await page.waitForSelector('.extended .pick', { timeout: 120000 });
await shot('lobby', 2500);
await page.click('.extended .pick >> nth=0', { force: true });
await shot('characters', 1200);
await page.keyboard.press('Escape');
if (await page.locator('.modal').count()) await page.click('.modal .close', { force: true });
await page.waitForTimeout(500);
await page.click('.btn.start', { force: true });
await until(() => window.__client.view?.phase === 'draft');
await page.waitForTimeout(300);
// Someone else's pick first, when the draft doesn't open on ours.
if (await page.evaluate(() => window.__client.view.current !== window.__client.view.me)) await shot('draft-waiting', 1500);
await until(() => window.__client.view?.current === window.__client.view?.me || window.__client.view?.phase !== 'draft');
await page.waitForTimeout(600);
const cards = page.locator('.pool .card:not(.taken)');
await cards.nth(1).click({ force: true });
const steward = page.locator('.pool .card:not(.taken)', { hasText: 'Aldous' });
await ((await steward.count()) ? steward : cards.nth(2)).hover({ force: true });
await shot('draft-mine', 1200);
await page.click('.foot .btn.green', { force: true });
await until(() => window.__client.view?.phase !== 'draft');
await shot('after', 3000);
await browser.close();
