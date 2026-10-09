// Dev: the Reign Extended buildings from the host's switches to a workshop paying out. Takes the
// lobby with its Buildings plaque, the switches, the build menu (and its tooltip when you can't
// build yet), picking a tile, the new workshop, the roll that pays it, and the workshop lit up
// while your plaque is hovered.
// Needs the dev game server (cheats). Usage:
//   BASE=http://localhost:5173 node scripts/dev/buildings.mjs <outPrefix> [width] [height]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/buildings', w = '1440', h = '900'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
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
const myMain = () => until(() => {
	const v = window.__client.view;
	return v && v.phase === 'main' && v.current === v.me && v.step === 'main';
});
const myRoll = () => until(() => {
	const v = window.__client.view;
	return v && v.phase === 'main' && v.current === v.me && v.step === 'roll' && !window.__client.tossing;
});

await signIn(page, base);
await page.goto(`${base}/`);
await until(() => window.__ready === true);
// Signed in, so the green button is the home screen's and not the sign-in form's.
await until(() => window.__account?.status === 'in');
await page.waitForTimeout(2500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await page.evaluate(() => {
	const c = window.__client;
	c.send({ t: 'setMode', mode: 'extended' });
	c.send({ t: 'setMap', map: { preset: 'great' } });
	for (let i = 0; i < 3; i++) c.send({ t: 'addBot' });
});
await shot('lobby', 2500);
await page.click('text=Choose buildings', { force: true });
await page.waitForSelector('.modal .seg');
await shot('switches', 2500);
await page.click('.modal .seg .btn:has-text("Off")', { force: true });
await page.waitForTimeout(600);
await page.click('.modal .close', { force: true });
await shot('lobby-off', 1000);
await page.click('text=Choose buildings', { force: true });
await page.waitForTimeout(600);
await page.click('.modal .seg .btn:has-text("On")', { force: true });
await page.waitForTimeout(600);
await page.click('.modal .close', { force: true });
await page.waitForTimeout(600);

// No character draft, so the game goes straight to its setup (which a cheat finishes).
await page.evaluate(() => window.__client.send({ t: 'setCharacters', on: false }));
await page.waitForTimeout(600);
await page.click('.start', { force: true });
await until(() => !!window.__client.view);
await cheat({ type: 'fastBots', on: true });
await cheat({ type: 'finishSetup' });
await myRoll();
await cheat({ type: 'rigDice', total: 9 });
await page.evaluate(() => window.__client.act({ type: 'rollDice' }));
await myMain();
await cheat({ type: 'clearHand', player: await page.evaluate(() => window.__client.view.me) });
await page.waitForTimeout(1500);
await page.hover('.build:has-text("Workshop")', { force: true });
await shot('tip-need', 1200);
await cheat({ type: 'resources', player: await page.evaluate(() => window.__client.view.me), resources: { wood: 3, brick: 3, sheep: 1, wheat: 2, ore: 2 } });
await page.waitForTimeout(1500);
await page.mouse.move(10, 10);
await page.hover('.build:has-text("Workshop")', { force: true });
await shot('menu', 1200);
await page.click('.build:has-text("Workshop")', { force: true });
await page.mouse.move(20, 450);
await page.evaluate(() => window.__scene.stage.rig.set({ radius: 210 }, true));
await shot('pick', 2500);

// Hover the best tile on offer (a ghost workshop shows), then click to build there.
const spot = await page.evaluate(() => {
	const v = window.__client.view;
	const pts = window.__scene.debugPickPoints();
	const num = (p) => v.board.hexes[p.id].number;
	return pts.find((p) => [6, 8].includes(num(p))) ?? pts.find((p) => [5, 9].includes(num(p))) ?? pts[0];
});
console.log('hover tile', JSON.stringify(spot));
await page.mouse.move(spot.x, spot.y);
await shot('ghost', 1500);
await page.mouse.click(spot.x, spot.y);
await page.waitForTimeout(1500);
const shop = await page.evaluate(() => {
	const v = window.__client.latest ?? window.__client.view;
	const h = v.workshops.findIndex((o) => o === v.me);
	return h >= 0 ? { h, number: v.board.hexes[h].number } : null;
});
console.log('workshop', JSON.stringify(shop));
if (!shop) {
	console.log(JSON.stringify({ errors }));
	await browser.close();
	process.exit(1);
}
await page.evaluate((h) => {
	const s = window.__scene;
	const p = s.boardView.plotSpot(h).pos;
	s.stage.rig.set({ radius: 70, polar: 0.9, target: { x: p.x, y: p.y + 2, z: p.z } });
}, shop.h);
await shot('built', 3000);

// The next turn, roll the workshop's number and watch it pay. Meanwhile no 7s: you'd have to
// discard, and the robber could land on the workshop's tile. Bots keep to their own pace, so
// each of their rolls can be rigged before it happens.
await cheat({ type: 'clearHand', player: await page.evaluate(() => window.__client.view.me) });
await cheat({ type: 'fastBots', on: false });
const safe = shop.number === 6 ? 5 : 6;
await cheat({ type: 'rigDice', total: safe });
await page.evaluate(() => window.__client.act({ type: 'endTurn' }));
let rigged = await page.evaluate(() => window.__client.view.turn + 1);
for (;;) {
	const v = await page.evaluate(() => {
		const v = window.__client.view;
		return { turn: v.turn, current: v.current, me: v.me, step: v.step, tossing: window.__client.tossing };
	});
	if (v.current === v.me && v.step === 'roll' && !v.tossing) break;
	if (v.current !== v.me && v.step === 'roll' && v.turn !== rigged) {
		await cheat({ type: 'rigDice', total: safe });
		rigged = v.turn;
	}
	await page.waitForTimeout(150);
}
await cheat({ type: 'fastBots', on: true });
await cheat({ type: 'rigDice', total: shop.number });
await page.evaluate(() => window.__client.act({ type: 'rollDice' }));
await until(() => window.__client.view.step === 'main' || window.__client.view.step === 'moveRobber', null, 60000);
await shot('pays', 300);
await shot('paid', 2500);

// Hovering your plaque lights up your pieces, the workshop with its moving parts too.
await page.evaluate(() => window.__scene.anim.update(60));
const me = await page.evaluate(() => window.__client.view.me);
await page.hover(`.players .player >> nth=${me}`);
await until((seat) => window.__scene.lit[seat] === 1, me, 60000);
await shot('lit', 800);
await page.mouse.move(20, 450);
await until(() => window.__scene.lit.every((l) => l === 0), null, 60000);
await page.waitForTimeout(500);
const leftover = await page.evaluate(() => {
	const out = [];
	for (const p of window.__scene.pieces.values()) {
		if (p.glow || p.lift) out.push(p.key);
		p.obj.traverse((o) => o.name === 'glow' && out.push(`${p.key}:glow`));
	}
	return out;
});
console.log(JSON.stringify({ stillLit: leftover, errors: errors.slice(0, 10) }));
await browser.close();
