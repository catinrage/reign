// Dev helper: screenshot the "Your tiles" lights. One roll that pays you (gold), then a knight
// puts the robber on one of your tiles and its number is rolled (red).
// Usage: npx tsx scripts/dev/tile-lights.mts <outDir> [base]
import { chromium } from 'playwright';
import { tileIncome } from '../../src/shared/rules/income';
import type { GameView } from '../../src/shared/rules/types';
import { signIn } from './signin.mjs';

const [dir, base = 'http://localhost:5173'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('reign:graphics', 'low'));
const until = (fn: string, arg?: unknown) =>
	page.waitForFunction(fn, arg, { timeout: 400000, polling: 500 });
const view = (): Promise<GameView> =>
	page.evaluate('JSON.parse(JSON.stringify(window.__client.view))');
const run = (code: string) => page.evaluate(code);

await signIn(page, base);
await page.goto(base);
await until('window.__ready === true && !document.getElementById("boot")');
await page.waitForTimeout(2500);
await page.getByText('Play vs bots').click({ force: true });
await until('!!window.__client.view');
await run(
	`window.__client.cheat({ type: 'fastBots', on: true }); window.__client.cheat({ type: 'finishSetup' })`
);

const myRoll = async () => {
	await until(`(() => { const c = window.__client, v = c.view;
		return v && v.phase === 'main' && v.current === v.me && v.step === 'roll' && !c.tossing && !c.presenting; })()`);
	await page.waitForTimeout(1500);
};
const roll = async (total: number) => {
	await run(`window.__client.cheat({ type: 'rigDice', total: ${total} })`);
	await page.waitForTimeout(800);
	await run(`window.__client.act({ type: 'rollDice' })`);
	await until(
		`!!window.__client.lastRoll && !window.__client.tossing && window.__client.view.step !== 'roll'`
	);
};
const shot = async (name: string) => {
	await page.locator('.tiles').screenshot({ path: `${dir}/${name}.png` });
	await page.screenshot({ path: `${dir}/${name}-full.png` });
	console.log('shot', name);
};

// Gold: the number with the most of my tiles on it.
await myRoll();
let v = await view();
const count = (n: number) => tileIncome(v, v.me).filter((t) => t.number === n).length;
const numbers = [...new Set(tileIncome(v, v.me).map((t) => t.number))].sort(
	(a, b) => count(b) - count(a)
);
console.log('my numbers', numbers);
await roll(numbers[0]);
await page.waitForTimeout(300);
await shot('paid-flash');
await page.waitForTimeout(3000);
await shot('paid');
await run(`window.__client.act({ type: 'endTurn' })`);

// Red: a knight puts the robber on one of my tiles, then its number comes up.
await myRoll();
v = await view();
const list = tileIncome(v, v.me);
const target = list.find((t) => count(t.number) > 1) ?? list[0];
console.log('robber onto', target);
await run(
	`window.__client.cheat({ type: 'devCard', player: window.__client.view.me, card: 'knight' })`
);
await page.waitForTimeout(1000);
await run(`window.__client.act({ type: 'playKnight' })`);
await until(`window.__client.view.step === 'moveRobber'`);
await page.waitForTimeout(1500);
await run(`window.__client.act({ type: 'moveRobber', hex: ${target.hex} })`);
await page.waitForTimeout(1500);
v = await view();
if (v.step === 'steal') {
	const victim = v.players.findIndex((_, i) => i !== v.me);
	await run(`window.__client.act({ type: 'steal', victim: ${victim} })`);
}
await until(`window.__client.view.step === 'roll'`);
await page.waitForTimeout(3000);
await roll(target.number);
await page.waitForTimeout(3500);
await shot('blocked');
console.log(
	'lights',
	await run(`[...document.querySelectorAll('.tiles .chip')].map((c) => c.className).join(' / ')`)
);
await browser.close();
