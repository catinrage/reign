// Dev: pause and resume for everyone. A second player joins over a bare socket and pauses; the
// browser player sees who paused (desktop and phone width) and resumes. Then a game vs bots is
// paused with the corner button and the bots are checked to wait.
// Usage: node scripts/dev/pause.mjs <outDir> [base]
import { chromium } from 'playwright';
import WebSocket from 'ws';
const [dir = '/tmp/pause', base = 'http://localhost:8787'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const open = async (name) => {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	page.on('pageerror', (e) => errors.push(e.message));
	page.on(
		'console',
		(m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text())
	);
	await page.goto(base);
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
	await page.evaluate((n) => window.__client.setName(n), name);
	return page;
};
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 300000, polling: 300 });
const shot = async (page, name) => {
	await page.waitForTimeout(1500);
	await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled', timeout: 180000 });
	console.log('shot', name);
};

const host = await open('Komeil');
await host.evaluate(() => window.__client.create());
const code = await until(host, () => window.__client.code).then((h) => h.jsonValue());

// The guest: just a socket.
const guest = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
const lobbies = [];
guest.on('message', (data) => {
	const m = JSON.parse(String(data));
	if (m.t === 'lobby') lobbies.push(m.lobby);
});
await new Promise((r) => guest.on('open', r));
guest.send(JSON.stringify({ t: 'join', code, name: 'Bram' }));
await until(host, () => window.__client.lobby?.seats.length === 2);
guest.send(JSON.stringify({ t: 'setReady', ready: true }));
await until(host, () => window.__client.lobby?.seats.every((s) => s.ready));
await host.evaluate(() => window.__client.send({ t: 'start' }));
await until(host, () => !!window.__client.view);
await host.waitForTimeout(3000);
await shot(host, 'mp-before');

guest.send(JSON.stringify({ t: 'pauseGame', paused: true }));
await until(host, () => !!window.__client.lobby?.pausedBy);
await shot(host, 'mp-paused');
console.log('host sees:', await host.textContent('.curtain .who'));
await host.setViewportSize({ width: 390, height: 844 });
await shot(host, 'mp-paused-phone');
await host.setViewportSize({ width: 1280, height: 800 });

await host.click('.curtain .btn.big', { force: true });
await until(host, () => !window.__client.lobby?.paused);
const last = lobbies[lobbies.length - 1];
console.log(
	'guest sees after resume:',
	JSON.stringify({ paused: last.paused, pausedBy: last.pausedBy })
);
await shot(host, 'mp-resumed');
guest.close();
await host.close();

const solo = await open('Komeil');
await solo.click('text=Play vs bots', { force: true });
await until(solo, () => !!window.__client.view);
await solo.waitForTimeout(2000);
await solo.click('.corner .icon-btn >> nth=1', { force: true });
await until(solo, () => !!window.__client.lobby?.pausedBy);
const before = await solo.evaluate(() => window.__client.view.log.length);
await solo.waitForTimeout(8000);
const after = await solo.evaluate(() => window.__client.view.log.length);
await shot(solo, 'bots-paused');
await solo.keyboard.press('p');
await until(solo, () => !window.__client.lobby?.paused);
await solo.waitForTimeout(8000);
const later = await solo.evaluate(() => window.__client.view.log.length);
console.log(
	JSON.stringify({ code, botLog: { before, after, later }, errors: errors.slice(0, 10) })
);
await browser.close();
