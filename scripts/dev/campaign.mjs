// Dev: the solo campaign. Shots of the main menu, the campaign screen (mission 1 and a locked
// one), a mission's opening page, the table with a story line up, and the end of the mission.
// The bot logic plays your seat (?autoplay); WIN=1 wins at once on the dev server (--dev). Usage: node scripts/dev/campaign.mjs <outDir>
// [base] [width] [height] [mission]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir = '/tmp/campaign', base = 'http://localhost:8787', w = '1366', h = '768', mission = 'washed-ashore'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.addInitScript(() => {
	localStorage.setItem('reign:graphics', 'low');
	if (localStorage.getItem('reign:lang') === null && window.__lang) localStorage.setItem('reign:lang', window.__lang);
});
if (process.env.LANG_CODE) await page.addInitScript((l) => localStorage.setItem('reign:lang', l), process.env.LANG_CODE);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const until = (fn, arg, timeout = 600000) => page.waitForFunction(fn, arg, { timeout, polling: 200 });
const shot = async (name) => {
	await page.waitForTimeout(700);
	await page.screenshot({ path: `${dir}/${name}.png`, timeout: 180000 });
	console.log('shot', name);
};
await signIn(page, base);
await page.goto(`${base}/?autoplay`);
await until(() => window.__ready === true && window.__client.status === 'online');
await page.evaluate(() => window.__portraits?.());
await page.waitForTimeout(1500);
await shot('home');
await page.click('button.btn.purple', { force: true });
await page.waitForTimeout(2500);
await shot('campaign');
await page.click('.mission >> nth=3', { force: true });
await shot('campaign-locked');
await page.evaluate((m) => {
	window.__campaign.unlocked = true;
	window.__campaign.picked = m;
}, mission);
await page.click('.mission >> nth=0', { force: true });
await page.evaluate((m) => (window.__campaign.picked = m), mission);
await page.waitForTimeout(500);
await shot('campaign-mission');
await page.click('footer .btn', { force: true });
await until(() => !!document.querySelector('.brief'));
await page.waitForTimeout(2500);
await shot('brief');
await page.click('.brief .btn', { force: true });
// The story's first line comes as setup ends.
await until(() => !!document.querySelector('.story-bubble'));
await shot('story-line');
// WIN=1 (dev server only): win at once, to see the stars and the next mission.
if (process.env.WIN) await page.evaluate(() => window.__client.cheat({ type: 'win', player: window.__client.view.me }));
else await page.evaluate(() => window.__client.cheat?.({ type: 'fastBots', on: true }));
await until(() => window.__client.view?.phase === 'ended');
await page.waitForTimeout(4000);
await shot('end');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
