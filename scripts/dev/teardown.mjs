// Dev: tearing down a workshop in Reign Extended. Builds two, then takes the build menu with the
// Tear down plaque hovered, the pick (a red marker over each of your workshops), the hovered
// workshop trembling in its red shell, the fall frame by frame (the scene's loop is stopped and
// stepped, so the frames don't depend on how fast the machine renders), and the board once the
// Lumber is back in hand.
// Needs the dev game server (cheats). Usage:
//   BASE=http://localhost:5173 node scripts/dev/teardown.mjs <outPrefix> [width] [height]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/teardown', w = '1440', h = '900'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()));
const shot = async (name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 300000) => page.waitForFunction(fn, arg, { timeout, polling: 400 });
const cheat = (c) => page.evaluate((c) => window.__client.send({ t: 'cheat', cheat: c }), c);
const me = () => page.evaluate(() => window.__client.view.me);
/** Step the stopped scene by `n` frames of 0.05 s each, however long each takes to draw. */
const step = (n) =>
	page.evaluate((n) => {
		const clock = window.__scene.stage.clock;
		const real = clock.getDelta;
		clock.getDelta = () => 0.05;
		try {
			for (let i = 0; i < n; i++) window.__scene.stage.frame();
		} finally {
			clock.getDelta = real;
		}
	}, n);

await signIn(page, base);
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await until(() => window.__account?.status === 'in');
await page.waitForTimeout(2500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await page.evaluate(() => {
	const c = window.__client;
	c.send({ t: 'setMode', mode: 'extended' });
	c.send({ t: 'setMap', map: { preset: 'great' } });
	for (let i = 0; i < 3; i++) c.send({ t: 'addBot' });
	c.send({ t: 'setCharacters', on: false });
});
await page.waitForTimeout(3000);
await page.click('.start', { force: true });
await until(() => !!window.__client.view);
await cheat({ type: 'fastBots', on: true });
await cheat({ type: 'finishSetup' });
await until(() => {
	const v = window.__client.view;
	return v && v.phase === 'main' && v.current === v.me && v.step === 'roll' && !window.__client.tossing;
});
await cheat({ type: 'rigDice', total: 9 });
await page.evaluate(() => window.__client.act({ type: 'rollDice' }));
await until(() => {
	const v = window.__client.view;
	return v && v.phase === 'main' && v.current === v.me && v.step === 'main';
});
// On a slow machine the interface stops waiting before the scene's dice are down: wait for them
// and the cards they deal, or those rise in the middle of the fall.
const still = () => until(() => !window.__scene.dice.busy && window.__scene.anim.tweens.length === 0);
await still();
await cheat({ type: 'resources', player: await me(), resources: { wood: 4, brick: 4, sheep: 1, wheat: 1, ore: 4 } });
await page.waitForTimeout(1500);

// Two workshops, so the pick has a choice: each on the tile on offer nearest the middle of the
// screen, clear of the panels. A click the board misses (the camera still gliding, say) is
// made again through the rules.
for (let k = 0; k < 2; k++) {
	await page.click('.build:has-text("Workshop")', { force: true });
	await page.mouse.move(20, 450);
	await page.waitForTimeout(1500);
	const spot = await page.evaluate(() => {
		const d = (p) => Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2);
		return window.__scene.debugPickPoints().sort((a, b) => d(a) - d(b))[0];
	});
	await page.mouse.move(spot.x, spot.y);
	await page.waitForTimeout(600);
	await page.mouse.click(spot.x, spot.y);
	const built = await until((n) => {
		const v = window.__client.latest ?? window.__client.view;
		return (v.workshops ?? []).filter((o) => o === v.me).length === n;
	}, k + 1, 15000).then(() => true, () => false);
	if (!built) {
		console.log('the click missed the tile, building through the rules', JSON.stringify(spot));
		await page.keyboard.press('Escape');
		await page.evaluate((hex) => window.__client.act({ type: 'buildWorkshop', hex }), spot.id);
		await until((n) => {
			const v = window.__client.latest ?? window.__client.view;
			return (v.workshops ?? []).filter((o) => o === v.me).length === n;
		}, k + 1, 60000);
	}
	await page.waitForTimeout(1500);
}
const shops = await page.evaluate(() => {
	const v = window.__client.view;
	return v.workshops.flatMap((o, h) => (o === v.me ? [h] : []));
});
console.log('workshops', JSON.stringify(shops));
// Close over the first one.
await page.evaluate((h) => {
	const s = window.__scene;
	const p = s.boardView.plotSpot(h).pos;
	s.stage.rig.set({ radius: 80, polar: 0.88, target: { x: p.x, y: p.y + 2, z: p.z } }, true);
}, shops[0]);
await page.mouse.move(10, 10);
await page.hover('.build:has-text("Tear down")', { force: true });
await shot('menu', 2000);
await page.click('.build:has-text("Tear down")', { force: true });
await page.mouse.move(20, 450);
await shot('pick', 2000);
const pt = await page.evaluate((h) => window.__scene.debugPickPoints().find((p) => p.id === h), shops[0]);
await page.mouse.move(pt.x, pt.y);
await shot('hover', 1500);

// The fall, frame by frame.
await still();
await page.evaluate(() => window.__scene.stage.stop());
await step(1);
const target = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, pt);
if (target !== 'CANVAS') console.log('the pointer is over', target, 'not the board');
await page.mouse.click(pt.x, pt.y);
const gone = (h) => (window.__client.latest ?? window.__client.view).workshops[h] === null;
if (!(await until(gone, shops[0], 15000).then(() => true, () => false))) {
	console.log('the click missed the workshop, tearing it down through the rules');
	await page.evaluate((hex) => window.__client.act({ type: 'tearDownWorkshop', hex }), shops[0]);
	await until(gone, shops[0], 60000);
}
await page.mouse.move(20, 450);
await step(4);
await shot('fall-1', 300);
await step(4);
await shot('fall-2', 300);
await step(5);
await shot('fall-3', 300);
await step(6);
await shot('fall-4', 300);
// The rest of the fall, and the Lumber rising off the tile and flying to the hand.
await step(12);
await shot('fall-5', 300);
await page.evaluate(() => window.__scene.stage.start());
await shot('after', 2500);
const left = await page.evaluate(() => {
	const v = window.__client.latest ?? window.__client.view;
	return { workshops: v.workshops.filter((o) => o === v.me).length, wood: v.players[v.me].resources?.wood, last: v.log.at(-1) };
});
console.log(JSON.stringify({ left, errors: errors.slice(0, 10) }));
await browser.close();
