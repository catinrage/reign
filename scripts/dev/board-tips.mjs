// Dev: hovering a piece on the board shows its tooltip (name, owner, the turn it went up on). A
// game against bots plays itself (the bot logic plays your seat too) until turn TURN (8 by
// default) and is paused; then the mouse rests on a city, a settlement, a road and a workshop
// in turn, if the table has them, and each tooltip is shot. Pieces built late are picked first.
// EXTENDED=1 plays Reign Extended (with workshops) instead of Classic.
// Usage: TURN=8 node scripts/dev/board-tips.mjs <outDir> [base] [width] [height]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir = '/tmp/board-tips', base = 'http://localhost:8787', w = '1600', h = '900'] =
	process.argv.slice(2);
const turn = Number(process.env.TURN ?? 8);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.addInitScript(() => localStorage.setItem('reign:graphics', 'medium'));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 600000, polling: 200 });
await signIn(page, base);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.evaluate(() => window.__client.setName('Komeil'));
if (process.env.EXTENDED)
	await page.evaluate(() => {
		const c = window.__client;
		const send = c.send.bind(c);
		c.send = (msg) => {
			if (msg.t === 'start') send({ t: 'setMode', mode: 'extended' });
			send(msg);
		};
	});
await page.click('text=Play vs bots', { force: true });
await until((turn) => (window.__client.latest?.turn ?? 0) >= turn, turn);
await page.evaluate(() => {
	window.__stopAutoplay();
	window.__client.pauseGame(true);
});
await until(() => !!window.__client.lobby?.pausedBy);
await page.addStyleTag({ content: '.curtain { display: none !important; }' });
await page.evaluate(() => {
	const s = window.__scene;
	s.anim.update(60);
	s.stage.rig.set({}, true);
	s.stage.shift = s.stage.shiftGoal;
	s.stage.applyShift();
});
await page.evaluate(
	() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
);

/** A piece of each kind whose middle is on the bare board (no interface over it). */
const targets = await page.evaluate(() => {
	const s = window.__scene;
	const v = window.__client.latest;
	const canvas = s.stage.canvas;
	const out = {};
	const kindOf = (key) =>
		key.startsWith('e')
			? 'road'
			: key.startsWith('w')
				? 'workshop'
				: key.includes(':city')
					? 'city'
					: 'settlement';
	const turnOf = (key) => {
		const at = Number(/\d+/.exec(key)[0]);
		return v.builtTurns[`${kindOf(key)}:${at}`] ?? 0;
	};
	const late = [...s.pieces.values()].sort((a, b) => turnOf(b.key) - turnOf(a.key));
	for (const p of late) {
		const kind = kindOf(p.key);
		if (out[kind]) continue;
		const at = s.project(p.obj.position.clone().setY(p.obj.position.y + 1.5));
		if (document.elementFromPoint(at.x, at.y) !== canvas) continue;
		out[kind] = { key: p.key, ...at };
	}
	return { out, turn: v.turn };
});
console.log(JSON.stringify(targets));
for (const [kind, t] of Object.entries(targets.out)) {
	await page.mouse.move(t.x - 30, t.y - 30);
	await page.mouse.move(t.x, t.y, { steps: 4 });
	await page.waitForSelector('.reign-tip.on', { timeout: 60000 });
	await page.waitForTimeout(400);
	const text = await page.evaluate(() => document.querySelector('.reign-tip').innerText);
	console.log(kind, JSON.stringify(text));
	await page.screenshot({ path: `${dir}/${kind}.png`, timeout: 180000 });
	await page.screenshot({
		path: `${dir}/${kind}-zoom.png`,
		clip: { x: Math.max(0, t.x - 180), y: Math.max(0, t.y - 150), width: 360, height: 200 },
		timeout: 180000
	});
	await page.mouse.move(5, Number(h) / 2);
	await page.waitForSelector('.reign-tip:not(.on)', { timeout: 60000 });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
