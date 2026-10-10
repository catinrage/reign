// Dev helper: time the lobby's Classic -> Extended switch (and back) from the host's side, with
// the long tasks it causes and, with PROFILE=1, the functions that took the most time.
// Usage: node scripts/dev/mode-freeze.mjs [quality] [base]
import { chromium } from 'playwright';
import { signIn } from './signin.mjs';
const [quality = 'medium', base = 'http://localhost:5173'] = process.argv.slice(2);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', (e) => console.log('[page]', e.message));
await page.addInitScript((q) => {
	localStorage.setItem('reign:graphics', q);
	window.__long = [];
	new PerformanceObserver((l) =>
		l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))
	).observe({ type: 'longtask', buffered: true });
}, quality);
await signIn(page, base, 'Komeil');
await page.goto(`${base}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000, polling: 500 });
await page.click('.sign .btn.green', { force: true });
await page.waitForFunction(() => !!window.__client.lobby, null, { timeout: 60000 });
await page.waitForTimeout(4000);
const cdp = await page.context().newCDPSession(page);

async function measure(label, mode, profile) {
	await page.evaluate(() => (window.__long = []));
	if (profile) {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
		await cdp.send('Profiler.start');
	}
	const t = await page.evaluate(
		(mode) =>
			new Promise((done) => {
				const btn = [...document.querySelectorAll('.modes .mode')][mode === 'extended' ? 1 : 0];
				const t0 = performance.now();
				btn.click();
				// Wait for the settings to show, then for two frames to paint.
				const check = () => {
					const shown =
						mode === 'extended'
							? !!document.querySelector('.extended')
							: !document.querySelector('.extended');
					if (!shown) return setTimeout(check, 0);
					const t1 = performance.now();
					requestAnimationFrame(() =>
						requestAnimationFrame(() =>
							done({ shown: Math.round(t1 - t0), painted: Math.round(performance.now() - t0) })
						)
					);
				};
				check();
			}),
		mode
	);
	await page.waitForTimeout(Number(process.env.SETTLE ?? 4000));
	const long = await page.evaluate(() => window.__long);
	console.log(label, JSON.stringify(t), 'long tasks', JSON.stringify(long));
	if (profile) {
		const { profile: p } = await cdp.send('Profiler.stop');
		const self = new Map();
		const dt = p.timeDeltas;
		const byId = new Map(p.nodes.map((n) => [n.id, n]));
		const time = new Map();
		p.samples.forEach((id, i) => time.set(id, (time.get(id) ?? 0) + (dt[i] ?? 0)));
		for (const [id, us] of time) {
			const f = byId.get(id).callFrame;
			const k = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}`;
			self.set(k, (self.get(k) ?? 0) + us);
		}
		// Inclusive time per function, by walking parents.
		const parent = new Map();
		for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
		const incl = new Map();
		for (const [id, us] of time) {
			const seen = new Set();
			for (let n = id; n != null; n = parent.get(n)) {
				const f = byId.get(n).callFrame;
				const k = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}`;
				if (seen.has(k)) continue;
				seen.add(k);
				incl.set(k, (incl.get(k) ?? 0) + us);
			}
		}
		const top = (m) =>
			[...m]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 25)
				.map(([k, us]) => `  ${(us / 1000).toFixed(0).padStart(6)} ms  ${k}`)
				.join('\n');
		console.log(' self:\n' + top(self));
		console.log(' inclusive:\n' + top(incl));
	}
}
const profile = !!process.env.PROFILE;
await measure('classic -> extended (first)', 'extended', profile);
await measure('extended -> classic', 'classic', profile);
await measure('classic -> extended (again)', 'extended', profile);
await browser.close();
