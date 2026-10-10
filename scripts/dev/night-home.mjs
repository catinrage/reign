// Dev: the night switch on the home screen, beside Sound: off, clicked on (the room goes dark),
// and N turning it back off. Usage:
//   BASE=http://localhost:5173 node scripts/dev/night-home.mjs <outPrefix> [width] [height]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [out = '/tmp/night-home', w = '1440', h = '900'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()));
const night = () => page.evaluate(() => [window.__scene.stage.night, localStorage.getItem('reign:night')]);
const shot = async (name) => {
	await page.waitForTimeout(2500);
	await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
	console.log('shot', name);
};
await signIn(page, base);
await page.goto(`${base}/`);
await page.evaluate(() => localStorage.setItem('reign:graphics', 'medium'));
await page.goto(`${base}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForFunction(() => window.__account?.status === 'in', null, { timeout: 180000 });
await page.waitForTimeout(6000);
console.log('start', await night());
await shot('off');
await page.click('.extras .night', { force: true });
console.log('clicked', await night());
// Swiftshader draws too few frames to watch the fade: skip to night for the picture.
await page.evaluate(() => window.__scene.stage.setNight(true, true));
await shot('on');
await page.mouse.click(5, Number(h) - 5);
await page.keyboard.press('n');
console.log('after N', await night());
if (errors.length) console.log('errors', errors);
await browser.close();
