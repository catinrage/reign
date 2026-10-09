// Dev helper: screenshot what an invite link shows while the room loads, once seated, and for a
// room that doesn't exist. The host is a bare socket; the page's join is held back for a moment
// so the loading screen can be caught.
// Usage: node scripts/dev/invite.mjs <outDir> [width] [height] [base] [server]
import { chromium } from 'playwright';
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

const host = new WebSocket(server);
const code = await new Promise((res) => {
	host.on('open', () => host.send(JSON.stringify({ t: 'create', name: 'Komeil' })));
	host.on('message', (d) => {
		const m = JSON.parse(String(d));
		if (m.t === 'welcome') res(m.code);
	});
});
host.send(JSON.stringify({ t: 'addBot' }));

const shot = async (page, name) => {
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};

async function open(room, holdMs) {
	const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
	page.on('pageerror', (e) => console.log('[page]', e.message));
	const screens = [];
	await page.exposeFunction('__seen', (s) => screens.push(s));
	await page.addInitScript(() => {
		let last = '';
		setInterval(() => {
			const s = document.querySelector('.home')
				? 'home'
				: document.querySelector('.joining')
					? 'joining'
					: document.querySelector('.lobby')
						? 'lobby'
						: '';
			if (s && s !== last) window.__seen((last = s));
		}, 30);
	});
	await page.routeWebSocket(/\/ws$/, (ws) => {
		const srv = ws.connectToServer();
		ws.onMessage((m) => {
			if (holdMs && String(m).includes('"join"')) setTimeout(() => srv.send(m), holdMs);
			else srv.send(m);
		});
	});
	await page.goto(`${base}/?room=${room}`);
	return { page, screens };
}

{
	const { page, screens } = await open(code, 6000);
	await page.waitForSelector('.joining .steps', { timeout: 300000 });
	await page.waitForTimeout(800);
	await shot(page, 'invite-loading');
	await page.waitForFunction(() => !!window.__client?.lobby, null, { timeout: 60000 });
	await page.waitForTimeout(1500);
	await shot(page, 'invite-lobby');
	console.log('screens seen:', screens.join(' -> '));
	await page.close();
}
{
	const { page, screens } = await open('QQQQQ', 0);
	await page.waitForSelector('.joining .failed', { timeout: 300000 });
	await page.waitForTimeout(800);
	await shot(page, 'invite-missing');
	await page.click('.failed .btn');
	await page.waitForSelector('.home', { timeout: 10000 });
	console.log('screens seen:', screens.join(' -> '), 'url:', page.url());
	await page.close();
}
// Backing out while the join is still on its way lands on the main menu, not in the room.
{
	const { page, screens } = await open(code, 3000);
	await page.waitForSelector('.joining .back', { timeout: 300000 });
	await page.click('.joining .back');
	await page.waitForTimeout(5000);
	const state = await page.evaluate(() => ({
		lobby: !!window.__client.lobby,
		seat: window.__client.seat
	}));
	console.log('screens seen:', screens.join(' -> '), 'url:', page.url(), JSON.stringify(state));
	await page.close();
}
host.close();
await browser.close();
