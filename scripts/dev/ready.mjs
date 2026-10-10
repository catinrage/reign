// Dev helper: screenshot the lobby ready check from the host's side and from a guest's side.
// One browser page at a time; the other player is a bare socket, which keeps it light.
// Usage: node scripts/dev/ready.mjs <outDir> [width] [height] [mode] [base] [server]
import { chromium } from 'playwright';
import { signIn, signUp } from './signin.mjs';
import WebSocket from 'ws';
const [dir, w = '1600', h = '900', mode = 'classic', base = 'http://localhost:5173', server = 'ws://localhost:8787/ws'] =
	process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});

/** A player with no screen: sends one message, resolves with the room code once seated. */
async function socket(first) {
	const ws = new WebSocket(server, { headers: { cookie: await signUp(base, first.name) } });
	const welcome = new Promise((res) =>
		ws.on('message', (d) => {
			const m = JSON.parse(String(d));
			if (m.t === 'welcome') res(m.code);
		})
	);
	ws.on('open', () => ws.send(JSON.stringify(first)));
	return { ws, welcome, send: (m) => ws.send(JSON.stringify(m)) };
}
async function open(name) {
	const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
	page.on('pageerror', (e) => console.log(`[${name}]`, e.message));
	await signIn(page, base, name);
	await page.goto(`${base}/`);
	await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 300000, polling: 500 });
	await page.waitForTimeout(2000);
	return page;
}
const lobby = (page) => page.waitForFunction(() => !!window.__client.lobby, null, { timeout: 60000 });
const shot = async (page, name, wait = 1500) => {
	await page.waitForTimeout(wait);
	// Portraits draw in the background, one at a time.
	await page.evaluate(() => window.__portraits());
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};

// The host's view, with a guest who hasn't said they're ready.
{
	const page = await open('Komeil');
	await page.click('.sign .btn.green', { force: true });
	await lobby(page);
	await page.evaluate((mode) => {
		window.__client.send({ t: 'addBot' });
		window.__client.send({ t: 'setMode', mode });
	}, mode);
	const code = await page.evaluate(() => window.__client.lobby.code);
	const guest = await socket({ t: 'join', code, name: 'Bram' });
	await guest.welcome;
	await shot(page, `${mode}-host-waiting`, 2500);
	guest.send({ t: 'setReady', ready: true });
	await shot(page, `${mode}-host-can-start`, 1000);
	guest.ws.close();
	await page.close();
}
// A guest's view, before and after they're ready.
{
	const host = await socket({ t: 'create', name: 'Komeil' });
	const code = await host.welcome;
	host.send({ t: 'addBot' });
	host.send({ t: 'setMode', mode });
	const page = await open('Bram');
	await page.evaluate((code) => window.__client.join(code), code);
	await lobby(page);
	await shot(page, `${mode}-guest-not-ready`, 2500);
	await page.click('.ready-btn', { force: true });
	await shot(page, `${mode}-guest-ready`, 1000);
	host.ws.close();
}
await browser.close();
