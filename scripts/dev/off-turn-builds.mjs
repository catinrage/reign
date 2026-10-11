// Dev: the build deck on someone else's turn. Plays an Extended game against bots and shoots the
// deck up but closed while a bot plays, with its tooltip, then your own turn before the roll.
// Needs the dev game server (cheats). Usage:
//   BASE=http://localhost:5173 node scripts/dev/off-turn-builds.mjs <outPrefix> [width] [height] [mode]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/off-turn', w = '1366', h = '768', mode = 'extended'] = process.argv.slice(2);
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

await page.addInitScript(() => localStorage.setItem('reign:graphics', 'low'));
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
const rects = () =>
	page.evaluate(() => {
		const r = (s) => {
			const e = document.querySelector(s);
			if (!e) return null;
			const b = e.getBoundingClientRect();
			return [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)].join(',');
		};
		return JSON.stringify({ players: r('.players'), builds: r('.builds'), roll: r('.actions .roll'), row: r('.actions .row'), hand: r('.hand'), plaque: r('.builds .build') });
	});
const myStep = (step) =>
	until((step) => {
		const v = window.__client.view;
		return v && v.phase === 'main' && v.current === v.me && v.step === step && !window.__client.tossing;
	}, step);
// Your turn before the roll: the deck is up but closed, under the Roll dice button.
await myStep('roll');
await cheat({ type: 'resources', player: me, resources: { wood: 2, brick: 2, sheep: 1, wheat: 2, ore: 3 } });
await shot('roll');
console.log('roll', await rects());
if (!phone) await page.hover('.builds .build[data-kind="settlement"]', { force: true });
else await page.tap('.builds .build[data-kind="settlement"]', { force: true });
await shot('roll-tip', 900);
await cheat({ type: 'rigDice', total: 9 });
await page.evaluate(() => window.__client.act({ type: 'rollDice' }));
await myStep('main');
await shot('main', 3000);
console.log('main', await rects());
// Someone else's turn: the deck stays up, closed.
await page.evaluate(() => window.__client.act({ type: 'endTurn' }));
await until(() => window.__client.view.current !== window.__client.view.me);
await shot('off-turn', 800);
console.log('off', await rects());
const info = await page.evaluate(() =>
	[...document.querySelectorAll('.builds .build')].map((b) => [b.dataset.kind ?? 'path', b.disabled, b.getAttribute('aria-disabled')].join(':'))
);
console.log(info.join(' '));
if (phone) await page.tap('.builds .build[data-kind="road"]', { force: true });
else await page.hover('.builds .build[data-kind="road"]', { force: true });
await shot('off-turn-tip', 600);
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
