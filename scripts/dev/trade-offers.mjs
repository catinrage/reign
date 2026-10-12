// Dev: the trade offer settings (Settings > Trade offers). Shoots the Settings modal from the home
// screen, then plays a quick game against bots in the offline build (?autoplay plays your turns,
// but leaves offers to you) and reports each bot offer: whether you could pay, whether its card
// showed, what you answered and how long it stayed open. Shoots an offer card that shows.
// Usage: pnpm dev:offline, then
//   BASE=http://localhost:5173 [UI_LANG=de] node scripts/dev/trade-offers.mjs <outPrefix> [width] [height] [hide 0|1] [wait] [minutes]
import { chromium } from 'playwright';
const [out = '/tmp/trade-offers', w = '1366', h = '768', hide = '1', wait = '15', minutes = '5'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
const shot = async (name, wait = 0) => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
const until = (fn, arg, timeout = 300000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

await page.goto(`${base}/`);
await page.evaluate((lang) => {
	localStorage.setItem('reign:graphics', 'low');
	localStorage.setItem('reign:lang', lang);
	localStorage.removeItem('reign:hideOffers');
	localStorage.removeItem('reign:offerWait');
}, process.env.UI_LANG ?? 'en');
await page.goto(`${base}/`);
await until(() => window.__ready === true);
await page.waitForTimeout(1500);

// The settings, from the home screen: pick them by clicking, as a player would.
for (let i = 0; i < 5 && !(await page.$('.settings')); i++) {
	await page.evaluate(() => document.querySelectorAll('.medal')[1]?.click());
	await page.waitForTimeout(1000);
}
const picked = await page.evaluate(
	({ hide, wait }) => {
		const rows = [...document.querySelectorAll('.settings section')].find((s) =>
			s.querySelector('.seg') && [...s.querySelectorAll('.seg button')].length === 6
		);
		if (!rows) return null;
		rows.scrollIntoView({ block: 'center' });
		const [hideRow, waitRow] = rows.querySelectorAll('.row');
		hideRow.querySelectorAll('button')[hide === '1' ? 1 : 0].click();
		const i = { 8: 0, 15: 1, 30: 2, 0: 3 }[wait];
		waitRow.querySelectorAll('button')[i].click();
		return [localStorage.getItem('reign:hideOffers'), localStorage.getItem('reign:offerWait')];
	},
	{ hide, wait }
);
console.log('saved settings', picked);
await shot('settings', 800);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
if (minutes === '0') {
	await browser.close();
	process.exit(0);
}

// A quick game; autoplay plays your turns but leaves offers to you.
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.evaluate(() => {
	const c = window.__client;
	const act = c.act.bind(c);
	c.act = (a) => (a.type === 'respondTrade' && !window.__answer ? undefined : act(a));
	c.quickPlay(3);
});
await until(() => window.__client.view && window.__client.view.phase === 'main');
console.log('game on');
const seen = new Map();
let shots = 0;
const end = Date.now() + Number(minutes) * 60_000;
while (Date.now() < end && shots < 2) {
	const now = await page.evaluate(() => {
		const v = window.__client.view;
		if (!v?.trade || v.trade.from === v.me) return null;
		const t = v.trade;
		const mine = v.players[v.me].resources;
		const can = Object.entries(t.want).every(([r, n]) => mine[r] >= n);
		return {
			id: t.id,
			from: v.players[t.from].name,
			want: t.want,
			can,
			answer: t.responses[v.me] ?? null,
			card: !!document.querySelector('.letter')
		};
	});
	const t = Date.now();
	for (const [id, o] of seen) {
		if (!o.closed && (!now || now.id !== id)) {
			o.closed = t;
			console.log(`offer ${id} from ${o.from} for ${JSON.stringify(o.want)}: can pay ${o.can}, card ${o.card}, answer ${o.answer}, open ${((o.closed - o.at) / 1000).toFixed(1)}s`);
		}
	}
	if (now) {
		const o = seen.get(now.id) ?? { ...now, at: t };
		o.card ||= now.card;
		o.answer = now.answer ?? o.answer;
		seen.set(now.id, o);
		if (now.card && !o.shot) {
			o.shot = true;
			shots++;
			await shot(`offer-${shots}`, 600);
		} else if (!now.can && !o.shot) {
			o.shot = true;
			await shot(`hidden-${now.id}`, 300);
		}
	}
	await page.waitForTimeout(150);
}
await browser.close();
