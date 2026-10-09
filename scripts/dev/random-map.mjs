// Dev helper: the random island generator from the host's side (picker, rerolls, the capped
// points goal) and the same island in a guest's lobby.
// Runs under tsx so the guest's host (a bare socket) can grow islands with the real generator.
// Usage: pnpm tsx scripts/dev/random-map.mjs <outDir> [width] [height] [base] [server]
import { chromium } from 'playwright';
import WebSocket from 'ws';
import { randomMap } from '../../src/shared/board/random.ts';
const [dir, w = '1600', h = '900', base = 'http://localhost:5173', server = 'ws://localhost:8787/ws'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
async function open(name) {
	const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
	page.on('pageerror', (e) => console.log(`[${name}]`, e.message));
	await page.goto(`${base}/`);
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000, polling: 500 });
	await page.waitForTimeout(2000);
	await page.fill('.name-row .input', name);
	return page;
}
const lobby = (page) => page.waitForFunction(() => !!window.__client.lobby, null, { timeout: 60000 });
const shot = async (page, name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};

const host = await open('Komeil');
await host.click('.sign .btn.green', { force: true });
await lobby(host);
await host.evaluate(() => {
	const c = window.__client;
	c.send({ t: 'setMode', mode: 'extended' });
	for (let i = 0; i < 4; i++) c.send({ t: 'addBot' });
});
await host.waitForTimeout(1000);
await host.waitForSelector('.island .pick', { timeout: 120000 });
await host.click('.island .pick', { force: true });
await host.waitForTimeout(800);
await shot(host, 'picker-empty', 500);
await host.click('.random .shapes .btn >> nth=3', { force: true });
await host.locator('.random .slider').fill(process.env.TILES ?? '48');
await host.click('.random .seg:not(.shapes) .btn >> nth=1', { force: true });
await host.click('.random .generate', { force: true });
await shot(host, 'picker-islands', 2500);
await host.click('.random .generate', { force: true });
await shot(host, 'picker-again', 2500);
await host.keyboard.press('Escape');
await host.waitForTimeout(500);
if (await host.locator('.modal').count()) await host.click('.modal .icon-btn >> nth=0', { force: true });
await shot(host, 'lobby-host', 3000);
// Ask for far too many points: the server refuses and says how many this table can play to.
await host.fill('.other', '25');
await host.locator('.other').blur();
await shot(host, 'lobby-too-many', 800);
await host.close();

// A guest's lobby. One browser page at a time keeps it quick; the host here is a bare socket.
const ws = new WebSocket(server);
const send = (m) => ws.send(JSON.stringify(m));
const code = await new Promise((res) => {
	ws.on('message', (d) => {
		const m = JSON.parse(String(d));
		if (m.t === 'welcome') res(m.code);
	});
	ws.on('open', () => send({ t: 'create', name: 'Komeil' }));
});
send({ t: 'setMode', mode: 'extended' });
send({ t: 'addBot' });
send({ t: 'addBot' });
const island = (seed) => ({ t: 'setMap', map: { custom: randomMap({ tiles: 40, shape: 'ragged', lakes: true, seed }) } });
send(island(11));
const guest = await open('Bram');
await guest.evaluate((code) => window.__client.join(code), code);
await lobby(guest);
await shot(guest, 'lobby-guest', 4000);
send(island(12));
await shot(guest, 'lobby-guest-reroll', 4000);
ws.close();
await browser.close();
