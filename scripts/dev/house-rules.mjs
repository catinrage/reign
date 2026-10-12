// Dev helper: screenshot the lobby's house rules in both modes, the panel (host and guest), and a
// game started with custom rules.
// Usage: node scripts/dev/house-rules.mjs <outDir> [width] [height] [base] [server]
import { chromium } from 'playwright';
import { signIn, signUp } from './signin.mjs';
import WebSocket from 'ws';
const [dir, w = '1366', h = '768', base = 'http://localhost:5173', server = 'ws://localhost:8787/ws'] = process.argv.slice(2);
const tag = `${w}`;
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
	console.log('signed in', name);
	await page.goto(`${base}/`);
	console.log('loading', name);
	await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 300000, polling: 500 });
	await page.waitForTimeout(2000);
	return page;
}
const lobby = (page) => page.waitForFunction(() => !!window.__client.lobby, null, { timeout: 60000 });
const shot = async (page, name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.evaluate(() => window.__portraits?.());
	await page.screenshot({ path: `${dir}/${name}-${tag}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const send = (page, msgs) => page.evaluate((msgs) => msgs.forEach((m) => window.__client.send(m)), msgs);
const custom = {
	bank: 25,
	deck: { knight: 10, roadBuilding: 2, yearOfPlenty: 2, monopoly: 1, victoryPoint: 3 }
};

// The host: Classic, standard and then custom; Extended with six seats; the panel; then a game.
{
	const page = await open('Komeil');
	await page.click('.sign .btn.green', { force: true });
	await lobby(page);
	await send(page, [{ t: 'addBot' }, { t: 'addBot' }, { t: 'addBot' }]);
	await shot(page, 'classic-standard', 2500);
	await send(page, [{ t: 'setPointsToWin', points: 8 }, { t: 'setHouseRules', house: custom }, { t: 'setHandLimit', cards: 9 }]);
	await shot(page, 'classic-custom');
	await page.click('.house .btn', { force: true });
	await shot(page, 'panel-host', 800);
	await page.click('.modal .close', { force: true });
	await send(page, [{ t: 'setMode', mode: 'extended' }, { t: 'addBot' }, { t: 'addBot' }]);
	await shot(page, 'extended-custom', 2500);
	await send(page, [{ t: 'setHouseRules', house: { bank: null, deck: null } }, { t: 'setHandLimit', cards: 7 }]);
	await shot(page, 'extended-standard');
	await page.click('.house .btn', { force: true });
	await shot(page, 'panel-host-standard', 800);
	await page.click('.modal .close', { force: true });
	// Back to Classic with four, the custom rules, and start.
	await page.evaluate(() => {
		const bots = window.__client.lobby.seats.filter((s) => s.isBot).slice(0, 2);
		for (const b of bots) window.__client.send({ t: 'removeSeat', seat: b.id });
	});
	await page.waitForTimeout(500);
	await send(page, [{ t: 'setMode', mode: 'classic' }, { t: 'setPointsToWin', points: 8 }, { t: 'setHouseRules', house: custom }]);
	await page.waitForTimeout(500);
	await send(page, [{ t: 'start' }]);
	await page.waitForFunction(() => !!window.__client.view, null, { timeout: 60000 });
	await shot(page, 'game-custom', 6000);
	// Skip the setup (dev cheat) so the build deck shows what's left of the custom deck.
	await send(page, [{ t: 'cheat', cheat: { type: 'finishSetup' } }]);
	await page.waitForFunction(() => window.__client.view?.phase === 'main', null, { timeout: 120000 });
	await shot(page, 'game-custom-main', 5000);
	await page.close();
}
// A guest sees the rules but can't change them.
{
	const host = await socket({ t: 'create', name: 'Komeil' });
	const code = await host.welcome;
	host.send({ t: 'addBot' });
	host.send({ t: 'setHouseRules', house: custom });
	host.send({ t: 'setPointsToWin', points: 8 });
	const page = await open('Bram');
	await page.evaluate((code) => window.__client.join(code), code);
	await lobby(page);
	await shot(page, 'classic-guest', 2500);
	await page.click('.house .btn', { force: true });
	await shot(page, 'panel-guest', 800);
	host.ws.close();
}
await browser.close();
