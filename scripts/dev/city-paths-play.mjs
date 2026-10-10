// Dev: Reign Extended city paths in a game against bots, from the build menu to the pieces. Takes
// the build panel with the City path plaque and its tooltip, the paths menu, the castle pick
// (markers over your cities) and its ghost, the castle going up, the guild hall's goods dialog,
// the guild hall with its tooltip, and the paths menu once every city has taken its path.
// Needs the dev game server (cheats). UI_LANG=de (or ru, zh-CN, fr) plays it in that language, and
// QUALITY=low (or medium) draws it at that graphics quality, several times faster in software
// rendering. Usage:
//   BASE=http://localhost:5173 node scripts/dev/city-paths-play.mjs <outPrefix> [width] [height]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/city-paths-play', w = '1440', h = '900'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const context = await browser.newContext({ viewport: { width: Number(w), height: Number(h) } });
if (process.env.UI_LANG) await context.addInitScript((c) => localStorage.setItem('reign:lang', c), process.env.UI_LANG);
if (process.env.QUALITY) await context.addInitScript((q) => localStorage.setItem('reign:graphics', q), process.env.QUALITY);
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
/** The City path plaque, and the plaques of the paths menu (castle, guild hall, fortress, Back). */
const CITY_PATH = '.build:has(.grown)';
const pathPlaque = (n) => `.builds .build >> nth=${n}`;

await signIn(page, base);
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await until(() => window.__account?.status === 'in');
await page.waitForTimeout(2500);
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
// Reign Extended has every building on unless the host says otherwise. No character draft (the
// game goes straight to its setup, which a cheat finishes) and no events, which could stop a turn.
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
await act({ type: 'rollDice' });
await until(() => {
	const v = window.__client.view;
	return v && v.phase === 'main' && v.current === v.me && v.step === 'main';
});

// Both settlements grow into cities, then the cards for every path.
const me = await page.evaluate(() => window.__client.view.me);
await cheat({ type: 'clearHand', player: me });
await cheat({ type: 'resources', player: me, resources: { wheat: 4, ore: 6 } });
await page.waitForTimeout(1000);
const towns = await page.evaluate(() => {
	const v = window.__client.view;
	return v.buildings.flatMap((b, i) => (b?.owner === v.me && b.kind === 'settlement' ? [i] : []));
});
for (const v of towns.slice(0, 2)) {
	await act({ type: 'buildCity', vertex: v });
	await until((v) => (window.__client.latest ?? window.__client.view).buildings[v]?.kind === 'city', v, 30000);
}
await cheat({ type: 'resources', player: me, resources: { ore: 4, wheat: 4, brick: 3, sheep: 2, wood: 1 } });
await page.waitForTimeout(2500);

console.log('City path tooltip:', await tipAt(...(await center(CITY_PATH))));
await shot('menu', 300);
await away();
await page.click(CITY_PATH, { force: true });
console.log('castle tooltip:', await tipAt(...(await center(pathPlaque(0)))));
await shot('paths', 300);

// The castle: markers over your cities, then its ghost over one of them.
await page.click(pathPlaque(0), { force: true });
await away();
console.log('prompt:', await page.evaluate(() => document.querySelector('.prompt')?.innerText.replace(/\s+/g, ' ').trim()));
await shot('pick', 2500);
const [a, b] = towns;
const look = (v, radius = 34) =>
	page.evaluate(
		([v, radius]) => {
			const s = window.__scene;
			s.stage.rig.set({ radius, polar: 0.95, target: s.boardView.vertexPos(v) }, true);
		},
		[v, radius]
	);
const hoverPick = async (id) => {
	await page.waitForTimeout(1500);
	const pt = await page.evaluate((id) => window.__scene.debugPickPoints().find((p) => p.id === id), id);
	await page.mouse.move(pt.x, pt.y);
	return pt;
};
await look(a);
await away();
let pt = await hoverPick(a);
await shot('ghost', 1500);
await page.mouse.click(pt.x, pt.y);
await until((v) => (window.__client.latest ?? window.__client.view).cityPaths?.[v] === 'castle', a, 30000);
await away();
await page.waitForTimeout(500);
await settle();
await shot('castle', 800);

// The guild hall: pick the other city, then name its goods.
await page.click(CITY_PATH, { force: true });
await page.click(pathPlaque(1), { force: true });
await look(b);
await away();
pt = await hoverPick(b);
await shot('guild-ghost', 1500);
await page.mouse.click(pt.x, pt.y);
await page.waitForSelector('.modal', { timeout: 30000 });
await shot('goods', 1200);
// The first card you can name.
await page.locator('.modal .card:not([disabled])').first().click();
await until((v) => (window.__client.latest ?? window.__client.view).cityPaths?.[v] === 'guildHall', b, 30000);
const named = (await latest()).guildGoods[b];
console.log('guild hall trades', named);
await away();
await page.waitForTimeout(500);
await settle();
await shot('guild', 800);

// Its tooltip, from the middle of the hall's front.
const at = await page.evaluate((v) => {
	const s = window.__scene;
	const p = [...s.pieces.values()].find((p) => p.key.startsWith(`v${v}:`));
	return s.project(p.obj.localToWorld(p.obj.position.clone().set(0, 4, 3)));
}, b);
console.log('guild hall tooltip:', await tipAt(at.x, at.y));
await shot('tip', 300);
await away();

// Every city has taken its path now: the menu says why each can't be taken.
await page.click(CITY_PATH, { force: true });
console.log('fortress tooltip:', await tipAt(...(await center(pathPlaque(2)))));
await shot('done', 300);
await away();
console.log(
	'chronicle:',
	await page.evaluate(() =>
		[...document.querySelectorAll('.log .line')].slice(-6).map((e) => e.textContent.replace(/\s+/g, ' ').trim())
	)
);
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
