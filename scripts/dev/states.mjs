// Dev helper: screenshot the lobby, dialogs, a trade offer and the victory screen by
// starting a quick game and injecting view states on the client.
// Usage: node scripts/dev/states.mjs <outDir> [width] [height] [base]
import { chromium } from 'playwright';
const [dir, w = '1600', h = '900', base = 'http://localhost:5180'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shot = async (name, wait = 1500) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000, animations: 'disabled' });
	console.log('shot', name);
};
const until = (fn, timeout = 300000) => page.waitForFunction(fn, null, { timeout, polling: 500 });

await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.waitForTimeout(2500);
await page.fill('.name-row .input', 'Komeil');
await page.click('.sign .btn.green', { force: true });
await until(() => !!window.__client.lobby);
await page.evaluate(() => {
	window.__client.send({ t: 'addBot' });
	window.__client.send({ t: 'addBot' });
});
await shot('lobby', 2500);
await page.click('.start', { force: true });
await until(
	() =>
		window.__client.view && window.__client.view.phase !== 'setup' && window.__client.view.turn >= 3
);
await until(() => {
	const v = window.__client.view;
	if (v.current === v.me && v.step === 'roll') {
		window.__stopAutoplay();
		return true;
	}
	return false;
});
await page.waitForTimeout(1500);
const inject = (patch) =>
	page.evaluate((p) => {
		const v = window.__client.view;
		window.__saved ??= v;
		window.__client.view = {
			...window.__saved,
			...new Function('v', `return (${p})`)(window.__saved)
		};
	}, patch);
await inject(
	`{ step: 'discard', pendingDiscards: { [v.me]: 3 }, players: v.players.map((p, i) => i === v.me ? { ...p, resources: { wood: 2, brick: 1, sheep: 2, wheat: 1, ore: 1 } } : p) }`
);
await shot('discard');
await inject(
	`{ step: 'steal', current: v.me, stealCandidates: v.players.map((_, i) => i).filter((i) => i !== v.me).slice(0, 2) }`
);
await shot('steal');
await inject(
	`{ trade: { id: 7, from: (v.me + 1) % v.players.length, give: { wheat: 2 }, want: { ore: 1, brick: 1 }, responses: {} }, players: v.players.map((p, i) => i === v.me ? { ...p, resources: { wood: 2, brick: 1, sheep: 2, wheat: 1, ore: 1 } } : p) }`
);
await shot('offer');
await inject(`{ phase: 'ended', winner: v.me, trade: null }`);
await shot('victory', 3000);
await browser.close();
