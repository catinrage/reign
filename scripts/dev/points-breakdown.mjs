// Dev: where the points come from. A Reign Extended game against bots plays itself (the bot logic
// plays your seat too); at turn MID, with a victory point card cheated into your hand, it shoots
// the points coin's tooltip on your plaque and an opponent's, then plays on to the end and shoots
// the standings with a points tooltip, wide and at phone width.
// Needs the dev server (cheats on): `pnpm build && npx tsx src/server/index.ts --dev`.
// Usage: MID=20 WIN_AT=0 MODE=extended|classic LANG_CODE=de node scripts/dev/points-breakdown.mjs <outDir> [base]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir = '/tmp/points-breakdown', base = 'http://localhost:8787'] = process.argv.slice(2);
const mode = process.env.MODE ?? 'extended';
const mid = Number(process.env.MID ?? 20);
const winAt = Number(process.env.WIN_AT ?? 0);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.addInitScript((lang) => {
	localStorage.setItem('reign:graphics', 'low');
	if (lang) localStorage.setItem('reign:lang', lang);
}, process.env.LANG_CODE ?? '');
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const until = (fn, arg, timeout = 1800000) => page.waitForFunction(fn, arg, { timeout, polling: 500 });
const settled = () =>
	until(() => !window.__scene?.dice?.busy && (window.__scene?.anim?.tweens?.length ?? 0) === 0, null, 60000).catch(() => {});
const shot = async (file) => {
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${dir}/${file}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', file);
};
/** Rest the mouse on an element so its tooltip shows. */
const hover = async (selector) => {
	await page.mouse.move(5, 5);
	await page.waitForTimeout(400);
	// A plaque can move under the pointer as the game goes on: aim again until the tooltip shows.
	for (let k = 0; k < 4; k++) {
		const box = await page.locator(selector).first().boundingBox();
		await page.mouse.move(box.x + box.width / 2 - 1, box.y + box.height / 2);
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		const on = await until(() => !!document.querySelector('.reign-tip.on'), null, 5000).then(() => true, () => false);
		if (on) return;
		await page.mouse.move(5, 5);
	}
	console.log('no tooltip on', selector);
};

await signIn(page, base);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
// A room asked for before the line is up goes nowhere.
await until(() => window.__client.status === 'online', null, 120000);
await page.waitForTimeout(1500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby, null, 30000).catch(async () => {
	await page.evaluate(() => window.__client.create());
	await until(() => !!window.__client.lobby, null, 120000);
});
await page.evaluate((mode) => {
	const c = window.__client;
	if (mode === 'extended') {
		c.send({ t: 'setMode', mode: 'extended' });
		c.send({ t: 'setPointsToWin', points: 10 });
		// No draft, and no event cards holding every round up: the game gets there sooner.
		c.send({ t: 'setCharacters', on: false });
		c.send({ t: 'setEvents', events: { on: false, every: 1, wild: true, pulled: [] } });
	}
	for (let i = 0; i < 3; i++) c.send({ t: 'addBot' });
}, mode);
await until(() => window.__client.lobby?.seats.length === 4, null, 60000);
await page.click('.start', { force: true });
await until(() => !!window.__client.view);
await page.evaluate(() => {
	const c = window.__client;
	c.send({ t: 'cheat', cheat: { type: 'fastBots', on: true } });
	c.send({ t: 'cheat', cheat: { type: 'finishSetup' } });
});
const started = Date.now();
const progress = setInterval(async () => {
	const at = await page.evaluate(() => `turn ${window.__client.view?.turn} ${window.__client.view?.step}`).catch(() => '?');
	console.log(`${Math.round((Date.now() - started) / 1000)} s: ${at}`);
}, 30000);

// Mid-game: a hidden card in your hand, the coins' tooltips.
await until((turn) => (window.__client.view?.turn ?? 0) >= turn, mid);
await page.evaluate(() => {
	const c = window.__client;
	c.send({ t: 'cheat', cheat: { type: 'devCard', player: c.view.me, card: 'victoryPoint' } });
});
await until(() => window.__client.view.players[window.__client.view.me].devCards.some((d) => d.type === 'victoryPoint'), null, 60000);
// Bots go back to a normal pace while the tooltips are shot (a pause would curtain the plaques).
await page.evaluate(() => window.__client.send({ t: 'cheat', cheat: { type: 'fastBots', on: false } }));
await page.waitForTimeout(2500);
await settled();
await hover('.players .player.me .vp');
await shot('plaque-tip-you');
// The opponent with the most points, holding a development card or two so the note on what they
// may hide shows (a knight is cheated in if they hold none).
const opp = await page.evaluate(() => {
	const v = window.__client.view;
	const i = v.players.map((p, i) => ({ i, pts: p.publicPoints })).filter((p) => p.i !== v.me).sort((a, b) => b.pts - a.pts)[0].i;
	if (!v.players[i].devCardCount) window.__client.send({ t: 'cheat', cheat: { type: 'devCard', player: i, card: 'knight' } });
	return i;
});
await until((i) => window.__client.view.players[i].devCardCount > 0, opp, 30000).catch(() => {});
await hover(`.players [data-plaque="${opp}"] .vp`);
await shot('plaque-tip-opponent');
await page.mouse.move(5, 5);
await page.evaluate(() => window.__client.send({ t: 'cheat', cheat: { type: 'fastBots', on: true } }));

// Close to the goal the bot logic on your seat raises a castle when it can pay for one: hand it the
// goods so the standings show one (Reign Extended only).
if (mode === 'extended') {
	await until(() => {
		const v = window.__client.view;
		return v.phase === 'ended' || (v.players[v.me].totalPoints ?? 0) >= v.pointsToWin - 3;
	});
	await page.evaluate(() => {
		const c = window.__client;
		if (c.view.phase !== 'ended')
			c.send({ t: 'cheat', cheat: { type: 'resources', player: c.view.me, resources: { brick: 3, wheat: 8, ore: 8 } } });
	});
}
if (winAt) {
	await until((turn) => (window.__client.view?.turn ?? 0) >= turn, winAt);
	await page.evaluate(() => window.__client.send({ t: 'cheat', cheat: { type: 'win', player: window.__client.view.me } }));
}
await until(() => window.__client.view?.phase === 'ended');
console.log(`game over after ${Math.round((Date.now() - started) / 1000)} s, turn ${await page.evaluate(() => window.__client.view.turn)}`);
console.log(JSON.stringify(await page.evaluate(() => window.__client.view.players.map((p) => [p.name, p.totalPoints, p.publicPoints]))));
await until(() => !!document.querySelector('.victory .board'), null, 60000);
await page.waitForTimeout(2500);
await shot('end-1366');
await hover('.victory .rank.first .pts');
await shot('end-1366-tip');
await hover('.victory .rank:nth-child(3) .part');
await shot('end-1366-part-tip');
await page.mouse.move(5, 5);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(2500);
await shot('end-390');
console.log(errors.length ? errors.join('\n') : 'no errors');
clearInterval(progress);
await browser.close();
