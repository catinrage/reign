// Dev: the robber's target tile, as the player moving it and as everyone else sees it. A second
// player joins over a bare socket; dev cheats finish the setup and rig a 7 for each of the two
// first turns. On the browser player's turn the pointer hovers two tiles; on the socket player's
// turn the socket aims at two tiles and the browser shows them. Needs the server run with --dev.
// Usage: node scripts/dev/robber-aim.mjs <outDir> [base]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import WebSocket from 'ws';
const [dir = '/tmp/robber-aim', base = 'http://localhost:8787'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => localStorage.setItem('reign:quality', 'low'));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()));
await page.goto(base);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
await page.evaluate(() => window.__client.setName('Komeil'));
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 900000, polling: 300 });
/** A shot once the light on the tile has had time to come up (in game time: frames are slow here). */
const shot = async (name, lit = true) => {
	if (lit) await until(() => window.__scene.aim.since > 0.6);
	await page.waitForTimeout(1500);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 400000 });
	console.log('shot', name);
};

await page.evaluate(() => window.__client.create());
const code = await until(() => window.__client.code).then((h) => h.jsonValue());

// The other player: just a socket, keeping the aims it is told about.
const guest = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
const told = [];
guest.on('message', (data) => {
	const m = JSON.parse(String(data));
	if (m.t === 'aim') told.push(m.hex);
});
await new Promise((r) => guest.on('open', r));
const say = (m) => guest.send(JSON.stringify(m));
say({ t: 'join', code, name: 'Bram' });
await until(() => window.__client.lobby?.seats.length === 2);
say({ t: 'setReady', ready: true });
await until(() => window.__client.lobby?.seats.every((s) => s.ready));
await page.evaluate(() => window.__client.send({ t: 'start' }));
await until(() => !!window.__client.view);
await page.evaluate(() => window.__client.cheat({ type: 'finishSetup' }));
await until(() => window.__client.latest?.phase === 'main');

/** Two tiles to aim at: an 11 (as in the report) and a 6 or 8, never the robber's own tile. */
const targets = () =>
	page.evaluate(() => {
		const v = window.__client.latest;
		const ok = (h, i) => i !== v.robberHex && h.number !== null;
		const find = (nums) => v.board.hexes.findIndex((h, i) => ok(h, i) && nums.includes(h.number));
		const a = find([11, 10, 9]);
		const b = find([6, 8, 5]);
		return [a, b === a ? v.board.hexes.findIndex((h, i) => ok(h, i) && i !== a) : b];
	});

for (let turn = 0; turn < 2; turn++) {
	const { current, me } = await page.evaluate(() => window.__client.latest);
	const mine = current === me;
	await page.evaluate(() => window.__client.cheat({ type: 'rigDice', total: 7 }));
	await page.waitForTimeout(300);
	if (mine) await page.evaluate(() => window.__client.act({ type: 'rollDice' }));
	else say({ t: 'action', action: { type: 'rollDice' } });
	await until(() => window.__client.latest?.step === 'moveRobber' && !window.__client.tossing);
	const [a, b] = await targets();
	if (mine) {
		for (const [hex, name] of [[a, 'mine-1'], [b, 'mine-2']]) {
			const p = await page.evaluate((h) => window.__scene.debugPickPoints().find((q) => q.id === h), hex);
			await page.mouse.move(p.x, p.y);
			await until((h) => window.__scene.myAim === h, hex);
			await shot(name);
		}
		const radius = await page.evaluate(() => window.__scene.stage.rig.radius);
		await page.evaluate(() => window.__scene.stage.rig.set({ radius: 210 }, true));
		await shot('mine-close');
		await page.evaluate((r) => window.__scene.stage.rig.set({ radius: r }, true), radius);
		console.log('the other player was told', JSON.stringify(told));
		await page.mouse.move(5, 450);
		await page.evaluate((h) => window.__client.act({ type: 'moveRobber', hex: h }), b);
	} else {
		say({ t: 'aim', hex: a });
		await until((h) => window.__scene.theirAim?.hex === h, a);
		await shot('theirs-1');
		say({ t: 'aim', hex: b });
		await until((h) => window.__scene.theirAim?.hex === h, b);
		await shot('theirs-2');
		say({ t: 'action', action: { type: 'moveRobber', hex: b } });
		await until((h) => window.__client.latest?.robberHex === h, b);
		await shot('theirs-after', false);
	}
	await until(() => window.__client.latest?.step !== 'moveRobber');
	await page.waitForTimeout(2500);
	if (mine) await page.evaluate(() => window.__client.act({ type: 'endTurn' }));
	else say({ t: 'action', action: { type: 'endTurn' } });
	await until((c) => window.__client.latest?.current !== c, current);
}
console.log(JSON.stringify({ code, errors: errors.slice(0, 10) }));
guest.close();
await browser.close();
