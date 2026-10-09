// Dev helper: screenshots of the account screens. Signs up a fresh player in the browser and a
// friend over the API (with a bare socket so they show as online), wins a quick game with dev
// cheats so the history has something in it, and opens the friends, history and invite sheets.
// Usage: node scripts/dev/accounts.mjs <outDir>   (needs `pnpm dev` running)
import { chromium, request } from 'playwright';
import WebSocket from 'ws';

const out = process.argv[2] ?? '.';
const base = 'http://localhost:5173';
const stamp = Date.now().toString(36).slice(-5);
const me = `komeil_${stamp}`;
const friend = `bram_${stamp}`;
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const shot = async (page, name) => {
	await page.waitForTimeout(700);
	await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled', timeout: 180000 });
	console.log('shot', name);
};

// DOM clicks: playwright's own clicks wait on frames that swiftshader renders slowly.
const tap = (p, sel) => p.locator(sel).first().evaluate((el) => el.click());

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(base);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.waitForSelector('.auth form');
await page.waitForTimeout(1500);
await shot(page, 'auth-signin');

await tap(page, 'text=Create account');
await page.fill('input[autocomplete="username"]', me);
await page.fill('input[placeholder="What the table calls you"]', 'Komeil');
await page.fill('input[autocomplete="new-password"] >> nth=0', 'secret12');
await page.fill('input[autocomplete="new-password"] >> nth=1', 'secret12');
await tap(page, '.picker button[title="Wizard"]');
await shot(page, 'auth-register');
await tap(page, 'button[type=submit]');
await page.waitForSelector('.home .me');

// A friend signs up elsewhere and asks to be friends.
const api = await request.newContext({ baseURL: 'http://localhost:8787' });
const json = { 'content-type': 'application/json' };
await api.post('/api/register', { headers: json, data: { username: friend, nickname: 'Bram', password: 'secret12', avatar: 'fox' } });
await api.post('/api/friends', { headers: json, data: { username: me } });
const cookie = (await api.storageState()).cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const ws = new WebSocket('ws://localhost:8787/ws', { headers: { cookie } });
const got = [];
ws.on('message', (m) => got.push(JSON.parse(String(m))));
await new Promise((r) => ws.on('open', r));
await page.waitForTimeout(1200);
await shot(page, 'home');

await tap(page, '.medal:has-text("Friends")');
await shot(page, 'friends-request');
await tap(page, 'button:has-text("Accept")');
await page.waitForTimeout(800);
await shot(page, 'friends-online');
await tap(page, '.modal .close');

// Win a quick game against bots with dev cheats, then look at the history.
await tap(page, 'text=Play vs bots');
await page.waitForFunction(() => window.__client?.view, null, { timeout: 60000 });
await page.evaluate(() => window.__client.cheat({ type: 'finishSetup' }));
await page.waitForTimeout(1500);
await page.evaluate(() => window.__client.cheat({ type: 'win', player: window.__client.view.me }));
await page.waitForTimeout(3000);
await page.evaluate(() => window.__client.leave());
await page.waitForSelector('.home .me');
await tap(page, '.medal:has-text("History")');
await page.waitForSelector('.match');
await shot(page, 'history');
await tap(page, '.modal .close');

// A table of our own: invite the friend.
await tap(page, 'text=Create a room');
await page.waitForSelector('.lobby');
await tap(page, 'button:has-text("Invite friends")');
await page.waitForTimeout(600);
await shot(page, 'lobby-invite');
await tap(page, '.modal button:has-text("Invite")');
await page.waitForTimeout(800);
console.log('friend got:', got.map((m) => m.t).join(', '));
const invite = got.find((m) => m.t === 'invited');
console.log('invite:', JSON.stringify(invite?.invite));
await tap(page, '.modal .close');
await shot(page, 'lobby');

// The friend's invitation reaching us: Bram makes a table and invites back.
ws.send(JSON.stringify({ t: 'create', name: 'Bram' }));
await page.waitForTimeout(500);
ws.send(JSON.stringify({ t: 'invite', user: (await page.evaluate(() => window.__account.me.id)) }));
await page.waitForSelector('.invites .invite', { timeout: 10000 });
await shot(page, 'invite-card');

// Phone sizes.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(base);
await phone.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await phone.waitForSelector('.auth form');
await phone.waitForTimeout(1200);
await shot(phone, 'phone-signin');
await tap(phone, 'text=Create account');
await shot(phone, 'phone-register');

ws.close();
await browser.close();
