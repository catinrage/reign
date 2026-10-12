// Dev helper: the interface size rows in the main menu's settings, on a phone.
// Usage: node scripts/dev/sizes-phone.mjs <outDir> [base]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, base = 'http://localhost:5180'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await signIn(page, base);
await page.goto(`${base}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
await page.waitForTimeout(2000);
await page.click('.medal >> nth=3', { force: true });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('.settings input.slider:nth-of-type(1)'));
await page.locator('.settings .divider >> nth=1').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.screenshot({ path: `${dir}/phone-settings.png` });
// Let go of the menu slider at 120%: the menu grows.
await page.evaluate(() => {
	const s = document.querySelectorAll('.settings input.slider')[1];
	s.value = '1.2';
	s.dispatchEvent(new Event('input', { bubbles: true }));
	s.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${dir}/phone-settings-120.png` });
console.log(await page.evaluate(() => localStorage.getItem('reign:menuSize')));
await browser.close();
