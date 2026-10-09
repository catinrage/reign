// Dev helper: how each Reign Extended event card plays out at the table once it is put down
// (the headline, the island's part, the cards it moves, what each plaque lost or got). Cards are
// flipped with the dev cheat, so run it against `pnpm dev`.
// Usage: node scripts/dev/event-show.mjs <outDir> [width] [height] [base]
// CARDS=plagueOfRats,stormAtSea,... picks the cards (all of them by default).
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, w = '1366', h = '768', base = 'http://localhost:5173'] = process.argv.slice(2);
const cards = (process.env.CARDS ?? 'plagueOfRats,stormAtSea,earthquake,banditUprising,royalWedding,taxCollector,harvestFestival,comet,migratingHerds,travelingFair,bountifulYear').split(',');
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
// Screenshots take seconds here: slow the interface's animations down so each shot catches them.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Animation.enable');
const slow = (rate) => cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const until = (fn, arg, timeout = 300000) => page.waitForFunction(fn, arg, { timeout, polling: 300 });
const send = (m) => page.evaluate((m) => window.__client.send(m), m);
const cheat = (c) => send({ t: 'cheat', cheat: c });

await signIn(page, base, 'Komeil');
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await page.waitForTimeout(2000);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await page.evaluate(() => {
	const c = window.__client;
	c.send({ t: 'setMode', mode: 'extended' });
	c.send({ t: 'setCharacters', on: false });
	for (let i = 0; i < 3; i++) c.send({ t: 'addBot' });
});
await page.waitForSelector('.duo .pick', { timeout: 120000 });
await page.waitForTimeout(1500);
await page.click('.btn.start', { force: true });
await until(() => !!window.__client.view);
// Long enough to catch each stage in a slow browser.
await page.evaluate(() => {
	window.__flipMs = 600000;
	window.__effectMs = 600000;
});
await cheat({ type: 'finishSetup' });
await until(() => window.__client.presenting?.phase === 'flip');
await page.click('.flip-backdrop', { force: true });
await page.waitForTimeout(2000);
await page.evaluate(() => window.__client.presented(window.__client.presenting?.seq ?? 0));

for (const card of cards) {
	// Everyone holds plenty, so the cards that take some have something to take.
	const n = await page.evaluate(() => window.__client.latest.players.length);
	for (let p = 0; p < n; p++) await cheat({ type: 'resources', player: p, resources: { wood: 2, brick: 2, sheep: 2, wheat: 1, ore: 1 } });
	await page.waitForTimeout(800);
	const seq = await page.evaluate(() => window.__client.latest.log.at(-1).seq);
	for (let i = 0; i < 40; i++) {
		const ok = await page.evaluate(() => ['roll', 'main'].includes(window.__client.latest?.step));
		if (ok) break;
		await page.waitForTimeout(500);
	}
	await cheat({ type: 'event', card });
	await until((seq) => window.__client.presenting?.phase === 'flip' && window.__client.presenting.seq > seq, seq, 30000);
	await slow(Number(process.env.RATE ?? 0.1));
	await page.click('.flip-backdrop', { force: true });
	await page.waitForTimeout(Number(process.env.AFTER ?? 7000));
	console.log(await page.evaluate(() => ({ runners: document.querySelectorAll('.runner').length, deltas: [...document.querySelectorAll('.delta')].map((d) => d.textContent), drops: document.querySelectorAll('.drop').length })));
	await page.screenshot({ path: `${dir}/${card}.png`, timeout: 180000 });
	await slow(1);
	console.log('shot', card);
	await page.evaluate(() => window.__client.presented(window.__client.presenting?.seq ?? 0));
	await page.waitForTimeout(1500);
}
await browser.close();
