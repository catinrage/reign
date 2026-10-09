// Dev helper: screenshot a spectator watching a game, and the players' side with someone watching.
// One browser page; the other side is a bare socket, which keeps it light.
// Usage: node scripts/dev/spectate.mjs <outDir> [width] [height] [base] [server]
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

/** A connection with no screen: sends one message, resolves with the room code once in. */
async function socket(first) {
	const ws = new WebSocket(server, { headers: { cookie: await signUp(base, first.name) } });
	const ready = new Promise((res) =>
		ws.on('message', (d) => {
			const m = JSON.parse(String(d));
			if (m.t === 'welcome' || m.t === 'watching') res(m.code);
		})
	);
	ws.on('open', () => ws.send(JSON.stringify(first)));
	return { ws, ready, send: (m) => ws.send(JSON.stringify(m)) };
}
async function open(path, width = Number(w), height = Number(h)) {
	const page = await browser.newPage({ viewport: { width, height } });
	page.on('pageerror', (e) => console.log('[page]', e.message));
	await page.addInitScript(() => localStorage.setItem('reign:quality', 'low'));
	await signIn(page, base);
	await page.goto(`${base}/${path}`);
	await page.waitForFunction(() => window.__ready === true, null, {
		timeout: 300000,
		polling: 500
	});
	return page;
}
const shot = async (page, name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const watching = (page) =>
	page.waitForFunction(() => window.__client.spectating && !!window.__client.view, null, {
		timeout: 120000
	});

// A game between a player and two bots, already under way; the page opens its invite link.
const host = await socket({ t: 'create', name: 'Komeil' });
const code = await host.ready;
host.send({ t: 'addBot' });
host.send({ t: 'addBot' });
host.send({ t: 'start' });
{
	const page = await open(`?room=${code}`);
	await watching(page);
	await shot(page, 'spectator', 4000);
	console.log(
		'hands seen:',
		await page.evaluate(() => window.__client.view.players.filter((p) => p.resources).length)
	);
	await page.click('.icon-btn.gear', { force: true });
	await shot(page, 'spectator-menu', 800);
	await page.close();
}
{
	const page = await open(`?room=${code}`, 390, 844);
	await watching(page);
	await shot(page, 'spectator-phone', 4000);
	await page.close();
}
host.ws.close();

// The players' side: a game against bots with two people watching.
{
	const page = await open('');
	await page.waitForTimeout(1500);
	await page.click('.sign .btn.big', { force: true });
	await page.waitForFunction(() => !!window.__client.view, null, { timeout: 120000 });
	const code = await page.evaluate(() => window.__client.code);
	const fans = [
		await socket({ t: 'join', code, name: 'Fan' }),
		await socket({ t: 'join', code, name: 'Fan 2' })
	];
	await Promise.all(fans.map((f) => f.ready));
	await shot(page, 'player-watched', 3000);
	await page.setViewportSize({ width: 390, height: 844 });
	await shot(page, 'player-watched-phone', 3000);
	for (const f of fans) f.ws.close();
	await page.close();
}
await browser.close();
