// Dev: the hand with different development cards, at desktop and phone sizes. A game against
// bots is paused, then the interface is handed made-up states: your turn, some resources and a
// few development cards, with the build panel showing.
// Usage: node scripts/dev/hand.mjs <outDir> [base]
import { chromium } from 'playwright';
const [dir = '/tmp/hand', base = 'http://localhost:8787'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
// The low graphics setting draws much faster in software, and these pictures are about the hand.
await page.addInitScript(() => localStorage.setItem('reign:quality', 'low'));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(base);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
await page.evaluate(() => window.__client.setName('Komeil'));
await page.click('text=Play vs bots', { force: true });
await page.waitForFunction(() => !!window.__client.view, null, { timeout: 300000 });
await page.waitForTimeout(2500);
// Hold the bots so no new state replaces the made-up one, and keep the paused screen out of
// the pictures.
await page.evaluate(() => window.__client.pauseGame(true));
await page.waitForFunction(() => !!window.__client.lobby?.pausedBy, null, { timeout: 60000 });
await page.addStyleTag({ content: '.curtain { display: none !important; }' });

const card = (type, boughtTurn) => ({ type, boughtTurn });
const HANDS = {
	none: [],
	two: [card('knight', 2), card('victoryPoint', 1), card('victoryPoint', 3)],
	four: [
		card('knight', 2),
		card('knight', 6),
		card('roadBuilding', 6),
		card('monopoly', 4),
		card('victoryPoint', 1)
	],
	five: [
		card('knight', 2),
		card('roadBuilding', 3),
		card('yearOfPlenty', 4),
		card('monopoly', 5),
		card('victoryPoint', 1)
	]
};
const SIZES = {
	d1600: { width: 1600, height: 900 },
	d1280: { width: 1280, height: 800 },
	d1366: { width: 1366, height: 768 },
	d1920: { width: 1920, height: 1080 },
	phone: { width: 390, height: 844 }
};
const only = process.env.ONLY?.split(',');
for (const [size, vp] of Object.entries(SIZES)) {
	await page.setViewportSize(vp);
	for (const [name, devCards] of Object.entries(HANDS)) {
		const tag = `${size}-${name}`;
		if (only && !only.some((o) => tag.includes(o))) continue;
		await page.evaluate((devCards) => {
			const c = window.__client;
			const v = c.view;
			const me = v.me;
			c.view = {
				...v,
				phase: 'main',
				step: 'main',
				current: me,
				turn: 6,
				devCardPlayedThisTurn: false,
				players: v.players.map((p, i) =>
					i === me
						? {
								...p,
								resources: { wood: 2, brick: 1, sheep: 3, wheat: 2, ore: 1 },
								resourceCount: 9,
								devCards,
								devCardCount: devCards.length
							}
						: p
				)
			};
		}, devCards);
		await page.waitForTimeout(1500);
		await page.screenshot({ path: `${dir}/${tag}.png`, timeout: 180000 });
		const box = await page.evaluate(() => {
			const r = document.querySelector('.hand')?.getBoundingClientRect();
			return r && { x: r.x, y: r.y, width: r.width, height: r.height };
		});
		const hand = await page.evaluate(() =>
			[...document.querySelectorAll('.hand .tray')].map((t) => {
				const r = t.getBoundingClientRect();
				return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
			})
		);
		const panel = await page.evaluate(() => {
			const r = document.querySelector('.actions .builds')?.getBoundingClientRect();
			return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right)] : null;
		});
		console.log(tag, JSON.stringify({ trays: hand, buildPanel: panel }));
		if (box) {
			const pad = 40;
			const x = Math.max(0, box.x - pad);
			const y = Math.max(0, box.y - pad);
			await page.screenshot({
				path: `${dir}/${tag}-hand.png`,
				clip: {
					x,
					y,
					width: Math.min(vp.width - x, box.width + pad * 2),
					height: Math.min(vp.height - y, box.height + pad * 2)
				},
				timeout: 180000
			});
		}
	}
}
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
