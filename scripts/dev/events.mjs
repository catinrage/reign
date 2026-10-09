// Dev helper: Reign Extended's Events deck. The lobby with the Events card and its panel, then a
// game against bots: the first card turning over, the round's card in the corner, a Royal Decree
// to pick, a Bountiful Year to take, and an earthquake. Cards are flipped with the dev cheat, so
// run it against `pnpm dev`.
// Usage: node scripts/dev/events.mjs <outDir> [width] [height] [base]
// ONLY=lobby,flip,... takes just those shots.
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, w = '1600', h = '900', base = 'http://localhost:5173'] = process.argv.slice(2);
const only = process.env.ONLY?.split(',');
const want = (name) => !only || only.includes(name);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.text().startsWith('TOAST') && console.log(m.text()));
const shot = async (name, wait = 1500) => {
	if (!want(name)) return;
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 300000) => page.waitForFunction(fn, arg, { timeout, polling: 300 });
const send = (m) => page.evaluate((m) => window.__client.send(m), m);
const cheat = (c) => send({ t: 'cheat', cheat: c });
/** Flip a card with the cheat, retrying while the table is somewhere a card can't flip. */
async function flip(card) {
	for (let i = 0; i < 60; i++) {
		// A Royal Decree of ours still open holds the table: pick its first card.
		await page.evaluate(() => {
			const v = window.__client.latest;
			if (v?.step === 'eventChoice' && v.events.choice.player === v.me)
				window.__client.act({ type: 'chooseEvent', card: v.events.choice.cards[0] });
		});
		const ok = await page.evaluate(() => ['roll', 'main'].includes(window.__client.latest?.step));
		if (ok) {
			await cheat({ type: 'event', card });
			const done = await page
				.waitForFunction((card) => window.__client.latest?.log.some((e) => e.type === 'eventDrawn' && e.card === card && e.seq > (window.__seen ?? 0)), card, { timeout: 10000 })
				.then(() => true, () => false);
			if (done) {
				await page.evaluate(() => (window.__seen = window.__client.latest.log.at(-1).seq));
				return;
			}
		}
		await page.waitForTimeout(400);
	}
	throw new Error(`couldn't flip ${card}`);
}

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
await shot('lobby', 2500);
if (want('lobby-events')) {
	await page.click('.duo .pick >> nth=1', { force: true });
	await shot('lobby-events', 1200);
	await page.click('.modal .close', { force: true });
}
await page.click('.btn.start', { force: true });
await until(() => !!window.__client.view);
// Say what the table told us (a cheat that didn't take says why).
await page.evaluate(() => {
	const c = window.__client;
	const toast = c.toast.bind(c);
	c.toast = (m, k) => (console.log('TOAST', m), toast(m, k));
	// Screenshots are slow here: hold each card up long enough to catch it.
	window.__flipMs = 12000;
});
await page.waitForTimeout(1500);
await cheat({ type: 'finishSetup' });
// The first round's card turns over as the setup ends.
await until(() => window.__client.view?.phase === 'main');
await shot('flip', 300);
await page.evaluate(() => (window.__seen = window.__client.latest.log.at(-1).seq));
await page.click('.flip-backdrop', { force: true }).catch(() => {});
await shot('corner', 800);

// A Royal Decree: with an empty hand, you're the one in last place (everyone has 2 points).
await cheat({ type: 'clearHand', player: await page.evaluate(() => window.__client.view.me) });
await flip('royalDecree');
await until(() => window.__client.view?.step === 'eventChoice');
const mine = await page.evaluate(() => window.__client.view.events.choice.player === window.__client.view.me);
console.log('decree is mine:', mine);
await shot('decree-flip', 800);
await page.click('.flip-backdrop', { force: true }).catch(() => {});
await shot('decree-pick', 800);
if (mine) {
	await page.click('.choices .choice >> nth=0', { force: true });
	await shot('decree-picked', 1500);
}
await page.waitForTimeout(3000);

await flip('bountifulYear');
await shot('bounty-flip', 600);
await page.click('.flip-backdrop', { force: true }).catch(() => {});
await shot('bounty', 800);
if (await page.locator('.modal .close').count()) await page.click('.modal .close', { force: true });
await shot('bounty-later', 800);

await flip('earthquake');
await page.click('.flip-backdrop', { force: true }).catch(() => {});
await shot('quake', 300);
await shot('quake-after', 2500);

await flip('banditUprising');
await page.click('.flip-backdrop', { force: true }).catch(() => {});
await shot('bandits', 2500);
await browser.close();
