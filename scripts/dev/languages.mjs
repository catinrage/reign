// Dev helper: screenshot the main screens in every language, to check translations fit.
// Usage: node --import tsx scripts/dev/languages.mjs <url> <outDir> [langs] [width] [height]
//   e.g. node --import tsx scripts/dev/languages.mjs http://localhost:5173 shots ru,de 1366 768
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { LANGUAGES } from '../../src/client/i18n/languages.ts';
import { signIn } from './signin.mjs';

const [url, out = 'test-results/languages', only = '', w = '1366', h = '768'] = process.argv.slice(2);
const langs = only ? only.split(',') : LANGUAGES.map((l) => l.code);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});

async function dict(code) {
	if (code === 'en') return {};
	return (await import(`../../src/client/i18n/locales/${code}.ts`)).default;
}

for (const code of langs) {
	const d = await dict(code);
	const tr = (s) => d[s] || s;
	const context = await browser.newContext({ viewport: { width: Number(w), height: Number(h) } });
	await context.addInitScript((c) => localStorage.setItem('reign:lang', c), code);
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log(`[${code}] pageerror`, e.message));
	const shot = async (name) => {
		await page.waitForTimeout(1200);
		await page.screenshot({ path: `${out}/${code}-${name}.png`, timeout: 180000, animations: 'disabled' });
		console.log(`${code}-${name}`);
	};
	const ready = () => page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(() => {});

	// The sign-in screen, before an account exists.
	await page.goto(url);
	await ready();
	await page.waitForTimeout(3000);
	await shot('auth');

	await signIn(page, url);
	await page.goto(url);
	await ready();
	await page.waitForTimeout(4000);
	await shot('home');

	await page.locator('.medal').nth(3).click();
	await shot('settings');
	await page.locator('.modal-backdrop .close').first().click();
	await page.waitForTimeout(600);

	await page.locator('.medal').nth(2).click();
	await page.waitForTimeout(800);
	await shot('tutorial');
	await page.goto(url);
	await ready();
	await page.waitForTimeout(3000);

	await page.locator('.btn.big.shine').first().click();
	await page.waitForTimeout(25000);
	await shot('game');

	// A second account for the lobby, since the first one is now seated in a game.
	await context.clearCookies();
	await signIn(page, url);
	await page.goto(url);
	await ready();
	await page.waitForTimeout(3000);
	await page.locator('.btn.green.block').first().click();
	await page.waitForTimeout(4000);
	await shot('lobby');
	await page.getByText(tr('Reign Extended'), { exact: true }).first().click().catch(() => console.log(`[${code}] no Extended button`));
	await page.waitForTimeout(2500);
	await shot('lobby-extended');
	await context.close();
}
await browser.close();
