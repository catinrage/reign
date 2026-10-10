// Dev: auto roll against bots. Turns the corner switch on, then checks that the dice roll by
// themselves on your roll step (and how long that takes), that a Knight played first starts the
// wait over, that a paused game doesn't roll, and that switching it off leaves the roll to you.
// Needs the dev game server (cheats). Usage:
//   BASE=http://localhost:5173 node scripts/dev/auto-roll.mjs <outPrefix>
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/auto-roll'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on(
	'console',
	(m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text())
);
const shot = async (name, wait = 0) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 300000) =>
	page.waitForFunction(fn, arg, { timeout, polling: 100 });
const cheat = (c) => page.evaluate((c) => window.__client.send({ t: 'cheat', cheat: c }), c);
const me = () => page.evaluate(() => window.__client.view.me);
/** My rolls so far. */
const myRolls = () =>
	page.evaluate(() => {
		const v = window.__client.latest;
		return v.log.filter((e) => e.type === 'diceRolled' && e.player === v.me).length;
	});
/** Waits for the Roll dice button to be up on my turn, and returns when it went up. */
const myRoll = async () => {
	await until(() => !!document.querySelector('.actions .roll'));
	return Date.now();
};
/** Moves the robber (after a Knight or a 7) and steals from whoever the server takes. */
const robber = async () => {
	const hex = await page.evaluate(() => {
		const v = window.__client.view;
		return v.board.hexes.findIndex((h, i) => i !== v.robberHex && h.number !== null);
	});
	await page.evaluate((hex) => window.__client.act({ type: 'moveRobber', hex }), hex);
	for (let victim = 0; victim < 4; victim++) {
		await page.waitForTimeout(400);
		if ((await page.evaluate(() => window.__client.view.step)) !== 'steal') break;
		await page.evaluate((victim) => window.__client.act({ type: 'steal', victim }), victim);
	}
};
const endTurn = async () => {
	await until(() => {
		const v = window.__client.view;
		return (
			v.current === v.me &&
			(v.step === 'main' || v.step === 'moveRobber') &&
			!window.__client.tossing
		);
	});
	if ((await page.evaluate(() => window.__client.view.step)) === 'moveRobber') await robber();
	await until(() => window.__client.view.step === 'main');
	await page.evaluate(() => window.__client.act({ type: 'endTurn' }));
};

await signIn(page, base);
await page.goto(`${base}/`);
// Low graphics, so screenshots are quick enough to catch the fuse burning.
await page.evaluate(() => localStorage.setItem('reign:graphics', 'medium'));
await page.goto(`${base}/`);
await until(() => window.__ready === true);
// Times, on the page's own clock, when the Roll dice button went up and when the roll was sent.
await page.evaluate(() => {
	window.__times = { up: [], rolled: [] };
	const act = window.__client.act.bind(window.__client);
	window.__client.act = (a) => {
		if (a.type === 'rollDice') window.__times.rolled.push(performance.now());
		return act(a);
	};
	let was = false;
	new MutationObserver(() => {
		const is = !!document.querySelector('.actions .roll');
		if (is && !was) window.__times.up.push(performance.now());
		was = is;
	}).observe(document.body, { subtree: true, childList: true });
});
await until(() => window.__account?.status === 'in');
await page.waitForTimeout(2500);
await page.click('text=Play vs bots', { force: true });
await until(() => !!window.__client.view);
await page.waitForTimeout(1500);
await shot('corner-off');
const sw = '.corner .auto-roll';
await page.click(sw, { force: true });
const stored = await page.evaluate(() => localStorage.getItem('reign:autoRoll'));
await page.hover(sw);
await shot('corner-on', 900);
await page.mouse.move(700, 450);
await cheat({ type: 'fastBots', on: true });
await cheat({ type: 'finishSetup' });

// 1. Rolls by itself.
const r0 = await myRolls();
await myRoll();
await until((n) => {
	const v = window.__client.latest;
	return v.log.filter((e) => e.type === 'diceRolled' && e.player === v.me).length > n;
}, r0);
const waited = await page.evaluate(() =>
	Math.round(window.__times.rolled[0] - window.__times.up[0])
);
await endTurn();

// 2. A Knight played first starts the wait over, and the roll still comes after it.
await cheat({ type: 'devCard', player: await me(), card: 'knight' });
await myRoll();
const r1 = await myRolls();
await page.evaluate(() => window.__client.act({ type: 'playKnight' }));
await until(() => window.__client.view.step === 'moveRobber');
await robber();
await until(() => window.__client.view.step === 'roll' || window.__client.view.step === 'main');
const backToRoll = await page.evaluate(() => window.__client.view.step);
await until((n) => {
	const v = window.__client.latest;
	return v.log.filter((e) => e.type === 'diceRolled' && e.player === v.me).length > n;
}, r1);
const afterKnight = (await myRolls()) - r1;
await endTurn();

// 3. Paused: no roll until the game goes on.
await myRoll();
await page.evaluate(() => window.__client.pauseGame(true));
await until(() => !!window.__client.lobby?.pausedBy);
const r2 = await myRolls();
await page.waitForTimeout(5000);
const whilePaused = (await myRolls()) - r2;
await page.evaluate(() => window.__client.pauseGame(false));
await until((n) => {
	const v = window.__client.latest;
	return v.log.filter((e) => e.type === 'diceRolled' && e.player === v.me).length > n;
}, r2);
await endTurn();

// 4. Switched off: the roll waits for you.
await page.click(sw, { force: true });
await myRoll();
const r3 = await myRolls();
await page.waitForTimeout(5000);
const whileOff = (await myRolls()) - r3;
await shot('off-roll');
// The fuse, held part-burnt for the picture (and the roll it would send held back).
await page.evaluate(() => {
	const act = window.__client.act;
	window.__client.act = (a) => a.type !== 'rollDice' && act(a);
	const st = document.createElement('style');
	st.textContent =
		'.fuse { animation-delay: -0.9s !important; animation-play-state: paused !important; }';
	document.head.append(st);
});
await page.click(sw, { force: true });
await shot('fuse', 500);
await page.screenshot({
	path: `${out}-fuse-zoom.png`,
	clip: { x: 1100, y: 760, width: 340, height: 140 }
});
await page.setViewportSize({ width: 390, height: 844 });
await shot('phone', 1500);

console.log(
	JSON.stringify({
		stored,
		waited,
		backToRoll,
		afterKnight,
		whilePaused,
		whileOff,
		errors: errors.slice(0, 10)
	})
);
await browser.close();
