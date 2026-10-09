// Dev: Reign Extended taverns in a game against bots, from the lobby to the rumor coming true.
// Takes the lobby's Buildings panel (and the tavern greyed out with the Events deck off), the build
// panel with the Tavern plaque and its tooltip, the pick (markers over your buildings) and the
// tavern's ghost, the tavern built, the rumor chip in the corner with its tooltip and the card it
// holds up, the building's tooltip, a storehouse added beside the tavern, and the next round's card
// turning over, which must be the rumored one.
// Needs the dev game server (cheats). UI_LANG=de (or ru, zh-CN) plays it in that language, and
// QUALITY=veryLow (or low) draws it at that graphics quality, several times faster in software
// rendering; LOBBY=0 skips the lobby shots. Usage:
//   BASE=http://localhost:5173 node scripts/dev/tavern-play.mjs <outPrefix> [width] [height]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/tavern-play', w = '1440', h = '900'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const context = await browser.newContext({ viewport: { width: Number(w), height: Number(h) } });
if (process.env.UI_LANG) await context.addInitScript((c) => localStorage.setItem('reign:lang', c), process.env.UI_LANG);
if (process.env.QUALITY) await context.addInitScript((q) => localStorage.setItem('reign:quality', q), process.env.QUALITY);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()));
const shot = async (name, wait = 1500) => {
	await page.waitForTimeout(wait);
	// CSS animations jump to their end: under swiftshader a frame can take a second.
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 300000) => page.waitForFunction(fn, arg, { timeout, polling: 400 });
const cheat = (c) => page.evaluate((c) => window.__client.send({ t: 'cheat', cheat: c }), c);
const act = (a) => page.evaluate((a) => window.__client.act(a), a);
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
const away = () => page.mouse.move(20, 450);
/**
 * Wait for the board to come to rest: the dice down and every drop-in, squash and shrink done. A
 * frame steps the board by 0.05 s at most, and in software rendering at High a frame takes seconds.
 */
const settle = () => until(() => !window.__scene.dice.busy && window.__scene.anim.tweens.length === 0);
const latest = () => page.evaluate(() => window.__client.latest ?? window.__client.view);
/** My turn, waiting for `step`, with no card turning over and no dice in the air. */
const myStep = (step) =>
	until((step) => {
		const c = window.__client;
		const v = c.view;
		return v?.phase === 'main' && v.current === v.me && v.step === step && !c.tossing && !c.presenting;
	}, step);
const TAVERN = '.build[data-kind="tavern"]';

await signIn(page, base);
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await until(() => window.__account?.status === 'in');
await page.waitForTimeout(2500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
// Reign Extended has every building on unless the host says otherwise. No character draft (the
// game goes straight to its setup, which a cheat finishes). The Events deck is on, but without the
// Royal Decree and the Bountiful Year, which would wait on a choice.
const deck = { on: true, every: 1, wild: true, pulled: ['royalDecree', 'bountifulYear'] };
await page.evaluate((deck) => {
	const c = window.__client;
	c.send({ t: 'setMode', mode: 'extended' });
	for (let i = 0; i < 3; i++) c.send({ t: 'addBot' });
	c.send({ t: 'setCharacters', on: false });
	c.send({ t: 'setEvents', events: deck });
}, deck);
await page.waitForSelector('.start:not([disabled])', { timeout: 120000 });
await page.waitForTimeout(1000);

// The lobby's Buildings panel, then with the Events deck off: the tavern is out of the game.
// LOBBY=0 skips these.
if (process.env.LOBBY !== '0') {
	await page.click('.duo > .pick:first-child', { force: true });
	await page.waitForSelector('.modal .row', { timeout: 30000 });
	await page.locator('.modal .row[data-kind="tavern"]').scrollIntoViewIfNeeded();
	await shot('lobby', 800);
	await page.evaluate(() => window.__client.send({ t: 'setEvents', events: { on: false, every: 1, wild: true, pulled: [] } }));
	await page.waitForSelector('.modal .needs', { timeout: 30000 });
	await page.locator('.modal .needs').scrollIntoViewIfNeeded();
	await shot('lobby-off', 800);
	console.log('summary without events:', await page.evaluate(() => document.querySelector('.duo > .pick:first-child .pick-name')?.textContent));
	await page.evaluate((deck) => window.__client.send({ t: 'setEvents', events: deck }), deck);
	await page.click('.modal .close', { force: true });
	await page.waitForSelector('.modal', { state: 'detached', timeout: 30000 });
}

await page.click('.start', { force: true });
await until(() => !!window.__client.view);
await cheat({ type: 'fastBots', on: true });
await cheat({ type: 'finishSetup' });
await myStep('roll');
await cheat({ type: 'rigDice', total: 6 });
await act({ type: 'rollDice' });
await myStep('main');

// A Lumber and a Grain for the tavern, and a Lumber, a Wool and a Grain for the storehouse after it.
const me = await page.evaluate(() => window.__client.view.me);
await cheat({ type: 'clearHand', player: me });
await cheat({ type: 'resources', player: me, resources: { wood: 2, wheat: 2, sheep: 1 } });
await page.waitForTimeout(2500);
console.log('Tavern tooltip:', await tipAt(...(await center(TAVERN))));
await shot('menu', 300);
await away();

// The pick: markers over your buildings, then the tavern's ghost against a wall.
await page.click(TAVERN, { force: true });
await away();
console.log('prompt:', await page.evaluate(() => document.querySelector('.prompt')?.innerText.replace(/\s+/g, ' ').trim()));
await shot('pick', 2500);
const home = await page.evaluate(() => {
	const v = window.__client.view;
	return v.buildings.findIndex((b) => b?.owner === v.me);
});
const look = (v, radius = 30, azimuth) =>
	page.evaluate(
		([v, radius, azimuth]) => {
			const s = window.__scene;
			s.stage.rig.set({ radius, polar: 0.95, target: s.boardView.vertexPos(v), ...(azimuth === undefined ? {} : { azimuth }) }, true);
		},
		[v, radius, azimuth]
	);
const hoverPick = async (id) => {
	await page.waitForTimeout(1500);
	const pt = await page.evaluate((id) => window.__scene.debugPickPoints().find((p) => p.id === id), id);
	await page.mouse.move(pt.x, pt.y);
	return pt;
};
// Face the wall the tavern goes on.
const facing = await page.evaluate(() => window.__scene.ghosts.getObjectByName('ghost')?.rotation.y);
await look(home, 30, facing);
await away();
let pt = await hoverPick(home);
await shot('ghost', 1500);
await page.mouse.click(pt.x, pt.y);
await until((v) => (window.__client.latest ?? window.__client.view).taverns?.[v], home, 30000);
await away();
await page.waitForTimeout(500);
await settle();
await shot('built', 800);

// The rumor in the corner, its tooltip, and the card it holds up.
await page.waitForSelector('.rumor-chip', { timeout: 30000 });
const rumor = (await latest()).events.rumor;
console.log('rumor:', rumor);
console.log('rumor tooltip:', await tipAt(...(await center('.rumor-chip'))));
await shot('rumor', 300);
await page.click('.rumor-chip', { force: true });
await page.waitForSelector('.flip-backdrop', { timeout: 30000 });
console.log('held up:', await page.evaluate(() => document.querySelector('.flip-head')?.textContent.trim()));
await shot('rumor-card', 1200);
await page.click('.flip-backdrop', { force: true });
await away();

// The building's tooltip names the tavern and the rumor.
const at = await page.evaluate((v) => {
	const s = window.__scene;
	const p = [...s.pieces.values()].find((p) => p.key.startsWith(`v${v}:`));
	return s.project(p.obj.localToWorld(p.obj.position.clone().set(0, 3, 0)));
}, home);
console.log('building tooltip:', await tipAt(at.x, at.y));
await shot('tip', 300);
await away();

// A storehouse beside it: it keeps clear of the tavern's wall.
await act({ type: 'buildStorehouse', vertex: home });
await until((v) => (window.__client.latest ?? window.__client.view).storehouses?.[v], home, 30000);
await page.waitForTimeout(500);
await settle();
await look(home, 34, facing + 0.6);
await shot('both', 1500);
console.log(
	'annexes:',
	await page.evaluate((v) => [...window.__scene.pieces.keys()].filter((k) => new RegExp(`^[st]${v}:`).test(k)), home)
);

// The round ends: the card that turns over is the one the tavern heard of. The bots take their
// turns first; the card is held up longer than in play, for the picture.
const flips = await page.evaluate(() => {
	const v = window.__client.latest ?? window.__client.view;
	let r = Math.floor((Math.max(1, v.turn) - 1) / v.players.length) + 2;
	while ((r - 1) % v.events.every) r++;
	return r;
});
await page.evaluate(() => (window.__flipMs = 8000));
await act({ type: 'endTurn' });
await until((flips) => window.__client.presenting?.round === flips, flips, 600000);
const flipped = await page.evaluate(() => window.__client.presenting.card);
await shot('flipped', 600);
console.log('turned over:', flipped, flipped === rumor ? '(as rumored)' : '(NOT the rumor)');
console.log('next rumor:', (await latest()).events.rumor);
console.log(
	'chronicle:',
	await page.evaluate(() => [...document.querySelectorAll('.log .line')].slice(-8).map((e) => e.textContent.replace(/\s+/g, ' ').trim()))
);
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
