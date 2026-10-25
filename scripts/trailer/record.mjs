// Trailer recorder: plays a game against bots, then records clips frame by frame on a fake clock
// (each frame is rendered on demand and screenshotted, so the video is smooth however slow the
// renderer is). Needs a dev server with cheats: `pnpm build && DATABASE_URL=memory:// pnpm start --dev`.
// Usage: node scripts/trailer/record.mjs <outDir> <a|b> [clip,clip...]
//   a: a 4-player game: establish, glide, roll, build, trade, robber, comet (+ still-table.png)
//   b: an 8-player game on a big island: eight, eight-ui (+ still-eight.png)
// Env: BASE (server, default http://localhost:8787), CHROME_PATH, SOFTWARE=1 (no graphics card),
// HEADED=1 (show the browser window, if headless gets no GPU), TURNS (how far the game gets first).
// Each clip lands in <outDir>/<clip>/0000.jpg...; a clip already recorded is skipped.
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';

const [dir, game = 'a', which = ''] = process.argv.slice(2);
const want = (n) => !which || which.split(',').includes(n);
const base = process.env.BASE ?? 'http://localhost:8787';
const W = 1920, H = 1080, FPS = 30;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || undefined,
	headless: !process.env.HEADED,
	args: process.env.SOFTWARE
		? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
		: ['--ignore-gpu-blocklist', '--enable-gpu']
});

const until = (page, fn, arg, timeout = 1800000) => page.waitForFunction(fn, arg, { timeout, polling: 400 });
const send = (page, m) => page.evaluate((m) => window.__client.send(m), m);
const cheat = (page, c) => send(page, { t: 'cheat', cheat: c });
const act = (page, a) => page.evaluate((a) => window.__client.act(a), a);

async function open(query, quality) {
	const page = await browser.newPage({ viewport: { width: W, height: H } });
	await page.addInitScript((q) => {
		localStorage.setItem('reign:fpsCap', '30');
		if (sessionStorage.getItem('rec:quality')) return;
		localStorage.setItem('reign:graphics', q);
		sessionStorage.setItem('rec:quality', '1');
	}, quality);
	page.on('pageerror', (e) => log('[pageerror]', e.message));
	const username = `komeil_${Date.now().toString(36).slice(-5)}`;
	const res = await page.request.post(`${base}/api/register`, {
		data: { username, nickname: 'Komeil', password: 'devpass1', avatar: 'wizard' }
	});
	if (!res.ok()) throw new Error(`sign-up failed: ${res.status()}`);
	await page.goto(`${base}/${query}`);
	await until(page, () => window.__ready === true && !document.getElementById('boot'));
	await page.waitForTimeout(2500);
	return page;
}

async function room(page, bots, setup) {
	await page.click('.sign .btn.green', { force: true });
	await until(page, () => !!window.__client.lobby);
	await page.evaluate(([bots, setup]) => {
		const c = window.__client;
		c.send({ t: 'setMode', mode: 'extended' });
		for (const m of setup) c.send(m);
		for (let i = 0; i < bots; i++) c.send({ t: 'addBot' });
	}, [bots, setup]);
	await page.waitForTimeout(2500);
}

async function start(page) {
	await send(page, { t: 'start' });
	await until(page, () => !!window.__client.view);
}

async function resume(page) {
	const search = await page.evaluate(() => {
		localStorage.setItem('reign:graphics', 'high');
		const url = new URL(location.href);
		url.searchParams.delete('autoplay');
		return url.search;
	});
	log('goto', search);
	await page.goto(`${base}/${search}`);
	await until(page, () => window.__ready === true && !document.getElementById('boot') && !!window.__client.view);
	await page.evaluate(() => {
		const azimuth = -0.62 + window.__client.view.me * (Math.PI / 2);
		window.__home = { azimuth, target: { x: 0, y: 0, z: 0 }, ...window.__scene.framing(azimuth) };
		window.__scene.stage.rig.set(window.__home, true);
	});
	await page.waitForTimeout(5000);
	await page.evaluate(() => window.__portraits());
	await page.waitForTimeout(1000);
}

// Same as the README shots script: autoplay my seat until `turns` turns, stopping on my turn.
async function playTo(page, turns, at = 'roll') {
	await cheat(page, { type: 'fastBots', on: true });
	await page.evaluate(([turns, at]) => {
		const c = window.__client;
		window.__held = false;
		const there = () => {
			const v = c.view;
			if (!v || v.phase === 'draft' || v.phase === 'setup' || v.turn < turns) return false;
			return v.current === v.me && v.step === at && !c.tossing;
		};
		const hold = () => {
			window.__stopAutoplay?.();
			clearInterval(window.__skip);
			clearTimeout(c.presentTimer);
			window.__held = true;
		};
		const act = c.act.bind(c);
		c.act = (a) => {
			if (window.__held) return act(a);
			if (there()) return hold();
			act(a);
		};
		let since = 0, seen = '';
		window.__skip = setInterval(() => {
			if (there()) return hold();
			if (c.tossing) c.landed(c.tossing.seq);
			if (c.presenting) c.presented(c.presenting.seq);
			const v = c.view;
			const key = v && `${v.version}:${v.current}:${v.step}`;
			if (key !== seen) [seen, since] = [key, Date.now()];
			else if (v.current === v.me && v.step === 'roll' && !c.tossing && Date.now() - since > 8000) {
				since = Date.now();
				act({ type: 'rollDice' });
			}
		}, 300);
	}, [turns, at]);
	const progress = setInterval(async () => {
		const line = await page.evaluate(() => {
			const v = window.__client.view;
			return v && `turn ${v.turn} current ${v.current} me ${v.me} step ${v.step} phase ${v.phase}`;
		}).catch(() => null);
		log('play', line);
	}, 60000);
	await until(page, () => window.__held);
	clearInterval(progress);
	await cheat(page, { type: 'fastBots', on: false });
}

let cdp;
/**
 * Record `frames` frames into <dir>/<name>/. `each(i, t)` runs before frame i (t = 0..1) to move
 * the camera or act in the game. The scene's own loop is stopped; time only moves between frames.
 */
async function clip(page, name, frames, each, { ui = true } = {}) {
	const out = `${dir}/${name}`;
	if (!want(name)) return;
	if (existsSync(out) && readdirSync(out).length >= frames) return log('skip', name);
	mkdirSync(out, { recursive: true });
	cdp ??= await page.context().newCDPSession(page);
	await cdp.send('Animation.enable');
	const hide = ui ? null : await page.addStyleTag({ content: '#app { visibility: hidden !important; }' });
	await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 200));
	await page.evaluate(() => {
		const st = window.__scene.stage;
		st.stop();
		// The fake clock's time isn't the real one the scene's clock last read: start from now.
		st.clock.oldTime = performance.now();
	});
	const t0 = Date.now();
	let perFrame = 8000;
	for (let i = 0; i < frames; i++) {
		// CSS animations run on the real clock: slow them to the pace frames are made at.
		await cdp.send('Animation.setPlaybackRate', { playbackRate: 1000 / FPS / perFrame });
		if (each) await each(i, frames > 1 ? i / (frames - 1) : 1);
		const ms = Math.round(((i + 1) * 1000) / FPS) - Math.round((i * 1000) / FPS);
		await page.clock.runFor(ms);
		await page.evaluate(() => window.__scene.stage.frame());
		const f0 = Date.now();
		await page.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95, timeout: 300000 });
		perFrame = Math.max(500, (Date.now() - t0) / (i + 1));
		if (i % 15 === 0) log(name, i, `${Math.round(perFrame)}ms/frame`, `shot ${Date.now() - f0}ms`);
	}
	await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
	await page.evaluate(() => window.__scene.stage.start());
	await page.clock.resume();
	if (hide) await hide.evaluate((el) => el.remove());
	log('done', name, `${Math.round((Date.now() - t0) / 1000)}s`);
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Put the camera somewhere: azimuth, polar, radius and target (x, z) are numbers. */
const cam = (page, o) =>
	page.evaluate((o) => {
		const r = window.__scene.stage.rig;
		const T = r.target.constructor;
		r.set({ azimuth: o.azimuth, polar: o.polar, radius: o.radius, target: new T(o.x ?? 0, 0, o.z ?? 0) }, true);
	}, o);
const lerp = (a, b, t) => a + (b - a) * t;

/** Facts about the board in the page: hex centers, my buildings, hexes next to each vertex. */
async function boardFacts(page) {
	return page.evaluate(() => {
		const c = window.__client, bv = window.__scene.boardView, s = c.latest, me = c.view.me;
		const hexes = s.board.hexes.map((h, i) => {
			const p = bv.hexCenter(i);
			return { i, x: p.x, z: p.z, number: h.number, terrain: h.terrain };
		});
		let d = Infinity;
		for (let a = 0; a < hexes.length; a++)
			for (let b = a + 1; b < hexes.length; b++)
				d = Math.min(d, Math.hypot(hexes[a].x - hexes[b].x, hexes[a].z - hexes[b].z));
		const buildings = [];
		s.buildings.forEach((b, v) => {
			if (!b) return;
			const p = bv.vertexPos(v);
			const near = hexes.filter((h) => Math.hypot(h.x - p.x, h.z - p.z) < d * 0.7).map((h) => h.i);
			buildings.push({ v, owner: b.owner, kind: b.kind, x: p.x, z: p.z, near });
		});
		return { me, hexes, buildings, robber: s.robberHex, d, home: window.__home };
	});
}

if (game === 'a') {
	const page = await open('?autoplay', 'low');
	await room(page, 3, []);
	await start(page);
	await playTo(page, Number(process.env.TURNS ?? 9), 'roll');
	log('at my turn, reloading at high');
	await resume(page);
	await page.clock.install();
	await page.clock.resume();
	log('clock installed');
	let f = await boardFacts(page);
	const home = f.home;
	log('home', JSON.stringify(home));

	if (want('establish')) {
		// A crane shot: from high over the room down to the table.
		await clip(page, 'establish', 165, async (i, t) => {
			const e = ease(t);
			await cam(page, {
				azimuth: lerp(home.azimuth - 1.1, home.azimuth - 0.15, e),
				polar: lerp(0.38, home.polar + 0.05, e),
				radius: lerp(home.radius * 2.1, home.radius * 0.92, e)
			});
		}, { ui: false });
	}

	if (want('glide')) {
		// Low over the island, past my buildings.
		const mine = f.buildings.filter((b) => b.owner === f.me);
		const a = mine[0] ?? { x: -40, z: 0 };
		let b = mine.reduce((best, m) => (Math.hypot(m.x - a.x, m.z - a.z) > Math.hypot(best.x - a.x, best.z - a.z) ? m : best), a);
		if (Math.hypot(b.x - a.x, b.z - a.z) < f.d) b = { x: -a.x, z: -a.z };
		const az = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
		await clip(page, 'glide', 135, async (i, t) => {
			const e = ease(t);
			await cam(page, { azimuth: az + 0.25 * (e - 0.5), polar: 1.0, radius: 62, x: lerp(a.x, b.x, e), z: lerp(a.z, b.z, e) });
		}, { ui: false });
	}

	await cam(page, home);
	if (want('roll')) {
		// The number most of my buildings touch, so the roll pays me.
		const count = {};
		for (const b of f.buildings.filter((b) => b.owner === f.me))
			for (const h of b.near) {
				const n = f.hexes[h].number;
				if (n && n !== 7 && h !== f.robber) count[n] = (count[n] ?? 0) + (b.kind === 'city' ? 2 : 1);
			}
		const total = Number(Object.entries(count).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 8);
		log('rigging dice', total, JSON.stringify(count));
		await clip(page, 'roll', 165, async (i, t) => {
			if (i === 10) {
				await cheat(page, { type: 'rigDice', total });
				await page.waitForTimeout(400);
				await act(page, { type: 'rollDice' });
				await page.waitForTimeout(600);
			}
			const e = easeOut(Math.min(1, t * 1.4));
			await cam(page, { ...home, azimuth: home.azimuth - 0.15 + 0.12 * e, radius: home.radius * lerp(0.95, 0.85, e) });
		});
	}

	f = await boardFacts(page);
	if (want('build')) {
		const s = f.buildings.find((b) => b.owner === f.me && b.kind === 'settlement');
		if (s) {
			await cheat(page, { type: 'resources', player: f.me, resources: { grain: 2, ore: 3 } });
			await page.waitForTimeout(800);
			await clip(page, 'build', 105, async (i, t) => {
				if (i === 20) {
					await act(page, { type: 'buildCity', vertex: s.v });
					await page.waitForTimeout(600);
				}
				const e = ease(t);
				await cam(page, {
					azimuth: home.azimuth - 0.05 + 0.3 * e,
					polar: lerp(home.polar, 0.95, e),
					radius: lerp(home.radius * 0.8, 70, e),
					x: lerp(0, s.x, e),
					z: lerp(0, s.z, e)
				});
			});
		} else log('no settlement to upgrade');
	}

	await cam(page, home);
	if (want('trade')) {
		await cheat(page, { type: 'resources', player: f.me, resources: { wool: 3, lumber: 2 } });
		await page.waitForTimeout(800);
		await clip(page, 'trade', 105, async (i) => {
			if (i === 8) {
				await act(page, { type: 'offerTrade', give: { wool: 2 }, want: { brick: 1 } });
				await page.waitForTimeout(300);
			}
		});
		await act(page, { type: 'cancelTrade' });
		await page.waitForTimeout(1500);
	}

	f = await boardFacts(page);
	if (want('robber')) {
		// The robber onto a rival's best tile, then steal from them.
		const rivals = f.buildings.filter((b) => b.owner !== f.me);
		const mineHexes = new Set(f.buildings.filter((b) => b.owner === f.me).flatMap((b) => b.near));
		let pick = null;
		for (const r of rivals)
			for (const h of r.near)
				if (!mineHexes.has(h) && h !== f.robber && f.hexes[h].terrain !== 'desert' && (!pick || [6, 8].includes(f.hexes[h].number))) pick = { h, victim: r.owner };
		if (pick) {
			await cheat(page, { type: 'devCard', player: f.me, card: 'knight' });
			await page.waitForTimeout(800);
			const hp = f.hexes[pick.h];
			await clip(page, 'robber', 135, async (i, t) => {
				if (i === 6) {
					await act(page, { type: 'playKnight' });
					await page.waitForTimeout(500);
				}
				if (i === 30) {
					await act(page, { type: 'moveRobber', hex: pick.h });
					await page.waitForTimeout(500);
				}
				if (i === 75) {
					const step = await page.evaluate(() => window.__client.view.step);
					if (step === 'steal') await act(page, { type: 'steal', victim: pick.victim });
					await page.waitForTimeout(500);
				}
				const e = ease(Math.min(1, t * 1.3));
				await cam(page, {
					azimuth: home.azimuth + 0.2 - 0.25 * e,
					polar: lerp(home.polar, 0.9, e),
					radius: lerp(home.radius * 0.9, 95, e),
					x: lerp(0, hp.x * 0.8, e),
					z: lerp(0, hp.z * 0.8, e)
				});
			});
		} else log('no robber target');
	}

	await cam(page, home);
	if (want('comet')) {
		await clip(page, 'comet', 195, async (i, t) => {
			if (i === 6) {
				await cheat(page, { type: 'event', card: 'comet' });
				await page.waitForTimeout(600);
			}
			await cam(page, { ...home, azimuth: home.azimuth - 0.1 + 0.2 * t, radius: home.radius * 0.97 });
		});
	}

	if (want('still')) {
		// Stills for the store page.
		await page.evaluate(() => window.__portraits());
		await page.waitForTimeout(3000);
		await page.screenshot({ path: `${dir}/still-table.png`, timeout: 300000 });
	}
}

if (game === 'b') {
	const page = await open('?autoplay', 'low');
	await room(page, 0, []);
	await page.click('.island .pick', { force: true });
	await page.waitForTimeout(800);
	await page.click('.random .shapes .btn >> nth=0', { force: true });
	await page.locator('.random .slider').fill('48');
	await page.click('.random .generate', { force: true });
	await page.waitForTimeout(1500);
	await page.keyboard.press('Escape');
	if (await page.locator('.modal').count()) await page.click('.modal .icon-btn >> nth=0', { force: true });
	for (let i = 0; i < 7; i++) await send(page, { t: 'addBot' });
	await until(page, () => window.__client.lobby.seats.length === 8);
	await page.waitForTimeout(1500);
	await start(page);
	await playTo(page, Number(process.env.TURNS ?? 28), 'roll');
	await resume(page);
	await page.clock.install();
	await page.clock.resume();
	log('clock installed');
	const home = await page.evaluate(() => window.__home);
	await page.screenshot({ path: `${dir}/still-eight.png`, timeout: 300000 });
	await clip(page, 'eight', 165, async (i, t) => {
		const e = ease(t);
		await cam(page, { azimuth: home.azimuth - 0.5 + 0.7 * e, polar: lerp(0.6, home.polar, e), radius: home.radius * lerp(1.25, 1.0, e) });
	}, { ui: false });
	await clip(page, 'eight-ui', 75, async (i, t) => {
		await cam(page, { ...home, azimuth: home.azimuth + 0.12 * t });
	});
}

await browser.close();
log('all done');
