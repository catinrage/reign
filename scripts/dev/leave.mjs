// Dev helper: screenshot leaving and rejoining a game, and a game cancelled when everyone left.
// One browser page; the other player is a bare socket, which keeps it light.
// Usage: node scripts/dev/leave.mjs <outDir> [width] [height] [base] [server]
import { chromium } from 'playwright';
import { signIn, signUp } from './signin.mjs';
import WebSocket from 'ws';
const [
	dir,
	w = '1600',
	h = '900',
	base = 'http://localhost:5173',
	server = 'ws://localhost:8787/ws'
] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});

/** A player with no screen: sends one message, resolves with its welcome once seated. */
async function socket(first) {
	const ws = new WebSocket(server, { headers: { cookie: await signUp(base, first.name) } });
	const welcome = new Promise((res) =>
		ws.on('message', (d) => {
			const m = JSON.parse(String(d));
			if (m.t === 'welcome') res(m);
		})
	);
	ws.on('open', () => ws.send(JSON.stringify(first)));
	return { ws, welcome, send: (m) => ws.send(JSON.stringify(m)) };
}
async function open(name) {
	const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
	page.on('pageerror', (e) => console.log(`[${name}]`, e.message));
	await page.addInitScript(() => localStorage.setItem('reign:quality', 'low'));
	await signIn(page, base);
	await page.goto(`${base}/`);
	await page.waitForFunction(() => window.__ready === true, null, {
		timeout: 300000,
		polling: 500
	});
	await page.waitForTimeout(2000);
	return page;
}
const playing = (page) =>
	page.waitForFunction(() => !!window.__client.view, null, { timeout: 120000 });
const shot = async (page, name, wait = 1500) => {
	await page.waitForTimeout(wait);
	const toasts = await page.evaluate(() => window.__client.toasts.map((t) => t.text));
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name, toasts.length ? toasts : '');
};
const menuLeave = async (page) => {
	await page.click('.icon-btn.gear', { force: true });
	await page.waitForTimeout(600);
	await page.click('.btn.red.block', { force: true });
};

// Two players: the guest leaves and comes back, then the host leaves and rejoins from the menu.
{
	const page = await open('Komeil');
	await page.click('.sign .btn.green', { force: true });
	await page.waitForFunction(() => !!window.__client.lobby, null, { timeout: 60000 });
	await page.evaluate(() => window.__client.send({ t: 'addBot' }));
	const code = await page.evaluate(() => window.__client.lobby.code);
	let guest = await socket({ t: 'join', code, name: 'Bram' });
	const { token } = await guest.welcome;
	guest.send({ t: 'setReady', ready: true });
	await page.waitForTimeout(500);
	await page.evaluate(() => window.__client.send({ t: 'start' }));
	await playing(page);
	await page.waitForTimeout(3000);

	guest.send({ t: 'leave' });
	await shot(page, 'guest-left', 800);
	guest.ws.close();
	guest = await socket({ t: 'join', code, name: 'Bram', token });
	await guest.welcome;
	await shot(page, 'guest-back', 800);

	await menuLeave(page);
	await shot(page, 'leave-confirm-others', 800);
	await page.click('.confirm .btn.red', { force: true });
	await page.waitForFunction(() => !!window.__client.resumable, null, { timeout: 30000 });
	await shot(page, 'home-rejoin', 2500);
	await page.click('.rejoin', { force: true });
	await playing(page);
	await shot(page, 'rejoined', 3000);
	guest.ws.close();
	await page.close();
}
// One player against bots: leaving cancels the game.
{
	const page = await open('Komeil');
	await page.click('.sign .btn.big', { force: true });
	await playing(page);
	await page.waitForTimeout(3000);
	const code = await page.evaluate(() => window.__client.code);
	await menuLeave(page);
	await shot(page, 'leave-confirm-alone', 800);
	await page.click('.confirm .btn.red', { force: true });
	await page.waitForTimeout(1500);
	console.log('resumable after solo leave:', await page.evaluate(() => window.__client.resumable));
	await page.evaluate((code) => window.__client.join(code), code);
	await shot(page, 'cancelled', 600);
	await page.close();
}
await browser.close();
