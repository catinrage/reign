// Dev helper: screenshots of the Settings tabs, in the main menu and in a game, at 1366x768,
// on a phone, in the longest languages and at the biggest menu size.
// Usage: node scripts/dev/settings-tabs.mjs <outDir> [base]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [dir, base = 'http://localhost:5173'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const until = (page, fn, timeout = 240000) => page.waitForFunction(fn, null, { timeout, polling: 500 });

async function open(viewport, prefs, touch = false) {
	const page = await browser.newPage({ viewport, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch });
	page.on('pageerror', (e) => console.log('[pageerror]', e.message));
	await signIn(page, base);
	await page.goto(`${base}/`);
	await page.evaluate((prefs) => {
		localStorage.setItem('reign:graphics', 'low');
		for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
	}, prefs);
	await page.goto(`${base}/`);
	await until(page, () => window.__ready === true);
	await page.waitForSelector('.medal', { timeout: 240000 });
	await page.waitForTimeout(1500);
	return page;
}
const shot = async (page, name) => {
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
	console.log('shot', name, await fits(page));
};
/** Whether the open panel fits the screen without scrolling. */
const fits = (page) =>
	page.evaluate(() => {
		const b = document.querySelector('.modal .body, .board .page');
		return b ? `${b.scrollHeight}/${b.clientHeight}` : 'none';
	});
const tab = (page, n) => page.click(`.settings .tab >> nth=${n}`);
const openHome = async (page) => {
	for (let i = 0; i < 5 && !(await page.$('.settings .tab')); i++) {
		await page.click('.medal >> nth=3', { force: true });
		await page.waitForTimeout(1500);
	}
};

// Main menu, every tab, English.
{
	const page = await open({ width: 1366, height: 768 }, {});
	await openHome(page);
	for (const [n, name] of ['interface', 'sound', 'graphics', 'game'].entries()) {
		await tab(page, n);
		await shot(page, `home-1366-${name}`);
	}
	await page.close();
}
// The longest languages.
for (const lang of ['ru', 'de', 'fr']) {
	const page = await open({ width: 1366, height: 768 }, { 'reign:lang': lang });
	await openHome(page);
	await shot(page, `home-1366-${lang}-interface`);
	await tab(page, 2);
	await shot(page, `home-1366-${lang}-graphics`);
	await page.close();
}
// Biggest menus.
{
	const page = await open({ width: 1366, height: 768 }, { 'reign:menuSize': '1.5' });
	await openHome(page);
	await shot(page, 'home-1366-menu150');
	await page.evaluate(() => (document.querySelector('.modal .body').scrollTop = 200));
	await shot(page, 'home-1366-menu150-scrolled');
	await page.close();
}
// Phone, Russian.
{
	const page = await open({ width: 390, height: 844 }, { 'reign:lang': 'ru' }, true);
	await openHome(page);
	for (const [n, name] of ['interface', 'sound', 'graphics', 'game'].entries()) {
		await tab(page, n);
		await shot(page, `phone-ru-${name}`);
	}
	await page.close();
}
// In a game.
{
	const page = await open({ width: 1366, height: 768 }, {});
	await page.goto(`${base}/?autoplay`);
	await page.waitForSelector('.sign .btn.big', { timeout: 240000 });
	await page.waitForTimeout(2000);
	await page.click('.sign .btn.big', { force: true });
	await until(page, () => window.__client.view && window.__client.view.phase !== 'setup');
	await page.evaluate(() => window.__stopAutoplay?.());
	await page.waitForTimeout(1500);
	await page.keyboard.press('Escape');
	await page.click('.board .list .btn.wood >> nth=1', { force: true });
	await shot(page, 'game-1366-interface');
	await tab(page, 2);
	await shot(page, 'game-1366-graphics');
	await tab(page, 3);
	await shot(page, 'game-1366-game');
	await page.close();
}
await browser.close();
