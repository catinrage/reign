// Dev helper: character powers. The host's character list with Traits and powers on, the draft's
// detail with a power, then a game where your character's power is ready: the Power button, its
// dialog, and (for powers that pick a spot) the board lit up and the result.
// Usage: CHAR=abbess node scripts/dev/powers.mjs <outDir> [width] [height] [base]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, w = '1600', h = '900', base = 'http://localhost:5173'] = process.argv.slice(2);
const char = process.env.CHAR ?? 'abbess';
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shot = async (name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${dir}/${char}-${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, arg = null, timeout = 300000) => page.waitForFunction(fn, arg, { timeout, polling: 300 });
const send = (msg) => page.evaluate((m) => window.__client.send(m), msg);

await signIn(page, base, 'Komeil');
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await page.waitForTimeout(2000);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await send({ t: 'setMode', mode: 'extended' });
for (let i = 0; i < 3; i++) await send({ t: 'addBot' });
if (process.env.RECHARGE) await send({ t: 'setRecharge', rounds: Number(process.env.RECHARGE) });
await page.waitForSelector('.extended .pick', { timeout: 120000 });
if (!process.env.SKIP_LOBBY) {
	await shot('lobby', 2500);
	await page.click('.extended .pick >> nth=0', { force: true });
	await shot('picker', 1200);
	await page.click('.modal .close', { force: true });
	await page.waitForTimeout(500);
}
await page.click('.btn.start', { force: true });
await until(() => window.__client.view?.phase === 'draft');
await until(() => window.__client.view?.current === window.__client.view?.me);
await page.waitForTimeout(800);
// The pool lists the cast in its usual order.
const CAST = ['merchant', 'mason', 'scholar', 'veteran', 'rogue', 'steward', 'shepherd', 'explorer', 'seer', 'alchemist', 'bard', 'witch', 'cartographer', 'baron', 'abbess', 'jester'];
await page.locator('.pool .card').nth(CAST.indexOf(char)).hover({ force: true });
if (!process.env.SKIP_LOBBY) await shot('draft', 1000);
await page.evaluate((c) => window.__client.act({ type: 'pickCharacter', character: c }), char);
await until(() => window.__client.view?.phase !== 'draft');
await send({ t: 'cheat', cheat: { type: 'finishSetup' } });
await until(() => window.__client.view?.phase === 'main');
// Wait for my turn, then set up the hand the power wants.
await until(() => {
	const v = window.__client.view;
	return v.current === v.me && (v.step === 'roll' || v.step === 'main') && !window.__client.tossing;
});
const me = await page.evaluate(() => window.__client.view.me);
await send({ t: 'cheat', cheat: { type: 'resources', player: me, resources: { wood: 3, sheep: 2, ore: 1, wheat: 1 } } });
if (char !== 'seer' && (await page.evaluate(() => window.__client.view.step)) === 'roll') {
	// No 7, so the turn goes straight on to building.
	await send({ t: 'cheat', cheat: { type: 'rigDice', total: 8 } });
	await page.waitForTimeout(300);
	await page.click('.btn.roll', { force: true });
	await until(() => {
		const v = window.__client.view;
		return v.step === 'main' && !window.__client.tossing;
	});
	await page.waitForTimeout(2500);
}
await page.waitForSelector('.btn.power', { timeout: 60000 });
await shot('turn', 1500);
await page.click('.btn.power', { force: true });
await shot('dialog', 1200);
if (await page.locator('.modal .btn.purple', { hasText: 'Pick on the board' }).count()) {
	await page.click('.modal .btn.purple', { force: true });
	await page.waitForTimeout(800);
	const pts = await page.evaluate(() => window.__scene?.debugPickPoints?.() ?? []);
	if (pts.length) {
		const p = pts[Math.floor(pts.length / 2)];
		await page.mouse.move(p.x, p.y);
		await shot('pick', 1200);
		await page.mouse.click(p.x, p.y);
		await page.waitForTimeout(800);
		if (char === 'cartographer') {
			const next = await page.evaluate(() => window.__scene?.debugPickPoints?.() ?? []);
			if (next.length) await page.mouse.click(next[0].x, next[0].y);
		}
		if (char === 'alchemist') {
			await shot('terrain', 1000);
			await page.click('.modal .card >> nth=0', { force: true });
		}
		await shot('after', 3500);
	}
} else if (char === 'seer') {
	await page.click('.modal .btn.purple', { force: true });
	await until(() => window.__client.view?.step === 'chooseRoll');
	await shot('rolls', 1200);
}
console.log(await page.evaluate(() => window.__client.view.log.slice(-6).map((e) => e.type).join(', ')));
console.log(await page.evaluate(() => JSON.stringify({ blessed: window.__client.view.blessed, claims: window.__client.view.claims, marks: window.__scene?.powerMarks?.children.length, inScene: !!window.__scene?.powerMarks?.parent })));
await browser.close();
