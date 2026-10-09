// Dev: the custom tooltips. A game against bots is held, the hand is given made-up development
// cards, and the pointer rests on cards that can and can't be played, on a player plaque and on
// the menu gear (near the top, so its tooltip opens below). On a phone, a tap on a card that
// can't be played shows why.
// Usage: node scripts/dev/tips.mjs <outDir> [base]
import { chromium } from 'playwright';
const [dir = '/tmp/tips', base = 'http://localhost:8787'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];

async function start(context) {
	const page = await context.newPage();
	await page.addInitScript(() => localStorage.setItem('reign:quality', 'low'));
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(base);
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
	await page.evaluate(() => window.__client.setName('Komeil'));
	await page.click('text=Play vs bots', { force: true });
	await page.waitForFunction(() => !!window.__client.view, null, { timeout: 300000 });
	await page.waitForTimeout(2500);
	// Hold the bots so no new state replaces the made-up one; then let the hand believe the
	// game runs, and keep the paused screen out of the pictures.
	await page.evaluate(() => window.__client.pauseGame(true));
	await page.waitForFunction(() => !!window.__client.lobby?.pausedBy, null, { timeout: 60000 });
	await page.addStyleTag({ content: '.curtain { display: none !important; }' });
	return page;
}

/** Your turn (or not), with a knight bought this turn, a playable monopoly and a victory point. */
async function stage(page, { mine = true, played = false } = {}) {
	await page.evaluate(
		({ mine, played }) => {
			const c = window.__client;
			c.lobby = { ...c.lobby, paused: false, pausedBy: null };
			const v = c.view;
			const me = v.me;
			c.view = {
				...v,
				phase: 'main',
				step: 'main',
				current: mine ? me : (me + 1) % v.players.length,
				turn: 6,
				devCardPlayedThisTurn: played,
				players: v.players.map((p, i) =>
					i === me
						? {
								...p,
								resources: { wood: 2, brick: 1, sheep: 3, wheat: 2, ore: 1 },
								resourceCount: 9,
								devCards: [
									{ type: 'knight', boughtTurn: 6 },
									{ type: 'roadBuilding', boughtTurn: 3 },
									{ type: 'monopoly', boughtTurn: 4 },
									{ type: 'victoryPoint', boughtTurn: 1 }
								],
								devCardCount: 4
							}
						: p
				)
			};
		},
		{ mine, played }
	);
	await page.waitForTimeout(800);
}

async function shoot(page, name, around) {
	await page.waitForTimeout(700);
	const tip = await page.evaluate(() => {
		const t = document.querySelector('.reign-tip.on');
		if (!t) return null;
		const r = t.getBoundingClientRect();
		return { x: r.x, y: r.y, w: r.width, h: r.height, text: t.innerText.replace(/\n+/g, ' | ') };
	});
	console.log(name, JSON.stringify(tip));
	const native = await page.evaluate(() => document.querySelectorAll('[data-tip][title]').length);
	if (native) errors.push(`${name}: ${native} element(s) kept their title while held`);
	const vp = page.viewportSize();
	const box = await page.locator(around).first().boundingBox();
	const pad = 150;
	const x = Math.max(0, Math.min(box.x, tip?.x ?? box.x) - pad / 2);
	const y = Math.max(0, Math.min(box.y, tip?.y ?? box.y) - pad / 2);
	const r = Math.min(vp.width, Math.max(box.x + box.width, (tip?.x ?? 0) + (tip?.w ?? 0)) + pad / 2);
	const b = Math.min(vp.height, Math.max(box.y + box.height, (tip?.y ?? 0) + (tip?.h ?? 0)) + pad / 2);
	await page.screenshot({ path: `${dir}/${name}.png`, clip: { x, y, width: r - x, height: b - y } });
}

// Playable cards bob, so point at where they are rather than waiting for them to stop.
async function point(page, sel) {
	const b = await page.locator(sel).first().boundingBox();
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
}
const card = (alt) => `.hand .card:has(img[alt="${alt}"])`;

// Desktop.
{
	const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
	const page = await start(context);
	await stage(page);
	await point(page, card('Knight'));
	await shoot(page, 'desk-fresh-knight', '.hand');
	await point(page, card('Monopoly'));
	await shoot(page, 'desk-playable', '.hand');
	await point(page, card('Victory Point'));
	await shoot(page, 'desk-vp', '.hand');
	await page.mouse.move(800, 300);
	await stage(page, { mine: false });
	await point(page, card('Road Building'));
	await shoot(page, 'desk-not-your-turn', '.hand');
	await page.mouse.move(800, 300);
	await stage(page, { played: true });
	await point(page, card('Monopoly'));
	await shoot(page, 'desk-played', '.hand');
	await page.mouse.move(800, 300);
	await page.waitForTimeout(500);
	await point(page, '.icon-btn.gear');
	await shoot(page, 'desk-gear', '.icon-btn.gear');
	await page.mouse.move(800, 300);
	await page.waitForTimeout(500);
	const stat = page.locator('[title^="Victory points"], [data-tip^="Victory points"]').first();
	await stat.hover();
	await shoot(page, 'desk-plaque', '[data-tip^="Victory points"]');
	await page.screenshot({ path: `${dir}/desk-full.png` });
	await context.close();
}

// Phone: a tap on a card that can't be played shows the reason.
{
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
		deviceScaleFactor: 2
	});
	const page = await start(context);
	await stage(page);
	const b = await page.locator(card('Knight')).first().boundingBox();
	await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
	await shoot(page, 'phone-tap-knight', '.hand');
	await page.screenshot({ path: `${dir}/phone-full.png` });
	await context.close();
}

console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
