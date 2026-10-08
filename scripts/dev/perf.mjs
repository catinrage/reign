import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[c]', m.text()));
const t0 = Date.now();
await page.goto('http://localhost:8787/?sandbox' + (process.argv[2] ?? ''));
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
console.log('ready ms', Date.now() - t0);
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
	const s = window.__stage;
	const r = s.renderer;
	let meshes = 0, tris = 0;
	s.scene.traverse((o) => { if (o.isMesh && o.visible) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
	return { calls: r.info.render.calls, frameTris: r.info.render.triangles, meshes, sceneTris: Math.round(tris), mem: r.info.memory };
});
console.log(JSON.stringify(info));
await browser.close();
