// Dev: hovering a plaque lights up that player's pieces on the board. A game against bots plays
// itself through the setup (the bot logic plays your seat too) and is paused once everyone has
// two settlements and two roads. Pictures: nobody hovered, each plaque hovered in turn, a city
// built while the mouse stays on the last plaque, and the mouse gone again. Where each building
// is on screen goes to pieces.json, for close-ups.
// Usage: COLORS=yellow,green node scripts/dev/plaque.mjs <outDir> [base] [width] [height]
// (COLORS picks the plaques to hover; every one by default.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir = '/tmp/plaque', base = 'http://localhost:8787', w = '1600', h = '900'] =
	process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
// The low graphics setting draws much faster in software.
await page.addInitScript(() => localStorage.setItem('reign:graphics', 'medium'));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 300000, polling: 100 });
await signIn(page, base);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true);
await page.evaluate(() => window.__client.setName('Komeil'));
await page.click('text=Play vs bots', { force: true });
await until(() => {
	const v = window.__client.latest;
	if (!v) return false;
	const owners = v.buildings.map((b) => b?.owner);
	const count = (list, i) => list.filter((o) => o === i).length;
	return v.players.every((_, i) => count(owners, i) >= 2 && count(v.roads, i) >= 2);
});
// Hold the table as it is, and keep the paused screen out of the pictures.
await page.evaluate(() => {
	window.__stopAutoplay();
	window.__client.pauseGame(true);
});
await until(() => !!window.__client.lobby?.pausedBy);
await page.addStyleTag({ content: '.curtain { display: none !important; }' });
// In software the frames come slowly, so the last pieces can still be dropping in, the camera
// gliding to its place and the view sliding back from the lobby's side panel: finish all three.
await page.evaluate(() => {
	const s = window.__scene;
	s.anim.update(60);
	s.stage.rig.set({}, true);
	s.stage.shift = s.stage.shiftGoal;
	s.stage.applyShift();
});
// Let it draw a couple of frames from there before asking where things are on screen.
await page.evaluate(
	() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
);

const shot = async (name) => {
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000 });
	console.log('shot', name);
};
/** Every building on screen, as the scene projects it. */
const buildings = () =>
	page.evaluate(() => {
		const s = window.__scene;
		return [...s.pieces.values()]
			.filter((p) => p.key.startsWith('v'))
			.map((p) => ({ key: p.key, owner: p.owner, ...s.project(p.obj.position) }));
	});
/** Wait until the pieces of `seat` are fully lit and everyone else's dark (null: all dark). */
const lit = (seat) =>
	until((seat) => {
		const levels = window.__scene.lit;
		return (seat === null || levels[seat] === 1) && levels.every((l, i) => i === seat || l === 0);
	}, seat);
const away = () => page.mouse.move(20, Number(h) / 2);

const players = await page.evaluate(() => window.__client.view.players.map((p) => p.color));
const colors = process.env.COLORS?.split(',') ?? players;
const seats = colors.map((c) => players.indexOf(c)).filter((i) => i >= 0);
console.log(JSON.stringify({ players, seats }));

await away();
await lit(null);
writeFileSync(`${dir}/pieces.json`, JSON.stringify({ players, buildings: await buildings() }));
await shot('none');
for (const i of seats) {
	await page.hover(`.players .player >> nth=${i}`);
	await lit(i);
	await page.waitForTimeout(500);
	await shot(`hover-${i}-${players[i]}`);
}

// A city for the last hovered player, built while the mouse stays on their plaque.
const last = seats[seats.length - 1];
await page.evaluate((seat) => {
	const v = window.__client.latest;
	const at = v.buildings.findIndex((b) => b?.owner === seat);
	const buildings = v.buildings.map((b, i) => (i === at ? { kind: 'city', owner: seat } : b));
	window.__scene.setView({ ...v, buildings });
}, last);
await until(
	(seat) =>
		[...window.__scene.pieces.values()].some(
			(p) => p.key.endsWith(`:city:${seat}`) && p.glow && p.lift > 0.7
		),
	last
);
await shot(`city-${last}-${players[last]}`);

await away();
await lit(null);
await page.waitForTimeout(500);
await shot('after');
const left = await page.evaluate(() =>
	[...window.__scene.pieces.values()]
		.filter((p) => p.glow || p.lift || p.obj.position.y !== p.ground)
		.map((p) => p.key)
);
console.log(JSON.stringify({ stillLit: left, errors: errors.slice(0, 10) }));
await browser.close();
