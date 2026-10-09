// Dev helper: screenshot the pigeon post. The page is the host; Bram and Cleo are bare sockets.
// Bram and the host trade notes; Cleo sits at the same table and must never hear of them.
// Usage: node scripts/dev/pigeon.mjs <outDir> [width] [height] [base] [server]
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

/** A player with no screen: joins, records what it is sent, resolves with its seat once seated. */
async function socket(first) {
	const ws = new WebSocket(server, { headers: { cookie: await signUp(base, first.name) } });
	const got = [];
	const welcome = new Promise((res) =>
		ws.on('message', (d) => {
			const m = JSON.parse(String(d));
			got.push(m);
			if (m.t === 'welcome') res(m.seat);
		})
	);
	ws.on('open', () => ws.send(JSON.stringify(first)));
	return { ws, got, welcome, send: (m) => ws.send(JSON.stringify(m)) };
}
const shot = async (page, name, wait = 800) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000 });
	console.log('shot', name);
};
/** Freeze every pigeon in the air at `t` (0..1) of its flight, for a still. */
const freeze = (page, t) =>
	page.evaluate((t) => {
		for (const a of document.getAnimations()) {
			if (!a.effect?.target?.classList?.contains('bird')) continue;
			a.pause();
			a.currentTime = a.effect.getTiming().duration * t;
		}
	}, t);
/** Land every pigeon in the air (a software-rendered page draws too few frames to wait for it). */
const land = (page) =>
	page.evaluate(() => {
		for (const a of document.getAnimations())
			if (a.effect?.target?.classList?.contains('bird')) a.finish();
	});
const flying = (page) =>
	page.waitForFunction(() => document.querySelectorAll('.sky .bird').length > 0, null, {
		timeout: 30000
	});
const landed = (page) =>
	page.waitForFunction(() => document.querySelectorAll('.sky .bird').length === 0, null, {
		timeout: 30000
	});

const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log('[page]', e.message));
await signIn(page, base);
await page.goto(`${base}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000, polling: 500 });
await page.evaluate(() => {
	try {
		localStorage.setItem('reign:quality', 'low');
	} catch {}
	window.__client.setName('Komeil');
	window.__client.create();
});
await page.waitForFunction(() => !!window.__client.lobby, null, { timeout: 60000 });
const code = await page.evaluate(() => window.__client.lobby.code);
const host = await page.evaluate(() => window.__client.seat);
const bram = await socket({ t: 'join', code, name: 'Bram' });
const cleo = await socket({ t: 'join', code, name: 'Cleo' });
const bramSeat = await bram.welcome;
await cleo.welcome;
bram.send({ t: 'setReady', ready: true });
cleo.send({ t: 'setReady', ready: true });
await page.waitForTimeout(500);
await page.evaluate(() => window.__client.send({ t: 'start' }));
await page.waitForFunction(() => !!window.__client.view, null, { timeout: 60000 });
await page.waitForTimeout(6000);

// Bram writes to the host: the pigeon leaves Bram's plaque and lands on the loft button.
bram.send({
	t: 'pigeon',
	to: host,
	text: "Psst. Two wheat for your ore, and I'll keep my road away from your harbor."
});
await flying(page);
await freeze(page, 0.55);
await shot(page, 'pigeon-1-incoming', 300);
await land(page);
await landed(page);
await shot(page, 'pigeon-2-landed', 100);

// The host reads it and writes back.
await page.click('.loft-btn', { force: true });
await shot(page, 'pigeon-3-loft', 800);
await page.fill('.loft .input', 'Deal. Meet me by the wheat fields, and not a word to Cleo.');
await page.click('.loft .send', { force: true });
await flying(page);
await freeze(page, 0.5);
await shot(page, 'pigeon-4-outgoing', 300);
await land(page);
await landed(page);
await shot(page, 'pigeon-5-sent', 300);

const pigeons = (s) => s.got.filter((m) => m.t === 'pigeon').map((m) => m.note.text);
console.log('Bram got', pigeons(bram));
console.log(
	'Cleo got',
	pigeons(cleo),
	'mentions:',
	JSON.stringify(cleo.got).includes('wheat fields')
);
void bramSeat;
bram.ws.close();
cleo.ws.close();
await browser.close();
