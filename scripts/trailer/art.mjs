// Store art: cover, banner, page background, YouTube thumbnail and the trailer's title cards and
// captions, laid out in HTML and screenshotted (no WebGL, so it's quick).
// Usage: node scripts/trailer/art.mjs <outDir> <heroWide> <heroClose> [names]
// heroWide: a wide shot of the table (the banner and thumbnail), heroClose: the cover's picture.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [out, wide, close] = process.argv.slice(2);
const R = resolve('.');
const url = (p) => 'file://' + resolve(p);
const font = (w) => url(`${R}/node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-${w}-normal.woff2`);
const nunito = url(`${R}/node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2`);
const logo = url(`${R}/src/client/public/logo@2x.png`);

const css = `
@font-face { font-family: RPx; font-weight: 700; src: url(${url(R + '/src/client/styles/fonts/reign-px-700.woff2')}); unicode-range: U+0030-0039, U+0043; }
@font-face { font-family: Px; font-weight: 700; src: url(${font(700)}); }
@font-face { font-family: Px; font-weight: 500; src: url(${font(500)}); }
@font-face { font-family: Nunito; font-weight: 200 1000; src: url(${nunito}); }
* { margin: 0; box-sizing: border-box; }
body { background: #140904; overflow: hidden; }
.stage { position: relative; overflow: hidden; }
.hero { position: absolute; inset: 0; background-size: cover; background-position: center; }
.shade { position: absolute; inset: 0; }
.logo { position: absolute; image-rendering: pixelated; filter: drop-shadow(0 8px 0 rgba(20,9,4,.55)) drop-shadow(0 0 30px rgba(20,9,4,.7)); }
.ribbon { position: absolute; display: flex; align-items: center; justify-content: center; }
.ribbon .band { position: relative; background: #e04b35; color: #fbeedb; font-family: RPx, Px; font-weight: 700;
  letter-spacing: .06em; white-space: nowrap; box-shadow: 0 0 0 var(--b) #7a2414, 0 calc(var(--b) * 2) 0 var(--b) rgba(20,9,4,.6); }
.ribbon .band::before { content: ''; position: absolute; inset: calc(var(--b) * 1.2); border: calc(var(--b) * .5) dashed rgba(251,238,219,.55); }
.ribbon .band span { position: relative; text-shadow: var(--b) 0 0 #3a160c, calc(var(--b) * -1) 0 0 #3a160c, 0 var(--b) 0 #3a160c, 0 calc(var(--b) * -1) 0 #3a160c, 0 calc(var(--b) * 2) 0 #3a160c; }
.ribbon .tail { width: calc(var(--h) * .9); height: calc(var(--h) * .82); background: #b8740f; box-shadow: 0 0 0 var(--b) #5a3208;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 35% 50%); margin-top: calc(var(--h) * .35); }
.ribbon .tail.r { clip-path: polygon(0 0, 100% 0, 65% 50%, 100% 100%, 0 100%); }
.tag { position: absolute; font-family: RPx, Px; font-weight: 700; color: #ffd45a; letter-spacing: .05em;
  text-shadow: 3px 0 0 #1a0c05, -3px 0 0 #1a0c05, 0 3px 0 #1a0c05, 0 -3px 0 #1a0c05, 3px 3px 0 #1a0c05, -3px 3px 0 #1a0c05, 3px -3px 0 #1a0c05, -3px -3px 0 #1a0c05, 0 6px 0 #1a0c05; }
.chip { position: absolute; font-family: RPx, Px; font-weight: 700; color: #3a2214; background: #ffd45a; letter-spacing: .04em;
  box-shadow: 0 0 0 4px #7d4b28, 0 8px 0 4px rgba(20,9,4,.6); }
`;
const ribbon = (text, { x, y, w, h, size }) => `
<div class="ribbon" style="left:${x}px;top:${y}px;width:${w}px;--h:${h}px;--b:${Math.max(2, Math.round(h / 16))}px">
  <div class="tail"></div>
  <div class="band" style="height:${h}px;line-height:${h}px;padding:0 ${h * 0.6}px;font-size:${size}px"><span>${text}</span></div>
  <div class="tail r"></div>
</div>`;

const pages = {
	cover: [630, 500, `
<div class="hero" style="background-image:url(${url(close)});background-position:50% 60%"></div>
<div class="shade" style="background:radial-gradient(ellipse at 50% 70%, rgba(20,9,4,0) 30%, rgba(20,9,4,.6) 100%), linear-gradient(rgba(20,9,4,.75), rgba(20,9,4,0) 55%)"></div>
<img class="logo" src="${logo}" style="left:105px;top:26px;width:420px">
${ribbon('SETTLE · TRADE · BUILD', { x: 0, y: 214, w: 630, h: 42, size: 24 })}`],
	banner: [960, 300, `
<div class="hero" style="background-image:url(${url(wide)});background-position:50% 55%"></div>
<div class="shade" style="background:radial-gradient(ellipse at 50% 45%, rgba(20,9,4,.35) 0%, rgba(20,9,4,.8) 75%)"></div>
<img class="logo" src="${logo}" style="left:250px;top:22px;width:460px">
${ribbon('SETTLE · TRADE · BUILD', { x: 0, y: 222, w: 960, h: 44, size: 25 })}`],
	thumb: [1280, 720, `
<div class="hero" style="background-image:url(${url(wide)});background-position:50% 50%"></div>
<div class="shade" style="background:linear-gradient(90deg, rgba(20,9,4,.88) 0%, rgba(20,9,4,.55) 42%, rgba(20,9,4,0) 70%)"></div>
<img class="logo" src="${logo}" style="left:40px;top:70px;width:600px">
${ribbon('SETTLE · TRADE · BUILD', { x: 30, y: 340, w: 620, h: 56, size: 30 })}
<div class="tag" style="left:70px;top:460px;font-size:46px;line-height:1.25">COZY VOXEL<br>BOARD GAME</div>
<div class="chip" style="left:74px;top:610px;font-size:30px;padding:10px 22px">PLAY FREE IN YOUR BROWSER</div>`],
	// CrazyGames covers. CrazyGames lays its own label over the top-left corner, so that stays picture.
	'cg-landscape': [1920, 1080, `
<div class="hero" style="background-image:url(${url(wide)});background-position:50% 40%"></div>
<div class="shade" style="background:linear-gradient(rgba(20,9,4,0) 45%, rgba(20,9,4,.85) 88%)"></div>
<img class="logo" src="${logo}" style="left:610px;top:640px;width:700px">
${ribbon('SETTLE · TRADE · BUILD', { x: 0, y: 950, w: 1920, h: 70, size: 38 })}`],
	'cg-portrait': [800, 1200, `
<div class="hero" style="background-image:url(${url(wide)});background-size:auto 100%;background-position:50% 50%"></div>
<div class="shade" style="background:linear-gradient(rgba(20,9,4,0) 50%, rgba(20,9,4,.9) 85%)"></div>
<img class="logo" src="${logo}" style="left:90px;top:820px;width:620px">
${ribbon('SETTLE · TRADE · BUILD', { x: 0, y: 1090, w: 800, h: 56, size: 30 })}`],
	'cg-square': [800, 800, `
<div class="hero" style="background-image:url(${url(wide)});background-size:auto 100%;background-position:50% 50%"></div>
<div class="shade" style="background:linear-gradient(rgba(20,9,4,0) 45%, rgba(20,9,4,.88) 85%)"></div>
<img class="logo" src="${logo}" style="left:140px;top:500px;width:520px">
${ribbon('SETTLE · TRADE · BUILD', { x: 0, y: 715, w: 800, h: 50, size: 27 })}`],
	// Trailer title cards: transparent, laid over the footage.
	'card-logo': [1920, 1080, `
<img class="logo" src="${logo}" style="left:510px;top:250px;width:900px">
${ribbon('SETTLE · TRADE · BUILD', { x: 0, y: 690, w: 1920, h: 84, size: 46 })}`, true],
	'card-end': [1920, 1080, `
<div class="shade" style="background:radial-gradient(ellipse at 50% 45%, rgba(20,9,4,.45) 0%, rgba(20,9,4,.85) 80%)"></div>
<img class="logo" src="${logo}" style="left:560px;top:170px;width:800px">
${ribbon('SETTLE · TRADE · BUILD', { x: 0, y: 560, w: 1920, h: 76, size: 42 })}
<div class="chip" style="left:50%;transform:translateX(-50%);top:720px;font-size:52px;padding:18px 44px;white-space:nowrap">PLAY FREE IN YOUR BROWSER</div>
<div class="tag" style="left:0;right:0;text-align:center;top:880px;font-size:40px;color:#fbeedb">ON ITCH.IO</div>`, true]
};
// Lower-third captions for the trailer.
const captions = {
	'cap-island': 'A HAND-CRAFTED VOXEL ISLAND',
	'cap-roll': 'ROLL THE DICE',
	'cap-build': 'BUILD YOUR REALM',
	'cap-trade': 'TRADE WITH RIVALS',
	'cap-robber': 'SEND IN THE ROBBER',
	'cap-events': 'EVENTS SHAKE THE REALM',
	'cap-eight': 'UP TO 8 PLAYERS ONLINE',
	'cap-bots': 'OR TAKE ON THE BOTS'
};
for (const [k, text] of Object.entries(captions))
	pages[k] = [1920, 1080, `<div style="position:absolute;left:0;bottom:0;width:1500px;height:300px;background:radial-gradient(ellipse 100% 100% at 0% 100%, rgba(20,9,4,.92) 0%, rgba(20,9,4,.75) 45%, rgba(20,9,4,0) 100%)"></div>
<div class="tag" style="left:110px;bottom:100px;font-size:64px;letter-spacing:.06em">${text}</div>
<div style="position:absolute;left:112px;bottom:86px;width:${Math.round(text.length * 41)}px;height:8px;background:#e04b35;box-shadow:0 4px 0 #1a0c05"></div>`, true];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const want = process.argv[5]?.split(',');
for (const [name, [w, h, body, clear]] of Object.entries(pages)) {
	if (want && !want.includes(name)) continue;
	const page = await browser.newPage({ viewport: { width: w, height: h } });
	const file = `${out}/_${name}.html`;
	writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}${clear ? 'body{background:transparent}' : ''}</style><div class="stage" style="width:${w}px;height:${h}px">${body}</div>`);
	await page.goto('file://' + resolve(file));
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${out}/${name}.png`, omitBackground: !!clear });
	await page.close();
	console.log(name);
}

// Page background: seamless walnut planks, as in the game's frames.
{
	const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
	await page.setContent(`<canvas id=c width=64 height=64 style="width:256px;height:256px;image-rendering:pixelated"></canvas><style>body{margin:0}</style>`);
	await page.evaluate(() => {
		const g = document.getElementById('c').getContext('2d');
		const cols = ['#2e180b', '#331b0c', '#2a160a', '#30190b'];
		let seed = 7;
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		for (let row = 0; row < 4; row++) {
			const y = row * 16;
			const joint = [12, 44, 28, 60][row];
			for (let x = 0; x < 64; x++) {
				for (let yy = 0; yy < 16; yy++) {
					g.fillStyle = cols[(row + (x > joint ? 1 : 0)) % 4];
					if (rnd() < 0.06) g.fillStyle = '#24130a';
					g.fillRect(x, y + yy, 1, 1);
				}
			}
			g.fillStyle = '#1a0c05';
			g.fillRect(0, y + 15, 64, 1);
			g.fillRect(joint, y, 1, 15);
			g.fillStyle = '#4a2a16';
			g.fillRect(0, y, 64, 1);
		}
	});
	await page.screenshot({ path: `${out}/bg-tile.png` });
	console.log('bg-tile');
}
await browser.close();
