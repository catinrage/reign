// Dev: a Reign Extended storehouse in a game against bots, from the build menu to a 7. Takes the
// build menu with its tooltip, the pick (markers over your buildings), the ghost against the wall
// it would go on, the storehouse dropping in, its tooltip, your plaque lighting it up, the hand's
// tooltip, and the discard on a 7 that leaves the storehouse's cards out.
// Needs the dev game server (cheats). Usage:
//   BASE=http://localhost:5173 node scripts/dev/storehouse-play.mjs <outPrefix> [width] [height]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/storehouse-play', w = '1440', h = '900'] = process.argv.slice(2);
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
/** Rest the pointer on a point until its tooltip shows; returns the tooltip's text (null: none). */
async function tipAt(x, y) {
	await page.mouse.move(x - 30, y - 30);
	await page.mouse.move(x, y, { steps: 4 });
	const on = await page.waitForSelector('.reign-tip.on', { timeout: 20000 }).catch(() => null);
	return on && (await page.evaluate(() => document.querySelector('.reign-tip').innerText.replace(/\s+/g, ' ').trim()));
}
const center = async (sel) => {
	const b = await page.locator(sel).first().boundingBox();
	return [b.x + b.width / 2, b.y + b.height / 2];
};
const myMain = () => until(() => {
	const v = window.__client.view;
	return v && v.phase === 'main' && v.current === v.me && v.step === 'main';
});

await signIn(page, base);
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await until(() => window.__account?.status === 'in');
await page.waitForTimeout(2500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
// Reign Extended has every building on unless the host says otherwise. No character draft, so the
// game goes straight to its setup (which a cheat finishes), and no events, which could stop a
// turn to wait for an answer.
await page.evaluate(() => {
	const c = window.__client;
	c.send({ t: 'setMode', mode: 'extended' });
	for (let i = 0; i < 3; i++) c.send({ t: 'addBot' });
	c.send({ t: 'setCharacters', on: false });
	c.send({ t: 'setEvents', events: { on: false, every: 1, wild: true, pulled: [] } });
});
await page.waitForSelector('.start:not([disabled])', { timeout: 120000 });
await page.waitForTimeout(1000);
await page.click('.start', { force: true });
await until(() => !!window.__client.view);
await cheat({ type: 'fastBots', on: true });
await cheat({ type: 'finishSetup' });
await until(() => {
	const v = window.__client.view;
	return v.phase === 'main' && v.current === v.me && v.step === 'roll' && !window.__client.tossing;
});
await cheat({ type: 'rigDice', total: 6 });
await page.evaluate(() => window.__client.act({ type: 'rollDice' }));
await myMain();

// A big hand: the storehouse's Lumber, Wool and Grain, and plenty more to keep safe.
const me = await page.evaluate(() => window.__client.view.me);
await cheat({ type: 'clearHand', player: me });
await cheat({ type: 'resources', player: me, resources: { wood: 4, sheep: 4, wheat: 4, brick: 2, ore: 2 } });
await page.waitForTimeout(1500);
console.log('menu tooltip:', await tipAt(...(await center('.build:has-text("Storehouse")'))));
await shot('menu', 300);
await page.click('.build:has-text("Storehouse")', { force: true });
await page.mouse.move(20, 450);
await shot('pick', 2500);

// Closer in on one of your buildings: hovering it shows the storehouse's ghost against its wall.
// The camera then comes round to face that wall, near enough that the number token of the tile
// in front doesn't hide it.
const id = await page.evaluate(() => window.__scene.debugPickPoints()[0].id);
const look = (id, azimuth) =>
	page.evaluate(
		([id, azimuth]) => {
			const s = window.__scene;
			const near = azimuth !== null;
			const at = s.boardView.vertexPos(id);
			s.stage.rig.set({ radius: near ? 30 : 60, polar: near ? 0.9 : 0.85, azimuth: near ? azimuth : undefined, target: at }, true);
		},
		[id, azimuth ?? null]
	);
const hoverPick = async (id) => {
	await page.waitForTimeout(1500);
	const pt = await page.evaluate((id) => window.__scene.debugPickPoints().find((p) => p.id === id), id);
	await page.mouse.move(pt.x, pt.y);
	return pt;
};
await look(id);
await hoverPick(id);
await until(() => !!window.__scene.ghosts.getObjectByName('ghost'), null, 30000);
await look(id, await page.evaluate(() => window.__scene.ghosts.getObjectByName('ghost').rotation.y));
await page.mouse.move(20, 450);
const pt = await hoverPick(id);
await shot('ghost', 1500);
await page.mouse.click(pt.x, pt.y);
await until(() => (window.__client.latest ?? window.__client.view).storehouses?.some((on) => on));
await page.mouse.move(20, 450);
await shot('built', 3000);

// Its tooltip: the building's, which mentions the storehouse.
// The middle of the storehouse's front, in its own voxels.
const at = await page.evaluate((me) => {
	const s = window.__scene;
	const p = [...s.pieces.values()].find((p) => p.key.startsWith('s') && p.owner === me);
	return s.project(p.obj.localToWorld(p.obj.position.clone().set(0, 1.5, 2.5)));
}, me);
console.log('piece tooltip:', await tipAt(at.x, at.y), await page.evaluate(() => window.__scene.hoverKey));
await shot('tip', 300);

// Hovering your plaque lights up your pieces: the storehouse floats with its building.
const [px, py] = await center(`.players .player >> nth=${me}`);
await page.mouse.move(px, py, { steps: 4 });
await until((seat) => window.__scene.lit[seat] === 1, me, 60000);
await shot('lit', 800);
await page.mouse.move(20, 450);
console.log('hand tooltip:', await tipAt(...(await center('.hand .total'))));
await shot('hand', 800);
await page.mouse.move(20, 450);

// Round to your next roll (the bots roll no 7s, and you turn down their trades), then a 7: the
// safe cards don't count.
await cheat({ type: 'rigDice', total: 6 });
await page.evaluate(() => window.__client.act({ type: 'endTurn' }));
let rigged = await page.evaluate(() => window.__client.view.turn + 1);
for (let i = 0; ; i++) {
	const v = await page.evaluate(() => {
		const v = window.__client.view;
		const t = v.trade;
		return {
			turn: v.turn,
			current: v.current,
			me: v.me,
			step: v.step,
			tossing: window.__client.tossing,
			offer: t && t.from !== v.me && t.responses[v.me] === undefined ? t.id : null
		};
	});
	if (v.current === v.me && v.step === 'roll' && !v.tossing) break;
	if (v.offer !== null) await page.evaluate((id) => window.__client.act({ type: 'respondTrade', offerId: id, accept: false }), v.offer);
	if (v.current !== v.me && v.step === 'roll' && v.turn !== rigged) {
		await cheat({ type: 'rigDice', total: 6 });
		rigged = v.turn;
	}
	if (i % 200 === 199) console.log('waiting for your roll', JSON.stringify(v));
	await page.waitForTimeout(150);
}
const before = await page.evaluate(() => window.__client.view.players[window.__client.view.me].resources);
await cheat({ type: 'rigDice', total: 7 });
await page.evaluate(() => window.__client.act({ type: 'rollDice' }));
await until(() => window.__client.view.step !== 'roll', null, 60000);
const after = await page.evaluate(() => {
	const v = window.__client.view;
	return { step: v.step, discard: v.pendingDiscards?.[v.me] ?? 0 };
});
console.log(JSON.stringify({ hand: before, ...after }));
// The dialog opens once the dice have landed.
await page.waitForSelector('text=The robber strikes!', { timeout: 60000 });
await shot('discard', 1500);
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
