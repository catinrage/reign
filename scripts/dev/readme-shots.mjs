// Dev helper: retakes the README screenshots in docs/screenshots. Run it against a dev server
// (`DATABASE_URL=memory:// pnpm start --dev` after `pnpm build`, or `pnpm dev`).
// Usage: node scripts/dev/readme-shots.mjs <outDir> [base] [shots]
// shots is a comma list out of home,lobby,islands,draft,table,closeup,events,eight (all by default).
// TURNS=n sets how far the table game gets before its shots (13 by default). Games against bots
// play out at Low graphics and come back at High for the shots; under swiftshader each game still
// takes a good while. Writes PNGs: save them over docs/screenshots/*.jpg afterwards
// (eight.png is eight-players.jpg).
import { chromium } from 'playwright';
const [
	dir,
	base = 'http://localhost:5173',
	which = 'home,lobby,islands,draft,table,closeup,events,eight'
] = process.argv.slice(2);
const want = new Set(which.split(','));
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});

let users = 0;
/** A page signed in as Komeil, with a fresh account (the username has to be unique). */
async function open(w, h, query = '', quality = 'high') {
	const page = await browser.newPage({ viewport: { width: w, height: h } });
	// Bot games play out at Low graphics, which is far quicker in a software renderer.
	await page.addInitScript((q) => {
		if (sessionStorage.getItem('shots:quality')) return;
		localStorage.setItem('reign:graphics', q);
		sessionStorage.setItem('shots:quality', '1');
	}, quality);
	page.on('pageerror', (e) => console.log('[pageerror]', e.message));
	const username = `komeil_${Date.now().toString(36).slice(-4)}${users++}`;
	const res = await page.request.post(`${base}/api/register`, {
		data: { username, nickname: 'Komeil', password: 'devpass1', avatar: 'wizard' }
	});
	if (!res.ok()) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
	await page.goto(`${base}/${query}`);
	await until(page, () => window.__ready === true && !document.getElementById('boot'));
	await page.waitForTimeout(2500);
	return page;
}
const until = (page, fn, arg, timeout = 600000) =>
	page.waitForFunction(fn, arg, { timeout, polling: 400 });
const send = (page, m) => page.evaluate((m) => window.__client.send(m), m);
const cheat = (page, c) => send(page, { t: 'cheat', cheat: c });
async function shot(page, name, wait = 1500) {
	await page.waitForTimeout(wait);
	// Portraits and avatars draw in the background, one at a time.
	await page.evaluate(() => window.__portraits());
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 300000, animations: 'disabled' });
	console.log('shot', name);
}
/** A room in Reign Extended with bots, as the host. */
async function room(page, bots, setup) {
	await page.click('.sign .btn.green', { force: true });
	await until(page, () => !!window.__client.lobby);
	await page.evaluate(
		([bots, setup]) => {
			const c = window.__client;
			c.send({ t: 'setMode', mode: 'extended' });
			for (const m of setup) c.send(m);
			for (let i = 0; i < bots; i++) c.send({ t: 'addBot' });
		},
		[bots, setup]
	);
	await page.waitForTimeout(2500);
}
/** Start the game and let bots finish the setup. */
async function start(page) {
	await send(page, { t: 'start' });
	await until(page, () => !!window.__client.view);
}
/** Reload into my seat in the room, at High graphics, with or without autoplay. */
async function resume(page, autoplay) {
	const search = await page.evaluate((autoplay) => {
		localStorage.setItem('reign:graphics', 'high');
		const url = new URL(location.href);
		if (autoplay) url.searchParams.set('autoplay', '');
		else url.searchParams.delete('autoplay');
		return url.search;
	}, autoplay);
	await page.goto(`${base}/${search}`);
	await until(
		page,
		() => window.__ready === true && !document.getElementById('boot') && !!window.__client.view
	);
	// My seat's usual view, without waiting for the camera to swing over from the menu.
	await page.evaluate(() => {
		const azimuth = -0.62 + window.__client.view.me * (Math.PI / 2);
		window.__scene.stage.rig.set(
			{ azimuth, target: { x: 0, y: 0, z: 0 }, ...window.__scene.framing(azimuth) },
			true
		);
	});
	await page.waitForTimeout(4000);
}
/**
 * Autoplay (a page opened with ?autoplay) runs my seat until `turns` turns have gone by, then
 * stops on my turn: before the roll (`at` 'roll'), once the roll has played out ('main'), or on
 * the next event card held up to the table ('flip'). Bots hurry, and dice and event cards on the
 * way don't wait to play out: frames are slow here.
 */
const hurried = new WeakSet();
async function playTo(page, turns, at = 'roll') {
	if (!hurried.has(page)) await cheat(page, { type: 'fastBots', on: true });
	hurried.add(page);
	await page.evaluate(
		([turns, at]) => {
			const c = window.__client;
			if (at === 'flip') window.__flipMs = window.__effectMs = 600000;
			window.__held = false;
			const there = () => {
				const v = c.view;
				if (!v || v.phase === 'draft' || v.phase === 'setup' || v.turn < turns) return false;
				if (at === 'flip') return c.presenting?.phase === 'flip';
				return v.current === v.me && v.step === at && !c.tossing;
			};
			const hold = () => {
				window.__stopAutoplay?.();
				clearInterval(window.__skip);
				clearTimeout(c.presentTimer);
				window.__held = true;
			};
			// Autoplay goes through client.act: once there, its next move is dropped.
			const act = c.act.bind(c);
			c.act = (a) => {
				if (window.__held) return;
				if (there()) return hold();
				act(a);
			};
			// Autoplay sometimes stalls before my roll (a move the server turned down isn't tried
			// again), so the dice get rolled for it after a while.
			let since = 0;
			let seen = '';
			window.__skip = setInterval(() => {
				if (there()) return hold();
				if (c.tossing) c.landed(c.tossing.seq);
				if (c.presenting) c.presented(c.presenting.seq);
				const v = c.view;
				const key = v && `${v.version}:${v.current}:${v.step}`;
				if (key !== seen) [seen, since] = [key, Date.now()];
				else if (
					v.current === v.me &&
					v.step === 'roll' &&
					!c.tossing &&
					Date.now() - since > 8000
				) {
					since = Date.now();
					act({ type: 'rollDice' });
				}
			}, 300);
		},
		[turns, at]
	);
	const progress = setInterval(async () => {
		const line = await page
			.evaluate(() => {
				const c = window.__client;
				const v = c.view;
				return (
					v &&
					`turn ${v.turn} (server ${c.latest.turn}) current ${v.current} me ${v.me} step ${v.step}`
				);
			})
			.catch(() => null);
		console.log('play', line);
	}, 60000);
	await until(page, () => window.__held);
	clearInterval(progress);
}

if (want.has('home')) {
	const page = await open(1600, 900);
	await shot(page, 'home', 4000);
	await page.close();
}

if (want.has('lobby') || want.has('islands') || want.has('draft')) {
	const page = await open(1366, 768);
	await room(page, 3, [{ t: 'setMap', map: { preset: 'great' } }]);
	// Bots are always ready; the shot shows a full table of four.
	if (want.has('lobby')) await shot(page, 'lobby', 3000);
	if (want.has('islands')) {
		await page.setViewportSize({ width: 1600, height: 900 });
		await page.click('.island .pick', { force: true });
		await page.waitForTimeout(800);
		await page.click('.random .shapes .btn >> nth=3', { force: true });
		await page.locator('.random .slider').fill('48');
		await page.click('.random .seg:not(.shapes) .btn >> nth=1', { force: true });
		await page.click('.random .generate', { force: true });
		await shot(page, 'islands', 4000);
		await page.keyboard.press('Escape');
		if (await page.locator('.modal').count())
			await page.click('.modal .icon-btn >> nth=0', { force: true });
		await send(page, { t: 'setMap', map: { preset: 'great' } });
		await page.setViewportSize({ width: 1366, height: 768 });
		await page.waitForTimeout(1500);
	}
	if (want.has('draft')) {
		await start(page);
		await until(page, () => window.__client.view?.phase === 'draft');
		await until(
			page,
			() =>
				window.__client.view?.current === window.__client.view?.me ||
				window.__client.view?.phase !== 'draft'
		);
		await page.waitForTimeout(800);
		const cards = page.locator('.pool .card:not(.taken)');
		await cards.nth(2).click({ force: true });
		await cards.nth(3).hover({ force: true });
		await shot(page, 'draft', 2000);
	}
	await page.close();
}

if (want.has('table') || want.has('closeup') || want.has('events')) {
	const page = await open(1600, 900, '?autoplay', 'low');
	await room(page, 3, []);
	await start(page);
	// Autoplay rolls (and deals with a 7) before the page comes back at High graphics.
	await playTo(page, Number(process.env.TURNS ?? 13), 'main');
	await resume(page, false);
	if (want.has('table')) await shot(page, 'table', 4000);
	if (want.has('closeup')) {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.addStyleTag({ content: '#app { visibility: hidden !important; }' });
		// Up close on the robber, leaning towards the nearest storehouse when there is one.
		await page.evaluate(() => {
			const c = window.__client;
			const board = window.__scene.boardView;
			const target = board.robberSpot(c.latest.robberHex);
			const houses = (c.latest.storehouses ?? []).flatMap((on, v) =>
				on ? [board.vertexPos(v)] : []
			);
			houses.sort((a, b) => a.distanceTo(target) - b.distanceTo(target));
			if (houses[0] && houses[0].distanceTo(target) < 40) target.lerp(houses[0], 0.5);
			target.y = 0;
			const azimuth = -0.62 + c.view.me * (Math.PI / 2) + 0.35;
			window.__scene.stage.rig.set({ target, radius: 60, polar: 0.95, azimuth }, true);
		});
		await shot(page, 'closeup', 6000);
		await page.addStyleTag({ content: '#app { visibility: visible !important; }' });
		await page.setViewportSize({ width: 1600, height: 900 });
	}
	if (want.has('events')) {
		// Play on to the next round's event card and catch it held up to the table.
		const turn = await page.evaluate(() => window.__client.view.turn);
		await resume(page, true);
		await playTo(page, turn + 1, 'flip');
		await shot(page, 'events', 500);
	}
	await page.close();
}

if (want.has('eight')) {
	const page = await open(1600, 900, '?autoplay', 'low');
	await room(page, 0, []);
	// A big round island from the picker, then seven bots: a small island seats fewer.
	await page.click('.island .pick', { force: true });
	await page.waitForTimeout(800);
	await page.click('.random .shapes .btn >> nth=0', { force: true });
	await page.locator('.random .slider').fill('48');
	await page.click('.random .generate', { force: true });
	await page.waitForTimeout(1500);
	await page.keyboard.press('Escape');
	if (await page.locator('.modal').count())
		await page.click('.modal .icon-btn >> nth=0', { force: true });
	for (let i = 0; i < 7; i++) await send(page, { t: 'addBot' });
	await until(page, () => window.__client.lobby.seats.length === 8);
	await page.waitForTimeout(1500);
	await start(page);
	await playTo(page, 40);
	await resume(page, false);
	// Before the roll, so the build menu leaves all eight plaques in sight.
	await shot(page, 'eight', 8000);
	await page.close();
}

await browser.close();
