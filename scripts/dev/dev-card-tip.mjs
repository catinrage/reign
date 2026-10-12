// Dev: the development card plaque's tooltip, on your turn and off it. Plays a game against bots
// and hovers (or taps, on a phone) the plaque. Needs the dev game server (cheats). Usage:
//   BASE=http://localhost:5173 LANG_CODE=de node scripts/dev/dev-card-tip.mjs <outPrefix> [width] [height] [mode]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/dev-card-tip', w = '1366', h = '768', mode = 'classic'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const phone = Number(w) <= 900;
const page = await browser.newPage({
	viewport: { width: Number(w), height: Number(h) },
	...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {})
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()));
const shot = async (name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 300000) => page.waitForFunction(fn, arg, { timeout, polling: 300 });
const cheat = (c) => page.evaluate((c) => window.__client.send({ t: 'cheat', cheat: c }), c);

await page.addInitScript((lang) => {
	localStorage.setItem('reign:graphics', 'low');
	if (lang) localStorage.setItem('reign:lang', lang);
}, process.env.LANG_CODE ?? '');
await signIn(page, base);
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await page.evaluate(() => window.__client.create());
await until(() => !!window.__client.lobby);
await page.evaluate((mode) => {
	const c = window.__client;
	if (mode === 'extended') c.send({ t: 'setMode', mode: 'extended' });
	for (let i = 0; i < 3; i++) c.send({ t: 'addBot' });
}, mode);
await page.waitForTimeout(1000);
if (mode === 'extended') await page.evaluate(() => window.__client.send({ t: 'setCharacters', on: false }));
await page.waitForTimeout(600);
await page.evaluate(() => window.__client.send({ t: 'start' }));
await until(() => !!window.__client.view);
await cheat({ type: 'finishSetup' });
const me = await page.evaluate(() => window.__client.view.me);
const myStep = (step) =>
	until((step) => {
		const v = window.__client.view;
		return v && v.phase === 'main' && v.current === v.me && v.step === step && !window.__client.tossing;
	}, step);
// Your turn before the roll: the deck is up but closed, under the Roll dice button.
const hoverDev = async () => {
	if (phone) await page.tap('.builds .build[data-kind="devCard"]', { force: true });
	else await page.hover('.builds .build[data-kind="devCard"]', { force: true });
};
await myStep('roll');
await cheat({ type: 'resources', player: me, resources: { wood: 1, brick: 1, sheep: 2, wheat: 2, ore: 2 } });
await cheat({ type: 'rigDice', total: 9 });
await page.evaluate(() => window.__client.act({ type: 'rollDice' }));
await myStep('main');
// The deck settles once the dice land; hover after that so the tooltip stays on the plaque.
await page.waitForTimeout(5000);
await page.mouse.move(5, 5);
await hoverDev();
await shot('main-tip', 2500);
await page.evaluate(() => window.__client.act({ type: 'endTurn' }));
await until(() => window.__client.view.current !== window.__client.view.me);
await page.mouse.move(5, 5);
await hoverDev();
await shot('off-turn-tip', 2500);
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
