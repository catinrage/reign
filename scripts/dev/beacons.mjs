// Dev: map beacons. The browser player Alt+clicks a spot on the island and the socket player is
// told; the socket player lights one out at sea and the browser shows it in their color; a long
// press with a finger lights one too, and a plain click lights none. Needs the server run with --dev.
// Usage: node scripts/dev/beacons.mjs <outDir> [base]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import WebSocket from 'ws';
import { signIn, signUp } from './signin.mjs';
const [dir = '/tmp/beacons', base = 'http://localhost:8787'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.addInitScript(() => localStorage.setItem('reign:graphics', 'medium'));
page.on('pageerror', (e) => errors.push(e.message));
page.on(
	'console',
	(m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text())
);
await signIn(page, base);
await page.goto(base);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 900000, polling: 300 });
const lit = () =>
	page.evaluate(() =>
		window.__scene.beacons.lit.filter((b) => b.group.visible).map((b) => +b.age.toFixed(2))
	);
/** A shot once the newest beacon has been up `age` seconds of game time (frames are slow here). */
const shot = async (name, age = 0.7) => {
	await until((a) => window.__scene.beacons.lit.some((b) => b.group.visible && b.age > a), age);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 400000 });
	// And a close-up round the newest beacon's foot.
	const at = await page.evaluate(() => {
		const b = window.__scene.beacons.lit.filter((l) => l.group.visible).at(-1);
		return window.__scene.project(b.group.position.clone());
	});
	const clip = {
		x: Math.max(0, Math.min(1366 - 520, at.x - 260)),
		y: Math.max(0, Math.min(768 - 420, at.y - 300)),
		width: 520,
		height: 420
	};
	await page.screenshot({ path: `${dir}/${name}-close.png`, clip, timeout: 400000 });
	console.log('shot', name, JSON.stringify(at), JSON.stringify(await lit()));
};

await page.evaluate(() => window.__client.create());
const code = await until(() => window.__client.code).then((h) => h.jsonValue());
const guest = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`, {
	headers: { cookie: await signUp(base, 'Bram') }
});
const told = [];
guest.on('message', (data) => {
	const m = JSON.parse(String(data));
	if (m.t === 'beacon') told.push(m);
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
// Let the camera glide in before working out screen spots.
await until(() => {
	const r = window.__scene.stage.rig;
	return Math.abs(r.radius - r.goal.radius) < 0.5 && Math.abs(r.azimuth - r.goal.azimuth) < 0.005;
});
await page.waitForTimeout(1500);

// 1. Alt+click on a tile: lit here at once, and the other player is told.
const tile = await page.evaluate(() => {
	const v = window.__client.latest;
	const h = v.board.hexes.findIndex((x, i) => i !== v.robberHex && x.number === 8);
	const c = window.__scene.boardView.hexCenter(h);
	return window.__scene.debugMapPoint(c.x / 12 + 0.3, c.z / 12 + 0.2);
});
await page.keyboard.down('Alt');
await page.mouse.click(tile.x, tile.y);
await page.keyboard.up('Alt');
await until(() => window.__client.beacons.length === 1);
await shot('alt-click-land');
await page.waitForTimeout(500);
console.log('guest was told', JSON.stringify(told));

// 2. The other player lights one out at sea: shown here in their color.
await until(() => !window.__scene.beacons.lit.some((b) => b.group.visible));
const sea = await page.evaluate(() => {
	// Out past the furthest land, toward the camera.
	return { x: 0, z: (window.__scene.reach + 14) / 12 };
});
say({ t: 'beacon', x: sea.x, z: sea.z });
await until(() => window.__client.beacons.length === 2);
await shot('theirs-at-sea');
const theirColor = await page.evaluate(
	() => window.__client.latest.players[window.__client.beacons[1].player].color
);
console.log('their beacon color', theirColor);

// 3. A plain click lights nothing; a finger resting on the board does.
await until(() => !window.__scene.beacons.lit.some((b) => b.group.visible));
await page.mouse.click(tile.x + 40, tile.y);
await page.waitForTimeout(800);
const afterClick = await page.evaluate(() => window.__client.beacons.length);
await page.evaluate(
	async ({ x, y }) => {
		const c = document.querySelector('canvas');
		const ev = (type) =>
			new PointerEvent(type, {
				pointerType: 'touch',
				isPrimary: true,
				pointerId: 7,
				clientX: x,
				clientY: y,
				bubbles: true,
				button: 0,
				buttons: type === 'pointerup' ? 0 : 1
			});
		c.dispatchEvent(ev('pointerdown'));
		await new Promise((r) => setTimeout(r, 800));
		c.dispatchEvent(ev('pointerup'));
	},
	{ x: tile.x - 60, y: tile.y + 30 }
);
await until(() => window.__client.beacons.length === 3);
await shot('long-press');
// A short tap lights none.
await page.evaluate(
	async ({ x, y }) => {
		const c = document.querySelector('canvas');
		const ev = (type) =>
			new PointerEvent(type, {
				pointerType: 'touch',
				isPrimary: true,
				pointerId: 8,
				clientX: x,
				clientY: y,
				bubbles: true,
				button: 0
			});
		c.dispatchEvent(ev('pointerdown'));
		await new Promise((r) => setTimeout(r, 150));
		c.dispatchEvent(ev('pointerup'));
	},
	{ x: tile.x, y: tile.y }
);
await page.waitForTimeout(1200);
const afterTap = await page.evaluate(() => window.__client.beacons.length);
console.log(
	JSON.stringify({ afterClick, afterTap, told: told.length, errors: errors.slice(0, 10) })
);
guest.close();
await browser.close();
