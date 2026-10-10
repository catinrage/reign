// Dev helper: render the account avatars into a gallery screenshot.
// Usage: node scripts/dev/avatars.mjs <out.png>
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1072, height: 1064 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?sandbox&noboard');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.evaluate(async () => {
	const m = await import('/scene/avatars.ts');
	const AVATARS = ['knight', 'archer', 'wizard', 'queen', 'king', 'pirate', 'monk', 'bard', 'farmer', 'vampire', 'alien', 'fox', 'owl', 'bear', 'frog', 'cat'];
	document.body.innerHTML = '<div id=g style="display:grid;grid-template-columns:repeat(4,256px);gap:8px;padding:8px;background:#3a1f12"></div>';
	for (const id of AVATARS) {
		const img = new Image();
		img.src = await m.loadAvatar(id);
		img.style.background = '#5a3020';
		document.getElementById('g').appendChild(img);
	}
});
await page.waitForTimeout(800);
await page.screenshot({ path: out });
await browser.close();
