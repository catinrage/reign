// Dev: the loading screen (index.html + src/client/boot.ts). Holds back the game's biggest file so
// the screen stays up, shoots it, then loads for real and prints each step's label with its time
// until the screen fades out. Works against any build or the dev server. Usage:
//   BASE=http://localhost:4173 node scripts/dev/loading.mjs <out.png> [width] [height] [lang]
import { chromium } from 'playwright';
const [out = '/tmp/loading.png', w = '1366', h = '768', lang = 'en'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:4173';
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const open = async () => {
	const ctx = await browser.newContext({
		viewport: { width: Number(w), height: Number(h) },
		serviceWorkers: 'block'
	});
	await ctx.addInitScript((lang) => {
		localStorage.setItem('reign:graphics', 'low');
		localStorage.setItem('reign:lang', lang);
	}, lang);
	return ctx.newPage();
};

// 1. Stuck on the download: the screen with its bar part way and the step's label.
const held = await open();
await held.route(
	(u) => /\/assets\/(stage|app)-/.test(u.pathname),
	() => {}
);
await held.goto(`${base}/`);
await held.waitForSelector('#boot .cap.on');
await held.waitForTimeout(3000);
await held.screenshot({ path: out });
console.log('shot', out);

// 2. A real load, step by step.
const page = await open();
await page.addInitScript(() => {
	const t0 = performance.now();
	window.__steps = [];
	document.addEventListener('DOMContentLoaded', () => {
		const el = document.getElementById('boot');
		let last = null;
		const tick = () => {
			const label = el.querySelector('.cap').textContent;
			if (label !== last)
				window.__steps.push(`${Math.round(performance.now() - t0)}ms ${label || '(no label)'}`);
			last = label;
			if (el.isConnected) setTimeout(tick, 20);
			else window.__steps.push(`${Math.round(performance.now() - t0)}ms gone`);
		};
		tick();
	});
});
await page.goto(`${base}/`);
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 300000 });
console.log((await page.evaluate(() => window.__steps)).join('\n'));
await browser.close();
