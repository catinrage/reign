// Dev helper: render the character portraits into a gallery screenshot.
// Usage: node scripts/dev/portraits.mjs <out.png>
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() !== 'debug' && console.log('[console]', m.text()));
await page.goto('http://localhost:5173/?sandbox&noboard');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.evaluate(async () => {
	const m = await import('/scene/portraits.ts');
	const ids = ['merchant', 'mason', 'scholar', 'veteran', 'rogue', 'steward', 'shepherd', 'explorer'];
	document.body.innerHTML = '<div id=g style="display:grid;grid-template-columns:repeat(4,256px);gap:8px;padding:8px;background:#3a1f12"></div>';
	for (const id of ids) {
		const img = new Image();
		img.src = await m.loadPortrait(id);
		img.style.background = '#5a3020';
		document.getElementById('g').appendChild(img);
	}
});
await page.waitForTimeout(800);
await page.screenshot({ path: out });
await browser.close();
